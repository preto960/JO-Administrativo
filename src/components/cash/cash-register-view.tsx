'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Wallet, Plus, ArrowUpCircle, ArrowDownCircle, Lock, Eye, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'

interface CashRegister {
  id: string
  openingDate: string
  closingDate: string | null
  initialAmt: number
  currentAmt: number
  status: string
  user: { id: string; name: string }
  _count: { sales: number; movements: number }
}

export function CashRegisterView() {
  const { user } = useAuth()
  const [registers, setRegisters] = useState<CashRegister[]>([])
  const [loading, setLoading] = useState(true)
  const [showOpen, setShowOpen] = useState(false)
  const [showMovement, setShowMovement] = useState(false)
  const [movementRegId, setMovementRegId] = useState<string | null>(null)
  const [showClose, setShowClose] = useState(false)
  const [closeRegId, setCloseRegId] = useState<string | null>(null)
  const [initialAmt, setInitialAmt] = useState('100')
  const [moveType, setMoveType] = useState('entrada')
  const [moveAmount, setMoveAmount] = useState('')
  const [moveConcept, setMoveConcept] = useState('')
  const [saving, setSaving] = useState(false)
  const [closeActual, setCloseActual] = useState('')
  const [closingAll, setClosingAll] = useState(false)

  const fetchData = async () => {
    try {
      const data = await api.get<CashRegister[]>('/api/cash-register')
      setRegisters(data)
    } catch {
      toast.error('Error al cargar caja')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const openRegisters = registers.filter(r => r.status === 'abierta')
  const totalOpenAmt = openRegisters.reduce((sum, r) => sum + r.currentAmt, 0)

  const openRegister = async () => {
    setSaving(true)
    try {
      await api.post('/api/cash-register/open', {
        userId: user?.id || '',
        initialAmt: parseFloat(initialAmt) || 0,
      })
      toast.success('Caja abierta exitosamente')
      setShowOpen(false)
      fetchData()
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
      fetchData()
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
      fetchData()
    } catch {
      toast.error('Error al cerrar caja')
    } finally {
      setSaving(false)
    }
  }

  const closeAllRegisters = async () => {
    setClosingAll(true)
    try {
      const result = await api.post<{ message: string }>('/api/cash-register/close-all', {})
      toast.success(result.message)
      fetchData()
    } catch {
      toast.error('Error al cerrar todas las cajas')
    } finally {
      setClosingAll(false)
    }
  }

  const currentRegister = registers[0]?.status === 'abierta' ? openRegisters[0] : null

  if (loading) {
    return <div className="h-64 rounded-lg bg-muted animate-pulse" />
  }

  return (
    <div className="space-y-4">
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
                    <TableHead>Cajero</TableHead>
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
                      <TableCell className="font-medium">{reg.user.name}</TableCell>
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
                  <TableHead>Cajero</TableHead>
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
                    <TableCell className="font-medium">{reg.user.name}</TableCell>
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
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No hay registros de caja
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Open Dialog */}
      <Dialog open={showOpen} onOpenChange={setShowOpen}>
        <DialogContent className="sm:max-w-[90vw]">
          <DialogHeader>
            <DialogTitle>Abrir Caja</DialogTitle>
            <DialogDescription>Ingresa el monto inicial para abrir la caja</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="initial">Monto Inicial</Label>
              <Input id="initial" type="number" step="0.01" value={initialAmt} onChange={(e) => setInitialAmt(e.target.value)} />
            </div>
            <Button className="w-full bg-primary hover:bg-primary/90 text-white" onClick={openRegister} disabled={saving}>
              {saving ? 'Abriendo...' : 'Abrir Caja'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Movement Dialog */}
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
                        {reg.user.name} — ${reg.currentAmt.toFixed(2)}
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

      {/* Close Dialog */}
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
              <Input id="closeamt" type="number" step="0.01" value={closeActual} onChange={(e) => setCloseActual(e.target.value)} placeholder={currentRegister?.currentAmt.toFixed(2)} />
            </div>
            <Button className="w-full bg-red-600 hover:bg-red-700 text-white" onClick={closeRegister} disabled={saving}>
              {saving ? 'Cerrando...' : 'Confirmar Cierre'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
