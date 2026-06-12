'use client'

import { useState, useEffect, useMemo } from 'react'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Banknote, CreditCard, ArrowLeftRight, Clock, Smartphone, CheckCircle2, Loader2, AlertTriangle, UserPlus, User } from 'lucide-react'
import { toast } from 'sonner'
import { useCurrency } from '@/hooks/use-currency'

interface PosPaymentModalProps {
  onClose: () => void
}

interface PaymentMethod {
  value: string
  label: string
  icon: React.ElementType
  needsReference?: boolean
  isLocalCurrency?: boolean
}

interface ClientOption {
  id: string
  name: string
  phone: string | null
  email: string | null
}

const paymentMethods: PaymentMethod[] = [
  { value: 'divisas', label: 'Divisas', icon: Banknote, isLocalCurrency: false },
  { value: 'efectivo', label: 'Efectivo', icon: Banknote, isLocalCurrency: true },
  { value: 'pago_movil', label: 'Pago Móvil', icon: Smartphone, needsReference: true, isLocalCurrency: true },
  { value: 'tarjeta', label: 'Tarjeta', icon: CreditCard, needsReference: true, isLocalCurrency: true },
  { value: 'transferencia', label: 'Transferencia', icon: ArrowLeftRight, needsReference: true, isLocalCurrency: true },
  { value: 'credito', label: 'Crédito', icon: Clock, isLocalCurrency: false },
]

