import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') || ''
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''
    const branchId = await resolveBranchId(request)

    const where: Record<string, unknown> = { branchId, deletedAt: null }
    if (category) where.category = category
    if (from || to) {
      where.date = {}
      if (from) (where.date as Record<string, unknown>).gte = new Date(from)
      if (to) (where.date as Record<string, unknown>).lte = new Date(to)
    }

    const expenses = await db.expense.findMany({
      where,
      include: {
        currency: true,
        user: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: 50,
    })
    return NextResponse.json(expenses)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener gastos' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const branchId = body.branchId || await resolveBranchId()
    const expense = await db.expense.create({
      data: {
        branchId,
        category: body.category,
        description: body.description,
        amount: body.amount,
        currencyId: body.currencyId,
        userId: body.userId,
      },
      include: { currency: true, user: { select: { name: true } } },
    })
    return NextResponse.json(expense, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear gasto' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID es requerido' }, { status: 400 })
    }

    // Soft delete
    await db.expense.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({ message: 'Gasto eliminado (soft delete)' })
  } catch (error) {
    return NextResponse.json({ error: 'Error al eliminar gasto' }, { status: 500 })
  }
}
