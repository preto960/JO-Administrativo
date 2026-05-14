import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'

export async function GET(request: NextRequest) {
  try {
    const branchId = await resolveBranchId(request)

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
    const { userId, initialAmt, branchId, name } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }

    const effectiveBranchId = body.branchId || await resolveBranchId()

    // Allow multiple open registers per branch - removed the single-check

    const register = await db.cashRegister.create({
      data: {
        name: name?.trim() || null,
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
