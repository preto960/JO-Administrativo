'use client'

import { useEffect } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/stores/use-app-store'
import { applyBothColors } from '@/components/settings/color-picker'
import { setCustomPermissions, type UserPermissions } from '@/lib/permissions'
import type { AppSettings } from '@/stores/use-app-store'

interface SettingsData {
  primaryColor: string
  secondaryColor: string
  theme: string
  sessionDuration: number
  notificationsEnabled: boolean
  businessName: string
  logoUrl: string
  phone: string
  email: string
  rif: string
  address: string
  baseCurrencyId: string
  referenceCurrency: string
  usdRate: number
  eurRate: number
  customRate: number
  exchangeRate: number
}

/**
 * Loads settings from DB on app startup and applies theme colors to CSS variables.
 * Also auto-fetches BCV exchange rates.
 */
export function SettingsInitializer() {
  const setSettings = useAppStore((s) => s.setSettings)

  useEffect(() => {
    async function loadAndApplySettings() {
      try {
        const s = await api.get<SettingsData>('/api/settings')
        if (s) {
          setSettings(s as AppSettings)

          // Apply both colors at once via <style> injection (reliable method)
          applyBothColors(s.primaryColor || 'blue', s.secondaryColor || 'slate')

          // Apply theme (light/dark) if saved
          if (s.theme === 'dark') {
            document.documentElement.classList.add('dark')
          } else {
            document.documentElement.classList.remove('dark')
          }

          // Update page title
          if (s.businessName) {
            document.title = `${s.businessName} - ERP/POS`
          }
        }

        // Auto-fetch BCV exchange rates in the background (non-blocking)
        api.get<{ rates: Array<{ currency: string; rate: number; source: string }> }>('/api/exchange-rates')
          .then((data) => {
            if (data?.rates && data.rates.length > 0) {
              const currentSettings = useAppStore.getState().settings
              if (!currentSettings) return
              const usdRate = data.rates.find(r => r.currency === 'USD')
              const eurRate = data.rates.find(r => r.currency === 'EUR')
              const updates: Partial<AppSettings> = {}
              if (usdRate) updates.usdRate = usdRate.rate
              if (eurRate) updates.eurRate = eurRate.rate
              // Update effective rate only if no custom rate is set
              if (!currentSettings.customRate) {
                const refCurrency = currentSettings.referenceCurrency || 'USD'
                const refRate = data.rates.find(r => r.currency === refCurrency) || usdRate
                if (refRate) updates.exchangeRate = refRate.rate
              }
              if (Object.keys(updates).length > 0) {
                setSettings({ ...currentSettings, ...updates })
              }
            }
          })
          .catch(() => {
            // Silently fail - rates will be fetched on next load
          })

        // Load custom role permissions from the database
        api.get<{ permissions: Record<string, UserPermissions> }>('/api/role-permissions')
          .then((data) => {
            if (data?.permissions && Object.keys(data.permissions).length > 0) {
              setCustomPermissions(data.permissions)
            }
          })
          .catch(() => {
            // Silently fail - use default permissions
          })
      } catch {
        // Silently fail — use defaults from globals.css
      }
    }

    loadAndApplySettings()

    // Re-apply colors when theme changes (dark ↔ light)
    const observer = new MutationObserver(() => {
      const settings = useAppStore.getState().settings
      if (settings) {
        applyBothColors(settings.primaryColor || 'blue', settings.secondaryColor || 'slate')
      }
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => observer.disconnect()
  }, [setSettings])

  return null
}
