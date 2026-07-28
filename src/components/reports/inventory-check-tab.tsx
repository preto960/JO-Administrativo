'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { useAppStore } from '@/stores/use-app-store'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Eye, Download, Loader2, ClipboardCheck, PackageSearch } from 'lucide-react'
import { toast } from 'sonner'

// ── Types ──────────────────────────────────────────────────────────────────

interface CheckItem {
  productId: string
  productName: string
  initialStock: number
  verifiedStock: number | null
  unitPrice: number
  notes: string
}

interface InventoryCheck {
  id: string
  date: string
  branch: { id: string; name: string } | null
  user: { id: string; name: string } | null
  status: 'pendiente' | 'verificado'
  items: CheckItem[]
}

// ── Helpers ──────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'verificado')
    return (
      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
        Verificado
      </Badge>
    )
  return (
    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
      Pendiente
    </Badge>
  )
}

function fmtMoney(value: number) {
  return value.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Component ──────────────────────────────────────────────────────────────

export function InventoryCheckTab() {
  const { user } = useAuth()
  const selectedBranchId = useAppStore((s) => s.selectedBranchId)

  const [checks, setChecks] = useState<InventoryCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  // Edit dialog state
  const [editCheck, setEditCheck] = useState<InventoryCheck | null>(null)
  const [editItems, setEditItems] = useState<CheckItem[]>([])

  // ── Fetch checks ────────────────────────────────────────────────────────

  const fetchChecks = async () => {
    try {
      const data = await api.get<InventoryCheck[]>('/api/reports/inventory-check')
      setChecks(data)
    } catch {
      toast.error('Error al cargar verificaciones')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchChecks()
  }, [])

  // ── Create new check ───────────────────────────────────────────────────

  const handleCreate = async () => {
    setCreating(true)
    try {
      await api.post('/api/reports/inventory-check', {
        branchId: selectedBranchId || undefined,
      })
      toast.success('Verificacion de inventario creada')
      fetchChecks()
    } catch {
      toast.error('Error al crear verificacion')
    } finally {
      setCreating(false)
    }
  }

  // ── Open edit dialog ────────────────────────────────────────────────────

  const handleOpenEdit = (check: InventoryCheck) => {
    setEditCheck(check)
    setEditItems(check.items.map((p) => ({ ...p })))
  }

  // ── Edit handlers ───────────────────────────────────────────────────────

  const handleStockChange = (productId: string, value: string) => {
    const num = value === '' ? null : parseInt(value, 10)
    setEditItems((prev) =>
      prev.map((p) => (p.productId === productId ? { ...p, verifiedStock: num } : p)),
    )
  }

  const handleNotesChange = (productId: string, value: string) => {
    setEditItems((prev) =>
      prev.map((p) => (p.productId === productId ? { ...p, notes: value } : p)),
    )
  }

  // ── Save / Verify ──────────────────────────────────────────────────────

  const handleSaveAndVerify = async () => {
    if (!editCheck) return
    setSaving(true)
    try {
      await api.put(`/api/reports/inventory-check/${editCheck.id}`, {
        items: editItems.map((p) => ({
          productId: p.productId,
          verifiedStock: p.verifiedStock,
          notes: p.notes,
        })),
        status: 'verificado',
      })
      toast.success('Inventario verificado correctamente')
      setEditCheck(null)
      fetchChecks()
    } catch {
      toast.error('Error al guardar verificacion')
    } finally {
      setSaving(false)
    }
  }

  // ── PDF download ───────────────────────────────────────────────────────

  const handleDownloadPdf = (id: string) => {
    window.open(`/api/reports/inventory-check/${id}/pdf`, '_blank')
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="h-64 rounded-lg bg-muted animate-pulse" />
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Verificaciones de Inventario</h3>
          <p className="text-sm text-muted-foreground">
            Revisa y verifica el stock de productos de tu sucursal
          </p>
        </div>
        <Button
          onClick={handleCreate}
          disabled={creating}
          className="bg-primary hover:bg-primary/90 text-white"
        >
          {creating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Nueva Verificacion de Inventario
        </Button>
      </div>

      {/* Checks Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead>Cajero</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checks.map((check) => (
                  <TableRow key={check.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {fmtDate(check.date)}
                    </TableCell>
                    <TableCell>{check.branch?.name || '—'}</TableCell>
                    <TableCell>{check.user?.name || '—'}</TableCell>
                    <TableCell>
                      <StatusBadge status={check.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenEdit(check)}
                          title="Ver/Editar"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDownloadPdf(check.id)}
                          title="Descargar PDF"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {checks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      <PackageSearch className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      No hay verificaciones de inventario
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit / View Dialog */}
      <Dialog
        open={!!editCheck}
        onOpenChange={(open) => {
          if (!open) setEditCheck(null)
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5" />
                Verificacion de Inventario
              </div>
            </DialogTitle>
            <DialogDescription>
              Fecha: {editCheck ? fmtDate(editCheck.date) : ''} — {editCheck?.branch?.name}
            </DialogDescription>
          </DialogHeader>

          {editCheck && (
            <div className="space-y-4">
              {/* Items table */}
              <div className="max-h-96 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-center">Stock Inicial</TableHead>
                      <TableHead className="text-center">Stock Verificado</TableHead>
                      <TableHead className="text-center">Diferencia Qty</TableHead>
                      <TableHead className="text-center">Diferencia $</TableHead>
                      <TableHead>Novedades</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editItems.map((item) => {
                      const diffQty =
                        item.verifiedStock !== null
                          ? item.verifiedStock - item.initialStock
                          : null
                      const diffMoney = diffQty !== null ? diffQty * item.unitPrice : null
                      const isVerified = editCheck.status === 'verificado'

                      return (
                        <TableRow key={item.productId}>
                          <TableCell className="font-medium max-w-[180px] truncate">
                            {item.productName}
                          </TableCell>
                          <TableCell className="text-center">{item.initialStock}</TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min="0"
                              value={item.verifiedStock ?? ''}
                              onChange={(e) => handleStockChange(item.productId, e.target.value)}
                              className="w-24 mx-auto text-center"
                              disabled={isVerified}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            {diffQty !== null && (
                              <span
                                className={
                                  diffQty < 0
                                    ? 'text-red-600 font-semibold'
                                    : diffQty > 0
                                      ? 'text-green-600 font-semibold'
                                      : 'text-muted-foreground'
                                }
                              >
                                {diffQty > 0 ? `+${diffQty}` : diffQty}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center whitespace-nowrap">
                            {diffMoney !== null && (
                              <span
                                className={
                                  diffMoney < 0
                                    ? 'text-red-600 font-semibold'
                                    : diffMoney > 0
                                      ? 'text-green-600 font-semibold'
                                      : 'text-muted-foreground'
                                }
                              >
                                {diffMoney > 0 ? '+' : ''}
                                {fmtMoney(diffMoney)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Input
                              value={item.notes}
                              onChange={(e) => handleNotesChange(item.productId, e.target.value)}
                              placeholder="Novedades..."
                              className="min-w-[140px]"
                              disabled={isVerified}
                            />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Footer actions */}
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleDownloadPdf(editCheck.id)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Descargar PDF
                </Button>
                {editCheck.status !== 'verificado' && (
                  <Button
                    onClick={handleSaveAndVerify}
                    disabled={saving}
                    className="bg-primary hover:bg-primary/90 text-white"
                  >
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ClipboardCheck className="mr-2 h-4 w-4" />
                    )}
                    Guardar y Verificar
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
