import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const supplier = await db.supplier.findUnique({
      where: { id },
      include: {
        _count: {
          select: { purchases: true, payables: true, payments: true },
        },
        payables: {
          where: { status: { in: ['pendiente', 'parcial'] } },
          select: {
            id: true,
            amount: true,
            pendingBalance: true,
            dueDate: true,
            status: true,
          },
        },
      },
    })

    if (!supplier) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
    }

    return NextResponse.json(supplier)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener proveedor' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, rif, phone, email, address } = body

    const supplier = await db.supplier.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(rif !== undefined ? { rif: rif || null } : {}),
        ...(phone !== undefined ? { phone: phone || null } : {}),
        ...(email !== undefined ? { email: email || null } : {}),
        ...(address !== undefined ? { address: address || null } : {}),
      },
    })

    return NextResponse.json(supplier)
  } catch (error) {
    return NextResponse.json({ error: 'Error al actualizar proveedor' }, { status: 500 })
  }
}
