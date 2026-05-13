import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const categoryId = searchParams.get('categoryId') || ''
    const active = searchParams.get('active')

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { sku: { contains: search } },
      ]
    }
    if (categoryId) {
      where.categoryId = categoryId
    }
    if (active === 'true') {
      where.active = true
    } else if (active === 'false') {
      where.active = false
    }
    // If active is 'all' or not provided, show all products (no active filter)

    const products = await db.product.findMany({
      where,
      include: {
        currency: true,
        category: true,
        inventories: { where: { branchId: 'sucursal-1' } },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(products)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener productos' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const product = await db.product.create({
      data: {
        name: body.name,
        sku: body.sku || null,
        type: body.type || 'simple',
        costAvg: body.costAvg || 0,
        price: body.price,
        currencyId: body.currencyId,
        categoryId: body.categoryId || null,
      },
      include: { currency: true, category: true },
    })

    // Create inventory entry
    await db.inventory.create({
      data: {
        productId: product.id,
        branchId: 'sucursal-1',
        stock: 0,
        minStock: body.minStock || 0,
      },
    })

    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear producto' }, { status: 500 })
  }
}
