import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const branches = await db.branch.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: {
          select: {
            inventories: true,
            sales: true,
            purchases: true,
            cashRegisters: true,
            expenses: true,
          },
        },
      },
    })
    return NextResponse.json(branches)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener sucursales' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, address, phone } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    }

    // Auto-generate code based on count
    const count = await db.branch.count()
    const code = `sucursal-${count + 1}`

    const branch = await db.branch.create({
      data: {
        name: name.trim(),
        code,
        address: address?.trim() || null,
        phone: phone?.trim() || null,
      },
    })

    return NextResponse.json(branch, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear sucursal' }, { status: 500 })
  }
}
