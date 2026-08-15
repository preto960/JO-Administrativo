import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'
import { fetchAppTz } from '@/lib/tz-helpers'

// GET /api/reports/inventory-check — List inventory checks with filters
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if ('status' in auth) return auth

    const { searchParams } = new URL(request.url)
    const branchId = searchParams.get('branchId') || undefined
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const status = searchParams.get('status') || undefined
    const inventoryType = searchParams.get('inventoryType') || undefined

    // Cajero solo ve sus propios conteos; admin/gerente ven todos
    const isCajero = auth.role === 'cajero'

    const where: Record<string, unknown> = {}
    if (branchId) where.branchId = branchId
    if (isCajero) where.userId = auth.userId
    if (status) where.status = status
    if (inventoryType) where.inventoryType = inventoryType

    if (dateFrom || dateTo) {
      const appTz = await fetchAppTz()

      where.checkDate = {}
      if (dateFrom) {
        // dateFrom is a local date string (YYYY-MM-DD) in the app's timezone
        // We need to convert it to UTC for the DB query
        const fromDate = new Date(`${dateFrom}T00:00:00`)
        const localDate = new Date(fromDate.toLocaleString('en-US', { timeZone: appTz.timezone }))
        const offsetMs = localDate.getTime() - fromDate.getTime()
        const offsetHours = offsetMs / 3600000
        const utcStart = new Date(Date.UTC(
          fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(),
          -offsetHours, 0, 0, 0
        ))
        ;(where.checkDate as Record<string, unknown>).gte = utcStart
      }
      if (dateTo) {
        // dateTo is a local date string — end of that day in app timezone
        const toDate = new Date(`${dateTo}T23:59:59.999`)
        const localDate = new Date(toDate.toLocaleString('en-US', { timeZone: appTz.timezone }))
        const offsetMs = localDate.getTime() - toDate.getTime()
        const offsetHours = offsetMs / 3600000
        const utcEnd = new Date(Date.UTC(
          toDate.getFullYear(), toDate.getMonth(), toDate.getDate(),
          24 - offsetHours, 59, 59, 999
        ))
        ;(where.checkDate as Record<string, unknown>).lte = utcEnd
      }
    }

    const checks = await db.inventoryCheck.findMany({
      where,
      orderBy: { checkDate: 'desc' },
      include: {
        user: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
          orderBy: { productName: 'asc' },
        },
      },
    })

    return NextResponse.json(checks)
  } catch (error) {
    console.error('[GET inventory-check]', error)
    return NextResponse.json({ error: 'Error al obtener conteos de inventario' }, { status: 500 })
  }
}

// POST /api/reports/inventory-check — Create a new inventory check
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if ('status' in auth) return auth

    const perms = getPermissions(auth.role)
    if (!perms.canManageProducts && auth.role !== 'admin' && auth.role !== 'gerente') {
      return NextResponse.json({ error: 'Sin permisos para crear conteos de inventario' }, { status: 403 })
    }

    const body = await request.json()
    const { branchId, notes, inventoryType, cashRegId } = body

    if (!branchId) {
      return NextResponse.json({ error: 'branchId es requerido' }, { status: 400 })
    }

    // Validar inventoryType si se proporciona
    const validTypes = ['manual', 'apertura', 'cierre']
    const type = validTypes.includes(inventoryType) ? inventoryType : 'manual'

    // Use timezone-aware now for checkDate
    const { fetchNow } = await import('@/lib/tz-helpers')
    const checkDate = await fetchNow()

    // Get all inventory items for the branch
    const inventory = await db.inventory.findMany({
      where: { branchId },
      include: {
        product: {
          select: { id: true, name: true, active: true },
        },
      },
    })

    // Only include active products
    const activeItems = inventory.filter(inv => inv.product.active)

    const check = await db.$transaction(async (tx) => {
      const newCheck = await tx.inventoryCheck.create({
        data: {
          branchId,
          userId: auth.userId,
          checkDate, // timezone-aware date
          status: 'pendiente',
          notes: notes || null,
          inventoryType: type,
          cashRegId: cashRegId || null,
        },
      })

      // Create items from current inventory
      if (activeItems.length > 0) {
        await tx.inventoryCheckItem.createMany({
          data: activeItems.map(inv => ({
            checkId: newCheck.id,
            productId: inv.productId,
            productName: inv.product.name,
            initialStock: inv.stock,
            verifiedStock: 0, // Will be filled during verification
            unitPrice: inv.price,
            discrepancyQty: 0,
            discrepancyAmt: 0,
          })),
        })
      }

      return tx.inventoryCheck.findUnique({
        where: { id: newCheck.id },
        include: {
          user: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true } },
            },
            orderBy: { productName: 'asc' },
          },
        },
      })
    })

    return NextResponse.json(check, { status: 201 })
  } catch (error) {
    console.error('[POST inventory-check]', error)
    return NextResponse.json({ error: 'Error al crear conteo de inventario' }, { status: 500 })
  }
}
