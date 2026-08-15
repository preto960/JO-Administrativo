'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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
  origin: string
  membershipStatus: string
  planName: string
  hasAgreement: boolean
  hasPromotion: boolean
}

// API response shape from /api/reports/clients
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
  origen: string
  convenio: string
  promocion: string
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

// Component-level response (after mapping)
interface ClientReportResponse {
  clients: ClientReport[]
  total: number
  page: number
  pageSize: number
}

// ── Helpers ──────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function thirtyDaysAgoISO(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().split('T')[0]
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
  const [origin, setOrigin] = useState('')
  const [status, setStatus] = useState('')
  const [planType, setPlanType] = useState('')
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgoISO)
  const [dateTo, setDateTo] = useState(todayISO)
  const [withAgreement, setWithAgreement] = useState(false)
  const [withPromotion, setWithPromotion] = useState(false)

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
    if (origin) params.set('source', origin)
    if (status) params.set('status', status)
    if (planType) params.set('planType', planType)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    if (withAgreement) params.set('withAgreement', 'true')
    if (withPromotion) params.set('withPromotion', 'true')

    try {
      const raw = await api.get<ClientReportAPIResponse>(
        `/api/reports/clients?${params.toString()}`,
      )
      // Map API response to component format
      const mapped: ClientReportResponse = {
        clients: (raw.data || []).map((c) => ({
          id: c.id,
          name: [c.nombre, c.apellido].filter(Boolean).join(' '),
          phone: c.telefono || '',
          origin: c.origen || '',
          membershipStatus: c.membresia?.estado || 'Sin membresía',
          planName: c.membresia?.plan || '',
          hasAgreement: !!c.convenio,
          hasPromotion: !!c.promocion,
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
    if (origin) params.set('source', origin)
    if (status) params.set('status', status)
    if (planType) params.set('planType', planType)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    if (withAgreement) params.set('withAgreement', 'true')
    if (withPromotion) params.set('withPromotion', 'true')
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Origen */}
          <div className="space-y-2">
            <Label>Origen</Label>
            <Select value={origin} onValueChange={setOrigin}>
              <SelectTrigger>
                <SelectValue placeholder="Todos los orígenes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="referido">Referido</SelectItem>
                <SelectItem value="walk-in">Walk-in</SelectItem>
                <SelectItem value="web">Web</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Estado */}
          <div className="space-y-2">
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

          {/* Plan Type */}
          <div className="space-y-2">
            <Label>Tipo de Plan</Label>
            <Select value={planType} onValueChange={setPlanType}>
              <SelectTrigger>
                <SelectValue placeholder="Todos los planes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mensual">Mensual</SelectItem>
                <SelectItem value="trimestral">Trimestral</SelectItem>
                <SelectItem value="semestral">Semestral</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
                <SelectItem value="diario">Diario</SelectItem>
                <SelectItem value="visita">Por Visita</SelectItem>
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
            />
          </div>

          {/* Checkboxes */}
          <div className="flex items-end gap-6">
            <div className="flex items-center gap-2">
              <Checkbox
                id="with-agreement"
                checked={withAgreement}
                onCheckedChange={(checked) => setWithAgreement(checked === true)}
              />
              <Label htmlFor="with-agreement" className="cursor-pointer">
                Con convenio
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="with-promotion"
                checked={withPromotion}
                onCheckedChange={(checked) => setWithPromotion(checked === true)}
              />
              <Label htmlFor="with-promotion" className="cursor-pointer">
                Con promoción
              </Label>
            </div>
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
                      <TableHead>Origen</TableHead>
                      <TableHead>Estado Membresía</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead className="text-center">Convenio</TableHead>
                      <TableHead className="text-center">Promoción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{c.phone || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{c.origin || '—'}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={membershipBadgeVariant(c.membershipStatus)}>
                            {c.membershipStatus || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell>{c.planName || '—'}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={c.hasAgreement ? 'default' : 'secondary'}>
                            {c.hasAgreement ? 'Sí' : 'No'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={c.hasPromotion ? 'default' : 'secondary'}>
                            {c.hasPromotion ? 'Sí' : 'No'}
                          </Badge>
                        </TableCell>
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
