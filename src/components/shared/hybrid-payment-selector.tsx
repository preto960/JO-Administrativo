'use client'

import { useState, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Banknote,
  CreditCard,
  ArrowLeftRight,
  Clock,
  Smartphone,
  CircleDollarSign,
  Plus,
  Trash2,
  Layers,
  type LucideIcon,
} from 'lucide-react'

export interface PaymentMethodItem {
  code: string
  name: string
  icon: string
  enabled: boolean
  needsReference: boolean
  isLocalCurrency: boolean
  isCash: boolean
  isCredit: boolean
}

export interface HybridPaymentEntry {
  method: string
  amount: number
  reference: string
}

interface HybridPaymentSelectorProps {
  methods: PaymentMethodItem[]
  total: number
  currencySymbol: string
  multiEnabled?: boolean
  exchangeRate?: number
  localCurrencySymbol?: string
  onChange: (payments: HybridPaymentEntry[]) => void
  onModeChange?: (isHybrid: boolean) => void
}

const ICON_MAP: Record<string, LucideIcon> = {
  Banknote, CreditCard, ArrowLeftRight, Clock, Smartphone, CircleDollarSign,
}

function getIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] || CircleDollarSign
}

export function HybridPaymentSelector({
  methods, total, currencySymbol,
  multiEnabled = false, exchangeRate = 1, localCurrencySymbol = '',
  onChange, onModeChange,
}: HybridPaymentSelectorProps) {
  const [isHybrid, setIsHybrid] = useState(false)
  const [singleMethod, setSingleMethod] = useState('')
  const [singleAmount, setSingleAmount] = useState(total.toFixed(2))
  const [singleReference, setSingleReference] = useState('')
  const [entries, setEntries] = useState<HybridPaymentEntry[]>([])

  // Set default single method on mount
  useEffect(() => {
    const first = methods[0]?.code || ''
    setSingleMethod(first)
    onChange([{ method: first, amount: total, reference: '' }])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedSingle = methods.find(m => m.code === singleMethod)
  const isLocalSingle = multiEnabled ? (selectedSingle?.isLocalCurrency ?? false) : false
  const nonCreditMethods = useMemo(() => methods.filter(m => !m.isCredit), [methods])

  const handleSingleMethodChange = (code: string) => {
    setSingleMethod(code)
    setSingleReference('')
    const m = methods.find(pm => pm.code === code)
    if (m?.isLocalCurrency && multiEnabled) {
      setSingleAmount((total * exchangeRate).toFixed(2))
    } else {
      setSingleAmount(total.toFixed(2))
    }
    onModeChange?.(false)
    onChange([{ method: code, amount: total, reference: '' }])
  }

  const handleSingleAmountChange = (val: string) => {
    setSingleAmount(val)
    const parsed = parseFloat(val) || 0
    const amount = isLocalSingle && exchangeRate > 0
      ? Math.round((parsed / exchangeRate) * 100) / 100
      : parsed
    onChange([{ method: singleMethod, amount, reference: singleReference.trim() }])
  }

  const handleSingleRefChange = (val: string) => {
    setSingleReference(val)
    const parsed = parseFloat(singleAmount) || 0
    const amount = isLocalSingle && exchangeRate > 0
      ? Math.round((parsed / exchangeRate) * 100) / 100
      : parsed
    onChange([{ method: singleMethod, amount, reference: val.trim() }])
  }

  // ── Hybrid helpers ──
  const hybridRemaining = useMemo(() => {
    const sum = entries.reduce((s, e) => s + e.amount, 0)
    return Math.round((total - sum) * 100) / 100
  }, [entries, total])

  const hybridComplete = Math.abs(hybridRemaining) < 0.01

  const emitHybrid = (newEntries: HybridPaymentEntry[]) => {
    onChange(newEntries.filter(e => e.method && e.amount > 0))
  }

  const handleHybridMethod = (idx: number, code: string) => {
    const next = [...entries]
    next[idx] = { ...next[idx], method: code, reference: '' }
    setEntries(next)
    emitHybrid(next)
  }

  const handleHybridAmount = (idx: number, val: string) => {
    const parsed = parseFloat(val) || 0
    const m = methods.find(pm => pm.code === entries[idx].method)
    const amount = m?.isLocalCurrency && multiEnabled && exchangeRate > 0
      ? Math.round((parsed / exchangeRate) * 100) / 100
      : parsed
    const next = [...entries]
    next[idx] = { ...next[idx], amount }
    setEntries(next)
    emitHybrid(next)
  }

  const handleHybridRef = (idx: number, val: string) => {
    const next = [...entries]
    next[idx] = { ...next[idx], reference: val.trim() }
    setEntries(next)
    emitHybrid(next)
  }

  const addEntry = () => setEntries(prev => [...prev, { method: '', amount: 0, reference: '' }])
  const removeEntry = (idx: number) => setEntries(prev => prev.filter((_, i) => i !== idx))

  const toggleHybrid = () => {
    const next = !isHybrid
    setIsHybrid(next)
    onModeChange?.(next)
    if (next) {
      setEntries([{ method: nonCreditMethods[0]?.code || '', amount: 0, reference: '' }])
      emitHybrid([{ method: nonCreditMethods[0]?.code || '', amount: 0, reference: '' }])
    } else {
      setSingleMethod(methods[0]?.code || '')
      setSingleAmount(total.toFixed(2))
      setSingleReference('')
      onChange([{ method: methods[0]?.code || '', amount: total, reference: '' }])
    }
  }

  return (
    <div className="space-y-3">
      {/* Toggle */}
      <button
        type="button"
        onClick={toggleHybrid}
        className={`w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-2.5 text-xs font-medium transition-colors ${
          isHybrid
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary'
        }`}
      >
        <Layers className="h-4 w-4" />
        {isHybrid ? 'Pagando con múltiples métodos (Híbrido)' : 'Pagar con múltiples métodos (Híbrido)'}
      </button>

      {!isHybrid ? (
        <>
          <RadioGroup value={singleMethod} onValueChange={handleSingleMethodChange} className="grid grid-cols-2 gap-3">
            {methods.map((pm) => {
              const Icon = getIcon(pm.icon)
              return (
                <label key={pm.code} className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 p-3 transition-colors ${singleMethod === pm.code ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-muted hover:border-muted-foreground/30'}`}>
                  <RadioGroupItem value={pm.code} className="sr-only" />
                  <Icon className={`h-5 w-5 ${singleMethod === pm.code ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className={`text-xs font-medium ${singleMethod === pm.code ? 'text-primary dark:text-primary' : ''}`}>{pm.name}</span>
                </label>
              )
            })}
          </RadioGroup>
          <div className="space-y-2">
            <Label htmlFor="hps-single-amt">Monto {isLocalSingle ? `(${localCurrencySymbol})` : `(${currencySymbol})`}</Label>
            <Input id="hps-single-amt" type="text" inputMode="decimal" value={singleAmount} onChange={e => handleSingleAmountChange(e.target.value)} onWheel={e => e.currentTarget.blur()} />
            {multiEnabled && isLocalSingle && (
              <p className="text-xs text-muted-foreground">
                Equivale a {currencySymbol}{(parseFloat(singleAmount) || 0 / exchangeRate).toFixed(2)} (Tasa: {exchangeRate.toFixed(2)} {localCurrencySymbol}/{currencySymbol})
              </p>
            )}
          </div>
          {selectedSingle?.needsReference && (
            <div className="space-y-2">
              <Label htmlFor="hps-single-ref">Referencia</Label>
              <Input id="hps-single-ref" placeholder="Número de referencia" value={singleReference} onChange={e => handleSingleRefChange(e.target.value)} />
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total: <span className="font-semibold text-foreground">{currencySymbol}{total.toFixed(2)}</span></span>
            <span className={`font-semibold ${hybridComplete ? 'text-emerald-600' : 'text-amber-600'}`}>
              {hybridComplete ? 'Completo' : `Falta: ${currencySymbol}${Math.max(0, hybridRemaining).toFixed(2)}`}
            </span>
          </div>
          <Separator />
          {entries.map((entry, idx) => {
            const m = methods.find(pm => pm.code === entry.method)
            const isLocal = multiEnabled ? (m?.isLocalCurrency ?? false) : false
            return (
              <div key={idx} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">Pago #{idx + 1}</span>
                  {entries.length > 1 && (
                    <button type="button" onClick={() => removeEntry(idx)} className="text-red-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  )}
                </div>
                <RadioGroup value={entry.method} onValueChange={v => handleHybridMethod(idx, v)} className="grid grid-cols-3 gap-2">
                  {nonCreditMethods.map((pm) => {
                    const Icon = getIcon(pm.icon)
                    return (
                      <label key={pm.code} className={`flex cursor-pointer flex-col items-center gap-1 rounded-md border-2 p-2 transition-colors ${entry.method === pm.code ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-muted hover:border-muted-foreground/30'}`}>
                        <RadioGroupItem value={pm.code} className="sr-only" />
                        <Icon className={`h-4 w-4 ${entry.method === pm.code ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className={`text-[10px] font-medium leading-tight text-center ${entry.method === pm.code ? 'text-primary dark:text-primary' : ''}`}>{pm.name}</span>
                      </label>
                    )
                  })}
                </RadioGroup>
                <div className="space-y-1">
                  <Label className="text-[10px]">Monto {isLocal ? `(${localCurrencySymbol})` : `(${currencySymbol})`}</Label>
                  <Input type="text" inputMode="decimal" placeholder="0.00"
                    value={isLocal ? (entry.amount * exchangeRate).toFixed(2) : entry.amount.toFixed(2)}
                    onChange={e => handleHybridAmount(idx, e.target.value)} className="text-sm" onWheel={e => e.currentTarget.blur()} />
                  {multiEnabled && isLocal && (
                    <p className="text-[10px] text-muted-foreground">Equivale a {currencySymbol}{entry.amount.toFixed(2)}</p>
                  )}
                </div>
                {m?.needsReference && (
                  <div className="space-y-1">
                    <Label className="text-[10px]">Referencia</Label>
                    <Input placeholder="Número de referencia" value={entry.reference} onChange={e => handleHybridRef(idx, e.target.value)} className="text-sm" />
                  </div>
                )}
              </div>
            )
          })}
          {!hybridComplete && (
            <Button type="button" variant="outline" size="sm" className="w-full border-dashed" onClick={addEntry} disabled={entries.length >= 5}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Agregar otro método
            </Button>
          )}
          {hybridRemaining < -0.01 && (
            <p className="text-xs text-red-500 font-medium">Los pagos exceden el total en {currencySymbol}{Math.abs(hybridRemaining).toFixed(2)}</p>
          )}
        </div>
      )}
    </div>
  )
}

/** Build "Híbrido (efectivo, transferencia)" label for display */
export function buildHybridLabel(payments: HybridPaymentEntry[], methodNames: Record<string, string>): string {
  if (payments.length <= 1) return methodNames[payments[0]?.method] || payments[0]?.method || ''
  const parts = payments.map(p => methodNames[p.method] || p.method)
  return `Híbrido (${parts.join(', ')})`
}