import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const suppliers = await db.supplier.findMany({
      include: {
        payables: {
          where: { status: { in: ['pendiente', 'parcial'] } },
          select: { dueDate: true, pendingBalance: true },
          orderBy: { dueDate: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    })

    // Compute derived fields
    const enriched = suppliers.map(s => {
      const nextDue = s.payables.find(p => p.dueDate)?.dueDate || null
      const totalDebt = s.payables.reduce((sum, p) => sum + p.pendingBalance, 0)
      return {
        id: s.id,
        name: s.name,
        rif: s.rif,
        phone: s.phone,
        email: s.email,
        address: s.address,
        balance: Math.round(totalDebt * 100) / 100,
        nextDueDate: nextDue,
      }
    })

    return NextResponse.json(enriched)
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
    })

    return NextResponse.json({ ...supplier, nextDueDate: null })
  } catch (error) {
    console.error('[Suppliers POST] Error:', error)
    return NextResponse.json({ error: 'Error al crear proveedor' }, { status: 500 })
  }
}
