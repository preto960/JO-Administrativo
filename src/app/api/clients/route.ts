import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = { deletedAt: null }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
      ]
    }

    const clients = await db.client.findMany({
      where,
      include: {
        _count: { select: { sales: true } },
        receivables: {
          where: { status: 'pendiente' },
          select: { pendingBalance: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    // Compute pending balance for each client
    const clientsWithBalance = clients.map(client => {
      const pendingBalance = client.receivables.reduce((sum, r) => sum + r.pendingBalance, 0)
      return {
        ...client,
        pendingBalance: Math.round(pendingBalance * 100) / 100,
      }
    })

    return NextResponse.json(clientsWithBalance)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener clientes' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const client = await db.client.create({
      data: {
        name: body.name,
        phone: body.phone || null,
        email: body.email || null,
        address: body.address || null,
        note: body.note || null,
      },
    })
    return NextResponse.json(client, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear cliente' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, name, phone, email, address, note } = body

    if (!id) {
      return NextResponse.json({ error: 'ID es requerido' }, { status: 400 })
    }

    const client = await db.client.update({
      where: { id },
      data: {
        name,
        phone: phone || null,
        email: email || null,
        address: address || null,
        note: note || null,
      },
    })

    return NextResponse.json(client)
  } catch (error) {
    return NextResponse.json({ error: 'Error al actualizar cliente' }, { status: 500 })
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
    await db.client.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({ message: 'Cliente eliminado (soft delete)' })
  } catch (error) {
    return NextResponse.json({ error: 'Error al eliminar cliente' }, { status: 500 })
  }
}
