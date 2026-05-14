import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

interface CashCloseData {
  cashierName: string
  registerName: string | null
  branchName: string
  openingDate: Date
  closingDate: Date
  initialAmt: number
  expected: number
  actual: number
  difference: number
  totalSales: number
  totalExpenses: number
}

export async function sendCashCloseEmail(data: CashCloseData): Promise<boolean> {
  try {
    // Get admin email from settings
    const { db } = await import('@/lib/db')
    const settings = await db.settings.findFirst()
    const adminEmail = settings?.email || process.env.ADMIN_EMAIL

    if (!adminEmail) {
      console.log('[Email] No admin email configured, skipping cash close notification')
      return false
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'JO-Administrativo <onboarding@resend.dev>'

    const diffText = data.difference > 0
      ? `<span style="color: green;">Sobrante: $${data.difference.toFixed(2)}</span>`
      : data.difference < 0
        ? `<span style="color: red;">Faltante: $${Math.abs(data.difference).toFixed(2)}</span>`
        : `<span style="color: green;">Cuadrado</span>`

    await resend.emails.send({
      from: fromEmail,
      to: [adminEmail],
      subject: `[Cierre de Caja] ${data.registerName || 'Caja'} - ${data.cashierName} - ${new Date().toLocaleDateString('es-VE')}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Cierre de Caja</h2>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Cajero:</td>
                <td style="padding: 8px 0;">${data.cashierName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Caja:</td>
                <td style="padding: 8px 0;">${data.registerName || 'Sin nombre'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Sucursal:</td>
                <td style="padding: 8px 0;">${data.branchName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Apertura:</td>
                <td style="padding: 8px 0;">${data.openingDate.toLocaleString('es-VE')}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Cierre:</td>
                <td style="padding: 8px 0;">${data.closingDate.toLocaleString('es-VE')}</td>
              </tr>
            </table>
          </div>
          <div style="margin-top: 16px; background: #fff; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h3 style="margin: 0 0 12px 0; color: #333;">Resumen</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0;">Monto Inicial:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold;">$${data.initialAmt.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0;">Total Ventas (efectivo):</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; color: green;">+$${data.totalSales.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0;">Total Gastos:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; color: red;">-$${data.totalExpenses.toFixed(2)}</td>
              </tr>
              <tr style="border-top: 2px solid #333;">
                <td style="padding: 6px 0; font-weight: bold;">Esperado:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold;">$${data.expected.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold;">Real:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold;">$${data.actual.toFixed(2)}</td>
              </tr>
              <tr style="border-top: 2px solid #333;">
                <td style="padding: 6px 0; font-weight: bold;">Resultado:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold;">${diffText}</td>
              </tr>
            </table>
          </div>
          <p style="margin-top: 16px; color: #999; font-size: 12px; text-align: center;">
            JO-Administrativo - Sistema de Gestion
          </p>
        </div>
      `,
    })

    console.log(`[Email] Cash close notification sent to ${adminEmail}`)
    return true
  } catch (error) {
    console.error('[Email] Failed to send cash close notification:', error)
    return false
  }
}

export async function sendCashCloseAllEmail(cuts: Array<{
  cashierName: string
  registerName: string | null
  branchName: string
  openingDate: Date
  closingDate: Date
  initialAmt: number
  expected: number
  actual: number
  difference: number
  totalSales: number
  totalExpenses: number
}>): Promise<boolean> {
  try {
    const { db } = await import('@/lib/db')
    const settings = await db.settings.findFirst()
    const adminEmail = settings?.email || process.env.ADMIN_EMAIL

    if (!adminEmail) {
      console.log('[Email] No admin email configured, skipping cash close notification')
      return false
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'JO-Administrativo <onboarding@resend.dev>'

    const grandTotal = cuts.reduce((sum, c) => sum + c.actual, 0)

    const rows = cuts.map(c => {
      const diffText = c.difference > 0
        ? `<span style="color: green;">+$${c.difference.toFixed(2)}</span>`
        : c.difference < 0
          ? `<span style="color: red;">-$${Math.abs(c.difference).toFixed(2)}</span>`
          : `Cuadrado`
      return `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px;">${c.cashierName}</td>
          <td style="padding: 8px;">${c.registerName || '—'}</td>
          <td style="padding: 8px; text-align: right;">$${c.totalSales.toFixed(2)}</td>
          <td style="padding: 8px; text-align: right;">$${c.actual.toFixed(2)}</td>
          <td style="padding: 8px; text-align: center;">${diffText}</td>
        </tr>
      `
    }).join('')

    await resend.emails.send({
      from: fromEmail,
      to: [adminEmail],
      subject: `[Cierre Masivo] ${cuts.length} cajas cerradas - ${new Date().toLocaleDateString('es-VE')}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
          <h2 style="color: #333;">Cierre Masivo de Cajas</h2>
          <p>${cuts.length} caja(s) han sido cerradas.</p>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd; border-radius: 8px; margin-top: 16px;">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="padding: 10px; text-align: left;">Cajero</th>
                <th style="padding: 10px; text-align: left;">Caja</th>
                <th style="padding: 10px; text-align: right;">Ventas</th>
                <th style="padding: 10px; text-align: right;">Total</th>
                <th style="padding: 10px; text-align: center;">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
              <tr style="border-top: 2px solid #333; font-weight: bold;">
                <td colspan="3" style="padding: 10px; text-align: right;">Total General:</td>
                <td style="padding: 10px; text-align: right;">$${grandTotal.toFixed(2)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
          <p style="margin-top: 16px; color: #999; font-size: 12px; text-align: center;">
            JO-Administrativo - Sistema de Gestion
          </p>
        </div>
      `,
    })

    console.log(`[Email] Mass cash close notification sent to ${adminEmail}`)
    return true
  } catch (error) {
    console.error('[Email] Failed to send mass cash close notification:', error)
    return false
  }
}
