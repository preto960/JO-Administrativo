import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/cash-register/check?userId=xxx&since=xxx
// Returns whether a register was closed AFTER the given timestamp
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const since = searchParams.get('since')

    if (!userId) {
      return NextResponse.json({ error: 'userId es requerido' }, { status: 400 })
    }

    const sinceDate = since ? new Date(parseInt(since)) : new Date(Date.now() - 60 * 1000)

    const register = await db.cashRegister.findFirst({
      where: {
        userId,
        status: 'cerrada',
        closingDate: {
          gte: sinceDate,
        },
      },
      orderBy: { closingDate: 'desc' },
      include: {
        user: { select: { name: true } },
        branch: { select: { name: true } },
        cuts: { orderBy: { cutDate: 'desc' }, take: 1 },
      },
    })

    if (register) {
      return NextResponse.json({
        wasClosed: true,
        register: {
          name: register.name,
          branchName: register.branch.name,
          closingDate: register.closingDate,
          actual: register.cuts[0]?.actual || register.currentAmt,
          cutDate: register.cuts[0]?.cutDate || register.closingDate,
        },
      })
    }

    return NextResponse.json({ wasClosed: false })
  } catch (error) {
    return NextResponse.json({ wasClosed: false })
  }
}
