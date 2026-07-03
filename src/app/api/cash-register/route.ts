import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'
import { logAction } from '@/lib/audit-log'
import { formatCurrency } from '@/lib/currency'
import { getPaymentMethodsFromDB, FALLBACK_METHODS } from '@/lib/payment-methods'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if ('status' in auth) return auth
    const perms = getPermissions(auth.role)

    const { searchParams } = new URL(request.url)
    const queryBranchId = searchParams.get('branchId')
    const branchId = queryBranchId || await resolveBranchId(request)

    // Cajeros solo ven sus propias cajas; admin y gerente ven todas
    const isCajero = auth.role === 'cajero'

    const registers = await db.cashRegister.findMany({
      where: {
        branchId,
        ...(isCajero ? { userId: auth.userId } : {}),
      },
      orderBy: { openingDate: 'desc' },
      include: {
        user: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        _count: { select: { sales: true, movements: true } },
      },
    })

    // Recalculate currentAmt for open registers from actual data
    const pmList = await getPaymentMethodsFromDB().catch(() => FALLBACK_METHODS)
    const creditCodes = new Set(pmList.filter(m => m.isCredit).map(m => m.code))
    const cashCodes = new Set(pmList.filter(m => m.isCash).map(m => m.code))

    const openRegs = registers.filter(r => r.status === 'abierta')
    if (openRegs.length > 0) {
      const openRegIds = openRegs.map(r => r.id)

      // Get all non-credit payments for open registers
      const allPayments = await db.salePayment.findMany({
        where: {
          sale: { cashRegId: { in: openRegIds } },
          method: { notIn: [...creditCodes] },
        },
        include: { sale: { select: { cashRegId: true } } },
      })

      // Get all manual movements for open registers (exclude subscription-linked)
      const allMovements = await db.cashMovement.findMany({
        where: { cashRegId: { in: openRegIds } },
      })

      for (const reg of openRegs) {
        // All non-credit payments for this register
        const regPayments = allPayments.filter(p => p.sale.cashRegId === reg.id)

        // Recaudado = ALL non-credit payments (efectivo + transferencia + divisas + ...)
        const totalCollected = Math.round(regPayments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100

        // Physical cash only (isCash) — what should actually be in the drawer
        const cashTotal = Math.round(regPayments.filter(p => cashCodes.has(p.method)).reduce((sum, p) => sum + p.amount, 0) * 100) / 100

        // Sum manual movements (exclude subscription/sale-linked: [saleId] prefix or Suscripción/Renovación)
        const manualMovements = allMovements.filter(m =>
          m.cashRegId === reg.id &&
          !m.concept.match(/^\[[\w-]+\]\s*/) &&
          !m.concept.includes('Suscripción') &&
          !m.concept.includes('Renovación')
        )
        const netMovements = manualMovements.reduce((sum, m) =>
          sum + (m.type === 'entrada' ? m.amount : -m.amount), 0)

        const expectedAmt = Math.round((reg.initialAmt + cashTotal + netMovements) * 100) / 100

        // Update DB if stale
        if (Math.abs(reg.currentAmt - expectedAmt) > 0.01) {
          await db.cashRegister.update({
            where: { id: reg.id },
            data: { currentAmt: expectedAmt },
          })
          reg.currentAmt = expectedAmt
        }

        // Attach totalCollected for frontend "Recaudado" display
        ;(reg as any).totalCollected = totalCollected
      }
    }

    return NextResponse.json(registers)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener caja' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, initialAmt, branchId, name } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }

    const effectiveBranchId = body.branchId || await resolveBranchId()

    const settings = await db.settings.findFirst()

    const register = await db.cashRegister.create({
      data: {
        name: name?.trim() || null,
        userId,
        branchId: effectiveBranchId,
        initialAmt: initialAmt || 0,
        currentAmt: initialAmt || 0,
        status: 'abierta',
        currencyId: settings?.baseCurrencyId || '',
      },
      include: { user: { select: { id: true, name: true } } },
    })

    await logAction({
      action: 'open_cash',
      entity: 'cash_register',
      entityId: register.id,
      details: { summary: `Caja abierta: ${formatCurrency(initialAmt || 0)}`, initialAmount: initialAmt || 0 },
      request,
    })

    return NextResponse.json(register, { status: 201 })
  } catch (error: unknown) {
    console.error('Error al abrir caja:', error)
    const msg = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: `Error al abrir caja: ${msg}` }, { status: 500 })
  }
}
