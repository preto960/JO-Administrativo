import { Resend } from 'resend'
import { formatCurrency } from '@/lib/currency'

const resend = new Resend(process.env.RESEND_API_KEY)

// ─── Types ────────────────────────────────────────────────────────────────────

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
  totalRetiros: number
  cashCreditPayments: number
  totalCollected: number
  salesCount?: number
  ivaEnabled?: boolean
  ivaRate?: number
}

interface CashCloseDataWithPDF extends CashCloseData {
  pdfBuffer: Buffer
}

interface CashCloseAllData {
  registersCount: number
  cuts: CashCloseData[]
  pdfBuffer: Buffer
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAdminEmail(): Promise<string | null> {
  const { db } = await import('@/lib/db')
  const settings = await db.settings.findFirst()
  return settings?.email || process.env.ADMIN_EMAIL || null
}

function getFromEmail(): string {
  return process.env.RESEND_FROM || 'JO-Administrativo <onboarding@resend.dev>'
}

function row(label: string, value: string, color?: string, bold = false): string {
  const style = bold ? 'font-weight: bold;' : ''
  const colorStyle = color ? `color: ${color};` : ''
  return `<tr><td style="padding: 6px 0; ${style}">${label}</td><td style="padding: 6px 0; text-align: right; ${style}${colorStyle}">${value}</td></tr>`
}

// ─── Single Register Close Email with PDF ────────────────────────────────────

export async function sendCashCloseEmailWithPDF(data: CashCloseDataWithPDF, currencyCode?: string): Promise<boolean> {
  try {
    const adminEmail = await getAdminEmail()
    if (!adminEmail) {
      console.log('[Email] No admin email configured, skipping cash close notification')
      return false
    }

    const fromEmail = getFromEmail()
    const dateStr = data.closingDate.toLocaleDateString('es-VE')
    const registerLabel = data.registerName || 'Caja'

    const filename = `Cierre_${registerLabel.replace(/\s+/g, '_')}_${data.cashierName.replace(/\s+/g, '_')}_${dateStr.replace(/\//g, '-')}.pdf`

    const cc = data.cashCreditPayments || 0
    const diffColor = data.difference >= 0 ? 'green' : 'red'
    const diffPrefix = data.difference >= 0 ? '+' : ''
    const ccRow = cc > 0 ? row('+ Cobros de credito en efectivo:', `+${formatCurrency(cc, currencyCode)}`, '#16a34a') : ''

    await resend.emails.send({
      from: fromEmail,
      to: [adminEmail],
      subject: `[Cierre de Caja] ${registerLabel} - ${data.cashierName} - ${dateStr}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 24px;">
            <h2 style="color: white; margin: 0 0 4px 0; font-size: 20px;">Cierre de Caja</h2>
            <p style="color: #bfdbfe; margin: 0; font-size: 13px;">Reporte adjunto en PDF con detalle completo</p>
          </div>

          <!-- Info -->
          <div style="background: #f9fafb; padding: 16px 24px; border-bottom: 1px solid #e5e7eb;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="padding: 4px 0; color: #6b7280; width: 80px;">Cajero:</td>
                <td style="padding: 4px 0; font-weight: 600;">${data.cashierName}</td>
                <td style="padding: 4px 0; color: #6b7280; width: 80px;">Sucursal:</td>
                <td style="padding: 4px 0; font-weight: 600;">${data.branchName}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #6b7280;">Caja:</td>
                <td style="padding: 4px 0; font-weight: 600;">${registerLabel}</td>
                <td style="padding: 4px 0; color: #6b7280;">Cierre:</td>
                <td style="padding: 4px 0; font-weight: 600;">${data.closingDate.toLocaleString('es-VE')}</td>
              </tr>
            </table>
          </div>

          <!-- Conciliacion -->
          <div style="padding: 20px 24px;">
            <h3 style="margin: 0 0 12px 0; color: #1e40af; font-size: 14px; border-bottom: 2px solid #1e40af; padding-bottom: 6px;">Conciliacion de Caja Fisica</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              ${row('Monto Inicial:', formatCurrency(data.initialAmt, currencyCode), '#111827', true)}
              ${row('+ Ventas en efectivo:', `+${formatCurrency(data.totalSales, currencyCode)}`, '#16a34a', true)}
              ${ccRow}
              ${data.totalExpenses > 0 ? row('- Total Gastos:', `-${formatCurrency(data.totalExpenses, currencyCode)}`, '#dc2626', true) : ''}
              ${data.totalRetiros > 0 ? row('- Retiros de excedente:', `-${formatCurrency(data.totalRetiros, currencyCode)}`, '#dc2626', true) : ''}
              <tr><td colspan="2" style="border-top: 2px solid #d1d5db; padding: 2px 0;"></td></tr>
              ${row('Esperado en caja:', formatCurrency(data.expected, currencyCode), '#111827', true)}
              ${row('Contado en caja:', formatCurrency(data.actual, currencyCode), '#1e40af', true)}
              ${row('Diferencia:', `${diffPrefix}${formatCurrency(data.difference, currencyCode)}`, diffColor, true)}
            </table>
          </div>

          <!-- Recaudado Total -->
          <div style="padding: 0 24px 20px 24px;">
            <h3 style="margin: 0 0 8px 0; color: #16a34a; font-size: 14px; border-bottom: 2px solid #16a34a; padding-bottom: 6px;">Recaudado Total</h3>
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 18px; text-align: center;">
              <div style="font-size: 12px; color: #16a34a; margin-bottom: 4px;">TOTAL RECAUDADO</div>
              <div style="font-size: 24px; font-weight: bold; color: #15803d;">${formatCurrency(data.totalCollected, currencyCode)}</div>
            </div>
          </div>

          <!-- PDF Badge -->
          <div style="margin: 0 24px 20px 24px; background: #eff6ff; padding: 14px; border-radius: 8px; text-align: center; border: 1px dashed #93c5fd;">
            <p style="margin: 0; color: #1e40af; font-weight: bold; font-size: 13px;">PDF adjunto con detalle completo</p>
            <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 11px;">Productos vendidos, metodos de pago, gastos, entradas y mas</p>
          </div>

          <!-- Footer -->
          <div style="background: #f9fafb; padding: 12px 24px; border-top: 1px solid #e5e7eb; text-align: center;">
            <p style="margin: 0; color: #9ca3af; font-size: 11px;">JO-Administrativo - Sistema de Gestion</p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename,
          content: data.pdfBuffer,
        },
      ],
    })

    console.log(`[Email] Cash close notification with PDF sent to ${adminEmail}`)
    return true
  } catch (error) {
    console.error('[Email] Failed to send cash close notification:', error)
    return false
  }
}

// ─── Mass Close Email with PDF ───────────────────────────────────────────────

export async function sendCashCloseAllEmailWithPDF(data: CashCloseAllData, currencyCode?: string): Promise<boolean> {
  try {
    const adminEmail = await getAdminEmail()
    if (!adminEmail) {
      console.log('[Email] No admin email configured, skipping mass cash close notification')
      return false
    }

    const fromEmail = getFromEmail()
    const dateStr = new Date().toLocaleDateString('es-VE')
    const grandTotalRecaudado = data.cuts.reduce((sum, c) => sum + (c.totalCollected || 0), 0)
    const grandTotalActual = data.cuts.reduce((sum, c) => sum + c.actual, 0)

    const rows = data.cuts.map(c => {
      const salesCol = c.salesCount
        ? `<td style="padding: 10px; text-align: center; font-size: 13px;">${c.salesCount}</td>`
        : ''
      return `
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 10px; font-size: 13px;">${c.cashierName}</td>
          <td style="padding: 10px; font-size: 13px;">${c.registerName || '—'}</td>
          ${salesCol}
          <td style="padding: 10px; text-align: right; font-weight: 600; color: #16a34a; font-size: 13px;">${formatCurrency(c.totalCollected || 0, currencyCode)}</td>
          <td style="padding: 10px; text-align: right; font-weight: 600; color: #1e40af; font-size: 13px;">${formatCurrency(c.actual, currencyCode)}</td>
        </tr>
      `
    }).join('')

    const salesHeader = data.cuts.some(c => c.salesCount !== undefined)
      ? `<th style="padding: 12px 10px; text-align: center; font-size: 12px;">Ventas</th>`
      : ''

    const filename = `Cierre_Masivo_${data.registersCount}_cajas_${dateStr.replace(/\//g, '-')}.pdf`

    await resend.emails.send({
      from: fromEmail,
      to: [adminEmail],
      subject: `[Cierre Masivo] ${data.registersCount} cajas cerradas - ${dateStr}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 24px;">
            <h2 style="color: white; margin: 0 0 4px 0; font-size: 20px;">Cierre Masivo de Cajas</h2>
            <p style="color: #bfdbfe; margin: 0; font-size: 13px;">${data.registersCount} caja(s) cerradas</p>
          </div>

          <!-- Summary Table -->
          <div style="padding: 20px 24px;">
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; font-size: 13px;">
              <thead>
                <tr style="background: #f9fafb;">
                  <th style="padding: 12px 10px; text-align: left; font-size: 12px; color: #374151;">Cajero</th>
                  <th style="padding: 12px 10px; text-align: left; font-size: 12px; color: #374151;">Caja</th>
                  ${salesHeader}
                  <th style="padding: 12px 10px; text-align: right; font-size: 12px; color: #374151;">Recaudado</th>
                  <th style="padding: 12px 10px; text-align: right; font-size: 12px; color: #374151;">En Caja</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
                <tr style="border-top: 2px solid #d1d5db; font-weight: bold; background: #f0f5ff;">
                  <td colspan="${salesHeader ? '4' : '3'}" style="padding: 12px 10px; text-align: right; font-size: 13px;">Total General:</td>
                  <td style="padding: 12px 10px; text-align: right; color: #16a34a; font-size: 14px;">${formatCurrency(grandTotalRecaudado, currencyCode)}</td>
                </tr>
                <tr style="font-weight: bold; background: #f0f5ff;">
                  <td colspan="${salesHeader ? '4' : '3'}" style="padding: 6px 10px 12px 10px; text-align: right; font-size: 13px;">Efectivo en cajas:</td>
                  <td style="padding: 6px 10px 12px 10px; text-align: right; color: #1e40af; font-size: 14px;">${formatCurrency(grandTotalActual, currencyCode)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- PDF Badge -->
          <div style="margin: 0 24px 20px 24px; background: #eff6ff; padding: 14px; border-radius: 8px; text-align: center; border: 1px dashed #93c5fd;">
            <p style="margin: 0; color: #1e40af; font-weight: bold; font-size: 13px;">PDF adjunto con detalle completo de cada caja</p>
            <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 11px;">Productos vendidos, metodos de pago, gastos, entradas y mas por cada caja cerrada</p>
          </div>

          <!-- Footer -->
          <div style="background: #f9fafb; padding: 12px 24px; border-top: 1px solid #e5e7eb; text-align: center;">
            <p style="margin: 0; color: #9ca3af; font-size: 11px;">JO-Administrativo - Sistema de Gestion</p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename,
          content: data.pdfBuffer,
        },
      ],
    })

    console.log(`[Email] Mass cash close notification with PDF sent to ${adminEmail}`)
    return true
  } catch (error) {
    console.error('[Email] Failed to send mass cash close notification:', error)
    return false
  }
}

// ─── Legacy functions (kept for backward compatibility) ───────────────────────

export async function sendCashCloseEmail(data: CashCloseData, currencyCode?: string): Promise<boolean> {
  try {
    const adminEmail = await getAdminEmail()
    if (!adminEmail) {
      console.log('[Email] No admin email configured, skipping cash close notification')
      return false
    }

    const fromEmail = getFromEmail()

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
                <td style="padding: 6px 0; text-align: right; font-weight: bold;">${formatCurrency(data.initialAmt, currencyCode)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0;">Total Ventas (efectivo):</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; color: green;">+${formatCurrency(data.totalSales, currencyCode)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0;">Total Gastos:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; color: red;">-${formatCurrency(data.totalExpenses, currencyCode)}</td>
              </tr>
              <tr style="border-top: 2px solid #333;">
                <td style="padding: 6px 0; font-weight: bold;">Total en Caja:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold;">${formatCurrency(data.actual, currencyCode)}</td>
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
  totalRetiros: number
}>, currencyCode?: string): Promise<boolean> {
  try {
    const adminEmail = await getAdminEmail()
    if (!adminEmail) {
      console.log('[Email] No admin email configured, skipping cash close notification')
      return false
    }

    const fromEmail = getFromEmail()
    const grandTotal = cuts.reduce((sum, c) => sum + c.actual, 0)

    const rows = cuts.map(c => {
      return `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px;">${c.cashierName}</td>
          <td style="padding: 8px;">${c.registerName || '—'}</td>
          <td style="padding: 8px; text-align: right;">${formatCurrency(c.totalSales, currencyCode)}</td>
          <td style="padding: 8px; text-align: right;">${formatCurrency(c.actual, currencyCode)}</td>
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
                <th style="padding: 10px; text-align: right;">Total en Caja</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
              <tr style="border-top: 2px solid #333; font-weight: bold;">
                <td colspan="3" style="padding: 10px; text-align: right;">Total General:</td>
                <td style="padding: 10px; text-align: right;">${formatCurrency(grandTotal, currencyCode)}</td>
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