import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'

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

    // Cajero solo ve sus propios conteos; admin/gerente ven todos
    const isCajero = auth.role === 'cajero'

    const where: Record<string, unknown> = {}
    if (branchId) where.branchId = branchId
    if (isCajero) where.userId = auth.userId
    if (status) where.status = status

    if (dateFrom || dateTo) {
      where.checkDate = {}
      if (dateFrom) {
        (where.checkDate as Record<string, unknown>).gte = new Date(dateFrom)
      }
      if (dateTo) {
        (where.checkDate as Record<string, unknown>).lte = new Date(dateTo)
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
    const { branchId, notes } = body

    if (!branchId) {
      return NextResponse.json({ error: 'branchId es requerido' }, { status: 400 })
    }

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
          status: 'pendiente',
          notes: notes || null,
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
