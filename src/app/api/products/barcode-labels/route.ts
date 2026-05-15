import { NextRequest, NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import bwipjs from 'bwip-js'
import { db } from '@/lib/db'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LabelItem {
  productId: string
  quantity: number
}

// ─── Barcode generator ───────────────────────────────────────────────────────

async function generateBarcode(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text,
    scale: 3,
    height: 8,
    includetext: false,
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 1) + '\u2026'
}

function formatPrice(price: number): string {
  return price.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// ─── Label layout constants ───────────────────────────────────────────────────

const MARGIN = 30
const COLS = 3
const LABEL_WIDTH = 165
const LABEL_HEIGHT = 90
const LABEL_GAP_X = 10
const LABEL_GAP_Y = 10

// ─── POST Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { products } = body as { products?: LabelItem[] }

    // ── Validate request ─────────────────────────────────────────────────────
    if (!products || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json(
        { error: 'Se requiere un arreglo de productos con productId y quantity.' },
        { status: 400 },
      )
    }

    for (const item of products) {
      if (!item.productId || typeof item.quantity !== 'number' || item.quantity < 1) {
        return NextResponse.json(
          { error: 'Cada producto debe tener productId (string) y quantity (number >= 1).' },
          { status: 400 },
        )
      }
    }

    // ── Fetch products from DB ───────────────────────────────────────────────
    const productIds = products.map((p) => p.productId)
    const dbProducts = await db.product.findMany({
      where: { id: { in: productIds } },
      include: { currency: { select: { symbol: true, code: true } } },
    })

    if (dbProducts.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron productos con los IDs proporcionados.' },
        { status: 404 },
      )
    }

    // Build a lookup map
    const productMap = new Map(dbProducts.map((p) => [p.id, p]))

    // ── Expand labels with quantity ──────────────────────────────────────────
    type LabelData = {
      name: string
      sku: string
      price: string
      barcodeText: string
    }

    const labels: LabelData[] = []
    for (const item of products) {
      const product = productMap.get(item.productId)
      if (!product) continue // skip unknown products

      const sku = product.sku || product.id.slice(0, 8)
      const priceStr = `${product.currency.symbol}${formatPrice(product.price)}`

      for (let i = 0; i < item.quantity; i++) {
        labels.push({
          name: product.name,
          sku,
          price: priceStr,
          barcodeText: sku,
        })
      }
    }

    if (labels.length === 0) {
      return NextResponse.json(
        { error: 'No se generaron etiquetas.' },
        { status: 400 },
      )
    }

    // ── Generate barcode images (cache unique barcodes) ──────────────────────
    const barcodeCache = new Map<string, Buffer>()
    async function getBarcode(text: string): Promise<Buffer> {
      if (!barcodeCache.has(text)) {
        barcodeCache.set(text, await generateBarcode(text))
      }
      return barcodeCache.get(text)!
    }

    // Pre-generate all unique barcodes
    const uniqueBarcodes = [...new Set(labels.map((l) => l.barcodeText))]
    await Promise.all(uniqueBarcodes.map((text) => getBarcode(text)))

    // ── Create PDF ───────────────────────────────────────────────────────────
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        bufferPages: true,
        info: {
          Title: 'Etiquetas de Productos',
          Author: 'JO-Administrativo',
          Subject: 'Codigos de barras para productos',
        },
      })

      const buffers: Buffer[] = []
      doc.on('data', (chunk: Buffer) => buffers.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(buffers)))
      doc.on('error', reject)

      // Register fonts
      doc.registerFont('Regular', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
      doc.registerFont('Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')

      const pageW = doc.page.width
      const pageH = doc.page.height
      const usableW = pageW - MARGIN * 2

      let labelIndex = 0
      let col = 0
      let row = 0

      // Calculate rows per page
      const rowHeight = LABEL_HEIGHT + LABEL_GAP_Y
      const rowsPerPage = Math.floor((pageH - MARGIN * 2) / rowHeight)

      function drawLabel(x: number, y: number, label: LabelData) {
        // Dotted border
        doc
          .save()
          .rect(x, y, LABEL_WIDTH, LABEL_HEIGHT)
          .dash(2, { space: 2 })
          .strokeColor('#999999')
          .lineWidth(0.5)
          .stroke()
          .restore()

        const padX = 6
        const padY = 5
        const innerW = LABEL_WIDTH - padX * 2

        // ── Product name (bold, top) ──────────────────────────────────────
        doc.font('Bold').fontSize(9).fillColor('#111827')
        doc.text(
          truncate(label.name, 28),
          x + padX,
          y + padY,
          { width: innerW, lineBreak: false, ellipsis: true },
        )

        // ── Barcode image (middle) ───────────────────────────────────────
        const barcodeBuf = barcodeCache.get(label.barcodeText)!
        const barcodeW = Math.min(120, innerW)
        const barcodeH = 30
        const barcodeX = x + padX + (innerW - barcodeW) / 2
        const barcodeY = y + padY + 14
        doc.image(barcodeBuf, barcodeX, barcodeY, { width: barcodeW, height: barcodeH })

        // ── SKU text (below barcode) ─────────────────────────────────────
        doc.font('Regular').fontSize(7).fillColor('#6b7280')
        doc.text(
          label.sku,
          x + padX,
          y + padY + 46,
          { width: innerW, align: 'center', lineBreak: false },
        )

        // ── Price (bottom) ───────────────────────────────────────────────
        doc.font('Bold').fontSize(10).fillColor('#111827')
        doc.text(
          label.price,
          x + padX,
          y + padY + 58,
          { width: innerW, align: 'center', lineBreak: false },
        )
      }

      // Draw first page (it's already created)
      // We use doc.y reference but track manually
      let currentY = MARGIN
      let currentPageRows = 0

      while (labelIndex < labels.length) {
        // Check if we need a new page
        if (currentPageRows >= rowsPerPage) {
          doc.addPage()
          currentY = MARGIN
          currentPageRows = 0
        }

        const x = MARGIN + col * (LABEL_WIDTH + LABEL_GAP_X)
        const y = currentY + row * (LABEL_HEIGHT + LABEL_GAP_Y)

        drawLabel(x, y, labels[labelIndex])

        labelIndex++
        col++
        if (col >= COLS) {
          col = 0
          row++
          currentPageRows++
          if (currentPageRows >= rowsPerPage) {
            row = 0
          }
        }
      }

      doc.end()
    })

    // ── Return PDF ───────────────────────────────────────────────────────────
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="etiquetas_productos.pdf"',
      },
    })
  } catch (error) {
    console.error('Error generando etiquetas de producto:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor al generar las etiquetas.' },
      { status: 500 },
    )
  }
}