export function PosPaymentModal({ onClose }: PosPaymentModalProps) {
  const { items, getTotal, clearCart, clientId, setClientId } = usePosStore()
  const { user } = useAuth()
  const exchangeRate = useSetting('exchangeRate')
  const baseCurrencyId = useSetting('baseCurrencyId')
  const [method, setMethod] = useState('divisas')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [currencies, setCurrencies] = useState<{ id: string; code: string; symbol: string; isBase: boolean }[]>([])
  const [openCashRegId, setOpenCashRegId] = useState<string | null>(null)

  // Client selection
  const [clients, setClients] = useState<ClientOption[]>([])
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
  const selectedMethod = paymentMethods.find(pm => pm.value === method)

  // Resolve currencyId: prefer baseCurrencyId from settings, fallback to isBase currency or first available
  const resolvedCurrencyId = baseCurrencyId
    || currencies.find(c => c.isBase)?.id
    || currencies[0]?.id
    || ''
  const hasNoCurrency = !resolvedCurrencyId && currencies.length > 0

  // Determine if current method uses local currency
  const isLocalMethod = multiEnabled ? (selectedMethod?.isLocalCurrency ?? false) : false

  // Show client selector when credit is selected
  const showClientSelector = method === 'credito'

  // Filtered clients for search
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients
    const q = clientSearch.toLowerCase()
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
    )
  }, [clients, clientSearch])

  // Selected client name for display
  const selectedClientName = useMemo(() => {
    if (!clientId) return null
    return clients.find(c => c.id === clientId)?.name || null
  }, [clientId, clients])

  // When method changes, set default amount in the correct currency
  useEffect(() => {
    if (isLocalMethod) {
      setAmount(totalBs.toFixed(2))
    } else {
      setAmount(total.toFixed(2))
    }
  }, [method, isLocalMethod, totalBs, total])

  // Load currencies, open cash register, and clients on mount
  useEffect(() => {
    Promise.all([
      api.get<{ id: string; code: string; symbol: string; isBase: boolean }[]>('/api/currencies'),
      api.get<Array<{ id: string; status: string }>>('/api/cash-register'),
      api.get<ClientOption[]>('/api/clients'),
    ]).then(([currencies, registers, clients]) => {
      setCurrencies(currencies)
      const openReg = registers?.find(r => r.status === 'abierta')
      if (openReg) setOpenCashRegId(openReg.id)
      if (Array.isArray(clients)) setClients(clients)
    }).catch(() => {})
  }, [])

  // Create new client
  const handleCreateClient = async () => {
    if (!newClientName.trim()) {
      toast.error('El nombre del cliente es obligatorio')
      return
    }
    setCreatingClient(true)
    try {
      const newClient = await api.post<ClientOption>('/api/clients', {
        name: newClientName.trim(),
        phone: newClientPhone.trim() || undefined,
        email: newClientEmail.trim() || undefined,
      })
      setClients(prev => [...prev, newClient])
      setClientId(newClient.id)
      setShowNewClient(false)
      setNewClientName('')
      setNewClientPhone('')
      setNewClientEmail('')
      toast.success(`Cliente "${newClient.name}" creado`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al crear cliente'
      toast.error(msg)
    } finally {
      setCreatingClient(false)
    }
  }

  // Convert displayed amount to reference currency for submission
  const amountInRefCurrency = useMemo(() => {
    const parsed = parseFloat(amount) || 0
    if (isLocalMethod) {
      return exchangeRate > 0 ? Math.round((parsed / exchangeRate) * 100) / 100 : parsed
    }
    return parsed
  }, [amount, isLocalMethod, exchangeRate])

  const handlePay = async () => {
    if (parseFloat(amount) <= 0) {
      toast.error('El monto debe ser mayor a cero')
      return
    }
    if (!isLocalMethod && parseFloat(amount) > total && method !== 'divisas') {
      toast.error('El monto excede el total')
      return
    }
    if (!resolvedCurrencyId) {
      toast.error('No se pudo determinar la moneda. Verifica la configuracion o crea una moneda en el sistema.')
      return
    }
    if (selectedMethod?.needsReference && !reference.trim()) {
      toast.error(`La referencia es obligatoria para ${selectedMethod.label}`)
      return
    }
    if (method === 'credito' && !clientId) {
      toast.error('Debe seleccionar un cliente para ventas a credito')
      return
    }

    setLoading(true)
    try {
      const paymentAmount = isLocalMethod
        ? parseFloat(amount) || 0
        : Math.min(parseFloat(amount) || 0, total)

      await api.post('/api/sales', {
        clientId: clientId || null,
        cashRegId: openCashRegId,
        userId: user?.id || '',
        ivaEnabled: !!ivaEnabled,
        ivaRate,
        lines: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unitCost: item.unitCost,
        })),
        payments: [
          {
            method,
            amount: paymentAmount,
            currencyId: resolvedCurrencyId,
            reference: reference.trim() || undefined,
          },
        ],
      })
      setSuccess(true)
      setTimeout(() => {
        clearCart()
        onClose()
      }, 2000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al procesar la venta'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  // Calculate change in the displayed currency
  const changeAmount = useMemo(() => {
    const parsed = parseFloat(amount) || 0
    if (method === 'divisas' || method === 'efectivo') {
      const limit = isLocalMethod ? totalBs : total
      if (parsed > limit) {
        return parsed - limit
      }
    }
    return 0
  }, [amount, method, isLocalMethod, totalBs, total])

  const amountLabel = isLocalMethod ? `Monto (${baseSym})` : 'Monto'
  const changeLabel = isLocalMethod ? baseSym : currencySymbol

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
            <div className="rounded-full bg-primary/10 p-4 dark:bg-primary/10">
              <CheckCircle2 className="h-12 w-12 text-primary" />
            </div>
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
                Moneda base no configurada. Se usará la moneda predeterminada del sistema. Ve a Configuración → Moneda para definir la moneda base.
              </div>
            )}

            {/* Method Selection */}
            <RadioGroup value={method} onValueChange={(v) => { setMethod(v); setReference('') }} className="grid grid-cols-2 gap-3">
              {paymentMethods.map((pm) => (
                <label
                  key={pm.value}
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 p-3 transition-colors ${
                    method === pm.value
                      ? 'border-primary bg-primary/5 dark:bg-primary/10'
                      : 'border-muted hover:border-muted-foreground/30'
                  }`}
                >
                  <RadioGroupItem value={pm.value} className="sr-only" />
                  <pm.icon className={`h-5 w-5 ${method === pm.value ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className={`text-xs font-medium ${method === pm.value ? 'text-primary dark:text-primary' : ''}`}>
                    {pm.label}
                  </span>
                </label>
              ))}
            </RadioGroup>

            {/* Client selector — shown when credit is selected */}
            {showClientSelector && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    Cliente
                  </Label>
                  {!showNewClient && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10"
                      onClick={() => setShowNewClient(true)}
                    >
                      <UserPlus className="h-3 w-3 mr-1" />
                      Nuevo cliente
                    </Button>
                  )}
                </div>

                {!showNewClient ? (
                  <>
                    {/* Existing client selector */}
                    {selectedClientName && clientId && (
                      <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                        <User className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm font-medium flex-1 truncate">{selectedClientName}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => setClientId(null)}
                        >
                          ✕
                        </Button>
                      </div>
                    )}

                    {!clientId && (
                      <>
                        <Input
                          placeholder="Buscar por nombre, teléfono o email..."
                          value={clientSearch}
                          onChange={(e) => setClientSearch(e.target.value)}
                          className="text-sm"
                        />
                        {filteredClients.length > 0 && (
                          <div className="max-h-40 overflow-y-auto rounded-md border">
                            {filteredClients.slice(0, 20).map((client) => (
                              <button
                                key={client.id}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors border-b last:border-b-0 flex items-center gap-2"
                                onClick={() => {
                                  setClientId(client.id)
                                  setClientSearch('')
                                }}
                              >
                                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="truncate font-medium">{client.name}</span>
                                {client.phone && (
                                  <span className="text-xs text-muted-foreground ml-auto shrink-0">{client.phone}</span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                        {clientSearch.trim() && filteredClients.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            No se encontraron clientes.{' '}
                            <button
                              type="button"
                              className="text-primary underline"
                              onClick={() => setShowNewClient(true)}
                            >
                              Crear nuevo
                            </button>
                          </p>
                        )}
                        {!clientSearch.trim() && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3 shrink-0" /> Seleccione un cliente para vender a crédito
                          </p>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  /* New client form */
                  <>
                    <div className="space-y-2 rounded-md border p-3 bg-muted/30">
                      <p className="text-xs font-medium text-muted-foreground">Registrar nuevo cliente</p>
                      <div className="space-y-1.5">
                        <Input
                          placeholder="Nombre *"
                          value={newClientName}
                          onChange={(e) => setNewClientName(e.target.value)}
                          className="text-sm"
                          autoFocus
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            placeholder="Teléfono"
                            value={newClientPhone}
                            onChange={(e) => setNewClientPhone(e.target.value)}
                            className="text-sm"
                          />
                          <Input
                            placeholder="Email"
                            value={newClientEmail}
                            onChange={(e) => setNewClientEmail(e.target.value)}
                            className="text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          className="flex-1 bg-primary hover:bg-primary/90 text-white"
                          onClick={handleCreateClient}
                          disabled={creatingClient || !newClientName.trim()}
                        >
                          {creatingClient ? (
                            <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Creando...</>
                          ) : (
                            <><UserPlus className="mr-1 h-3 w-3" /> Crear</>
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowNewClient(false)
                            setNewClientName('')
                            setNewClientPhone('')
                            setNewClientEmail('')
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            <Separator />

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">{amountLabel}</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {multiEnabled && isLocalMethod && (
                <p className="text-xs text-muted-foreground">
                  Equivale a {currencySymbol}{amountInRefCurrency.toFixed(2)} (Tasa: {exchangeRate.toFixed(2)} {baseSym}/{refCode})
                </p>
              )}
              {changeAmount > 0 && (
                <p className="text-sm text-primary font-medium">
                  Cambio: {changeLabel}{changeAmount.toFixed(2)}
                </p>
              )}
            </div>

            {/* Reference */}
            {selectedMethod?.needsReference && (
              <div className="space-y-2">
                <Label htmlFor="reference">Referencia</Label>
                <Input
                  id="reference"
                  placeholder={method === 'pago_movil' ? 'Número de referencia / teléfono' : 'Número de referencia'}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
            )}

            {/* Action */}
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white"
              size="lg"
              onClick={handlePay}
              disabled={loading || !resolvedCurrencyId || (method === 'credito' && !clientId)}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>Confirmar Pago {isLocalMethod ? baseSym : currencySymbol}{parseFloat(amount || '0').toFixed(2)}</>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}