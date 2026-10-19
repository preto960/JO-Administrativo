import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { fetchToday } from '@/lib/tz-helpers'

export async function GET() {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  try {
    const today = await fetchToday()
    const results: Array<{ membershipId: string; clientName: string; planName: string; reason: string }> = []

    // ── 1. Expire by date (for "dias" and "horario" plans) ──
    const expiredByDate = await db.clientMembership.findMany({
      where: {
        status: 'Activo',
        endDate: {
          lte: today,
        },
      },
      include: {
        client: { select: { id: true, name: true, lastName: true } },
        plan: { select: { name: true, planType: true } },
      },
    })

    for (const m of expiredByDate) {
      // Tiqueteras (tickets) now also expire by date based on ticketDurationMonths
      // Gym plans (dias/horario) expire by date as before
      const planType = m.planType || m.plan?.planType || 'dias'

      await db.clientMembership.update({
        where: { id: m.id },
        data: {
          status: 'Vencido',
          daysRemaining: 0,
          // For tickets, also zero out remaining tickets since the validity period ended
          ticketsRemaining: planType === 'tickets' ? 0 : undefined,
        },
      })

      const clientFullName = `${m.client.name}${m.client.lastName ? ' ' + m.client.lastName : ''}`
      const planLabel = m.plan?.name || m.tarifa || 'Membresía'

      const admins = await db.user.findMany({
        where: { active: true },
        select: { id: true },
      })

      for (const admin of admins) {
        await db.notification.create({
          data: {
            userId: admin.id,
            title: 'Membresía Vencida',
            message: `${clientFullName} — Su plan "${planLabel}" ha vencido. Ya no tiene días disponibles.`,
            type: 'warning',
            clientId: m.client.id,
            clientName: clientFullName,
          },
        })
      }

      results.push({
        membershipId: m.id,
        clientName: clientFullName,
        planName: planLabel,
        reason: 'fecha_vencida',
      })
    }

    // ── 2. Expire ticket plans with 0 tickets remaining ──
    const expiredByTickets = await db.clientMembership.findMany({
      where: {
        status: 'Activo',
        planType: 'tickets',
        ticketsRemaining: { lte: 0 },
      },
      include: {
        client: { select: { id: true, name: true, lastName: true } },
        plan: { select: { name: true, planType: true } },
      },
    })

    for (const m of expiredByTickets) {
      await db.clientMembership.update({
        where: { id: m.id },
        data: {
          status: 'Vencido',
          ticketsRemaining: 0,
        },
      })

      const clientFullName = `${m.client.name}${m.client.lastName ? ' ' + m.client.lastName : ''}`
      const planLabel = m.plan?.name || m.tarifa || 'Membresía'

      const admins = await db.user.findMany({
        where: { active: true },
        select: { id: true },
      })

      for (const admin of admins) {
        await db.notification.create({
          data: {
            userId: admin.id,
            title: 'Membresía Vencida',
            message: `${clientFullName} — Su plan "${planLabel}" (tickets) ha vencido. Ya no tiene tickets disponibles.`,
            type: 'warning',
            clientId: m.client.id,
            clientName: clientFullName,
          },
        })
      }

      results.push({
        membershipId: m.id,
        clientName: clientFullName,
        planName: planLabel,
        reason: 'sin_tickets',
      })
    }

    console.log(`[check-expirations] ${results.length} membresías expiradas`, results.map(r => `${r.clientName} (${r.reason})`))

    return NextResponse.json({
      checked: true,
      expired: results.length,
      details: results,
    })
  } catch (error) {
    console.error('[check-expirations]', error)
    return NextResponse.json({ error: 'Error al verificar expiraciones' }, { status: 500 })
  }
}