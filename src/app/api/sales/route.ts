import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || ''
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit
    const branchId = await resolveBranchId(request)

    const where: Record<string, unknown> = { branchId }
    if (status) where.status = status
    if (from || to) {
      where.date = {}
      if (from) (where.date as Record<string, unknown>).gte = new Date(from)
      if (to) (where.date as Record<string, unknown>).lte = new Date(to)
    }

    const [sales, total] = await Promise.all([
      db.sale.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
          payments: { include: { currency: true } },
          lines: { include: { product: { select: { id: true, name: true } } } },
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      db.sale.count({ where }),
    ])

    return NextResponse.json({
      data: sales,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener ventas' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clientId, cashRegId, userId, lines, payments } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }
    if (!lines || lines.length === 0) {
      return NextResponse.json({ error: 'Debe incluir al menos una línea de venta' }, { status: 400 })
    }

    // Fetch product costAvg for each line
    const branchId = body.branchId || await resolveBranchId()
    const productIds = lines.map((l: { productId: string }) => l.productId)
    const products = await db.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, costAvg: true, price: true },
    })
    const productMap = new Map(products.map((p) => [p.id, p]))

    // Calculate totals
    let total = 0
    const saleLinesData = lines.map((line: { productId: string; quantity: number; unitPrice: number }) => {
      const product = productMap.get(line.productId)
      const unitCost = product?.costAvg || 0
      const unitPrice = line.unitPrice || product?.price || 0
      const lineTotal = line.quantity * unitPrice
      const lineProfit = line.quantity * (unitPrice - unitCost)
      total += lineTotal
      return {
        productId: line.productId,
        quantity: line.quantity,
        unitPrice,
        unitCost,
        lineTotal: Math.round(lineTotal * 100) / 100,
        lineProfit: Math.round(lineProfit * 100) / 100,
      }
    })

    total = Math.round(total * 100) / 100

    // Create sale with lines and payments in a transaction
    const sale = await db.$transaction(async (tx) => {
      const newSale = await tx.sale.create({
        data: {
          clientId: clientId || null,
          cashRegId: cashRegId || null,
          userId,
          branchId,
          total,
          status: 'completada',
          lines: { create: saleLinesData },
          payments: {
            create: payments.map((p: { method: string; amount: number; currencyId: string; reference?: string }) => ({
              method: p.method,
              amount: p.amount,
              currencyId: p.currencyId,
              reference: p.reference || null,
            })),
          },
        },
        include: {
          lines: { include: { product: { select: { id: true, name: true } } } },
          payments: { include: { currency: true } },
          client: { select: { id: true, name: true } },
        },
      })

      // Deduct inventory stock for each product
      for (const line of lines) {
        const inventory = await tx.inventory.findUnique({
          where: { productId_branchId: { productId: line.productId, branchId } },
        })
        if (inventory) {
          await tx.inventory.update({
            where: { id: inventory.id },
            data: { stock: { decrement: line.quantity } },
          })
        }
      }

      // Low stock notification to admin users
      const adminUsers = await tx.user.findMany({
        where: { role: 'admin', active: true },
        select: { id: true },
      })

      for (const admin of adminUsers) {
        for (const line of lines) {
          const inv = await tx.inventory.findUnique({
            where: { productId_branchId: { productId: line.productId, branchId } },
            include: { product: { select: { name: true } } },
          })
          if (inv && inv.stock <= inv.minStock && inv.minStock > 0) {
            await tx.notification.create({
              data: {
                userId: admin.id,
                title: 'Stock Bajo',
                message: `"${inv.product.name}" tiene ${inv.stock} unidades (mín: ${inv.minStock}). Reposición necesaria.`,
                type: 'warning',
              },
            })
          }
        }
      }

      // Update cash register currentAmt if cash payment
      if (cashRegId) {
        const cashPayments = payments.filter((p: { method: string }) => p.method === 'efectivo')
        const cashTotal = cashPayments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0)
        if (cashTotal > 0) {
          const reg = await tx.cashRegister.findUnique({ where: { id: cashRegId } })
          if (reg) {
            await tx.cashRegister.update({
              where: { id: cashRegId },
              data: { currentAmt: Math.round((reg.currentAmt + cashTotal) * 100) / 100 },
            })
          }
        }
      }

      // Handle credit sale - create account receivable
      const creditPayments = payments.filter((p: { method: string }) => p.method === 'credito')
      for (const cp of creditPayments) {
        if (clientId) {
          await tx.accountReceivable.create({
            data: {
              clientId,
              saleId: newSale.id,
              amount: cp.amount,
              pendingBalance: cp.amount,
              status: 'pendiente',
              dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          })
        }
      }

      return newSale
    })

    return NextResponse.json(sale, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear venta' }, { status: 500 })
  }
}
