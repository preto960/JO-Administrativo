import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const currencies = await db.currency.findMany({
      include: {
        exchangeRatesTo: {
          where: { fromCurrency: { isBase: true } },
          orderBy: { date: 'desc' },
          take: 1,
          include: { fromCurrency: true },
        },
      },
      orderBy: [{ isBase: 'desc' }, { code: 'asc' }],
    })
    return NextResponse.json(currencies)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener monedas' }, { status: 500 })
  }
}
