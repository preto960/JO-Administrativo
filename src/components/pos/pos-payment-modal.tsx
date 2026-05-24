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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Banknote, CreditCard, ArrowLeftRight, Clock, Smartphone, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

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

const paymentMethods: PaymentMethod[] = [
  { value: 'divisas', label: 'Divisas', icon: Banknote, isLocalCurrency: false },
  { value: 'efectivo', label: 'Efectivo', icon: Banknote, isLocalCurrency: true },
  { value: 'pago_movil', label: 'Pago Móvil', icon: Smartphone, needsReference: true, isLocalCurrency: true },
  { value: 'tarjeta', label: 'Tarjeta', icon: CreditCard, needsReference: true, isLocalCurrency: true },
  { value: 'transferencia', label: 'Transferencia', icon: ArrowLeftRight, needsReference: true, isLocalCurrency: true },
  { value: 'credito', label: 'Crédito', icon: Clock, isLocalCurrency: false },
]

export function PosPaymentModal({ onClose }: PosPaymentModalProps) {
  const { items, getTotal, clearCart, clientId } = usePosStore()
  const { user } = useAuth()
  const exchangeRate = useSetting('exchangeRate')
  const referenceCurrency = useSetting('referenceCurrency')
  const baseCurrencyId = useSetting('baseCurrencyId')
  const [method, setMethod] = useState('divisas')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [currencies, setCurrencies] = useState<{ id: string; code: string; symbol: string; isBase: boolean }[]>([])
  const [openCashRegId, setOpenCashRegId] = useState<string | null>(null)

  const subtotal = getTotal()
  const ivaEnabled = useSetting('ivaEnabled')
  const ivaRate = Number(useSetting('ivaRate')) || 0
  const ivaAmount = ivaEnabled ? Math.round(subtotal * (ivaRate / 100) * 100) / 100 : 0
  const total = Math.round((subtotal + ivaAmount) * 100) / 100
  const totalBs = total * exchangeRate
  const currencySymbol = referenceCurrency === 'EUR' ? '€' : '$'
  const selectedMethod = paymentMethods.find(pm => pm.value === method)

  // Resolve currencyId: prefer baseCurrencyId from settings, fallback to isBase currency or first available
  const resolvedCurrencyId = baseCurrencyId
    || currencies.find(c => c.isBase)?.id
    || currencies[0]?.id
    || ''
  const hasNoCurrency = !resolvedCurrencyId && currencies.length > 0

  // Determine if current method uses local currency (Bs.)
  const isLocalMethod = selectedMethod?.isLocalCurrency ?? false

  // When method changes, set default amount in the correct currency
  useEffect(() => {
    if (isLocalMethod) {
      // Show total in Bs.
      setAmount(totalBs.toFixed(2))
    } else {
      // Show total in reference currency
      setAmount(total.toFixed(2))
    }
  }, [method, isLocalMethod, totalBs, total])

  // Load currencies and open cash register on mount
  useEffect(() => {
    Promise.all([
      api.get<{ id: string; code: string; symbol: string; isBase: boolean }[]>('/api/currencies'),
      api.get<Array<{ id: string; status: string }>>('/api/cash-register'),
    ]).then(([currencies, registers]) => {
      setCurrencies(currencies)
      const openReg = registers?.find(r => r.status === 'abierta')
      if (openReg) setOpenCashRegId(openReg.id)
    }).catch(() => {})
  }, [])

  // Convert displayed amount to reference currency for submission
  const amountInRefCurrency = useMemo(() => {
    const parsed = parseFloat(amount) || 0
    if (isLocalMethod) {
      // Convert Bs. to reference currency
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
    // Validate reference for pago_movil, tarjeta, transferencia
    if (selectedMethod?.needsReference && !reference.trim()) {
      toast.error(`La referencia es obligatoria para ${selectedMethod.label}`)
      return
    }
    // Validate client for credit sales
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

  const amountLabel = isLocalMethod ? 'Monto (Bs.)' : 'Monto'
  const changeLabel = isLocalMethod ? 'Bs.' : currencySymbol

  return (
    <Dialog open onOpenChange={() => !success && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cobrar</DialogTitle>
          <DialogDescription>
            Total: {currencySymbol}{total.toFixed(2)}
            {exchangeRate > 0 && <span className="ml-2">· Bs. {totalBs.toFixed(2)}</span>}
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

            {method === 'credito' && !clientId && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" /> Seleccione un cliente para vender a credito
              </p>
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
              {isLocalMethod && exchangeRate > 0 && (
                <p className="text-xs text-muted-foreground">
                  Equivale a {currencySymbol}{amountInRefCurrency.toFixed(2)} (Tasa: {exchangeRate.toFixed(2)} Bs./{referenceCurrency})
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
              disabled={loading || !resolvedCurrencyId}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                `Confirmar Pago ${isLocalMethod ? 'Bs.' : currencySymbol}${parseFloat(amount || '0').toFixed(2)}`
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
