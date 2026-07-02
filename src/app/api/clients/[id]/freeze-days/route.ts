import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'
import { logAction } from '@/lib/audit-log'
import { fetchToday } from '@/lib/tz-helpers'

// POST /api/clients/[id]/freeze-days — Freeze N days on an active membership
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageClients) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const { days, reason, documentRef } = body as {
      days: number
      reason: string
      documentRef?: string
    }

    if (!days || days <= 0) {
      return NextResponse.json({ error: 'La cantidad de días debe ser mayor a 0' }, { status: 400 })
    }
    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: 'El motivo es obligatorio' }, { status: 400 })
    }
    if (days > 365) {
      return NextResponse.json({ error: 'Máximo 365 días por congelación' }, { status: 400 })
    }

    // Find active membership
    const membership = await db.clientMembership.findFirst({
      where: { clientId: id },
      orderBy: { createdAt: 'desc' },
    })

    if (!membership) {
      return NextResponse.json({ error: 'El cliente no tiene membresía' }, { status: 404 })
    }

    if (membership.status !== 'Activo') {
      return NextResponse.json({ error: 'Solo se puede congelar una membresía activa' }, { status: 400 })
    }

    if (!membership.endDate) {
      return NextResponse.json({ error: 'La membresía no tiene fecha de vencimiento' }, { status: 400 })
    }

    const today = await fetchToday()
    const endDt = new Date(membership.endDate)

    if (endDt < today) {
      return NextResponse.json({ error: 'La membresía ya está vencida' }, { status: 400 })
    }

    // Validate days don't exceed a reasonable limit (e.g., total frozen can't exceed 2x original days)
    const existingFreezes = await db.membershipFreeze.findMany({
      where: { membershipId: membership.id },
    })
    const totalFrozenDays = existingFreezes.reduce((sum, f) => sum + f.days, 0) + days
    if (totalFrozenDays > membership.daysRemaining + days) {
      return NextResponse.json({ error: `Los días a congelar (${totalFrozenDays} total) exceden los días restantes (${membership.daysRemaining + days})` }, { status: 400 })
    }

    // Extend endDate and daysRemaining
    const newEndDate = new Date(endDt)
    newEndDate.setDate(newEndDate.getDate() + days)

    const updatedMembership = await db.clientMembership.update({
      where: { id: membership.id },
      data: {
        endDate: newEndDate,
        daysRemaining: membership.daysRemaining + days,
      },
    })

    // Create freeze record for audit
    const freeze = await db.membershipFreeze.create({
      data: {
        membershipId: membership.id,
        days,
        reason: reason.trim(),
        documentRef: documentRef?.trim() || null,
        approvedBy: auth.userId,
      },
      include: {
        approver: { select: { id: true, name: true } },
      },
    })

    await logAction({
      action: 'update',
      entity: 'client',
      entityId: id,
      details: {
        action: 'freeze_days',
        membershipId: membership.id,
        days,
        reason: reason.trim(),
        documentRef: documentRef?.trim() || null,
        newEndDate: newEndDate.toISOString(),
      },
      request,
    })

    return NextResponse.json({
      membership: updatedMembership,
      freeze,
      message: `Se congelaron ${days} día${days !== 1 ? 's' : ''}. Nuevo vencimiento: ${newEndDate.toLocaleDateString('en-CA')}`,
    }, { status: 201 })
  } catch (error) {
    console.error('[FreezeDays POST]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Error al congelar días' }, { status: 500 })
  }
}

// GET /api/clients/[id]/freeze-days — Get freeze history for a client
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  const { id } = await params

  try {
    const freezes = await db.membershipFreeze.findMany({
      where: {
        membership: { clientId: id },
      },
      include: {
        approver: { select: { id: true, name: true } },
        membership: { select: { id: true, tarifa: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(freezes)
  } catch (error) {
    console.error('[FreezeDays GET]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Error al obtener historial' }, { status: 500 })
  }
}