import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { cashRegId, actual } = body

    if (!cashRegId) {
      return NextResponse.json({ error: 'cashRegId es requerido' }, { status: 400 })
    }

    const register = await db.cashRegister.findUnique({
      where: { id: cashRegId },
      include: {
        sales: { where: { status: 'completada' }, include: { payments: true } },
        movements: true,
      },
    })

    if (!register) {
      return NextResponse.json({ error: 'Caja no encontrada' }, { status: 404 })
    }

    if (register.status === 'cerrada') {
      return NextResponse.json({ error: 'La caja ya está cerrada' }, { status: 400 })
    }

    // Calculate totals from sales (cash payments only)
    const totalSales = register.sales.reduce((sum, sale) => {
      return sum + sale.payments
        .filter(p => p.method === 'efectivo')
        .reduce((s, p) => s + p.amount, 0)
    }, 0)

    // Calculate totals from movements
    const totalExpenses = register.movements
      .filter(m => m.type === 'salida')
      .reduce((sum, m) => sum + m.amount, 0)

    const totalEntries = register.movements
      .filter(m => m.type === 'entrada')
      .reduce((sum, m) => sum + m.amount, 0)

    const expected = Math.round((register.initialAmt + totalSales + totalEntries - totalExpenses) * 100) / 100
    const actualAmt = actual !== undefined ? actual : expected
    const difference = Math.round((actualAmt - expected) * 100) / 100

    const cut = await db.$transaction(async (tx) => {
      await tx.cashRegister.update({
        where: { id: cashRegId },
        data: {
          status: 'cerrada',
          closingDate: new Date(),
          currentAmt: actualAmt,
        },
      })

      return tx.cashCut.create({
        data: {
          cashRegId,
          totalSales: Math.round(totalSales * 100) / 100,
          totalExpenses: Math.round(totalExpenses * 100) / 100,
          expected,
          actual: actualAmt,
          difference,
        },
      })
    })

    return NextResponse.json(cut)
  } catch (error) {
    return NextResponse.json({ error: 'Error al cerrar caja' }, { status: 500 })
  }
}
