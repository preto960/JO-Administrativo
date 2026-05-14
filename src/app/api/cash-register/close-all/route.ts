import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const branchId = body.branchId || await resolveBranchId()

    const openRegisters = await db.cashRegister.findMany({
      where: { branchId, status: 'abierta' },
      include: {
        sales: { where: { status: 'completada' }, include: { payments: true } },
        movements: true,
      },
    })

    if (openRegisters.length === 0) {
      return NextResponse.json({ message: 'No hay cajas abiertas' })
    }

    const results = await db.$transaction(async (tx) => {
      const cuts = []
      for (const register of openRegisters) {
        const totalSales = register.sales.reduce((sum, sale) => {
          return sum + sale.payments
            .filter(p => p.method === 'efectivo')
            .reduce((s, p) => s + p.amount, 0)
        }, 0)

        const totalExpenses = register.movements
          .filter(m => m.type === 'salida')
          .reduce((sum, m) => sum + m.amount, 0)

        const totalEntries = register.movements
          .filter(m => m.type === 'entrada')
          .reduce((sum, m) => sum + m.amount, 0)

        const expected = Math.round((register.initialAmt + totalSales + totalEntries - totalExpenses) * 100) / 100
        const actual = expected

        await tx.cashRegister.update({
          where: { id: register.id },
          data: {
            status: 'cerrada',
            closingDate: new Date(),
            currentAmt: actual,
          },
        })

        const cut = await tx.cashCut.create({
          data: {
            cashRegId: register.id,
            totalSales: Math.round(totalSales * 100) / 100,
            totalExpenses: Math.round(totalExpenses * 100) / 100,
            expected,
            actual,
            difference: 0,
          },
          include: { cashReg: { include: { user: { select: { name: true } } } } },
        })

        cuts.push(cut)
      }
      return cuts
    })

    return NextResponse.json({
      message: `${results.length} caja(s) cerrada(s)`,
      cuts: results,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al cerrar cajas' }, { status: 500 })
  }
}
