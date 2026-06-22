import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { logAction } from '@/lib/audit-log'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'
import { todayBogota } from '@/lib/bogota-time'

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isValidPhone(phone: string): boolean {
  // Allow optional + prefix, then at least 7 digits
  return /^\+?\d{7,}$/.test(phone.replace(/[\s\-()]/g, ''))
}

/** Calculate dynamic days remaining based on endDate vs today (Bogota) */
function calcDaysRemaining(endDate: Date | null): number {
  if (!endDate) return 0
  const today = todayBogota()
  const end = new Date(endDate)
  const diff = end.getTime() - today.getTime()
  const days = diff / (1000 * 60 * 60 * 24)
  return Math.max(0, Math.round(days))
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const includeDeleted = searchParams.get('includeDeleted') === 'true'
    const activeMembership = searchParams.get('activeMembership') === 'true'

    const where: Record<string, unknown> = {}
    if (!includeDeleted) {
      where.deletedAt = null
    }
    if (activeMembership) {
      where.memberships = {
        some: { status: 'Activo' },
      }
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
        { cedula: { contains: search } },
        { lastName: { contains: search } },
      ]
    }

    const clients = await db.client.findMany({
      where,
      include: {
        _count: { select: { sales: true } },
        receivables: {
          where: { status: { in: ['pendiente', 'parcial'] } },
          select: { id: true, amount: true, pendingBalance: true, status: true, dueDate: true, createdAt: true },
        },
        memberships: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    })

    // Compute pending balance and membership for each client
    const clientsWithBalance = clients.map(client => {
      const pendingBalance = client.receivables.reduce((sum, r) => sum + r.pendingBalance, 0)
      const membership = client.memberships[0] || null
      return {
        ...client,
        pendingBalance: Math.round(pendingBalance * 100) / 100,
        receivables: client.receivables.map(r => ({
          id: r.id,
          amount: r.amount,
          pendingBalance: r.pendingBalance,
          status: r.status,
          dueDate: r.dueDate,
          createdAt: r.createdAt,
        })),
        membership: membership ? {
          id: membership.id,
          status: membership.status,
          tarifa: membership.tarifa,
          endDate: membership.endDate,
          daysRemaining: membership.endDate
            ? calcDaysRemaining(membership.endDate)
            : membership.daysRemaining,
          ticketsRemaining: membership.ticketsRemaining,
        } : null,
      }
    })

    return NextResponse.json(clientsWithBalance)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener clientes' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageClients && !perms.canMarkAttendance) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const body = await request.json()

    const name = (body.name || '').trim()
    if (!name) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }
    if (name.length < 2) {
      return NextResponse.json({ error: 'El nombre debe tener al menos 2 caracteres' }, { status: 400 })
    }

    const lastName = (body.lastName || '').trim()
    // lastName is optional (required only for gym, enforced on frontend)
    if (lastName.length > 0 && lastName.length < 2) {
      return NextResponse.json({ error: 'El apellido debe tener al menos 2 caracteres' }, { status: 400 })
    }

    const phone = body.phone ? body.phone.trim() : null
    if (phone && !isValidPhone(phone)) {
      return NextResponse.json({ error: 'El teléfono debe tener al menos 7 dígitos' }, { status: 400 })
    }

    const email = body.email ? body.email.trim() : null
    if (email && !isValidEmail(email)) {
      return NextResponse.json({ error: 'El formato del email no es válido' }, { status: 400 })
    }

    const address = body.address ? body.address.trim() : null
    if (address && address.length < 3) {
      return NextResponse.json({ error: 'La dirección debe tener al menos 3 caracteres' }, { status: 400 })
    }

    const note = body.note ? body.note.trim() : null

    const client = await db.client.create({
      data: {
        name,
        lastName,
        cedula: body.cedula ? body.cedula.trim() : null,
        phone,
        email,
        address,
        note,
        gender: body.gender ? body.gender.trim() : null,
        birthDate: body.birthDate ? new Date(body.birthDate) : null,
        age: body.age ? parseInt(String(body.age)) : null,
      },
    })
    await logAction({ action: 'create', entity: 'client', entityId: client.id, details: { name }, request })
    return NextResponse.json(client, { status: 201 })
  } catch (error: unknown) {
    console.error('Error al crear cliente:', error)
    const prismaErr = error as { code?: string; meta?: { target?: string[] } }
    if (prismaErr.code === 'P2002') {
      const field = prismaErr.meta?.target?.[0] || 'campo'
      const fieldLabel = field === 'cedula' ? 'cédula' : field
      return NextResponse.json({ error: `Ya existe un cliente con esa ${fieldLabel}` }, { status: 409 })
    }
    const msg = error instanceof Error ? error.message : 'Error al crear cliente'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageClients && !perms.canMarkAttendance) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'ID es requerido' }, { status: 400 })
    }

    // Verify client exists
    const existing = await db.client.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    // Handle reactivation
    if (body.reactivate) {
      const client = await db.client.update({
        where: { id },
        data: { deletedAt: null },
      })
      return NextResponse.json(client)
    }

    const name = (body.name || '').trim()
    if (!name) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }
    if (name.length < 2) {
      return NextResponse.json({ error: 'El nombre debe tener al menos 2 caracteres' }, { status: 400 })
    }

    const phone = body.phone ? body.phone.trim() : null
    if (phone && !isValidPhone(phone)) {
      return NextResponse.json({ error: 'El teléfono debe tener al menos 7 dígitos' }, { status: 400 })
    }

    const email = body.email ? body.email.trim() : null
    if (email && !isValidEmail(email)) {
      return NextResponse.json({ error: 'El formato del email no es válido' }, { status: 400 })
    }

    const address = body.address ? body.address.trim() : null
    if (address && address.length < 3) {
      return NextResponse.json({ error: 'La dirección debe tener al menos 3 caracteres' }, { status: 400 })
    }

    const note = body.note ? body.note.trim() : null

    const client = await db.client.update({
      where: { id },
      data: {
        name,
        cedula: body.cedula !== undefined ? (body.cedula ? body.cedula.trim() : null) : undefined,
        lastName: body.lastName !== undefined ? (body.lastName ? body.lastName.trim() : null) : undefined,
        phone,
        email,
        address,
        note,
        gender: body.gender !== undefined ? (body.gender ? body.gender.trim() : null) : undefined,
        birthDate: body.birthDate ? new Date(body.birthDate) : undefined,
        age: body.age !== undefined ? (body.age ? parseInt(String(body.age)) : null) : undefined,
      },
    })
    await logAction({ action: 'update', entity: 'client', entityId: id, details: { name }, request })

    return NextResponse.json(client)
  } catch (error) {
    return NextResponse.json({ error: 'Error al actualizar cliente' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageClients) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID es requerido' }, { status: 400 })
    }

    // Soft delete
    await db.client.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    await logAction({ action: 'delete', entity: 'client', entityId: id, request })

    return NextResponse.json({ message: 'Cliente eliminado (soft delete)' })
  } catch (error) {
    return NextResponse.json({ error: 'Error al eliminar cliente' }, { status: 500 })
  }
}
