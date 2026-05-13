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
