import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const product = await db.product.findUnique({
      where: { id },
      include: {
        currency: true,
        category: true,
        inventories: true,
        recipeAsParent: {
          include: {
            componentProduct: {
              include: { currency: true, inventories: true },
            },
          },
        },
        saleLines: { take: 5, orderBy: { sale: { date: 'desc' } }, include: { sale: { select: { date: true, total: true } } } },
      },
    })

    if (!product) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    }

    return NextResponse.json(product)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener producto' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const product = await db.product.update({
      where: { id },
      data: {
        name: body.name,
        sku: body.sku || null,
        type: body.type,
        costAvg: body.costAvg,
        price: body.price,
        currencyId: body.currencyId,
        categoryId: body.categoryId || null,
        active: body.active,
      },
      include: { currency: true, category: true },
    })
    return NextResponse.json(product)
  } catch (error) {
    return NextResponse.json({ error: 'Error al actualizar producto' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const product = await db.product.update({
      where: { id },
      data: { active: false },
    })
    return NextResponse.json(product)
  } catch (error) {
    return NextResponse.json({ error: 'Error al eliminar producto' }, { status: 500 })
  }
}
