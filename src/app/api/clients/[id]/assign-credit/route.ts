import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { logAction } from '@/lib/audit-log'

/**
 * POST /api/clients/[id]/assign-credit
 * Assign credit (create an AccountReceivable) directly to a client.
 * Works for any client regardless of membership status.
 *
 * Body: {
 *   amount: number          — credit amount
 *   currencyId?: string     — currency of the credit (defaults to base currency)
 *   description?: string    — optional description (e.g. "Crédito manual", "Deuda previa")
 *   dueDateDays?: number    — days until due (default 30)
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  const { id: clientId } = await params

  try {
    const body = await request.json()
    const { amount, currencyId, description, dueDateDays } = body

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 })
    }

    // Verify client exists
    const client = await db.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, lastName: true },
    })

    if (!client) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    // Resolve currency
    const settings = await db.settings.findFirst()
    let resolvedCurrencyId = currencyId || settings?.baseCurrencyId || ''
    if (!resolvedCurrencyId) {
      const refCurrency = await db.currency.findFirst({ where: { code: settings?.referenceCurrency || 'USD' } })
      resolvedCurrencyId = refCurrency?.id || ''
    }

    if (!resolvedCurrencyId) {
      return NextResponse.json({ error: 'No hay moneda base configurada' }, { status: 400 })
    }

    const days = dueDateDays && dueDateDays > 0 ? dueDateDays : 30
    const dueDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    const clientName = `${client.name}${client.lastName ? ' ' + client.lastName : ''}`
    const concept = description || `Crédito asignado`
    const branchId = (await db.branch.findFirst({ select: { id: true } }))?.id || ''
    const roundedAmount = Math.round(amount * 100) / 100

    // Create Sale + Receivable in a transaction
    const result = await db.$transaction(async (tx) => {
      // 1. Create the Sale (tracks in purchase history)
      const sale = await tx.sale.create({
        data: {
          clientId,
          userId: auth.userId,
          branchId,
          total: roundedAmount,
          originalTotal: roundedAmount,
          discountAmount: 0,
          discountNotes: concept,
          status: 'completada',
          currencyId: resolvedCurrencyId,
          syncStatus: 'synced',
          payments: {
            create: {
              method: 'credito',
              amount: roundedAmount,
              currencyId: resolvedCurrencyId,
            },
          },
        },
      })

      // 2. Create the AccountReceivable linked to the Sale
      const receivable = await tx.accountReceivable.create({
        data: {
          clientId,
          saleId: sale.id,
          amount: roundedAmount,
          pendingBalance: roundedAmount,
          status: 'pendiente',
          currencyId: resolvedCurrencyId,
          createdById: auth.userId,
          dueDate,
        },
      })

      return { sale, receivable }
    })

    // Audit log
    await logAction({
      action: 'create',
      entity: 'account_receivable',
      entityId: result.receivable.id,
      details: {
        summary: `Crédito asignado: ${fmtAmount(roundedAmount)} a ${clientName}`,
        clientId,
        amount: roundedAmount,
        dueDate: dueDate.toISOString().split('T')[0],
        description: concept,
        saleId: result.sale.id,
      },
      request,
    })

    return NextResponse.json({
      message: `Crédito de ${fmtAmount(roundedAmount)} asignado a ${clientName}`,
      receivable: result.receivable,
      saleId: result.sale.id,
    }, { status: 201 })

  } catch (error: unknown) {
    console.error('[Assign Credit Error]', error)
    const msg = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: `Error al asignar crédito: ${msg}` }, { status: 500 })
  }
}

function fmtAmount(n: number): string {
  return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
