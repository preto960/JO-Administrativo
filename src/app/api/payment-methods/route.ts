import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ── Default payment method templates ──────────────────────────────

const DEFAULT_METHODS = [
  { code: 'divisas', name: 'Divisas', icon: 'Banknote', needsReference: false, isLocalCurrency: false, isCash: false, isCredit: false, sortOrder: 0, countries: 'ALL' },
  { code: 'efectivo', name: 'Efectivo', icon: 'Banknote', needsReference: false, isLocalCurrency: true, isCash: true, isCredit: false, sortOrder: 1, countries: 'ALL' },
  { code: 'pago_movil', name: 'Pago Móvil', icon: 'Smartphone', needsReference: true, isLocalCurrency: true, isCash: false, isCredit: false, sortOrder: 2, countries: 'VE' },
  { code: 'tarjeta', name: 'Tarjeta', icon: 'CreditCard', needsReference: true, isLocalCurrency: true, isCash: false, isCredit: false, sortOrder: 3, countries: 'ALL' },
  { code: 'transferencia', name: 'Transferencia', icon: 'ArrowLeftRight', needsReference: true, isLocalCurrency: true, isCash: false, isCredit: false, sortOrder: 4, countries: 'ALL' },
  { code: 'credito', name: 'Crédito', icon: 'Clock', needsReference: false, isLocalCurrency: false, isCash: false, isCredit: true, sortOrder: 5, countries: 'ALL' },
]

interface PM {
  id: string; code: string; name: string; icon: string; enabled: boolean
  needsReference: boolean; isLocalCurrency: boolean; isCash: boolean; isCredit: boolean
  sortOrder: number; countries: string; createdAt: string; updatedAt: string
}

async function ensureTable() {
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PaymentMethod" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "code" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "icon" TEXT NOT NULL DEFAULT 'Banknote',
        "enabled" BOOLEAN NOT NULL DEFAULT true,
        "needsReference" BOOLEAN NOT NULL DEFAULT false,
        "isLocalCurrency" BOOLEAN NOT NULL DEFAULT false,
        "isCash" BOOLEAN NOT NULL DEFAULT false,
        "isCredit" BOOLEAN NOT NULL DEFAULT false,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "countries" TEXT NOT NULL DEFAULT 'ALL',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
      );
    `)
    try {
      await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PaymentMethod_code_key" ON "PaymentMethod"("code");`)
    } catch {}
  } catch (e) {
    console.error('[PaymentMethod] Error creating table:', e)
  }
}

function rowToPM(row: any): PM {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    icon: row.icon || 'Banknote',
    enabled: row.enabled === true || row.enabled === 1,
    needsReference: row.needsReference === true || row.needsReference === 1,
    isLocalCurrency: row.isLocalCurrency === true || row.isLocalCurrency === 1,
    isCash: row.isCash === true || row.isCash === 1,
    isCredit: row.isCredit === true || row.isCredit === 1,
    sortOrder: Number(row.sortOrder) || 0,
    countries: row.countries || 'ALL',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function getAll(): Promise<PM[]> {
  const rows: any[] = await db.$queryRawUnsafe(`SELECT * FROM "PaymentMethod" ORDER BY "sortOrder" ASC, "createdAt" ASC`)
  return rows.map(rowToPM)
}

async function getByCode(code: string): Promise<PM | null> {
  const rows: any[] = await db.$queryRawUnsafe(`SELECT * FROM "PaymentMethod" WHERE "code" = $1`, code)
  return rows.length > 0 ? rowToPM(rows[0]) : null
}

async function seedDefaults(country?: string) {
  for (const m of DEFAULT_METHODS) {
    const existing = await getByCode(m.code)
    if (existing) continue
    const availableForCountry = m.countries === 'ALL' || m.countries.split(',').includes(country || 'VE')
    await db.$executeRawUnsafe(
      `INSERT INTO "PaymentMethod" ("id","code","name","icon","enabled","needsReference","isLocalCurrency","isCash","isCredit","sortOrder","countries","updatedAt")
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
      m.code, m.name, m.icon, availableForCountry,
      m.needsReference, m.isLocalCurrency, m.isCash, m.isCredit, m.sortOrder, m.countries
    )
  }
}

// GET /api/payment-methods?country=VE
export async function GET(request: Request) {
  try {
    await ensureTable()
    const { searchParams } = new URL(request.url)
    const country = searchParams.get('country') || undefined

    let methods = await getAll()
    if (methods.length === 0) {
      await seedDefaults(country)
      methods = await getAll()
    }

    const filtered = methods.filter(m => {
      if (m.countries === 'ALL') return true
      return m.countries.split(',').includes(country || 'VE')
    })

    return NextResponse.json(filtered)
  } catch (error) {
    console.error('[GET /api/payment-methods]', error)
    return NextResponse.json([], { status: 200 })
  }
}

// PUT /api/payment-methods
export async function PUT(request: Request) {
  try {
    await ensureTable()
    const body = await request.json()
    const { id, enabled, name, needsReference, sortOrder } = body

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    }

    const sets: string[] = [`"updatedAt" = NOW()`]
    const params: any[] = []
    let idx = 1
    if (enabled !== undefined) { sets.push(`"enabled" = $${idx++}`); params.push(enabled) }
    if (name !== undefined) { sets.push(`"name" = $${idx++}`); params.push(name) }
    if (needsReference !== undefined) { sets.push(`"needsReference" = $${idx++}`); params.push(needsReference) }
    if (sortOrder !== undefined) { sets.push(`"sortOrder" = $${idx++}`); params.push(sortOrder) }

    params.push(id)
    await db.$executeRawUnsafe(
      `UPDATE "PaymentMethod" SET ${sets.join(', ')} WHERE "id" = $${idx}`,
      ...params
    )

    const updated = await getAll()
    const item = updated.find(m => m.id === id)
    return NextResponse.json(item || {})
  } catch (error: any) {
    console.error('[PUT /api/payment-methods]', error)
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 })
  }
}

// POST /api/payment-methods
export async function POST(request: Request) {
  try {
    await ensureTable()
    const body = await request.json()
    const { code, name, icon, needsReference, isLocalCurrency, isCash, isCredit, countries } = body

    if (!code || !name) {
      return NextResponse.json({ error: 'code y name son obligatorios' }, { status: 400 })
    }

    const existing = await getByCode(code)
    if (existing) {
      return NextResponse.json({ error: 'Ya existe un método con ese código' }, { status: 409 })
    }

    await db.$executeRawUnsafe(
      `INSERT INTO "PaymentMethod" ("id","code","name","icon","enabled","needsReference","isLocalCurrency","isCash","isCredit","sortOrder","countries","updatedAt")
       VALUES (gen_random_uuid()::text,$1,$2,$3,true,$4,$5,$6,$7,99,$8,NOW())`,
      code, name, icon || 'CircleDollarSign',
      needsReference || false, isLocalCurrency || false, isCash || false,
      isCredit || false, countries || 'ALL'
    )

    const created = await getByCode(code)
    return NextResponse.json(created, { status: 201 })
  } catch (error: any) {
    console.error('[POST /api/payment-methods]', error)
    return NextResponse.json({ error: 'Error al crear' }, { status: 500 })
  }
}

// DELETE /api/payment-methods?id=xxx
export async function DELETE(request: Request) {
  try {
    await ensureTable()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    }

    await db.$executeRawUnsafe(`DELETE FROM "PaymentMethod" WHERE "id" = $1`, id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[DELETE /api/payment-methods]', error)
    return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 })
  }
}