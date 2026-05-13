import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const branchId = searchParams.get('branchId') || 'sucursal-1'

    const registers = await db.cashRegister.findMany({
      where: { branchId },
      orderBy: { openingDate: 'desc' },
      include: {
        user: { select: { id: true, name: true } },
        _count: { select: { sales: true, movements: true } },
      },
    })

    return NextResponse.json(registers)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener caja' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, initialAmt, branchId } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }

    const effectiveBranchId = branchId || 'sucursal-1'

    // Check if there's an open register for this branch
    const openRegister = await db.cashRegister.findFirst({
      where: { branchId: effectiveBranchId, status: 'abierta' },
    })
    if (openRegister) {
      return NextResponse.json(
        { error: 'Ya existe una caja abierta en esta sucursal', register: openRegister },
        { status: 400 }
      )
    }

    const register = await db.cashRegister.create({
      data: {
        userId,
        branchId: effectiveBranchId,
        initialAmt: initialAmt || 0,
        currentAmt: initialAmt || 0,
        status: 'abierta',
      },
      include: { user: { select: { id: true, name: true } } },
    })
    return NextResponse.json(register, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al abrir caja' }, { status: 500 })
  }
}
