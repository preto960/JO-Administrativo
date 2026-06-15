import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'
import { logAction } from '@/lib/audit-log'

interface CsvRow {
  cedula: string
  nombre: string
  apellido?: string
  correo?: string
  celular?: string
  fecha_nacimiento?: string
  edad?: string
  genero?: string
  direccion?: string
  estado_membresia?: string
  tarifa?: string
  fecha_pago?: string
  fecha_inicio_membresia?: string
  fecha_vencimiento_membresia?: string
  dias_restantes?: string
  tiquetes_restantes?: string
  fecha_creacion?: string
  ultima_asistencia?: string
}

function parseDate(val: string | undefined | null): Date | null {
  if (!val || !val.toString().trim()) return null
  const str = val.toString().trim()
  // Try YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY
  let d = new Date(str)
  if (!isNaN(d.getTime())) return d
  // Try DD/MM/YYYY
  const parts = str.split('/')
  if (parts.length === 3) {
    d = new Date(`${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`)
    if (!isNaN(d.getTime())) return d
  }
  return null
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageClients) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { clients, updateExisting = true } = body as {
      clients: CsvRow[]
      updateExisting?: boolean
    }

    if (!clients || !Array.isArray(clients) || clients.length === 0) {
      return NextResponse.json({ error: 'No se recibieron clientes' }, { status: 400 })
    }

    if (clients.length > 5000) {
      return NextResponse.json({ error: 'Máximo 5,000 clientes por importación' }, { status: 400 })
    }

    let created = 0
    let updated = 0
    let skipped = 0
    const errors: string[] = []

    // Pre-fetch existing cedulas for fast lookup
    const existingClients = await db.client.findMany({
      where: { deletedAt: null, cedula: { not: null } },
      select: { id: true, cedula: true },
    })
    const cedulaMap = new Map(existingClients.map(c => [c.cedula!, c.id]))

    // Pre-fetch existing memberships
    const existingMemberships = await db.clientMembership.findMany({
      select: { id: true, clientId: true },
    })
    const membershipByClient = new Map(existingMemberships.map(m => [m.clientId, m.id]))

    const BATCH_SIZE = 100

    for (let i = 0; i < clients.length; i += BATCH_SIZE) {
      const batch = clients.slice(i, i + BATCH_SIZE)

      await db.$transaction(async (tx) => {
        for (const row of batch) {
          const rowNum = i + batch.indexOf(row) + 1
          try {
            const cedula = (row.cedula || '').toString().trim()
            const nombre = (row.nombre || '').toString().trim()

            if (!cedula) {
              errors.push(`Fila ${rowNum}: Cédula vacía — se omitió`)
              skipped++
              continue
            }
            if (!nombre) {
              errors.push(`Fila ${rowNum}: Nombre vacío (cédula: ${cedula}) — se omitió`)
              skipped++
              continue
            }

            const apellido = row.apellido?.toString().trim() || null
            const correo = row.correo?.toString().trim() || null
            const celular = row.celular?.toString().trim() || null
            const direccion = row.direccion?.toString().trim() || null
            const genero = row.genero?.toString().trim() || null
            const birthDate = parseDate(row.fecha_nacimiento)
            const edad = row.edad ? parseInt(String(row.edad)) : (birthDate ? null : null)
            const lastAttendance = parseDate(row.ultima_asistencia)

            const existingId = cedulaMap.get(cedula)

            // Build client data — only set non-empty fields
            const clientData: Record<string, unknown> = {}
            if (nombre) clientData.name = nombre
            if (apellido) clientData.lastName = apellido
            if (correo) clientData.email = correo
            if (celular) clientData.phone = celular
            if (direccion) clientData.address = direccion
            if (genero) clientData.gender = genero
            if (birthDate) clientData.birthDate = birthDate
            if (edad && !birthDate) clientData.age = edad
            if (lastAttendance) clientData.lastAttendance = lastAttendance
            // If client was soft-deleted, reactivate
            clientData.deletedAt = null

            let clientId: string

            if (existingId && updateExisting) {
              // UPDATE existing client — only non-empty fields
              await tx.client.update({
                where: { id: existingId },
                data: clientData,
              })
              clientId = existingId
              updated++
            } else if (existingId && !updateExisting) {
              errors.push(`Fila ${rowNum}: "${nombre}" (${cedula}) ya existe`)
              skipped++
              continue
            } else {
              // CREATE new client
              const newClient = await tx.client.create({
                data: {
                  cedula,
                  name: nombre,
                  lastName: apellido,
                  email: correo,
                  phone: celular,
                  address: direccion,
                  gender: genero,
                  birthDate,
                  age: edad && !birthDate ? edad : null,
                  lastAttendance,
                  ...clientData,
                },
              })
              clientId = newClient.id
              cedulaMap.set(cedula, clientId)
              created++
            }

            // ── Membership data ──
            const estadoMembresia = row.estado_membresia?.toString().trim() || ''
            const tarifa = row.tarifa?.toString().trim() || ''
            const paymentDate = parseDate(row.fecha_pago)
            const startDate = parseDate(row.fecha_inicio_membresia)
            const endDate = parseDate(row.fecha_vencimiento_membresia)
            const diasRestantes = row.dias_restantes ? parseInt(String(row.dias_restantes)) : 0
            const tiquetesRestantes = row.tiquetes_restantes ? parseInt(String(row.tiquetes_restantes)) : 0

            // Only create/update membership if there's actual membership data
            const hasMembershipData = estadoMembresia || tarifa || paymentDate || startDate || endDate

            if (hasMembershipData) {
              const existingMembershipId = membershipByClient.get(clientId)

              const membershipData: Record<string, unknown> = {}
              if (estadoMembresia) membershipData.status = estadoMembresia
              if (tarifa) membershipData.tarifa = tarifa
              if (paymentDate) membershipData.paymentDate = paymentDate
              if (startDate) membershipData.startDate = startDate
              if (endDate) membershipData.endDate = endDate
              if (diasRestantes !== undefined && diasRestantes !== null) membershipData.daysRemaining = diasRestantes
              if (tiquetesRestantes !== undefined && tiquetesRestantes !== null) membershipData.ticketsRemaining = tiquetesRestantes

              if (existingMembershipId) {
                // Update existing membership with non-empty fields only
                await tx.clientMembership.update({
                  where: { id: existingMembershipId },
                  data: membershipData,
                })
              } else {
                // Create new membership
                const newMembership = await tx.clientMembership.create({
                  data: {
                    clientId,
                    status: estadoMembresia || 'Sin membresia',
                    tarifa: tarifa || null,
                    paymentDate,
                    startDate,
                    endDate,
                    daysRemaining: diasRestantes || 0,
                    ticketsRemaining: tiquetesRestantes || 0,
                  },
                })
                membershipByClient.set(clientId, newMembership.id)
              }
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Error desconocido'
            errors.push(`Fila ${rowNum}: ${errorMsg}`)
            skipped++
          }
        }
      }, { timeout: 60000 })
    }

    await logAction({
      action: 'bulk-import',
      entity: 'client',
      details: { created, updated, skipped, total: clients.length },
      request,
    })

    return NextResponse.json({
      created,
      updated,
      skipped,
      errors: errors.slice(0, 50),
      totalProcessed: clients.length,
    })
  } catch (error) {
    console.error('[Bulk Import Clients] Error:', error)
    return NextResponse.json({ error: 'Error al importar clientes' }, { status: 500 })
  }
}