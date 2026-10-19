import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { fetchToday } from '@/lib/tz-helpers'

/**
 * GET /api/clients/fix-tiquetera-durations
 *
 * One-time migration/fix script that:
 * 1. Finds all active tiquetera memberships (planType = 'tickets', status = 'Activo')
 * 2. For each, calculates the correct endDate based on the plan's ticketDurationMonths
 *    (or falls back to 2 months default) starting from paymentDate/startDate
 * 3. If the tiquetera has already expired (today > correct endDate), cancels it
 * 4. If still valid, updates endDate and daysRemaining to the correct values
 *
 * Query params:
 *   ?dryRun=true  → Only report what would change, don't actually update DB
 *
 * Open in browser: /api/clients/fix-tiquetera-durations
 * Or with dry run: /api/clients/fix-tiquetera-durations?dryRun=true
 */
export async function GET(request: Request) {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  try {
    const { searchParams } = new URL(request.url)
    const dryRun = searchParams.get('dryRun') === 'true'

    const today = await fetchToday()
    const todayStr = today.toISOString().split('T')[0]

    // Find all tiquetera memberships (both active and potentially incorrectly active)
    const tiqueteras = await db.clientMembership.findMany({
      where: {
        planType: 'tickets',
        // Only process those that are currently active or might have wrong dates
        status: { in: ['Activo'] },
      },
      include: {
        client: { select: { id: true, name: true, lastName: true, cedula: true } },
        plan: { select: { id: true, name: true, ticketDurationMonths: true, ticketCount: true } },
      },
      orderBy: { paymentDate: 'asc' },
    })

    const results: Array<{
      membershipId: string
      clientName: string
      clientCedula: string | null
      planName: string
      ticketDurationMonths: number
      paymentDate: string
      startDate: string | null
      currentEndDate: string | null
      correctEndDate: string
      currentDaysRemaining: number
      correctDaysRemaining: number
      ticketsRemaining: number
      action: 'updated' | 'expired' | 'already_correct' | 'skip_no_start_date'
    }> = []

    let expiredCount = 0
    let updatedCount = 0
    let alreadyCorrectCount = 0
    let skippedCount = 0

    for (const m of tiqueteras) {
      const durationMonths = m.plan?.ticketDurationMonths || 2
      const durationDays = durationMonths * 30

      // Use startDate (app-local date) as the start reference, fallback to paymentDate
      // startDate is preferred because paymentDate may be off by 1 day due to UTC timezone shift
      const startRef = m.startDate || m.paymentDate
      if (!startRef) {
        results.push({
          membershipId: m.id,
          clientName: `${m.client.name}${m.client.lastName ? ' ' + m.client.lastName : ''}`,
          clientCedula: m.client.cedula,
          planName: m.plan?.name || m.tarifa || 'Tiquetera',
          ticketDurationMonths: durationMonths,
          paymentDate: m.paymentDate?.toISOString?.() || 'N/A',
          startDate: m.startDate?.toISOString?.() || null,
          currentEndDate: m.endDate?.toISOString?.() || null,
          correctEndDate: 'N/A',
          currentDaysRemaining: m.daysRemaining,
          correctDaysRemaining: 0,
          ticketsRemaining: m.ticketsRemaining,
          action: 'skip_no_start_date',
        })
        skippedCount++
        continue
      }

      // Calculate correct endDate — normalize to date-only (midnight) to avoid off-by-one
      // from time components in paymentDate/startDate
      const startDateRaw = new Date(startRef)
      const startDate = new Date(startDateRaw.getFullYear(), startDateRaw.getMonth(), startDateRaw.getDate())
      const correctEndDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + durationDays)

      const correctEndDateStr = correctEndDate.toISOString().split('T')[0]
      const currentEndDateStr = m.endDate ? new Date(m.endDate).toISOString().split('T')[0] : null

      // Calculate correct daysRemaining (both dates are at midnight, so diff is exact)
      const todayDate = new Date(todayStr)
      const diffMs = correctEndDate.getTime() - todayDate.getTime()
      const correctDaysRemaining = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)))

      const isExpired = correctDaysRemaining <= 0
      const clientFullName = `${m.client.name}${m.client.lastName ? ' ' + m.client.lastName : ''}`
      const planLabel = m.plan?.name || m.tarifa || 'Tiquetera'

      // Check if already correct
      const endDateMatches = currentEndDateStr === correctEndDateStr
      const daysMatch = m.daysRemaining === correctDaysRemaining || (isExpired && m.daysRemaining === 0)

      if (endDateMatches && (daysMatch || isExpired)) {
        results.push({
          membershipId: m.id,
          clientName: clientFullName,
          clientCedula: m.client.cedula,
          planName: planLabel,
          ticketDurationMonths: durationMonths,
          paymentDate: startDate.toISOString().split('T')[0],
          startDate: m.startDate?.toISOString?.()?.split('T')[0] || null,
          currentEndDate: currentEndDateStr,
          correctEndDate: correctEndDateStr,
          currentDaysRemaining: m.daysRemaining,
          correctDaysRemaining: isExpired ? 0 : correctDaysRemaining,
          ticketsRemaining: m.ticketsRemaining,
          action: isExpired ? 'expired' : 'already_correct',
        })
        if (isExpired) {
          expiredCount++
          // Even if dates match, if it should be expired and isn't, fix it
          if (!dryRun && m.status === 'Activo') {
            await db.clientMembership.update({
              where: { id: m.id },
              data: {
                status: 'Vencido',
                daysRemaining: 0,
              },
            })
          }
        } else {
          alreadyCorrectCount++
        }
        continue
      }

      // Needs update
      if (!dryRun) {
        if (isExpired) {
          await db.clientMembership.update({
            where: { id: m.id },
            data: {
              status: 'Vencido',
              endDate: correctEndDate,
              daysRemaining: 0,
            },
          })
          expiredCount++
        } else {
          await db.clientMembership.update({
            where: { id: m.id },
            data: {
              endDate: correctEndDate,
              daysRemaining: correctDaysRemaining,
            },
          })
          updatedCount++
        }
      } else {
        if (isExpired) {
          expiredCount++
        } else {
          updatedCount++
        }
      }

      results.push({
        membershipId: m.id,
        clientName: clientFullName,
        clientCedula: m.client.cedula,
        planName: planLabel,
        ticketDurationMonths: durationMonths,
        paymentDate: startDate.toISOString().split('T')[0],
        startDate: m.startDate?.toISOString?.()?.split('T')[0] || null,
        currentEndDate: currentEndDateStr || 'N/A',
        correctEndDate: correctEndDateStr,
        currentDaysRemaining: m.daysRemaining,
        correctDaysRemaining: isExpired ? 0 : correctDaysRemaining,
        ticketsRemaining: m.ticketsRemaining,
        action: isExpired ? 'expired' : 'updated',
      })
    }

    return NextResponse.json({
      mode: dryRun ? 'DRY_RUN (no changes made)' : 'LIVE (changes applied)',
      today: todayStr,
      totalTiqueteras: tiqueteras.length,
      expired: expiredCount,
      updated: updatedCount,
      alreadyCorrect: alreadyCorrectCount,
      skipped: skippedCount,
      details: results,
    })
  } catch (error) {
    console.error('[fix-tiquetera-durations]', error)
    return NextResponse.json({ error: 'Error al corregir duraciones de tiqueteras' }, { status: 500 })
  }
}
