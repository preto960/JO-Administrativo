import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { logAction } from '@/lib/audit-log'

/**
 * DELETE /api/clients/[id]/membership
 * Cancel/delete a membership or tiquetera for a client.
 *
 * Body: { membershipId: string }
 *
 * Sets status to "Vencido" and clears remaining days/tickets.
 * Does NOT physically delete the row (audit trail preserved).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  const { id: clientId } = await params

  try {
    const body = await request.json()
    const { membershipId } = body

    if (!membershipId) {
      return NextResponse.json({ error: 'membershipId es requerido' }, { status: 400 })
    }

    // Find the membership
    const membership = await db.clientMembership.findUnique({
      where: { id: membershipId },
      include: { plan: { select: { name: true, planType: true } } },
    })

    if (!membership) {
      return NextResponse.json({ error: 'Membresía no encontrada' }, { status: 404 })
    }

    if (membership.clientId !== clientId) {
      return NextResponse.json({ error: 'La membresía no pertenece a este cliente' }, { status: 403 })
    }

    const isTiquetera = membership.planType === 'tickets'
    const label = isTiquetera ? 'Tiquetera' : 'Membresía'

    // Cancel: set status to Vencido, zero out counters
    const updated = await db.clientMembership.update({
      where: { id: membershipId },
      data: {
        status: 'Vencido',
        daysRemaining: 0,
        ticketsRemaining: 0,
      },
    })

    // Audit log
    await logAction({
      action: 'cancel_membership',
      entity: 'client_membership',
      entityId: membershipId,
      details: {
        summary: `${label} cancelada: ${membership.plan?.name || membership.tarifa || 'Sin plan'}`,
        clientId,
        planType: membership.planType,
        planName: membership.plan?.name,
      },
      request,
    })

    return NextResponse.json({
      message: `${label} cancelada correctamente`,
      membership: updated,
    }, { status: 200 })

  } catch (error: unknown) {
    console.error('Error al cancelar membresía:', error)
    const msg = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: `Error al cancelar membresía: ${msg}` }, { status: 500 })
  }
}
