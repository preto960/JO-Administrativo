import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { notifyUser } from '@/lib/notify'

// GET /api/reports/inventory-check/[id] — Get single inventory check with items
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if ('status' in auth) return auth

    const { id } = await params

    const check = await db.inventoryCheck.findUnique({
      where: { id },
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

    if (!check) {
      return NextResponse.json({ error: 'Conteo de inventario no encontrado' }, { status: 404 })
    }

    // Cajero solo puede ver sus propios conteos
    if (auth.role === 'cajero' && check.userId !== auth.userId) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    return NextResponse.json(check)
  } catch (error) {
    console.error('[GET inventory-check/:id]', error)
    return NextResponse.json({ error: 'Error al obtener conteo de inventario' }, { status: 500 })
  }
}

// PUT /api/reports/inventory-check/[id] — Update an inventory check
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if ('status' in auth) return auth

    const { id } = await params
    const body = await request.json()
    const { items, notes, status: newStatus } = body

    // Find existing check
    const existing = await db.inventoryCheck.findUnique({
      where: { id },
      include: {
        items: true,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Conteo de inventario no encontrado' }, { status: 404 })
    }

    // Cajero solo puede editar sus propios conteos
    if (auth.role === 'cajero' && existing.userId !== auth.userId) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const isVerifying = newStatus === 'verificado'

    // Build update data
    const updateData: Record<string, unknown> = {}
    if (notes !== undefined) updateData.notes = notes || null
    if (newStatus) updateData.status = newStatus

    // Process items updates inside transaction
    const updated = await db.$transaction(async (tx) => {
      // Update the check itself
      await tx.inventoryCheck.update({
        where: { id },
        data: updateData,
      })

      // Update items if provided
      if (items && Array.isArray(items)) {
        for (const item of items) {
          if (!item.id) continue

          const existingItem = existing.items.find(i => i.id === item.id)
          if (!existingItem) continue

          const itemData: Record<string, unknown> = {}

          if (item.verifiedStock !== undefined) {
            itemData.verifiedStock = item.verifiedStock
          }

          if (item.notes !== undefined) {
            itemData.notes = item.notes || null
          }

          // When verifying, calculate discrepancies
          if (isVerifying) {
            const verifiedStock = item.verifiedStock !== undefined ? item.verifiedStock : existingItem.verifiedStock
            const discrepancyQty = Math.round((verifiedStock - existingItem.initialStock) * 100) / 100
            const discrepancyAmt = Math.round(discrepancyQty * existingItem.unitPrice * 100) / 100

            itemData.verifiedStock = verifiedStock
            itemData.discrepancyQty = discrepancyQty
            itemData.discrepancyAmt = discrepancyAmt
          }

          if (Object.keys(itemData).length > 0) {
            await tx.inventoryCheckItem.update({
              where: { id: item.id },
              data: itemData,
            })
          }
        }
      }

      // Return updated check with items
      return tx.inventoryCheck.findUnique({
        where: { id },
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

    // After verification, notify admin users if there are discrepancies
    if (isVerifying && updated) {
      const discrepancyItems = updated.items.filter(
        item => item.discrepancyQty !== 0
      )

      if (discrepancyItems.length > 0) {
        const totalDiscrepancyAmt = discrepancyItems.reduce(
          (sum, item) => sum + Math.abs(item.discrepancyAmt), 0
        )

        const discrepancySummary = discrepancyItems
          .slice(0, 5)
          .map(item => `${item.productName}: ${item.discrepancyQty > 0 ? '+' : ''}${item.discrepancyQty}`)
          .join(', ')
        const extra = discrepancyItems.length > 5 ? ` y ${discrepancyItems.length - 5} más` : ''

        // Get all admin users
        const adminUsers = await db.user.findMany({
          where: {
            role: 'admin',
            active: true,
            deletedAt: null,
          },
          select: { id: true },
        })

        const branchName = updated.branch?.name || 'Sucursal'
        const message = `Conteo verificado en "${branchName}" con ${discrepancyItems.length} producto(s) con diferencia. Monto total de diferencia: $${totalDiscrepancyAmt.toLocaleString('es-VE', { minimumFractionDigits: 2 })}. ${discrepancySummary}${extra}`

        // Notify all admins (fire-and-forget, don't block response)
        for (const admin of adminUsers) {
          notifyUser(admin.id, {
            title: 'Diferencias en Conteo de Inventario',
            message,
            type: 'warning',
          }).catch(() => {})
        }
      }
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[PUT inventory-check/:id]', error)
    return NextResponse.json({ error: 'Error al actualizar conteo de inventario' }, { status: 500 })
  }
}
