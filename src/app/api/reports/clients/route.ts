import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getPermissions } from '@/lib/permissions'

// GET /api/reports/clients?source=nuevo&createdBy=userId&status=Activo&agreementName=ConvenioX&promotionName=PromoY&dateFrom=2025-07-01&dateTo=2025-07-15&planType=dias&branchId=xxx&page=1&limit=25
export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if ('status' in auth) return auth

  const perms = getPermissions(auth.role)
  if (!perms.canManageClients && auth.role !== 'admin' && auth.role !== 'gerente') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)

  // Filters (all optional)
  const source = searchParams.get('source') || undefined
  const createdBy = searchParams.get('createdBy') || undefined
  const status = searchParams.get('status') || undefined
  const agreementName = searchParams.get('agreementName') || undefined
  const promotionName = searchParams.get('promotionName') || undefined
  const dateFrom = searchParams.get('dateFrom') || undefined
  const dateTo = searchParams.get('dateTo') || undefined
  const planType = searchParams.get('planType') || undefined
  const branchId = searchParams.get('branchId') || undefined

  // Pagination
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)))
  const skip = (page - 1) * limit

  try {
    // ── Build where clause ──
    const where: Record<string, unknown>[] = [
      { deletedAt: null },
    ]

    if (source) {
      where.push({ source })
    }
    if (agreementName) {
      where.push({ agreementName })
    }
    if (promotionName) {
      where.push({ promotionName })
    }
    if (planType) {
      where.push({ memberships: { some: { planType } } })
    }
    if (status) {
      where.push({ memberships: { some: { status } } })
    }
    if (branchId) {
      where.push({
        sales: {
          some: {
            branchId,
          },
        },
      })
    }
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, unknown> = {}
      if (dateFrom) {
        dateFilter.gte = new Date(dateFrom + 'T00:00:00')
      }
      if (dateTo) {
        dateFilter.lte = new Date(dateTo + 'T23:59:59.999')
      }
      // Use createdAt for date filtering, or sales date if createdBy is specified
      where.push({ createdAt: dateFilter })
    }

    // createdBy: userId from earliest Sale for this client
    // We need a subquery-like approach: find clients whose earliest sale was created by this user
    // Since Prisma doesn't support subqueries easily, we'll handle it in-memory
    if (createdBy) {
      // Find all client IDs whose earliest sale was made by this user
      const salesWithClient = await db.sale.findMany({
        where: { userId: createdBy, status: 'completada', clientId: { not: null } },
        select: { clientId: true, date: true },
        orderBy: { date: 'asc' },
      })

      // Group by clientId and take only the first sale (earliest)
      const earliestByClient = new Map<string, { clientId: string; date: Date }>()
      for (const sale of salesWithClient) {
        if (!sale.clientId) continue
        const existing = earliestByClient.get(sale.clientId)
        if (!existing || sale.date < existing.date) {
          earliestByClient.set(sale.clientId, { clientId: sale.clientId, date: sale.date })
        }
      }

      const clientIds = Array.from(earliestByClient.keys())
      if (clientIds.length === 0) {
        // No clients found for this user — return empty
        return NextResponse.json({
          count: 0,
          page,
          limit,
          totalPages: 0,
          data: [],
          filtros: { source, createdBy, status, agreementName, promotionName, dateFrom, dateTo, planType, branchId },
        })
      }
      where.push({ id: { in: clientIds } })
    }

    // ── Count + Fetch ──
    const baseWhere = { AND: where }

    const [count, clients] = await Promise.all([
      db.client.count({ where: baseWhere }),
      db.client.findMany({
        where: baseWhere,
        select: {
          id: true,
          name: true,
          lastName: true,
          cedula: true,
          phone: true,
          email: true,
          source: true,
          agreementName: true,
          promotionName: true,
          createdAt: true,
          lastAttendance: true,
          memberships: {
            select: {
              status: true,
              planType: true,
              tarifa: true,
              startDate: true,
              endDate: true,
              daysRemaining: true,
              ticketsRemaining: true,
              plan: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          _count: {
            select: {
              sales: true,
              receivables: true,
              attendances: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ])

    // ── Enrich with createdBy (earliest sale user) ──
    const clientIds = clients.map(c => c.id)
    let createdByMap = new Map<string, string>()

    if (clientIds.length > 0) {
      const earliestSales = await db.sale.findMany({
        where: { clientId: { in: clientIds }, status: 'completada' },
        select: { clientId: true, userId: true, date: true },
        orderBy: { date: 'asc' },
      })

      // Group by clientId and pick earliest
      const map: Map<string, { userId: string; date: Date }> = new Map()
      for (const s of earliestSales) {
        const existing = map.get(s.clientId)
        if (!existing || s.date < existing.date) {
          map.set(s.clientId, { userId: String(s.userId), date: s.date })
        }
      }

      // Resolve userId to name
      const userIds = new Set(Array.from(map.values()).map(v => v.userId))
      if (userIds.size > 0) {
        const users = await db.user.findMany({
          where: { id: { in: Array.from(userIds) } },
          select: { id: true, name: true },
        })
        const userMap = new Map<string, string>(users.map(u => [u.id, u.name]))

        createdByMap = new Map<string, string>()
        for (const [clientId, val] of map) {
          createdByMap.set(String(clientId), userMap.get(val.userId) || 'Desconocido')
        }
      }
    }

    // ── Build response data ──
    const data = clients.map(c => {
      const membership = c.memberships[0] || null
      return {
        id: c.id,
        nombre: c.name,
        apellido: c.lastName || '',
        cedula: c.cedula || '',
        telefono: c.phone || '',
        email: c.email || '',
        origen: c.source || '',
        convenio: c.agreementName || '',
        promocion: c.promotionName || '',
        registradoEl: c.createdAt,
        ultimaAsistencia: c.lastAttendance,
        membresia: membership ? {
          estado: membership.status,
          tipoPlan: membership.planType,
          tarifa: membership.tarifa || '',
          plan: membership.plan?.name || '',
          inicio: membership.startDate,
          vencimiento: membership.endDate,
          diasRestantes: membership.daysRemaining,
          ticketsRestantes: membership.ticketsRemaining,
        } : null,
        createdBy: createdByMap.get(c.id) || null,
        totalVentas: c._count.sales,
        totalDeuda: c._count.receivables,
        totalAsistencias: c._count.attendances,
      }
    })

    const totalPages = Math.ceil(count / limit)

    return NextResponse.json({
      count,
      page,
      limit,
      totalPages,
      data,
      filtros: { source, createdBy, status, agreementName, promotionName, dateFrom, dateTo, planType, branchId },
    })
  } catch (error) {
    console.error('[ClientsReport GET]', error)
    return NextResponse.json({ error: 'Error al generar reporte de clientes' }, { status: 500 })
  }
}
