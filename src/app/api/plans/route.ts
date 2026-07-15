import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'
import { fetchAppTz } from '@/lib/tz-helpers'

const VALID_DURATION_TYPES = ['1_mes', 'bimestral', 'anual', 'dia', 'otro'] as const
const VALID_PLAN_TYPES = ['dias', 'horario', 'tickets'] as const

/** Convert a Date to YYYY-MM-DD string in the given timezone */
function toDateStr(d: Date, tz: string): string {
  return d.toLocaleDateString('sv-SE', { timeZone: tz })
}

/** Calculate the effective price for a plan at a given moment */
async function getEffectivePrice(plan: { cost: number; discountPercentage: number; discountStartDate: Date | null; discountEndDate: Date | null; promoPrice: number | null; promoStartDate: Date | null; promoEndDate: Date | null }, now: Date, tz: string): Promise<{ price: number; hasPromo: boolean; hasDiscount: boolean }> {
  let basePrice = plan.cost
  let hasPromo = false
  let hasDiscount = false

  const nowStr = toDateStr(now, tz)

  // Check promo price (replaces base price if active)
  if (plan.promoPrice != null && plan.promoPrice > 0 && plan.promoStartDate && plan.promoEndDate) {
    const startStr = toDateStr(plan.promoStartDate, tz)
    const endStr = toDateStr(plan.promoEndDate, tz)
    if (nowStr >= startStr && nowStr <= endStr) {
      basePrice = plan.promoPrice
      hasPromo = true
    }
  }

  // Check discount percentage (applied on top of base/promo price)
  if (plan.discountPercentage > 0 && plan.discountStartDate && plan.discountEndDate) {
    const startStr = toDateStr(plan.discountStartDate, tz)
    const endStr = toDateStr(plan.discountEndDate, tz)
    if (nowStr >= startStr && nowStr <= endStr) {
      basePrice = Math.round((basePrice - (basePrice * plan.discountPercentage / 100)) * 100) / 100
      hasDiscount = true
    }
  }

  return { price: basePrice, hasPromo, hasDiscount }
}

