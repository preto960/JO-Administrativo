import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { buildReportFromRegister, generateCashClosePDF } from '@/lib/cash-close-pdf'

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
        sales: {
          where: { status: 'completada' },
          include: {
            payments: { include: { currency: { select: { code: true } } } },
            lines: { include: { product: { select: { name: true } } } },
            client: { select: { name: true } },
          },
        },
        movements: true,
        user: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, name: true } },
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

    const totalRetiros = register.movements
      .filter(m => m.type === 'retiro_excedente')
      .reduce((sum, m) => sum + m.amount, 0)

    const expected = Math.round((register.initialAmt + totalSales + totalEntries - totalExpenses - totalRetiros) * 100) / 100
    const actualAmt = actual !== undefined ? actual : expected
    const difference = Math.round((actualAmt - expected) * 100) / 100
    const closingDate = new Date()

    const cut = await db.$transaction(async (tx) => {
      await tx.cashRegister.update({
        where: { id: cashRegId },
        data: {
          status: 'cerrada',
          closingDate,
          currentAmt: actualAmt,
        },
      })

      return tx.cashCut.create({
        data: {
          cashRegId,
          totalSales: Math.round(totalSales * 100) / 100,
          totalExpenses: Math.round(totalExpenses * 100) / 100,
          totalRetiros: Math.round(totalRetiros * 100) / 100,
          expected,
          actual: actualAmt,
          difference,
        },
      })
    })

    // Send email with PDF report to admin (async, don't block response)
    import('@/lib/email').then(async ({ sendCashCloseEmailWithPDF }) => {
      try {
        const settings = await db.settings.findFirst()
        const report = await buildReportFromRegister(
          register as any,
          closingDate,
          actualAmt,
          expected,
          difference,
          totalSales,
          totalExpenses,
          totalEntries,
          totalRetiros,
          settings?.businessName || 'JO-Administrativo',
          settings?.rif || '',
          settings?.address || '',
          settings?.phone || '',
          settings?.exchangeRate || 0,
          settings?.referenceCurrency || 'USD',
          settings?.ivaEnabled || false,
          settings?.ivaRate || 0,
        )
        const pdfBuffer = await generateCashClosePDF(report)
        await sendCashCloseEmailWithPDF({
          cashierName: register.user.name,
          registerName: register.name,
          branchName: register.branch.name,
          openingDate: register.openingDate,
          closingDate,
          initialAmt: register.initialAmt,
          expected,
          actual: actualAmt,
          difference,
          totalSales,
          totalExpenses,
          totalRetiros,
          salesCount: register.sales.length,
          ivaEnabled: settings?.ivaEnabled || false,
          ivaRate: settings?.ivaRate || 0,
          pdfBuffer,
        })
      } catch (e) {
        console.error('[Email] Failed to generate/send PDF for cash close:', e)
      }
    })

    // Create notification for the cashier whose register was closed
    if (register.user.id) {
      await db.notification.create({
        data: {
          userId: register.user.id,
          title: 'Caja Cerrada',
          message: `Tu caja "${register.name || 'Sin nombre'}" en la sucursal "${register.branch.name}" ha sido cerrada por un administrador. Monto final: $${actualAmt.toFixed(2)}`,
          type: 'warning',
        },
      })
    }

    return NextResponse.json(cut)
  } catch (error) {
    return NextResponse.json({ error: 'Error al cerrar caja' }, { status: 500 })
  }
}
