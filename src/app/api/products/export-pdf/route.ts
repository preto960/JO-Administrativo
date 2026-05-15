import { NextRequest, NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import { db } from '@/lib/db'
import { resolveBranchId } from '@/lib/resolve-branch'

// ─── Colors ───────────────────────────────────────────────────────────────────

const COLORS = {
  primary: '#1e40af',
  primaryLight: '#3b82f6',
  green: '#16a34a',
  red: '#dc2626',
  gray: '#6b7280',
  grayLight: '#f3f4f6',
  grayMedium: '#e5e7eb',
  dark: '#111827',
  white: '#ffffff',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number, decimals = 2): string {
  return amount.toLocaleString('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtDate(d: Date): string {
  return d.toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtStock(stock: number): string {
  return stock % 1 === 0 ? String(Math.round(stock)) : fmt(stock, 2)
}

function altBg(idx: number): string {
  return idx % 2 === 0 ? COLORS.grayLight : COLORS.white
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductRow {
  name: string
  sku: string | null
  categoryName: string
  price: number
  currencySymbol: string
  stock: number
  noStock: boolean
}

// ─── PDF Generator ────────────────────────────────────────────────────────────

function generateProductsPDF(
  products: ProductRow[],
  companyInfo: {
    businessName: string
    rif: string
    address: string
    phone: string
  },
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 40, bottom: 40, left: 45, right: 45 },
      bufferPages: true,
      info: {
        Title: 'Listado de Productos',
        Author: companyInfo.businessName || 'JO-Administrativo',
        Subject: 'Reporte de listado de productos',
      },
    })

    const buffers: Buffer[] = []
    doc.on('data', (chunk) => buffers.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', reject)

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right

    // ─── Fonts ────────────────────────────────────────────────────────────────
    doc.registerFont('Regular', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
    doc.registerFont('Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')

    // ─── Header band ──────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 80).fill(COLORS.primary)

    doc.font('Bold').fontSize(18).fillColor(COLORS.white)
    doc.text(companyInfo.businessName || 'JO-Administrativo', 45, 18, { width: pageWidth })

    doc.font('Regular').fontSize(9).fillColor('#d1d5db')
    const rifLine = companyInfo.rif ? `RIF: ${companyInfo.rif}` : ''
    const addressLine = companyInfo.address || ''
    if (rifLine && addressLine) {
      doc.text(`${rifLine}  |  ${addressLine}${companyInfo.phone ? `  |  Tel: ${companyInfo.phone}` : ''}`, 45, 42, { width: pageWidth })
    } else if (rifLine) {
      doc.text(`${rifLine}${companyInfo.phone ? `  |  Tel: ${companyInfo.phone}` : ''}`, 45, 42, { width: pageWidth })
    } else if (addressLine) {
      doc.text(`${addressLine}${companyInfo.phone ? `  |  Tel: ${companyInfo.phone}` : ''}`, 45, 42, { width: pageWidth })
    }

    doc.font('Bold').fontSize(14).fillColor(COLORS.white)
    doc.text('LISTADO DE PRODUCTOS', 45, 62, { width: pageWidth, align: 'right' })

    doc.fillColor(COLORS.dark)

    // ─── Date ─────────────────────────────────────────────────────────────────
    let y = 95
    doc.font('Regular').fontSize(9).fillColor(COLORS.gray)
    doc.text(`Fecha de generacion: ${fmtDate(new Date())}`, 45, y, { width: pageWidth })
    y += 18

    // ─── Summary ──────────────────────────────────────────────────────────────
    const totalProducts = products.length
    const totalWithStock = products.filter(p => !p.noStock).length
    const totalNoStock = products.filter(p => p.noStock).length

    doc.rect(45, y, pageWidth, 48).fill('#f0f5ff').stroke(COLORS.primaryLight)
    doc.font('Bold').fontSize(10).fillColor(COLORS.primary)
    doc.text('Resumen', 55, y + 6)

    doc.font('Regular').fontSize(9).fillColor(COLORS.dark)
    doc.text(`Total Productos: ${totalProducts}`, 55, y + 22)
    doc.text(`Con Stock: ${totalWithStock}`, 55 + pageWidth * 0.35, y + 22)
    doc.text(`Sin Stock: ${totalNoStock}`, 55 + pageWidth * 0.6, y + 22)

    const inStockPercent = totalProducts > 0 ? ((totalWithStock / totalProducts) * 100).toFixed(1) : '0.0'
    const noStockPercent = totalProducts > 0 ? ((totalNoStock / totalProducts) * 100).toFixed(1) : '0.0'
    doc.font('Regular').fontSize(8).fillColor(COLORS.gray)
    doc.text(`(${inStockPercent}%)`, 55 + pageWidth * 0.35 + 75, y + 23)
    doc.text(`(${noStockPercent}%)`, 55 + pageWidth * 0.6 + 60, y + 23)

    doc.font('Regular').fontSize(9).fillColor(COLORS.dark)
    doc.text(`Productos activos en inventario`, 55, y + 36, { width: pageWidth * 0.5 })

    y += 60

    // ─── Table ────────────────────────────────────────────────────────────────
    const colConfig = {
      num: { label: '#', width: 0.05, align: 'center' as const },
      name: { label: 'Producto', width: 0.32, align: 'left' as const },
      sku: { label: 'SKU', width: 0.12, align: 'center' as const },
      category: { label: 'Categoria', width: 0.18, align: 'left' as const },
      price: { label: 'Precio', width: 0.15, align: 'right' as const },
      stock: { label: 'Stock', width: 0.08, align: 'center' as const },
      noStock: { label: 'Sin Stock', width: 0.10, align: 'center' as const },
    }

    // Column X positions (absolute)
    let xPos = 45
    const cols: { x: number; w: number; label: string; align: string }[] = []
    for (const key of Object.keys(colConfig) as (keyof typeof colConfig)[]) {
      const c = colConfig[key]
      const w = pageWidth * c.width
      cols.push({ x: xPos, w, label: c.label, align: c.align })
      xPos += w
    }

    // Table header
    doc.rect(45, y, pageWidth, 22).fill(COLORS.primary)
    doc.font('Bold').fontSize(8).fillColor(COLORS.white)
    for (const col of cols) {
      const textX = col.align === 'center' ? col.x + col.w / 2 : col.align === 'right' ? col.x + col.w - 5 : col.x + 5
      doc.text(col.label, textX, y + 6, { width: col.w - 10, align: col.align })
    }
    y += 24

    // Table rows
    const rowHeight = 18

    for (let i = 0; i < products.length; i++) {
      const p = products[i]

      // Check if we need a new page
      if (y + rowHeight > doc.page.height - 50) {
        doc.addPage()
        y = 45

        // Re-draw table header on new page
        doc.rect(45, y, pageWidth, 22).fill(COLORS.primary)
        doc.font('Bold').fontSize(8).fillColor(COLORS.white)
        for (const col of cols) {
          const textX = col.align === 'center' ? col.x + col.w / 2 : col.align === 'right' ? col.x + col.w - 5 : col.x + 5
          doc.text(col.label, textX, y + 6, { width: col.w - 10, align: col.align })
        }
        y += 24
      }

      // Alternating row background
      doc.rect(45, y, pageWidth, rowHeight).fill(altBg(i))

      // Row border lines
      doc.moveTo(45, y + rowHeight).lineTo(45 + pageWidth, y + rowHeight)
        .strokeColor(COLORS.grayMedium).lineWidth(0.3).stroke()

      const cellPad = 4
      const rowY = y + cellPad

      // # column
      doc.font('Regular').fontSize(7.5).fillColor(COLORS.gray)
      const numX = cols[0].x + cols[0].w / 2
      doc.text(String(i + 1), numX, rowY, { width: cols[0].w - 10, align: 'center' })

      // Producto
      doc.font('Regular').fontSize(8).fillColor(COLORS.dark)
      doc.text(p.name, cols[1].x + 5, rowY, { width: cols[1].w - 10, align: 'left', lineBreak: false, ellipsis: true })

      // SKU
      doc.font('Regular').fontSize(7.5).fillColor(COLORS.gray)
      const skuX = cols[2].x + cols[2].w / 2
      doc.text(p.sku || '—', skuX, rowY, { width: cols[2].w - 10, align: 'center' })

      // Categoria
      doc.font('Regular').fontSize(7.5).fillColor(COLORS.dark)
      doc.text(p.categoryName || '—', cols[3].x + 5, rowY, { width: cols[3].w - 10, align: 'left', lineBreak: false, ellipsis: true })

      // Precio
      doc.font('Bold').fontSize(8).fillColor(COLORS.dark)
      doc.text(`${p.currencySymbol} ${fmt(p.price)}`, cols[4].x + 5, rowY, { width: cols[4].w - 10, align: 'right' })

      // Stock
      doc.font('Bold').fontSize(8)
      const stockColor = p.noStock ? COLORS.red : COLORS.green
      doc.fillColor(stockColor)
      const stockX = cols[5].x + cols[5].w / 2
      doc.text(fmtStock(p.stock), stockX, rowY, { width: cols[5].w - 10, align: 'center' })

      // Sin Stock column
      doc.font('Bold').fontSize(9)
      if (p.noStock) {
        doc.fillColor(COLORS.red)
        const nsX = cols[6].x + cols[6].w / 2
        doc.text('\u2717', nsX, rowY - 1, { width: cols[6].w - 10, align: 'center' })
      } else {
        doc.fillColor(COLORS.green)
        const nsX = cols[6].x + cols[6].w / 2
        doc.text('\u2713', nsX, rowY - 1, { width: cols[6].w - 10, align: 'center' })
      }

      y += rowHeight
    }

    // Empty state
    if (products.length === 0) {
      doc.rect(45, y, pageWidth, 40).fill(COLORS.grayLight)
      doc.font('Regular').fontSize(10).fillColor(COLORS.gray)
      doc.text('No se encontraron productos con los filtros seleccionados.', 45, y + 13, { width: pageWidth, align: 'center' })
      y += 44
    }

    // ─── Footer ───────────────────────────────────────────────────────────────
    const range = doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i)
      const footerY = doc.page.height - 35

      doc.moveTo(45, footerY).lineTo(doc.page.width - 45, footerY)
        .strokeColor(COLORS.grayMedium).lineWidth(0.5).stroke()

      doc.font('Regular').fontSize(7).fillColor(COLORS.gray)
      const footerCompany = companyInfo.businessName || 'JO-Administrativo'
      const footerRif = companyInfo.rif ? `  |  RIF: ${companyInfo.rif}` : ''
      doc.text(
        `${footerCompany}${footerRif}  |  Generado por JO-Administrativo`,
        45, footerY + 5, { width: pageWidth, align: 'center' },
      )

      if (range.count > 1) {
        doc.text(
          `Pagina ${i + 1} de ${range.count}`,
          45, footerY + 15, { width: pageWidth, align: 'center' },
        )
      }
    }

    doc.end()
  })
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryBranchId = searchParams.get('branchId')
    const activeParam = searchParams.get('active') ?? 'true'
    const categoryId = searchParams.get('categoryId') || ''

    // Build where clause
    const where: Record<string, unknown> = {}
    if (activeParam === 'true') {
      where.active = true
    } else if (activeParam === 'false') {
      where.active = false
    }
    if (categoryId) {
      where.categoryId = categoryId
    }

    // Resolve branch
    const branchId = queryBranchId || await resolveBranchId(request)

    // Fetch products
    const products = await db.product.findMany({
      where,
      include: {
        currency: true,
        category: true,
        inventories: { where: { branchId } },
      },
      orderBy: { name: 'asc' },
    })

    // Fetch company settings
    const settings = await db.settings.findFirst()
    const companyInfo = {
      businessName: settings?.businessName || 'JO-Administrativo',
      rif: settings?.rif || '',
      address: settings?.address || '',
      phone: settings?.phone || '',
    }

    // Build product rows
    const rows: ProductRow[] = products.map(p => {
      const inv = p.inventories[0]
      const stock = inv?.stock ?? 0
      return {
        name: p.name,
        sku: p.sku,
        categoryName: p.category?.name || '',
        price: p.price,
        currencySymbol: p.currency?.symbol || '$',
        stock,
        noStock: !inv || inv.stock <= 0,
      }
    })

    // Generate PDF
    const pdfBuffer = await generateProductsPDF(rows, companyInfo)

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="listado_productos.pdf"',
      },
    })
  } catch (error) {
    console.error('Error generando PDF de productos:', error)
    return NextResponse.json(
      { error: 'Error al generar el PDF de productos' },
      { status: 500 },
    )
  }
}
