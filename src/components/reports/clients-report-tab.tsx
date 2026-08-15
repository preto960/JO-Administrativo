'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { useSetting } from '@/stores/use-app-store'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Download, Loader2, Search, Users, ChevronLeft, ChevronRight,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

interface ClientReport {
  id: string
  name: string
  phone: string
  membershipStatus: string
  planName: string
}

interface ClientReportAPIResponse {
  data: ClientReportAPIItem[]
  count: number
  page: number
  limit: number
  totalPages: number
  filtros?: Record<string, unknown>
}

interface ClientReportAPIItem {
  id: string
  nombre: string
  apellido: string
  cedula: string
  telefono: string
  email: string
  membresia: {
    estado: string
    tipoPlan: string
    tarifa: string
    plan: string
    inicio: string | null
    vencimiento: string | null
    diasRestantes: number
    ticketsRestantes: number
  } | null
  createdBy: string | null
  totalVentas: number
  totalDeuda: number
  totalAsistencias: number
}

interface PlanOption {
  id: string
  name: string
  active: boolean
  planType: string
}

// ── Helpers ──────────────────────────────────────────────────────────────

function todayLocalISO(country: string): string {
  const now = new Date()
  const tzMap: Record<string, string> = {
    VE: 'America/Caracas', CO: 'America/Bogota', MX: 'America/Mexico_City',
  }
  const tz = tzMap[country] || 'America/Bogota'
  return now.toLocaleDateString('en-CA', { timeZone: tz })
}

function thirtyDaysAgoLocalISO(country: string): string {
  const now = new Date()
  const d = new Date(now)
  d.setDate(d.getDate() - 30)
  const tzMap: Record<string, string> = {
    VE: 'America/Caracas', CO: 'America/Bogota', MX: 'America/Mexico_City',
  }
  const tz = tzMap[country] || 'America/Bogota'
  return d.toLocaleDateString('en-CA', { timeZone: tz })
}

const PAGE_SIZE = 10

function membershipBadgeVariant(status: string) {
  switch (status) {
    case 'activa':
      return 'default' as const
    case 'vencida':
      return 'destructive' as const
    case 'pendiente':
      return 'secondary' as const
    default:
      return 'outline' as const
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export function ClientsReportTab() {
  // ── Filters ─────────────────────────────────────────────────────────────
  const appCountry = useSetting('country') || 'CO'
  const [status, setStatus] = useState('')
  const [planType, setPlanType] = useState('')
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgoLocalISO(appCountry))
  const [dateTo, setDateTo] = useState(todayLocalISO(appCountry))

  // ── Plans from API ──────────────────────────────────────────────────────
  const [plans, setPlans] = useState<PlanOption[]>([])

  useEffect(() => {
    api.get<PlanOption[]>('/api/plans')
      .then(data => setPlans(Array.isArray(data) ? data.filter(p => p.active) : []))
      .catch(() => {})
  }, [])

  // ── Data ─────────────────────────────────────────────────────────────────
  const [clients, setClients] = useState<ClientReport[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── Search ───────────────────────────────────────────────────────────────
  const handleSearch = async (targetPage = 1) => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(targetPage))
    params.set('pageSize', String(PAGE_SIZE))
    if (status) params.set('status', status)
    if (planType) params.set('planType', planType)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)

    try {
      const raw = await api.get<ClientReportAPIResponse>(
        `/api/reports/clients?${params.toString()}`,
      )
      const mapped = {
        clients: (raw.data || []).map((c) => ({
          id: c.id,
          name: [c.nombre, c.apellido].filter(Boolean).join(' '),
          phone: c.telefono || '',
          membershipStatus: c.membresia?.estado || 'Sin membresía',
          planName: c.membresia?.plan || '',
        })),
        total: raw.count ?? 0,
        page: raw.page ?? 1,
        pageSize: raw.limit ?? PAGE_SIZE,
      }
      setClients(mapped.clients)
      setTotal(mapped.total)
      setPage(mapped.page)
      setSearched(true)
    } catch {
      toast.error('Error al buscar clientes')
    } finally {
      setLoading(false)
    }
  }

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return
    handleSearch(newPage)
  }

  const handleDownloadPdf = () => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (planType) params.set('planType', planType)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    window.open(`/api/reports/clients/pdf?${params.toString()}`, '_blank')
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Reporte de Clientes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ── Filters ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {/* Estado */}
          <div className="space-y-2 col-span-2 sm:col-span-1">
            <Label>Estado Membresía</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="activa">Activa</SelectItem>
                <SelectItem value="vencida">Vencida</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Plan Type — loaded from API */}
          <div className="space-y-2 col-span-2 sm:col-span-1">
            <Label>Tipo de Plan</Label>
            <Select value={planType} onValueChange={setPlanType}>
              <SelectTrigger>
                <SelectValue placeholder="Todos los planes" />
              </SelectTrigger>
              <SelectContent>
                {plans.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* dateFrom */}
          <div className="space-y-2">
            <Label htmlFor="cr-from">Desde</Label>
            <Input
              id="cr-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-background"
            />
          </div>

          {/* dateTo */}
          <div className="space-y-2">
            <Label htmlFor="cr-to">Hasta</Label>
            <Input
              id="cr-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-background"
            />
          </div>
        </div>

        {/* ── Action Buttons ────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => handleSearch(1)} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Buscar
          </Button>
          {searched && clients.length > 0 && (
            <Button variant="outline" onClick={handleDownloadPdf}>
              <Download className="mr-2 h-4 w-4" />
              Descargar PDF
            </Button>
          )}
        </div>

        {/* ── Results ───────────────────────────────────────────────────── */}
        {loading ? (
          <div className="h-40 rounded-lg bg-muted animate-pulse" />
        ) : searched ? (
          clients.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
              No se encontraron clientes con los filtros seleccionados
            </div>
          ) : (
            <div className="space-y-4">
              {/* Info bar */}
              <div className="text-sm text-muted-foreground">
                Mostrando {clients.length} de {total} clientes — Página {page} de {totalPages}
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>Estado Membresía</TableHead>
                      <TableHead>Plan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{c.phone || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={membershipBadgeVariant(c.membershipStatus)}>
                            {c.membershipStatus || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell>{c.planName || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Página {page} de {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1 || loading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= totalPages || loading}
                  >
                    Siguiente
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  )
}