export async function GET() {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  // GET is read-only (used in selectors) — any authenticated user can fetch plans

  try {
    const plans = await db.plan.findMany({
      orderBy: { createdAt: 'asc' },
    })
    const now = new Date()
    const { timezone } = await fetchAppTz()
    // Attach effective price to each plan
    const plansWithPrice = await Promise.all(plans.map(async p => {
      const { price, hasPromo, hasDiscount } = await getEffectivePrice(p, now, timezone)
      return { ...p, effectivePrice: price, hasActivePromo: hasPromo, hasActiveDiscount: hasDiscount }
    }))
    return NextResponse.json(plansWithPrice)
  } catch (error) {
    console.error('[Plans GET]', error)
    return NextResponse.json({ error: 'Error al obtener planes' }, { status: 500 })
  }
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
    const { name, planType, durationType, durationDays, ticketCount, startTime, endTime, cost, description, discountPercentage, discountStartDate, discountEndDate, promoPrice, promoStartDate, promoEndDate } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }

    const resolvedPlanType = planType || 'dias'
    if (!VALID_PLAN_TYPES.includes(resolvedPlanType)) {
      return NextResponse.json({ error: 'Tipo de plan inválido' }, { status: 400 })
    }

    // Validations per planType
    if (resolvedPlanType === 'dias') {
      if (!durationType || !VALID_DURATION_TYPES.includes(durationType)) {
        return NextResponse.json({ error: 'Tipo de duración inválido' }, { status: 400 })
      }
      if (durationType === 'otro' && (!durationDays || durationDays <= 0)) {
        return NextResponse.json({ error: 'Debes especificar los días para duración personalizada' }, { status: 400 })
      }
    }

    if (resolvedPlanType === 'horario') {
      if (!startTime || !endTime) {
        return NextResponse.json({ error: 'Debes especificar la hora de inicio y fin' }, { status: 400 })
      }
    }

    if (resolvedPlanType === 'tickets') {
      if (!ticketCount || ticketCount <= 0) {
        return NextResponse.json({ error: 'Debes especificar la cantidad de tickets' }, { status: 400 })
      }
    }

    const plan = await db.plan.create({
      data: {
        name: name.trim(),
        planType: resolvedPlanType,
        durationType: resolvedPlanType === 'dias' ? (durationType || '1_mes') : '1_mes',
        durationDays: resolvedPlanType === 'dias' && durationType === 'otro' ? Number(durationDays) : null,
        ticketCount: resolvedPlanType === 'tickets' ? Number(ticketCount) : 0,
        startTime: resolvedPlanType === 'horario' ? startTime : null,
        endTime: resolvedPlanType === 'horario' ? endTime : null,
        cost: Number(cost) || 0,
        description: description?.trim() || null,
        discountPercentage: Number(discountPercentage) || 0,
        discountStartDate: discountStartDate ? new Date(discountStartDate + 'T12:00:00Z') : null,
        discountEndDate: discountEndDate ? new Date(discountEndDate + 'T12:00:00Z') : null,
        promoPrice: promoPrice != null ? Number(promoPrice) : null,
        promoStartDate: promoStartDate ? new Date(promoStartDate + 'T12:00:00Z') : null,
        promoEndDate: promoEndDate ? new Date(promoEndDate + 'T12:00:00Z') : null,
      },
    })

    const now = new Date()
    const { timezone } = await fetchAppTz()
    const { price, hasPromo, hasDiscount } = await getEffectivePrice(plan, now, timezone)
    return NextResponse.json({ ...plan, effectivePrice: price, hasActivePromo: hasPromo, hasActiveDiscount: hasDiscount }, { status: 201 })
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Ya existe un plan con ese nombre' }, { status: 409 })
    }
    console.error('[Plans POST]', error)
    return NextResponse.json({ error: 'Error al crear plan' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth
  const perms = getPermissions(auth.role)
  if (!perms.canManageClients) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { id, name, planType, durationType, durationDays, ticketCount, startTime, endTime, cost, description, active, discountPercentage, discountStartDate, discountEndDate, promoPrice, promoStartDate, promoEndDate } = body

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    }
    if (!name?.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }

    const resolvedPlanType = planType || 'dias'
    if (!VALID_PLAN_TYPES.includes(resolvedPlanType)) {
      return NextResponse.json({ error: 'Tipo de plan inválido' }, { status: 400 })
    }

    // Validations per planType
    if (resolvedPlanType === 'dias' && durationType && !VALID_DURATION_TYPES.includes(durationType)) {
      return NextResponse.json({ error: 'Tipo de duración inválido' }, { status: 400 })
    }
    if (resolvedPlanType === 'dias' && durationType === 'otro' && (!durationDays || durationDays <= 0)) {
      return NextResponse.json({ error: 'Debes especificar los días para duración personalizada' }, { status: 400 })
    }
    if (resolvedPlanType === 'horario' && (!startTime || !endTime)) {
      return NextResponse.json({ error: 'Debes especificar la hora de inicio y fin' }, { status: 400 })
    }
    if (resolvedPlanType === 'tickets' && (!ticketCount || ticketCount <= 0)) {
      return NextResponse.json({ error: 'Debes especificar la cantidad de tickets' }, { status: 400 })
    }

    const plan = await db.plan.update({
      where: { id },
      data: {
        name: name.trim(),
        planType: resolvedPlanType,
        durationType: resolvedPlanType === 'dias' ? (durationType || '1_mes') : '1_mes',
        durationDays: resolvedPlanType === 'dias' && durationType === 'otro' ? Number(durationDays) : null,
        ticketCount: resolvedPlanType === 'tickets' ? Number(ticketCount) : 0,
        startTime: resolvedPlanType === 'horario' ? startTime : null,
        endTime: resolvedPlanType === 'horario' ? endTime : null,
        cost: cost !== undefined ? Number(cost) : undefined,
        description: description !== undefined ? (description?.trim() || null) : undefined,
        active: active !== undefined ? active : undefined,
        discountPercentage: discountPercentage !== undefined ? Number(discountPercentage) : undefined,
        discountStartDate: discountStartDate ? new Date(discountStartDate + 'T12:00:00Z') : (discountStartDate === null ? null : undefined),
        discountEndDate: discountEndDate ? new Date(discountEndDate + 'T12:00:00Z') : (discountEndDate === null ? null : undefined),
        promoPrice: promoPrice !== undefined ? (promoPrice != null ? Number(promoPrice) : null) : undefined,
        promoStartDate: promoStartDate ? new Date(promoStartDate + 'T12:00:00Z') : (promoStartDate === null ? null : undefined),
        promoEndDate: promoEndDate ? new Date(promoEndDate + 'T12:00:00Z') : (promoEndDate === null ? null : undefined),
      },
    })

    const now = new Date()
    const { timezone } = await fetchAppTz()
    const { price, hasPromo, hasDiscount } = await getEffectivePrice(plan, now, timezone)
    return NextResponse.json({ ...plan, effectivePrice: price, hasActivePromo: hasPromo, hasActiveDiscount: hasDiscount })
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Ya existe un plan con ese nombre' }, { status: 409 })
    }
    console.error('[Plans PUT]', error)
    return NextResponse.json({ error: 'Error al actualizar plan' }, { status: 500 })
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
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    }

    await db.plan.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2025') {
      return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 })
    }
    console.error('[Plans DELETE]', error)
    return NextResponse.json({ error: 'Error al eliminar plan' }, { status: 500 })
  }
}