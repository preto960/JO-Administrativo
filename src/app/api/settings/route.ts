import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { logAction } from '@/lib/audit-log'

export async function GET() {
  try {
    // Get the single settings row (firstOrCreate pattern)
    let settings = await db.settings.findFirst()
    if (!settings) {
      settings = await db.settings.create({
        data: {
          key: 'general',
          businessName: 'JO-Administrativo',
          logoUrl: '',
          address: '',
          phone: '',
          rif: '',
          email: '',
          baseCurrencyId: '',
          sessionDuration: 28800,
          notificationsEnabled: true,
          primaryColor: 'blue',
          secondaryColor: 'slate',
          theme: 'light',
          referenceCurrency: 'USD',
          usdRate: 0,
          eurRate: 0,
          customRate: 0,
          exchangeRate: 36.50,
        },
      })
    }
    return NextResponse.json(settings)
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener configuración' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()

    let settings = await db.settings.findFirst()
    if (!settings) {
      settings = await db.settings.create({
        data: body,
      })
    } else {
      settings = await db.settings.update({
        where: { id: settings.id },
        data: body,
      })
    }

    // Log which fields changed (excluding sensitive data)
    const changedFields = Object.keys(body).filter(k => !['id', 'createdAt', 'updatedAt'].includes(k))
    logAction({
      action: 'update',
      entity: 'settings',
      entityId: settings.id,
      details: { summary: `Configuración actualizada: ${changedFields.join(', ')}`, fields: changedFields },
      request: request as any,
    })

    return NextResponse.json(settings)
  } catch (error) {
    return NextResponse.json({ error: 'Error al guardar configuración' }, { status: 500 })
  }
}
