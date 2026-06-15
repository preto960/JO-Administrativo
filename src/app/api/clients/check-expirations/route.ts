import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'

/** Get today at midnight in Colombia timezone */
function getTodayBogota(): Date {
  const now = new Date()
  const bogota = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }))
  bogota.setHours(0, 0, 0, 0)
  return bogota
}

/**
 * GET /api/clients/check-expirations
 *
 * Finds all memberships with status "Activo" where endDate <= today (Bogota),
 * updates them to "Vencido" with 0 daysRemaining, and creates notifications.
 *
 * Called automatically when the clients page or dashboard loads.
 * Can also be called via Vercel Cron.
 */
export async function GET() {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  const today = getTodayBogota()

  try {
    // Find active memberships whose endDate has passed (Bogota)
    const expiredMemberships = await db.clientMembership.findMany({
      where: {
        status: 'Activo',
        endDate: {
          lte: today,
        },
      },
      include: {
        client: {
          select: { id: true, name: true, lastName: true },
        },
        plan: {
          select: { name: true },
        },
      },
    })

    if (expiredMemberships.length === 0) {
      return NextResponse.json({ checked: true, expired: 0 })
    }

    // Update each membership to Vencido and create notifications
    const results: Array<{ membershipId: string; clientName: string; planName: string }> = []

    for (const m of expiredMemberships) {
      // Update membership
      await db.clientMembership.update({
        where: { id: m.id },
        data: {
          status: 'Vencido',
          daysRemaining: 0,
        },
      })

      const clientFullName = `${m.client.name}${m.client.lastName ? ' ' + m.client.lastName : ''}`
      const planLabel = m.plan?.name || m.tarifa || 'Membresía'

      // Create notification for each admin user
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
      })
    }

    console.log(`[check-expirations] ${results.length} membresías expiradas`, results.map(r => r.clientName))

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