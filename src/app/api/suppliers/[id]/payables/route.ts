import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get payables with their payment history
    const payables = await db.accountPayable.findMany({
      where: { supplierId: id },
      include: {
        purchase: {
          select: {
            id: true,
            date: true,
            total: true,
            paidUpfront: true,
          },
        },
        payments: {
          include: {
            user: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    // Get all payments for this supplier
    const payments = await db.supplierPayment.findMany({
      where: { supplierId: id },
      include: {
        payable: {
          select: {
            purchase: { select: { id: true } },
          },
        },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ payables, payments })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener cuentas por pagar' }, { status: 500 })
  }
}
