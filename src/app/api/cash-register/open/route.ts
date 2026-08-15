import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBranchId } from '@/lib/resolve-branch'
import { logAction } from '@/lib/audit-log'
import { requireAuth } from '@/lib/require-auth'

const MAX_INITIAL_AMOUNT = 500000

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if ('status' in auth) return auth

    const body = await request.json()
    const { userId, initialAmt, branchId, name, skipInventory, inventoryNotes } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }

    // Fix 1: Validate max initial amount
    if (initialAmt !== undefined && initialAmt !== null && initialAmt > MAX_INITIAL_AMOUNT) {
      return NextResponse.json({ error: `El monto inicial no puede superar ${MAX_INITIAL_AMOUNT.toLocaleString()}` }, { status: 400 })
    }

    const effectiveBranchId = body.branchId || await resolveBranchId()

    // Fix 6: Check if this user already has an open register
    const existingOpen = await db.cashRegister.findFirst({
      where: { userId, status: 'abierta' },
    })
    if (existingOpen) {
      return NextResponse.json(
        { error: `Este cajero ya tiene una caja abierta: "${existingOpen.name || 'Sin nombre'}" (abierta el ${new Date(existingOpen.openingDate).toLocaleDateString('es-VE')})` },
        { status: 400 }
      )
    }

    // Get base currency from settings
    const settings = await db.settings.findFirst()
    const currencyId = settings?.baseCurrencyId || ''

    const register = await db.$transaction(async (tx) => {
      const reg = await tx.cashRegister.create({
        data: {
          name: name?.trim() || null,
          userId,
          branchId: effectiveBranchId,
          currencyId,
          initialAmt: initialAmt || 0,
          currentAmt: initialAmt || 0,
          status: 'abierta',
        },
        include: { user: { select: { id: true, name: true } } },
      })

      // Crear inventario de apertura automáticamente
      if (!skipInventory) {
        const inventory = await tx.inventory.findMany({
          where: { branchId: effectiveBranchId },
          include: { product: { select: { id: true, name: true, active: true } } },
        })
        const activeItems = inventory.filter(inv => inv.product.active)

        const invCheck = await tx.inventoryCheck.create({
          data: {
            branchId: effectiveBranchId,
            userId,
            status: 'verificado', // se crea ya verificado
            notes: inventoryNotes || 'Inventario de apertura de caja',
            inventoryType: 'apertura',
            cashRegId: reg.id,
          },
        })

        if (activeItems.length > 0) {
          await tx.inventoryCheckItem.createMany({
            data: activeItems.map(inv => ({
              checkId: invCheck.id,
              productId: inv.productId,
              productName: inv.product.name,
              initialStock: inv.stock,
              verifiedStock: inv.stock, // verificado al momento de apertura
              unitPrice: inv.price,
              discrepancyQty: 0,
              discrepancyAmt: 0,
            })),
          })
        }
      }

      return reg
    })

    await logAction({
      action: 'open_cash',
      entity: 'cash_register',
      entityId: register.id,
      details: { summary: `Caja abierta: $${(initialAmt || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, initialAmount: initialAmt || 0, name: name?.trim() || 'Sin nombre' },
      request,
    })

    return NextResponse.json(register, { status: 201 })
  } catch (error: unknown) {
    console.error('Error al abrir caja:', error)
    const msg = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: `Error al abrir caja: ${msg}` }, { status: 500 })
  }
}
