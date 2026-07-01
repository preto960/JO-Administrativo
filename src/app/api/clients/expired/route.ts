import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'

/**
 * GET /api/clients/expired
 *
 * Retorna todos los clientes que NO tienen una membresía activa.
 * Incluye clientes con membresía "Vencido" y "Sin membresia".
 * Se excluyen clientes eliminados (soft-delete).
 */
export async function GET() {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  try {
    const clients = await db.client.findMany({
      where: {
        deletedAt: null,
        memberships: {
          none: { status: 'Activo' },
        },
      },
      select: {
        id: true,
        name: true,
        lastName: true,
        cedula: true,
        email: true,
        phone: true,
        memberships: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            tarifa: true,
            endDate: true,
            daysRemaining: true,
            status: true,
            planType: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    const formatted = clients.map((c, i) => ({
      index: i + 1,
      id: c.id,
      name: c.name,
      lastName: c.lastName || '',
      fullName: `${c.name}${c.lastName ? ' ' + c.lastName : ''}`,
      cedula: c.cedula ? formatCedula(c.cedula) : '',
      cedulaRaw: c.cedula || '',
      email: c.email || '',
      phone: c.phone || '',
      tarifa: c.memberships[0]?.tarifa || '',
      fechaVencimiento: c.memberships[0]?.endDate
        ? new Date(c.memberships[0].endDate).toISOString().split('T')[0]
        : '',
      diasRestantes: c.memberships[0]?.daysRemaining ?? 0,
      status: c.memberships[0]?.status || 'Sin membresia',
      planType: c.memberships[0]?.planType || '',
    }))

    return NextResponse.json({
      clients: formatted,
      total: formatted.length,
    })
  } catch (error) {
    console.error('[ClientsExpired]', error)
    return NextResponse.json(
      { error: 'Error al consultar clientes vencidos' },
      { status: 500 },
    )
  }
}

function formatCedula(c: string): string {
  const digits = c.replace(/\D/g, '')
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9)
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}