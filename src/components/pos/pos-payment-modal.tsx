'use client'

import { useState, useEffect } from 'react'
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
import { Banknote, CreditCard, ArrowLeftRight, Clock, Smartphone, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface PosPaymentModalProps {
  onClose: () => void
}

interface PaymentMethod {
  value: string
  label: string
  icon: React.ElementType
  needsReference?: boolean
}

const paymentMethods: PaymentMethod[] = [
  { value: 'divisas', label: 'Divisas', icon: Banknote },
  { value: 'efectivo', label: 'Efectivo', icon: Banknote },
  { value: 'pago_movil', label: 'Pago Móvil', icon: Smartphone, needsReference: true },
  { value: 'tarjeta', label: 'Tarjeta', icon: CreditCard, needsReference: true },
  { value: 'transferencia', label: 'Transferencia', icon: ArrowLeftRight, needsReference: true },
  { value: 'credito', label: 'Crédito', icon: Clock },
]

export function PosPaymentModal({ onClose }: PosPaymentModalProps) {
  const { items, getTotal, clearCart, clientId } = usePosStore()
  const { user } = useAuth()
  const exchangeRate = useSetting('exchangeRate')
  const referenceCurrency = useSetting('referenceCurrency')
  const [method, setMethod] = useState('divisas')
  const [amount, setAmount] = useState(getTotal().toFixed(2))
  const [reference, setReference] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [currencies, setCurrencies] = useState<{ id: string; code: string; symbol: string; isBase: boolean }[]>([])
  const [baseCurrencyId, setBaseCurrencyId] = useState('')
  const [openCashRegId, setOpenCashRegId] = useState<string | null>(null)

  const total = getTotal()
  const totalBs = total * exchangeRate
  const currencySymbol = referenceCurrency === 'EUR' ? '€' : '$'
  const selectedMethod = paymentMethods.find(pm => pm.value === method)

  // Load currencies and open cash register on mount
  useEffect(() => {
    Promise.all([
      api.get<{ id: string; code: string; symbol: string; isBase: boolean }[]>('/api/currencies'),
      api.get<{ baseCurrencyId: string }>('/api/settings'),
      api.get<Array<{ id: string; status: string }>>('/api/cash-register'),
    ]).then(([currencies, settings, registers]) => {
      setCurrencies(currencies)
      const base = currencies.find(c => c.isBase)
      setBaseCurrencyId(settings?.baseCurrencyId || base?.id || currencies[0]?.id || '')
      const openReg = registers?.find(r => r.status === 'abierta')
      if (openReg) setOpenCashRegId(openReg.id)
    }).catch(() => {})
  }, [])

  const handlePay = async () => {
    if (parseFloat(amount) <= 0) {
      toast.error('El monto debe ser mayor a cero')
      return
    }
    if (parseFloat(amount) > total && method !== 'efectivo' && method !== 'divisas') {
      toast.error('El monto excede el total')
      return
    }
    if (!baseCurrencyId) {
      toast.error('No se pudo determinar la moneda base. Verifica la configuración.')
      return
    }

    setLoading(true)
    try {
      await api.post('/api/sales', {
        clientId: clientId || null,
        cashRegId: openCashRegId,
        userId: user?.id || '',
        lines: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unitCost: item.unitCost,
        })),
        payments: [
          {
            method,
            amount: Math.min(parseFloat(amount), total),
            currencyId: baseCurrencyId,
            reference: reference || undefined,
          },
        ],
      })
      setSuccess(true)
      setTimeout(() => {
        clearCart()
        onClose()
      }, 2000)
    } catch {
      toast.error('Error al procesar la venta')
    } finally {
      setLoading(false)
    }
  }

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

            <Separator />

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Monto</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {(method === 'efectivo' || method === 'divisas') && parseFloat(amount) > total && (
                <p className="text-sm text-primary font-medium">
                  Cambio: {currencySymbol}{(parseFloat(amount) - total).toFixed(2)}
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
              disabled={loading || !baseCurrencyId}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                `Confirmar Pago ${currencySymbol}${Math.min(parseFloat(amount), total).toFixed(2)}`
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
