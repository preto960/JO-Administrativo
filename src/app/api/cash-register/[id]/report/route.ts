import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { buildReportFromRegister, generateCashClosePDF } from '@/lib/cash-close-pdf'
import { getPaymentMethodsFromDB, FALLBACK_METHODS } from '@/lib/payment-methods'

// GET /api/cash-register/[id]/report — generate and download PDF for a cash register
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const register = await db.cashRegister.findUnique({
      where: { id },
      include: {
        sales: {
          where: { status: 'completada' },
          include: {
            payments: { include: { currency: { select: { code: true } } } },
            lines: { include: { product: { select: { name: true } } } },
            client: { select: { name: true, lastName: true } },
          },
        },
        movements: true,
        cuts: true,
        user: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, name: true } },
      },
    })

    if (!register) {
      return NextResponse.json({ error: 'Caja no encontrada' }, { status: 404 })
    }

    // Calculate totals
    const pmList = await getPaymentMethodsFromDB().catch(() => FALLBACK_METHODS)
    const cashCodes = new Set(pmList.filter(m => m.isCash).map(m => m.code))
    const totalSales = register.sales.reduce((sum, sale) =>
      sum + sale.payments.filter(p => cashCodes.has(p.method)).reduce((s, p) => s + p.amount, 0), 0)
    const totalExpenses = register.movements.filter(m => m.type === 'salida').reduce((sum, m) => sum + m.amount, 0)
    const isNonCashCreditMovement = (concept: string) => {
      if (!concept.startsWith('Cobro credito:')) return false
      const match = concept.match(/\((.+)\)\s*$/)
      if (!match) return false
      const methodName = match[1].trim()
      const pm = pmList.find(p => p.name === methodName)
      return pm ? !pm.isCash : true
    }
    const totalEntries = register.movements.filter(m => m.type === 'entrada' && !isNonCashCreditMovement(m.concept)).reduce((sum, m) => sum + m.amount, 0)
    const totalRetiros = register.movements.filter(m => m.type === 'retiro_excedente').reduce((sum, m) => sum + m.amount, 0)
    const expected = Math.round((register.initialAmt + totalSales + totalEntries - totalExpenses - totalRetiros) * 100) / 100

    const cut = register.cuts[0]
    const actual = cut?.actual ?? register.currentAmt
    const difference = Math.round((actual - expected) * 100) / 100
    const closingDate = register.closingDate || new Date()

    const settings = await db.settings.findFirst()

    const report = await buildReportFromRegister(
      register as any,
      closingDate,
      actual,
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

    const filename = `cierre_${(register.name || 'caja').replace(/\s+/g, '_')}_${closingDate.toISOString().slice(0, 10)}.pdf`

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('[GET cash-register report]', error)
    return NextResponse.json({ error: 'Error al generar reporte' }, { status: 500 })
  }
}