import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const users = await db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(users)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener usuarios' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email, password, role } = body

    if (!name || !email) {
      return NextResponse.json({ error: 'Nombre y email son requeridos' }, { status: 400 })
    }

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'El email ya está registrado' }, { status: 400 })
    }

    const user = await db.user.create({
      data: {
        name,
        email,
        password: password || 'changeme',
        role: role || 'cajero',
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    })

    return NextResponse.json(user, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear usuario' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, name, email, role, active, password } = body

    if (!id) {
      return NextResponse.json({ error: 'ID es requerido' }, { status: 400 })
    }

    const data: Record<string, unknown> = {}
    if (name !== undefined) data.name = name
    if (email !== undefined) data.email = email
    if (role !== undefined) data.role = role
    if (active !== undefined) data.active = active
    if (password) data.password = password

    const user = await db.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    })

    return NextResponse.json(user)
  } catch (error) {
    return NextResponse.json({ error: 'Error al actualizar usuario' }, { status: 500 })
  }
}
