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
        user: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, name: true } },
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
          include: { cashReg: { include: { user: { select: { name: true } }, branch: { select: { name: true } } } } },
        })

        cuts.push(cut)
      }
      return cuts
    })

    // Send email notification to admin (async)
    const closingDate = new Date()
    import('@/lib/email').then(({ sendCashCloseAllEmail }) => {
      sendCashCloseAllEmail(
        openRegisters.map(r => {
          const totalSales = r.sales.reduce((sum, sale) => {
            return sum + sale.payments.filter(p => p.method === 'efectivo').reduce((s, p) => s + p.amount, 0)
          }, 0)
          const totalExpenses = r.movements.filter(m => m.type === 'salida').reduce((sum, m) => sum + m.amount, 0)
          const totalEntries = r.movements.filter(m => m.type === 'entrada').reduce((sum, m) => sum + m.amount, 0)
          const expected = Math.round((r.initialAmt + totalSales + totalEntries - totalExpenses) * 100) / 100
          return {
            cashierName: r.user.name,
            registerName: r.name,
            branchName: r.branch.name,
            openingDate: r.openingDate,
            closingDate,
            initialAmt: r.initialAmt,
            expected,
            actual: expected,
            difference: 0,
            totalSales,
            totalExpenses,
          }
        })
      ).catch(() => {})
    })

    // Create notifications for all cashiers whose registers were closed
    for (const reg of openRegisters) {
      await db.notification.create({
        data: {
          userId: reg.user.id,
          title: 'Caja Cerrada',
          message: `Todas las cajas de la sucursal "${reg.branch.name}" han sido cerradas. Tu caja "${reg.name || 'Sin nombre'}" ha sido cerrada automáticamente.`,
          type: 'warning',
        },
      })
    }

    return NextResponse.json({
      message: `${results.length} caja(s) cerrada(s)`,
      cuts: results,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al cerrar cajas' }, { status: 500 })
  }
}
