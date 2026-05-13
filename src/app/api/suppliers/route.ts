import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const suppliers = await db.supplier.findMany({
      include: {
        _count: { select: { purchases: true } },
      },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(suppliers)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener proveedores' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, rif, phone, email, address } = body

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'El nombre del proveedor es obligatorio' }, { status: 400 })
    }

    // Check if RIF already exists
    if (rif && rif.trim() !== '') {
      const existing = await db.supplier.findUnique({ where: { rif: rif.trim() } })
      if (existing) {
        return NextResponse.json({ error: 'Ya existe un proveedor con ese RIF' }, { status: 400 })
      }
    }

    const supplier = await db.supplier.create({
      data: {
        name: name.trim(),
        rif: rif?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        address: address?.trim() || null,
      },
      include: {
        _count: { select: { purchases: true } },
      },
    })

    return NextResponse.json(supplier)
  } catch (error) {
    console.error('[Suppliers POST] Error:', error)
    return NextResponse.json({ error: 'Error al crear proveedor' }, { status: 500 })
  }
}
