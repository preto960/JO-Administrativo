'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { usePosStore } from '@/stores/use-pos-store'
import { useAuth } from '@/hooks/use-auth'
import { useSetting } from '@/stores/use-app-store'
import { api } from '@/lib/api'
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
  RadioGroup, RadioGroupItem,
} from '@/components/ui/radio-group'
import {
  Banknote, CreditCard, ArrowLeftRight, Clock, Smartphone,
  CircleDollarSign, CheckCircle2, Loader2, AlertTriangle,
  UserPlus, User, X, type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useCurrency } from '@/hooks/use-currency'
import { FALLBACK_METHODS } from '@/lib/payment-methods'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Command, CommandList, CommandItem } from '@/components/ui/command'
import { HybridPaymentSelector, type HybridPaymentEntry } from '@/components/shared/hybrid-payment-selector'

interface PosPaymentModalProps { onClose: () => void }

interface PaymentMethodItem {
  code: string; name: string; icon: string; enabled: boolean
  needsReference: boolean; isLocalCurrency: boolean; isCash: boolean; isCredit: boolean
}

interface ClientOption {
  id: string; name: string; lastName: string | null; phone: string | null; email: string | null
  deletedAt: string | null
}

const ICON_MAP: Record<string, LucideIcon> = {
  Banknote, CreditCard, ArrowLeftRight, Clock, Smartphone, CircleDollarSign,
}
function getIcon(iconName: string): LucideIcon { return ICON_MAP[iconName] || CircleDollarSign }

