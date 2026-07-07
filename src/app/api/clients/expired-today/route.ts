import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { fetchToday } from '@/lib/tz-helpers'

export async function GET() {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  try {
    const today = await fetchToday()
    const tomorrow = new Date(today)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

    const clients = await db.client.findMany({
      where: {
        deletedAt: null,
        memberships: {
          some: {
            endDate: { gte: today, lt: tomorrow },
            status: { in: ['Vencido', 'Activo'] },
          },
        },
      },
      select: {
        id: true,
        name: true,
        lastName: true,
        cedula: true,
        email: true,
        phone: true,
        memberships: {
          where: { endDate: { gte: today, lt: tomorrow } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            tarifa: true,
            endDate: true,
            daysRemaining: true,
            status: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    const formatted = clients.map((c, i) => ({
      index: i + 1,
      id: c.id,
      name: c.name,
      lastName: c.lastName || '',
      fullName: `${c.name}${c.lastName ? ' ' + c.lastName : ''}`,
      cedula: c.cedula ? formatCedula(c.cedula) : '',
      cedulaRaw: c.cedula || '',
      email: c.email || '',
      phone: c.phone || '',
      tarifa: c.memberships[0]?.tarifa || '',
      fechaVencimiento: c.memberships[0]?.endDate ? new Date(c.memberships[0].endDate).toISOString().split('T')[0] : '',
      diasRestantes: c.memberships[0]?.daysRemaining ?? 0,
      status: c.memberships[0]?.status || '',
    }))

    return NextResponse.json({ clients: formatted, date: today.toISOString().split('T')[0], total: formatted.length })
  } catch (error) {
    console.error('[ExpiredToday]', error)
    return NextResponse.json({ error: 'Error al consultar' }, { status: 500 })
  }
}

function formatCedula(c: string): string {
  const digits = c.replace(/\D/g, '')
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}