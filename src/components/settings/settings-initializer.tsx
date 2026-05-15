'use client'

import { useEffect } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/stores/use-app-store'
import { applyBothColors } from '@/components/settings/color-picker'
import { setCustomPermissions, type UserPermissions } from '@/lib/permissions'
import { useTheme } from 'next-themes'
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
  const { setTheme } = useTheme()

  useEffect(() => {
    async function loadAndApplySettings() {
      try {
        const s = await api.get<SettingsData>('/api/settings')
        if (s) {
          setSettings(s as AppSettings)

          // Apply both colors at once via <style> injection (reliable method)
          applyBothColors(s.primaryColor || 'blue', s.secondaryColor || 'slate')

          // Apply theme from DB only if next-themes hasn't already set one
          // next-themes reads from localStorage key "theme" on its own
          const nextThemesValue = localStorage.getItem('theme')
          if (nextThemesValue) {
            // User has a theme preference saved — let next-themes handle it
            setTheme(nextThemesValue)
          } else if (s.theme) {
            // No localStorage yet (first visit) — use DB value
            setTheme(s.theme)
          }

          // Update page title
          if (s.businessName) {
            document.title = `${s.businessName} - ERP/POS`
          }
        }

        // NOTE: We do NOT auto-fetch BCV exchange rates on page load anymore.
        // The GET /api/exchange-rates endpoint is now read-only and does NOT
        // write to the Settings table. Rates are only updated when the user
        // explicitly clicks "Actualizar" in Configuración > Moneda.

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