export function PosPaymentModal({ onClose }: PosPaymentModalProps) {
  const { items, getTotal, clearCart, clientId, setClientId } = usePosStore()
  const { user } = useAuth()
  const exchangeRate = useSetting('exchangeRate')
  const baseCurrencyId = useSetting('baseCurrencyId')
  const country = useSetting('country') || 'VE'
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [currencies, setCurrencies] = useState<{ id: string; code: string; symbol: string; isBase: boolean }[]>([])
  const [openCashRegId, setOpenCashRegId] = useState<string | null>(null)
  const [dbMethods, setDbMethods] = useState<PaymentMethodItem[]>([])

  // Hybrid payment state
  const [hybridPayments, setHybridPayments] = useState<HybridPaymentEntry[]>([])
  const [isHybridMode, setIsHybridMode] = useState(false)

  // Client selection (credit only)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const clientsReqId = useRef(0)
  const clientSearchRef = useRef<HTMLDivElement | null>(null)
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')
  const [creatingClient, setCreatingClient] = useState(false)

  const subtotal = getTotal()
  const ivaEnabled = useSetting('ivaEnabled')
  const ivaRate = Number(useSetting('ivaRate')) || 0
  const ivaAmount = ivaEnabled ? Math.round(subtotal * (ivaRate / 100) * 100) / 100 : 0
  const total = Math.round((subtotal + ivaAmount) * 100) / 100
  const totalBs = total * exchangeRate
  const { sym: currencySymbol, baseSym, refCode, fmt, fmtBase, multiEnabled } = useCurrency()

  const paymentMethods = useMemo(() => dbMethods.filter(m => m.enabled), [dbMethods])
  const resolvedCurrencyId = baseCurrencyId || currencies.find(c => c.isBase)?.id || currencies[0]?.id || ''
  const hasNoCurrency = !resolvedCurrencyId && currencies.length > 0

  // Check if credit is selected (single mode only — credit not allowed in hybrid)
  const isCreditSelected = !isHybridMode && paymentMethods.find(pm => pm.code === hybridPayments[0]?.method)?.isCredit
  const showClientSelector = isCreditSelected

  // Change calculation (only for cash in single mode)
  const changeAmount = useMemo(() => {
    if (isHybridMode) return 0
    const p = hybridPayments[0]
    if (!p) return 0
    const m = paymentMethods.find(pm => pm.code === p.method)
    if (m?.isCash && p.amount > total) return p.amount - total
    return 0
  }, [hybridPayments, isHybridMode, paymentMethods, total])

  useEffect(() => {
    Promise.all([
      api.get<{ id: string; code: string; symbol: string; isBase: boolean }[]>('/api/currencies'),
      api.get<{ id: string; status: string }[]>('/api/cash-register'),
      api.get(`/api/payment-methods?country=${country}&context=pos`),
    ]).then(([currencies, registers, methods]) => {
      setCurrencies(currencies)
      const openReg = registers?.find(r => r.status === 'abierta')
      if (openReg) setOpenCashRegId(openReg.id)
      if (Array.isArray(methods) && methods.length > 0) {
        setDbMethods(methods)
      } else {
        setDbMethods(FALLBACK_METHODS)
      }
    }).catch(() => {
      setDbMethods(FALLBACK_METHODS)
    })
  }, [country])

  // Server-side client search, loaded on demand when credit is selected.
  // Credit sales can be assigned to any client, including inactive (soft-deleted) ones.
  useEffect(() => {
    if (!showClientSelector) return
    const q = clientSearch.trim()
    if (!q) { setClients([]); setClientsLoading(false); return }
    const timer = setTimeout(() => {
      const reqId = ++clientsReqId.current
      setClientsLoading(true)
      const params = new URLSearchParams({ includeDeleted: 'true', light: 'true', take: '30', search: q })
      api.get<ClientOption[]>(`/api/clients?${params}`).then(res => {
        if (reqId !== clientsReqId.current) return
        setClients(Array.isArray(res) ? res : [])
      }).catch(() => {
        if (reqId === clientsReqId.current) setClients([])
      }).finally(() => {
        if (reqId === clientsReqId.current) setClientsLoading(false)
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [showClientSelector, clientSearch])

  // Resolve the name of a client chosen before the modal opened (e.g. restored paused sale)
  useEffect(() => {
    if (!showClientSelector || !clientId || selectedClient?.id === clientId) return
    let cancelled = false
    api.get<ClientOption | null>(`/api/clients?light=true&id=${clientId}`).then(res => {
      if (!cancelled && res && res.id) setSelectedClient(res)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [showClientSelector, clientId, selectedClient?.id])

  const handleSelectClient = (client: ClientOption) => {
    setSelectedClient(client)
    setClientId(client.id)
    setClientSearch('')
    setDropdownOpen(false)
  }

  const handleClearClient = () => {
    setSelectedClient(null)
    setClientId(null)
  }

  const handleCreateClient = async () => {
    if (!newClientName.trim()) { toast.error('El nombre del cliente es obligatorio'); return }
    setCreatingClient(true)
    try {
      const newClient = await api.post<ClientOption>('/api/clients', { name: newClientName.trim(), phone: newClientPhone.trim() || undefined, email: newClientEmail.trim() || undefined })
      setClients(prev => [...prev, newClient])
      setSelectedClient(newClient)
      setClientId(newClient.id)
      setShowNewClient(false); setNewClientName(''); setNewClientPhone(''); setNewClientEmail('')
      toast.success(`Cliente "${newClient.name}" creado`)
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error al crear cliente') }
    finally { setCreatingClient(false) }
  }

  const handlePay = async () => {
    // Validate
    if (isHybridMode) {
      const sum = hybridPayments.reduce((s, p) => s + p.amount, 0)
      if (Math.abs(sum - total) > 0.01) { toast.error('Los pagos híbridos no cubren el total exacto'); return }
      for (const p of hybridPayments) {
        const m = paymentMethods.find(pm => pm.code === p.method)
        if (m?.needsReference && !p.reference) { toast.error(`La referencia es obligatoria para ${m.name}`); return }
      }
    } else {
      const p = hybridPayments[0]
      if (!p || !p.method) { toast.error('Selecciona un método de pago'); return }
      if (p.amount <= 0) { toast.error('El monto debe ser mayor a cero'); return }
      const m = paymentMethods.find(pm => pm.code === p.method)
      if (m?.needsReference && !p.reference) { toast.error(`La referencia es obligatoria para ${m?.name}`); return }
      if (m?.isCredit && !clientId) { toast.error('Debe seleccionar un cliente para ventas a crédito'); return }
    }
    if (!resolvedCurrencyId) { toast.error('No se pudo determinar la moneda'); return }

    setLoading(true)
    try {
      let paymentsToSend: { method: string; amount: number; currencyId: string; reference?: string }[]

      if (isHybridMode) {
        // Hybrid: each entry is a separate SalePayment
        paymentsToSend = hybridPayments.map(p => ({
          method: p.method,
          amount: p.amount,
          currencyId: resolvedCurrencyId,
          reference: p.reference || undefined,
        }))
      } else {
        const p = hybridPayments[0]
        paymentsToSend = [{ method: p.method, amount: p.amount, currencyId: resolvedCurrencyId, reference: p.reference || undefined }]
      }

      await api.post('/api/sales', {
        clientId: clientId || null,
        cashRegId: openCashRegId,
        userId: user?.id || '',
        ivaEnabled: !!ivaEnabled,
        ivaRate,
        lines: items.map(item => ({ productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice, unitCost: item.unitCost })),
        payments: paymentsToSend,
      })
      setSuccess(true)
      setTimeout(() => { clearCart(); onClose() }, 2000)
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error al procesar la venta') }
    finally { setLoading(false) }
  }

  // Whether the submit button should be disabled
  const submitDisabled = loading || !resolvedCurrencyId
    || (!isHybridMode && !hybridPayments[0]?.method)
    || (!isHybridMode && isCreditSelected && !clientId)
    || (isHybridMode && !hybridPayments.every(p => p.method && p.amount > 0))

  const btnLabel = (() => {
    if (isHybridMode) {
      const count = hybridPayments.filter(p => p.amount > 0).length
      return `Confirmar Pago Híbrido (${count} métodos)`
    }
    const p = hybridPayments[0]
    if (!p) return 'Confirmar Pago'
    const m = paymentMethods.find(pm => pm.code === p.method)
    const isLocal = multiEnabled ? (m?.isLocalCurrency ?? false) : false
    const sym = isLocal ? baseSym : currencySymbol
    const amt = isLocal ? (p.amount * exchangeRate).toFixed(2) : p.amount.toFixed(2)
    return `Confirmar Pago ${sym}${amt}`
  })()

  return (
    <Dialog open onOpenChange={() => !success && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cobrar</DialogTitle>
          <DialogDescription>
            Total: {currencySymbol}{total.toFixed(2)}
            {multiEnabled && <span className="ml-2">· {baseSym} {totalBs.toFixed(2)}</span>}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <div className="rounded-full bg-primary/10 p-4 dark:bg-primary/10"><CheckCircle2 className="h-12 w-12 text-primary" /></div>
            <h3 className="text-xl font-bold text-primary dark:text-primary">¡Venta Exitosa!</h3>
            <p className="text-sm text-muted-foreground">Cerrando automáticamente...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {!openCashRegId && (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-2 text-xs text-amber-700 dark:text-amber-400">
                No hay caja abierta. Las ventas no se asociarán a un registro de caja.
              </div>
            )}
            {!baseCurrencyId && resolvedCurrencyId && (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-2 text-xs text-amber-700 dark:text-amber-400">
                Moneda base no configurada. Se usará la moneda predeterminada.
              </div>
            )}

            {/* Payment method selector (single + hybrid) */}
            <HybridPaymentSelector
              methods={paymentMethods}
              total={total}
              currencySymbol={currencySymbol}
              multiEnabled={multiEnabled}
              exchangeRate={exchangeRate}
              localCurrencySymbol={baseSym}
              onChange={setHybridPayments}
              onModeChange={setIsHybridMode}
            />

            {/* Client selector — credit (single mode only) */}
            {showClientSelector && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Cliente</Label>
                  {!showNewClient && !selectedClient && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10" onClick={() => setShowNewClient(true)}>
                      <UserPlus className="h-3 w-3 mr-1" /> Nuevo cliente
                    </Button>
                  )}
                </div>
                {!showNewClient ? (
                  <>
                    <Popover open={dropdownOpen && !selectedClient} onOpenChange={setDropdownOpen}>
                      <PopoverAnchor asChild>
                        <div ref={clientSearchRef}>
                          <Input
                            placeholder={selectedClient ? 'Cliente seleccionado' : 'Escriba para buscar por nombre, teléfono o email...'}
                            value={clientSearch}
                            onChange={e => { setClientSearch(e.target.value); setDropdownOpen(!!e.target.value.trim()) }}
                            onPointerDown={() => { if (clientSearch.trim()) setDropdownOpen(true) }}
                            onFocus={() => { if (clientSearch.trim()) setDropdownOpen(true) }}
                            onKeyDown={e => { if (e.key === 'Escape') setDropdownOpen(false) }}
                            disabled={!!selectedClient}
                            className="text-sm cursor-pointer"
                          />
                        </div>
                      </PopoverAnchor>
                      <PopoverContent
                        align="start"
                        sideOffset={4}
                        onOpenAutoFocus={e => e.preventDefault()}
                        onPointerDownOutside={e => {
                          // Keep the dropdown open when the pointer down lands on the search input itself
                          if (clientSearchRef.current?.contains(e.detail.originalEvent.target as Node)) e.preventDefault()
                        }}
                        onFocusOutside={e => {
                          // The input keeps focus while the dropdown is open; don't treat it as outside focus
                          if (clientSearchRef.current?.contains(e.detail.originalEvent.target as Node)) e.preventDefault()
                        }}
                        className="w-[var(--radix-popover-trigger-width)] p-0"
                      >
                        <Command shouldFilter={false}>
                          <CommandList
                            className="max-h-48"
                            onWheel={e => {
                              // The modal dialog's scroll lock blocks native wheel over the portaled list
                              if (e.defaultPrevented && e.currentTarget.scrollHeight > e.currentTarget.clientHeight) {
                                e.currentTarget.scrollTop += e.deltaY
                              }
                            }}
                          >
                            {clientsLoading ? (
                              <p className="text-xs text-muted-foreground text-center py-3 flex items-center justify-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Buscando clientes...</p>
                            ) : clients.length > 0 ? clients.map(client => (
                              <CommandItem key={client.id} value={client.id} onSelect={() => handleSelectClient(client)} className="gap-2 py-2.5 text-sm cursor-pointer">
                                <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className={`truncate flex-1 ${client.deletedAt ? 'text-muted-foreground line-through decoration-muted-foreground/50' : ''}`}>{client.name}{client.lastName ? ` ${client.lastName}` : ''}</span>
                                {client.deletedAt && <span className="text-[10px] uppercase font-semibold text-amber-600 dark:text-amber-400 border border-amber-300/60 dark:border-amber-700/60 rounded px-1 py-0.5 shrink-0">Inactivo</span>}
                                {client.phone && <span className="text-xs text-muted-foreground shrink-0">{client.phone}</span>}
                              </CommandItem>
                            )) : <p className="text-xs text-muted-foreground text-center py-3">{clientSearch.trim() ? 'No se encontraron clientes para esa búsqueda' : 'No hay clientes registrados'}</p>}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {selectedClient ? (
                      <div className="flex items-center gap-2.5 rounded-md border bg-primary/5 dark:bg-primary/10 p-2.5">
                        <div className="rounded-full bg-primary/10 dark:bg-primary/15 p-1.5 shrink-0"><User className="h-3.5 w-3.5 text-primary" /></div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium truncate ${selectedClient.deletedAt ? 'line-through decoration-muted-foreground/50' : ''}`}>{selectedClient.name}{selectedClient.lastName ? ` ${selectedClient.lastName}` : ''}</p>
                          {selectedClient.phone && <p className="text-xs text-muted-foreground truncate">{selectedClient.phone}</p>}
                        </div>
                        {selectedClient.deletedAt && <span className="text-[10px] uppercase font-semibold text-amber-600 dark:text-amber-400 border border-amber-300/60 dark:border-amber-700/60 rounded px-1 py-0.5 shrink-0">Inactivo</span>}
                        <button type="button" className="rounded-full p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0" onClick={handleClearClient} aria-label="Quitar cliente seleccionado">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" /> Seleccione un cliente para vender a crédito</p>
                    )}
                  </>
                ) : (
                  <div className="space-y-2 rounded-md border p-3 bg-muted/30">
                    <p className="text-xs font-medium text-muted-foreground">Registrar nuevo cliente</p>
                    <Input placeholder="Nombre *" value={newClientName} onChange={e => setNewClientName(e.target.value)} className="text-sm" autoFocus />
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Teléfono" value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)} className="text-sm" />
                      <Input placeholder="Email" value={newClientEmail} onChange={e => setNewClientEmail(e.target.value)} className="text-sm" />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button type="button" size="sm" className="flex-1 bg-primary hover:bg-primary/90 text-white" onClick={handleCreateClient} disabled={creatingClient || !newClientName.trim()}>
                        {creatingClient ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Creando...</> : <><UserPlus className="mr-1 h-3 w-3" /> Crear</>}
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => { setShowNewClient(false); setNewClientName(''); setNewClientPhone(''); setNewClientEmail('') }}>Cancelar</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Change (single cash only) */}
            {changeAmount > 0 && (
              <p className="text-sm text-primary font-medium">
                Cambio: {baseSym}{changeAmount.toFixed(2)}
              </p>
            )}

            <Button className="w-full bg-primary hover:bg-primary/90 text-white" size="lg" onClick={handlePay} disabled={submitDisabled}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando...</> : btnLabel}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}