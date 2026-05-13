'use client'

import { useState } from 'react'
import { usePosStore } from '@/stores/use-pos-store'
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
import { CreditCard, Banknote, ArrowLeftRight, Clock, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface PosPaymentModalProps {
  onClose: () => void
}

interface PaymentMethod {
  value: string
  label: string
  icon: React.ElementType
}

const paymentMethods: PaymentMethod[] = [
  { value: 'efectivo', label: 'Efectivo', icon: Banknote },
  { value: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
  { value: 'transferencia', label: 'Transferencia', icon: ArrowLeftRight },
  { value: 'credito', label: 'Crédito', icon: Clock },
]

export function PosPaymentModal({ onClose }: PosPaymentModalProps) {
  const { items, getTotal, clearCart } = usePosStore()
  const [method, setMethod] = useState('efectivo')
  const [amount, setAmount] = useState(getTotal().toFixed(2))
  const [reference, setReference] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const total = getTotal()

  const handlePay = async () => {
    if (parseFloat(amount) <= 0) {
      toast.error('El monto debe ser mayor a cero')
      return
    }
    if (parseFloat(amount) > total && method !== 'efectivo') {
      toast.error('El monto excede el total')
      return
    }

    setLoading(true)
    try {
      await api.post('/api/sales', {
        clientId: null,
        cashRegId: null,
        userId: 'current-user',
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
            currencyId: 'current-currency',
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
          <DialogDescription>Total a pagar: ${total.toFixed(2)}</DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <div className="rounded-full bg-emerald-100 p-4 dark:bg-emerald-900/30">
              <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold text-emerald-700 dark:text-emerald-400">¡Venta Exitosa!</h3>
            <p className="text-sm text-muted-foreground">Cerrando automáticamente...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Method Selection */}
            <RadioGroup value={method} onValueChange={setMethod} className="grid grid-cols-2 gap-3">
              {paymentMethods.map((pm) => (
                <label
                  key={pm.value}
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 p-3 transition-colors ${
                    method === pm.value
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                      : 'border-muted hover:border-muted-foreground/30'
                  }`}
                >
                  <RadioGroupItem value={pm.value} className="sr-only" />
                  <pm.icon className={`h-5 w-5 ${method === pm.value ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                  <span className={`text-xs font-medium ${method === pm.value ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>
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
              {method === 'efectivo' && parseFloat(amount) > total && (
                <p className="text-sm text-emerald-600 font-medium">
                  Cambio: ${(parseFloat(amount) - total).toFixed(2)}
                </p>
              )}
            </div>

            {/* Reference */}
            {(method === 'tarjeta' || method === 'transferencia') && (
              <div className="space-y-2">
                <Label htmlFor="reference">Referencia</Label>
                <Input
                  id="reference"
                  placeholder="Número de referencia"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
            )}

            {/* Action */}
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              size="lg"
              onClick={handlePay}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                `Confirmar Pago $${Math.min(parseFloat(amount), total).toFixed(2)}`
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
