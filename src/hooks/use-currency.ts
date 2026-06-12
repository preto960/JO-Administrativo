'use client'

import { useAppStore, useSetting, defaultSettings } from '@/stores/use-app-store'
import { getCurrencySymbol, formatAmount } from '@/lib/currency'

/**
 * Centralized hook for currency operations in client components.
 * Replaces all inline `referenceCurrency === 'EUR' ? '\u20AC' : '$'` logic.
 *
 * Usage:
 *   const { sym, refCode, baseCode, rate, fmt, fmtBase, toBase, fromBase } = useCurrency()
 *   <span>{fmt(150.50)}</span>           // "$150.50" or "\u20AC150.50"
 *   <span>{fmtBase(5432)}</span>         // "Bs.5,432.00"
 */
export function useCurrency() {
  const settings = useAppStore((s) => s.settings)
  const refCode = useSetting('referenceCurrency')
  const baseId = useSetting('baseCurrencyId')
  const rate = useSetting('exchangeRate')

  // Try to resolve base currency code from store or settings
  // The base currency code isn't stored directly, but we can derive it
  // from the branches or default to 'VES' for Venezuela
  const baseCode = 'VES' // Base currency is always local (Bs.)

  const sym = getCurrencySymbol(refCode)
  const baseSym = getCurrencySymbol(baseCode)

  /** Format amount in reference currency (USD, EUR, etc.) */
  const fmt = (amount: number, decimals = 2): string => {
    return `${sym}${formatAmount(amount, decimals)}`
  }

  /** Format amount in base/local currency (Bs.) */
  const fmtBase = (amount: number, decimals = 2): string => {
    return `${baseSym}${formatAmount(amount, decimals)}`
  }

  /** Format amount in a specific currency code */
  const fmtWith = (amount: number, code?: string | null, decimals = 2): string => {
    const s = getCurrencySymbol(code)
    return `${s}${formatAmount(amount, decimals)}`
  }

  /** Convert reference → base currency */
  const toBase = (amount: number): number => {
    if (!rate || rate <= 0) return amount
    return Math.round(amount * rate * 100) / 100
  }

  /** Convert base → reference currency */
  const fromBase = (amount: number): number => {
    if (!rate || rate <= 0) return amount
    return Math.round((amount / rate) * 100) / 100
  }

  return {
    sym,          // Reference currency symbol: "$" or "\u20AC"
    refCode,      // Reference currency code: "USD" or "EUR"
    baseCode,     // Base currency code: "VES"
    baseSym,      // Base currency symbol: "Bs."
    rate,         // Exchange rate (ref → base)
    fmt,          // format(amount) → "$150.50"
    fmtBase,      // format in base → "Bs.5,432.00"
    fmtWith,      // format with specific code → fmtWith(100, 'EUR') → "\u20AC100.00"
    toBase,       // convert ref → base
    fromBase,     // convert base → ref
  }
}
