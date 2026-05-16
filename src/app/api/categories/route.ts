import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const categories = await db.category.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(categories)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener categorías' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name } = body

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'El nombre de la categoría es obligatorio' }, { status: 400 })
    }

    // Check if category with same name already exists
    const existing = await db.category.findUnique({ where: { name: name.trim() } })
    if (existing) {
      return NextResponse.json({ error: 'Ya existe una categoría con ese nombre' }, { status: 400 })
    }

    const category = await db.category.create({
      data: { name: name.trim() },
      include: { _count: { select: { products: true } } },
    })

    return NextResponse.json(category)
  } catch (error) {
    console.error('[Categories POST] Error:', error)
    return NextResponse.json({ error: 'Error al crear categoría' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, name } = body

    if (!id || !name || name.trim() === '') {
      return NextResponse.json({ error: 'ID y nombre son obligatorios' }, { status: 400 })
    }

    // Check if another category with same name exists
    const existing = await db.category.findFirst({
      where: { name: name.trim(), id: { not: id } },
    })
    if (existing) {
      return NextResponse.json({ error: 'Ya existe una categoría con ese nombre' }, { status: 400 })
    }

    const category = await db.category.update({
      where: { id },
      data: { name: name.trim() },
      include: { _count: { select: { products: true } } },
    })

    return NextResponse.json(category)
  } catch (error) {
    console.error('[Categories PUT] Error:', error)
    return NextResponse.json({ error: 'Error al actualizar categoría' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID es requerido' }, { status: 400 })
    }

    // Check if category has products
    const category = await db.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    })

    if (!category) {
      return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })
    }

    if (category._count.products > 0) {
      return NextResponse.json(
        { error: `No se puede eliminar. Tiene ${category._count.products} producto(s) asociado(s). Elimina o reasigna los productos primero.` },
        { status: 400 }
      )
    }

    await db.category.delete({ where: { id } })

    return NextResponse.json({ message: 'Categoría eliminada' })
  } catch (error) {
    console.error('[Categories DELETE] Error:', error)
    return NextResponse.json({ error: 'Error al eliminar categoría' }, { status: 500 })
  }
}
