'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { useAppStore } from '@/stores/use-app-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Wallet, Plus, ArrowUpCircle, ArrowDownCircle, Lock, Eye, Loader2, UserCircle, AlertTriangle, GitBranch, Banknote, ClipboardCheck, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

interface CashRegister {
  id: string
  name: string | null
  openingDate: string
  closingDate: string | null
  initialAmt: number
  currentAmt: number
  status: string
  user: { id: string; name: string }
  branch: { id: string; name: string }
  _count: { sales: number; movements: number }
}

interface BranchItem {
  id: string
  name: string
  isMain: boolean
  active: boolean
}

const DENOMINATIONS = [
  { value: 100, label: 'Bs 100', type: 'billete' },
  { value: 50, label: 'Bs 50', type: 'billete' },
  { value: 20, label: 'Bs 20', type: 'billete' },
  { value: 10, label: 'Bs 10', type: 'billete' },
  { value: 5, label: 'Bs 5', type: 'billete' },
  { value: 1, label: 'Bs 1', type: 'billete' },
  { value: 0.5, label: 'Bs 0,50', type: 'moneda' },
  { value: 0.25, label: 'Bs 0,25', type: 'moneda' },
]

export function CashRegisterView() {
  const { user } = useAuth()
  const { branches, selectedBranchId, setSelectedBranchId } = useAppStore()
  const isCashier = user?.role === 'cajero'

  const [registers, setRegisters] = useState<CashRegister[]>([])
  const [loading, setLoading] = useState(true)
  const [filterBranchId, setFilterBranchId] = useState<string>(selectedBranchId || '')
  const [showOpen, setShowOpen] = useState(false)
  const [showMovement, setShowMovement] = useState(false)
  const [movementRegId, setMovementRegId] = useState<string | null>(null)
  const [showClose, setShowClose] = useState(false)
  const [closeRegId, setCloseRegId] = useState<string | null>(null)
  const [initialAmt, setInitialAmt] = useState('100')
  const [registerName, setRegisterName] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [availableUsers, setAvailableUsers] = useState<{ id: string; name: string; role: string }[]>([])
  const [moveType, setMoveType] = useState('entrada')
  const [moveAmount, setMoveAmount] = useState('')
  const [moveConcept, setMoveConcept] = useState('')
  const [saving, setSaving] = useState(false)
  const [closeActual, setCloseActual] = useState('')
  const [closingAll, setClosingAll] = useState(false)

  // Retiro de Excedente state
  const [showWithdrawal, setShowWithdrawal] = useState(false)
  const [withdrawalRegId, setWithdrawalRegId] = useState<string | null>(null)
  const [withdrawalAmount, setWithdrawalAmount] = useState('')
  const [withdrawalConcept, setWithdrawalConcept] = useState('')

  // Arqueo de Caja state
  const [showAudit, setShowAudit] = useState(false)
  const [auditRegId, setAuditRegId] = useState<string | null>(null)
  const [auditBreakdown, setAuditBreakdown] = useState<Record<string, string>>({})
  const [auditNotes, setAuditNotes] = useState('')
  const [auditResult, setAuditResult] = useState<{ counted: number; expected: number; difference: number } | null>(null)

  // Register closure alert for cashiers
  const [showClosedAlert, setShowClosedAlert] = useState(false)
  const [closedInfo, setClosedInfo] = useState<{ name: string | null; branchName: string; actual: number; cutDate: string } | null>(null)

  const fetchData = async (branchOverride?: string) => {
    try {
      const branchParam = branchOverride || filterBranchId || selectedBranchId || ''
      // Fetch registers for the selected branch (or all if no filter)
      const url = branchParam
        ? `/api/cash-register?branchId=${branchParam}`
        : '/api/cash-register'
      const regs = await api.get<CashRegister[]>(url)
      setRegisters(regs)

      // Only admin/gerente can see users list for cashier assignment
      if (!isCashier) {
        const users = await api.get<{ id: string; name: string; role: string; active: boolean }[]>('/api/users?role=cajero')
        setAvailableUsers(users.filter(u => u.active))
      }
    } catch {
      toast.error('Error al cargar caja')
    } finally {
      setLoading(false)
    }
  }

  // Initialize branch filter
  useEffect(() => {
    const mainBranch = branches.find(b => b.isMain && b.active)
    const defaultBranch = filterBranchId || selectedBranchId || mainBranch?.id || ''
    setFilterBranchId(defaultBranch)
    if (!filterBranchId && !selectedBranchId && mainBranch) {
      setSelectedBranchId(mainBranch.id)
    }
  }, [branches])

  useEffect(() => {
    if (filterBranchId) {
      fetchData(filterBranchId)
    }
  }, [filterBranchId])

  // Check if cashier's register was closed
  useEffect(() => {
    if (!isCashier || !user?.id) return
    api.get<{ wasClosed: boolean; register?: { name: string | null; branchName: string; closingDate: string; actual: number; cutDate: string } }>(`/api/cash-register/check?userId=${user.id}`)
      .then((result) => {
        if (result.wasClosed && result.register) {
          setClosedInfo(result.register)
          setShowClosedAlert(true)
        }
      })
      .catch(() => {})
  }, [isCashier, user?.id])

  const openRegisters = registers.filter(r => r.status === 'abierta')
  const totalOpenAmt = openRegisters.reduce((sum, r) => sum + r.currentAmt, 0)

  const openRegister = async () => {
    setSaving(true)
    try {
      const effectiveUserId = selectedUserId || user?.id || ''
      if (!effectiveUserId) {
        toast.error('Debe seleccionar un cajero')
        setSaving(false)
        return
      }
      await api.post('/api/cash-register/open', {
        userId: effectiveUserId,
        initialAmt: parseFloat(initialAmt) || 0,
        name: registerName.trim() || undefined,
        branchId: filterBranchId || undefined,
      })
      toast.success('Caja abierta exitosamente')
      setShowOpen(false)
      setRegisterName('')
      setSelectedUserId('')
      fetchData(filterBranchId)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al abrir caja'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const addMovement = async () => {
    if (!moveAmount || !moveConcept) {
      toast.error('Monto y concepto son obligatorios')
      return
    }
    if (!movementRegId) {
      toast.error('No se seleccionó caja')
      return
    }
    setSaving(true)
    try {
      const currencies = await api.get<Array<{ id: string; isBase: boolean }>>('/api/currencies')
      const baseCurrency = currencies.find(c => c.isBase)
      await api.post('/api/cash-register/movement', {
        cashRegId: movementRegId,
        type: moveType,
        amount: parseFloat(moveAmount),
        concept: moveConcept,
        currencyId: baseCurrency?.id || currencies[0]?.id || '',
        userId: user?.id || '',
      })
      toast.success('Movimiento registrado')
      setShowMovement(false)
      setMoveAmount('')
      setMoveConcept('')
      setMovementRegId(null)
      fetchData(filterBranchId)
    } catch {
      toast.error('Error al registrar movimiento')
    } finally {
      setSaving(false)
    }
  }

  const closeRegister = async () => {
    if (!closeRegId) return
    setSaving(true)
    try {
      await api.post('/api/cash-register/close', {
        cashRegId: closeRegId,
        actual: closeActual ? parseFloat(closeActual) : undefined,
      })
      toast.success('Caja cerrada exitosamente')
      setShowClose(false)
      setCloseRegId(null)
      setCloseActual('')
      fetchData(filterBranchId)
    } catch {
      toast.error('Error al cerrar caja')
    } finally {
      setSaving(false)
    }
  }

  const handleWithdrawal = async () => {
    if (!withdrawalAmount || parseFloat(withdrawalAmount) <= 0) {
      toast.error('El monto debe ser mayor a cero')
      return
    }
    if (!withdrawalRegId) {
      toast.error('No se seleccionó caja')
      return
    }
    setSaving(true)
    try {
      const currencies = await api.get<Array<{ id: string; isBase: boolean }>>('/api/currencies')
      const baseCurrency = currencies.find(c => c.isBase)
      const result = await api.post('/api/cash-register/withdrawal', {
        cashRegId: withdrawalRegId,
        amount: parseFloat(withdrawalAmount),
        concept: withdrawalConcept.trim() || undefined,
        currencyId: baseCurrency?.id || currencies[0]?.id || '',
        userId: user?.id || '',
      })
      toast.success(`Retiro de excedente por $${result.amount.toFixed(2)} registrado`)
      setShowWithdrawal(false)
      setWithdrawalAmount('')
      setWithdrawalConcept('')
      setWithdrawalRegId(null)
      fetchData(filterBranchId)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al registrar retiro'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleAudit = async () => {
    if (!auditRegId) {
      toast.error('No se seleccionó caja')
      return
    }
    setSaving(true)
    try {
      const numericBreakdown: Record<string, number> = {}
      for (const [key, val] of Object.entries(auditBreakdown)) {
        const num = parseFloat(val) || 0
        if (num > 0) numericBreakdown[key] = num
      }
      if (Object.keys(numericBreakdown).length === 0) {
        toast.error('Debe ingresar al menos una denominación')
        setSaving(false)
        return
      }
      const result = await api.post<{ counted: number; expected: number; difference: number }>(
        '/api/cash-register/audit',
        {
          cashRegId: auditRegId,
          userId: user?.id || '',
          breakdown: numericBreakdown,
          notes: auditNotes.trim() || undefined,
        }
      )
      setAuditResult(result)
      toast.success('Arqueo de caja registrado')
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al registrar arqueo'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const resetAuditDialog = () => {
    setShowAudit(false)
    setAuditRegId(null)
    setAuditBreakdown({})
    setAuditNotes('')
    setAuditResult(null)
  }

  const closeAllRegisters = async () => {
    setClosingAll(true)
    try {
      const result = await api.post<{ message: string }>('/api/cash-register/close-all', {
        branchId: filterBranchId || undefined,
      })
      toast.success(result.message)
      fetchData(filterBranchId)
    } catch {
      toast.error('Error al cerrar todas las cajas')
    } finally {
      setClosingAll(false)
    }
  }

  if (loading) {
    return <div className="h-64 rounded-lg bg-muted animate-pulse" />
  }

  return (
    <div className="space-y-4">
      {/* Register Closure Alert for Cashiers */}
      {showClosedAlert && closedInfo && (
        <Card className="border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center gap-4">
            <div className="rounded-full bg-red-100 dark:bg-red-900/50 p-4">
              <AlertTriangle className="h-10 w-10 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-red-700 dark:text-red-400">Tu Caja Ha Sido Cerrada</h2>
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                La caja &quot;{closedInfo.name || 'Sin nombre'}&quot; en la sucursal &quot;{closedInfo.branchName}&quot;
                ha sido cerrada por un administrador.
              </p>
              <div className="mt-3 rounded-md bg-white dark:bg-gray-900 p-3 text-sm">
                <p className="text-muted-foreground">Monto final: <span className="font-bold">${closedInfo.actual.toFixed(2)}</span></p>
                <p className="text-muted-foreground">Fecha de cierre: {new Date(closedInfo.cutDate).toLocaleString('es-VE')}</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => {
              setShowClosedAlert(false)
              setClosedInfo(null)
              // Refresh data
              fetchData(filterBranchId)
            }}>
              Entendido
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Branch filter (non-cashier only) */}
      {!isCashier && (
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <Select value={filterBranchId} onValueChange={(v) => {
            setFilterBranchId(v)
            setSelectedBranchId(v)
          }}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtrar por sucursal" />
            </SelectTrigger>
            <SelectContent>
              {branches
                .filter(b => b.active)
                .map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    <span className="flex items-center gap-2">
                      {branch.name}
                      {branch.isMain && <span className="text-xs text-muted-foreground">(Principal)</span>}
                    </span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2 dark:bg-primary/10">
              <Wallet className="h-5 w-5 text-primary dark:text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {openRegisters.length > 1 ? `Total (${openRegisters.length} cajas)` : 'Caja Actual'}
              </p>
              <p className="text-2xl font-bold text-primary dark:text-primary">
                ${totalOpenAmt.toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-full bg-amber-100 p-2 dark:bg-amber-900/30">
              <ArrowUpCircle className="h-5 w-5 text-amber-700 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Estado</p>
              <p className="text-lg font-bold">
                {openRegisters.length > 0 ? (
                  <Badge className="bg-primary">{openRegisters.length} Abierta{openRegisters.length > 1 ? 's' : ''}</Badge>
                ) : (
                  <Badge variant="secondary">Cerrada</Badge>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Acciones</p>
              <div className="flex gap-2 mt-1 flex-wrap">
                {!isCashier && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => {
                      if (openRegisters.length === 1) {
                        setMovementRegId(openRegisters[0].id)
                      }
                      setShowMovement(true)
                    }}>
                      <ArrowDownCircle className="mr-1 h-3 w-3" /> Movimiento
                    </Button>
                    {openRegisters.length > 0 && (
                      <Button size="sm" variant="outline" className="text-red-600" onClick={closeAllRegisters} disabled={closingAll}>
                        {closingAll ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Lock className="mr-1 h-3 w-3" />}
                        Cerrar Todas
                      </Button>
                    )}
                    <Button size="sm" className="bg-primary hover:bg-primary/90 text-white" onClick={() => setShowOpen(true)}>
                      <Plus className="mr-1 h-3 w-3" /> Abrir Caja
                    </Button>
                  </>
                )}
                {isCashier && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Modo cajero
                  </p>
                )}
                {openRegisters.length > 0 && (
                  <>
                    <Button size="sm" variant="outline" className="text-orange-600 border-orange-300 hover:bg-orange-50" onClick={() => {
                      if (openRegisters.length === 1) {
                        setWithdrawalRegId(openRegisters[0].id)
                      }
                      setShowWithdrawal(true)
                    }}>
                      <Banknote className="mr-1 h-3 w-3" /> Retiro
                    </Button>
                    <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-300 hover:bg-emerald-50" onClick={() => {
                      if (openRegisters.length === 1) {
                        setAuditRegId(openRegisters[0].id)
                      }
                      setShowAudit(true)
                    }}>
                      <ClipboardCheck className="mr-1 h-3 w-3" /> Arqueo
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Open Registers */}
      {openRegisters.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cajas Abiertas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Caja</TableHead>
                    <TableHead>Cajero</TableHead>
                    <TableHead>Sucursal</TableHead>
                    <TableHead>Apertura</TableHead>
                    <TableHead className="text-right">Inicial</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Ventas</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openRegisters.map((reg) => (
                    <TableRow key={reg.id}>
                      <TableCell className="font-medium">{reg.name || '—'}</TableCell>
                      <TableCell className="text-sm">{reg.user.name}</TableCell>
                      <TableCell className="text-sm">
                        <Badge variant="outline" className="text-xs">{reg.branch.name}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(reg.openingDate).toLocaleString('es-VE')}
                      </TableCell>
                      <TableCell className="text-right">${reg.initialAmt.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold">${reg.currentAmt.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline">{reg._count.sales}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {!isCashier && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => {
                                setMovementRegId(reg.id)
                                setShowMovement(true)
                              }}>
                                <ArrowDownCircle className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-red-600" onClick={() => {
                                setCloseRegId(reg.id)
                                setCloseActual('')
                                setShowClose(true)
                              }}>
                                <Lock className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="ghost" className="text-orange-600" onClick={() => {
                            setWithdrawalRegId(reg.id)
                            setShowWithdrawal(true)
                          }} title="Retiro de Excedente">
                            <Banknote className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-emerald-600" onClick={() => {
                            setAuditRegId(reg.id)
                            setShowAudit(true)
                          }} title="Arqueo de Caja">
                            <ClipboardCheck className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Register History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Historial de Cajas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Apertura</TableHead>
                  <TableHead>Caja</TableHead>
                  <TableHead>Cajero</TableHead>
                  <TableHead className="hidden sm:table-cell">Sucursal</TableHead>
                  <TableHead className="text-right">Inicial</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Final</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registers.map((reg) => (
                  <TableRow key={reg.id}>
                    <TableCell className="text-sm">
                      {new Date(reg.openingDate).toLocaleString('es-VE')}
                    </TableCell>
                    <TableCell className="font-medium">{reg.name || '—'}</TableCell>
                    <TableCell className="font-medium">{reg.user.name}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs">
                      {reg.branch?.name || '—'}
                    </TableCell>
                    <TableCell className="text-right">${reg.initialAmt.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-semibold hidden sm:table-cell">${reg.currentAmt.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">{reg._count.sales}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={reg.status === 'abierta' ? 'default' : 'secondary'}>
                        {reg.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {registers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No hay registros de caja
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Open Dialog (admin/gerente only) */}
      <Dialog open={showOpen} onOpenChange={setShowOpen}>
        <DialogContent className="sm:max-w-[90vw]">
          <DialogHeader>
            <DialogTitle>Abrir Caja</DialogTitle>
            <DialogDescription>Ingresa el monto inicial y selecciona el cajero</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Cashier selection - only show cashiers */}
            <div className="space-y-2">
              <Label>Cajero Asignado *</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar cajero" /></SelectTrigger>
                <SelectContent>
                  {availableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      <span className="flex items-center gap-2">
                        <UserCircle className="h-3 w-3" />
                        {u.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="regname">Nombre de la Caja (opcional)</Label>
              <Input id="regname" value={registerName} onChange={(e) => setRegisterName(e.target.value)} placeholder="Ej: Caja Principal, Caja 2..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="initial">Monto Inicial</Label>
              <Input id="initial" type="number" step="0.01" value={initialAmt} onChange={(e) => setInitialAmt(e.target.value)} />
            </div>
            <Button className="w-full bg-primary hover:bg-primary/90 text-white" onClick={openRegister} disabled={saving || !selectedUserId}>
              {saving ? 'Abriendo...' : 'Abrir Caja'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Movement Dialog (admin/gerente only) */}
      <Dialog open={showMovement} onOpenChange={(open) => {
        if (!open) {
          setShowMovement(false)
          setMovementRegId(null)
        }
      }}>
        <DialogContent className="sm:max-w-[90vw]">
          <DialogHeader>
            <DialogTitle>Registrar Movimiento</DialogTitle>
            <DialogDescription>Registra una entrada o salida de caja</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {openRegisters.length > 1 && (
              <div className="space-y-2">
                <Label>Caja</Label>
                <Select value={movementRegId || ''} onValueChange={setMovementRegId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar caja" /></SelectTrigger>
                  <SelectContent>
                    {openRegisters.map((reg) => (
                      <SelectItem key={reg.id} value={reg.id}>
                        {reg.name || reg.user.name} — ${reg.currentAmt.toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={moveType} onValueChange={setMoveType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="salida">Salida</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mamt">Monto</Label>
              <Input id="mamt" type="number" step="0.01" value={moveAmount} onChange={(e) => setMoveAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mconcept">Concepto *</Label>
              <Input id="mconcept" value={moveConcept} onChange={(e) => setMoveConcept(e.target.value)} placeholder="Descripción del movimiento" />
            </div>
            <Button className="w-full bg-primary hover:bg-primary/90 text-white" onClick={addMovement} disabled={saving}>
              {saving ? 'Registrando...' : 'Registrar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close Dialog (admin/gerente only) */}
      <Dialog open={showClose} onOpenChange={setShowClose}>
        <DialogContent className="sm:max-w-[90vw]">
          <DialogHeader>
            <DialogTitle>Cerrar Caja</DialogTitle>
            <DialogDescription>Confirma el monto real en caja para cerrar</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {closeRegId && (() => {
              const reg = registers.find(r => r.id === closeRegId)
              return reg ? (
                <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Caja:</span>
                    <span className="font-medium">{reg.name || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cajero:</span>
                    <span className="font-medium">{reg.user.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Monto esperado:</span>
                    <span className="font-medium">${reg.currentAmt.toFixed(2)}</span>
                  </div>
                </div>
              ) : null
            })()}
            <div className="space-y-2">
              <Label htmlFor="closeamt">Monto Real en Caja</Label>
              <Input id="closeamt" type="number" step="0.01" value={closeActual} onChange={(e) => setCloseActual(e.target.value)} placeholder={openRegisters[0]?.currentAmt.toFixed(2)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Se enviará un correo electrónico al administrador con el resumen del cierre.
            </p>
            <Button className="w-full bg-red-600 hover:bg-red-700 text-white" onClick={closeRegister} disabled={saving}>
              {saving ? 'Cerrando...' : 'Confirmar Cierre'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Retiro de Excedente Dialog */}
      <Dialog open={showWithdrawal} onOpenChange={(open) => {
        if (!open) {
          setShowWithdrawal(false)
          setWithdrawalRegId(null)
          setWithdrawalAmount('')
          setWithdrawalConcept('')
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-orange-600" />
              Retiro de Excedente
            </DialogTitle>
            <DialogDescription>Retira el efectivo excedente de la caja</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {openRegisters.length > 1 && (
              <div className="space-y-2">
                <Label>Caja</Label>
                <Select value={withdrawalRegId || ''} onValueChange={setWithdrawalRegId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar caja" /></SelectTrigger>
                  <SelectContent>
                    {openRegisters.map((reg) => (
                      <SelectItem key={reg.id} value={reg.id}>
                        {reg.name || reg.user.name} — ${reg.currentAmt.toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {withdrawalRegId && (() => {
              const reg = registers.find(r => r.id === withdrawalRegId)
              if (!reg) return null
              return (
                <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Caja:</span>
                    <span className="font-medium">{reg.name || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Saldo actual:</span>
                    <span className="font-bold text-primary">${reg.currentAmt.toFixed(2)}</span>
                  </div>
                </div>
              )
            })()}
            <div className="space-y-2">
              <Label htmlFor="wamt">Monto a Retirar</Label>
              <Input
                id="wamt"
                type="number"
                step="0.01"
                min="0"
                value={withdrawalAmount}
                onChange={(e) => setWithdrawalAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wconcept">Concepto (opcional)</Label>
              <Input
                id="wconcept"
                value={withdrawalConcept}
                onChange={(e) => setWithdrawalConcept(e.target.value)}
                placeholder="Razón del retiro..."
              />
            </div>
            <Button
              className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              onClick={handleWithdrawal}
              disabled={saving || !withdrawalAmount || parseFloat(withdrawalAmount) <= 0}
            >
              {saving ? 'Registrando...' : 'Registrar Retiro'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Arqueo de Caja Dialog */}
      <Dialog open={showAudit} onOpenChange={(open) => {
        if (!open) resetAuditDialog()
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-emerald-600" />
              Arqueo de Caja
            </DialogTitle>
            <DialogDescription>Verificación del efectivo en caja por denominación</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {openRegisters.length > 1 && (
              <div className="space-y-2">
                <Label>Caja</Label>
                <Select value={auditRegId || ''} onValueChange={setAuditRegId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar caja" /></SelectTrigger>
                  <SelectContent>
                    {openRegisters.map((reg) => (
                      <SelectItem key={reg.id} value={reg.id}>
                        {reg.name || reg.user.name} — ${reg.currentAmt.toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {auditRegId && (() => {
              const reg = registers.find(r => r.id === auditRegId)
              if (!reg) return null
              return (
                <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Caja:</span>
                    <span className="font-medium">{reg.name || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Monto esperado:</span>
                    <span className="font-bold text-primary">${reg.currentAmt.toFixed(2)}</span>
                  </div>
                </div>
              )
            })()}

            <div className="space-y-3">
              <Label className="text-sm font-medium">Denominaciones</Label>
              <div className="grid grid-cols-2 gap-2">
                {DENOMINATIONS.map((denom) => (
                  <div key={denom.value} className="flex items-center gap-2">
                    <span className="text-xs font-mono w-16 text-right shrink-0 text-muted-foreground">
                      {denom.label}
                    </span>
                    <Input
                      type="number"
                      min="0"
                      className="h-8 text-sm"
                      placeholder="0"
                      value={auditBreakdown[denom.value.toString()] || ''}
                      onChange={(e) =>
                        setAuditBreakdown((prev) => ({
                          ...prev,
                          [denom.value.toString()]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Totals */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total contado:</span>
                <span className="font-bold text-lg">
                  ${Object.entries(auditBreakdown).reduce(
                    (sum, [denom, qty]) => sum + parseFloat(denom) * (parseFloat(qty) || 0),
                    0
                  ).toFixed(2)}
                </span>
              </div>
              {auditRegId && (() => {
                const reg = registers.find(r => r.id === auditRegId)
                if (!reg) return null
                const counted = Object.entries(auditBreakdown).reduce(
                  (sum, [denom, qty]) => sum + parseFloat(denom) * (parseFloat(qty) || 0),
                  0
                )
                const diff = counted - reg.currentAmt
                return (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Diferencia:</span>
                    <span className={`font-bold ${diff > 0 ? 'text-amber-600' : diff < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                      {diff > 0 && ' (Sobrante)'}
                      {diff < 0 && ' (Faltante)'}
                      {diff === 0 && ' (Cuadrado)'}
                    </span>
                  </div>
                )
              })()}
            </div>

            {/* Audit Result */}
            {auditResult && (
              <div className={`rounded-md p-4 text-center ${
                auditResult.difference === 0
                  ? 'bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
                  : auditResult.difference > 0
                    ? 'bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
                    : 'bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-800'
              }`}>
                {auditResult.difference === 0 ? (
                  <>
                    <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-1" />
                    <p className="font-bold text-emerald-700 dark:text-emerald-400">Cuadrado</p>
                  </>
                ) : auditResult.difference > 0 ? (
                  <p className="font-bold text-amber-700 dark:text-amber-400">
                    Sobrante: ${auditResult.difference.toFixed(2)}
                  </p>
                ) : (
                  <p className="font-bold text-red-700 dark:text-red-400">
                    Faltante: ${Math.abs(auditResult.difference).toFixed(2)}
                  </p>
                )}
                <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                  <p>Esperado: ${auditResult.expected.toFixed(2)}</p>
                  <p>Contado: ${auditResult.counted.toFixed(2)}</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="auditnotes">Notas (opcional)</Label>
              <Textarea
                id="auditnotes"
                value={auditNotes}
                onChange={(e) => setAuditNotes(e.target.value)}
                placeholder="Observaciones del arqueo..."
                rows={2}
              />
            </div>

            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleAudit}
              disabled={saving}
            >
              {saving ? 'Registrando...' : auditResult ? 'Registrar Nuevo Arqueo' : 'Registrar Arqueo'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
