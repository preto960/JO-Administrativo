'use client'

import { useEffect } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/stores/use-app-store'
import { applyPrimaryColor, applySecondaryColor } from '@/components/settings/color-picker'
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
}

/**
 * Loads settings from DB on app startup and applies theme colors to CSS variables.
 * Also stores settings in Zustand so components can access them reactively.
 */
export function SettingsInitializer() {
  const setSettings = useAppStore((s) => s.setSettings)

  useEffect(() => {
    async function loadAndApplySettings() {
      try {
        const s = await api.get<SettingsData>('/api/settings')
        if (s) {
          // Store in Zustand for reactive access across the app
          setSettings(s as AppSettings)

          // Apply colors to CSS variables
          applyPrimaryColor(s.primaryColor || 'emerald')
          applySecondaryColor(s.secondaryColor || 'slate')

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
      } catch {
        // Silently fail — use defaults
      }
    }

    loadAndApplySettings()

    // Re-apply colors when theme changes (dark ↔ light) because oklch values differ
    const observer = new MutationObserver(() => {
      const settings = useAppStore.getState().settings
      if (settings) {
        applyPrimaryColor(settings.primaryColor || 'emerald')
        applySecondaryColor(settings.secondaryColor || 'slate')
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
