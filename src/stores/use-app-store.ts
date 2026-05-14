import { create } from 'zustand'

export type AppView =
  | 'pos'
  | 'dashboard'
  | 'products'
  | 'purchases'
  | 'clients'
  | 'suppliers'
  | 'cash'
  | 'expenses'
  | 'settings'

export interface AppSettings {
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
  sessionDuration: number
  notificationsEnabled: boolean
  primaryColor: string
  secondaryColor: string
  theme: string
}

export interface BranchItem {
  id: string
  name: string
  code: string
  address: string | null
  phone: string | null
  active: boolean
  isMain: boolean
}

function getStoredView(): AppView {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('activeView')
    if (stored && ['pos', 'dashboard', 'products', 'purchases', 'clients', 'suppliers', 'cash', 'expenses', 'settings'].includes(stored)) {
      return stored as AppView
    }
  }
  return 'pos'
}

interface AppState {
  activeView: AppView
  settings: AppSettings | null
  selectedBranchId: string | null
  branches: BranchItem[]
  setActiveView: (view: AppView) => void
  setSettings: (settings: AppSettings) => void
  setSelectedBranchId: (id: string | null) => void
  setBranches: (branches: BranchItem[]) => void
}

const defaultSettings: AppSettings = {
  businessName: 'JO-Administrativo',
  logoUrl: '',
  phone: '',
  email: '',
  rif: '',
  address: '',
  baseCurrencyId: '',
  referenceCurrency: 'USD',
  usdRate: 0,
  eurRate: 0,
  customRate: 0,
  exchangeRate: 36.50,
  sessionDuration: 28800,
  notificationsEnabled: true,
  primaryColor: 'blue',
  secondaryColor: 'slate',
  theme: 'light',
}

export const useAppStore = create<AppState>((set) => ({
  activeView: getStoredView(),
  settings: null,
  selectedBranchId: null,
  branches: [],
  setActiveView: (view) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('activeView', view)
    }
    set({ activeView: view })
  },
  setSettings: (settings) => set({ settings }),
  setSelectedBranchId: (id) => set({ selectedBranchId: id }),
  setBranches: (branches) => set({ branches }),
}))

// Helper to get a setting with fallback
export function useSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  const settings = useAppStore((s) => s.settings)
  return settings?.[key] ?? defaultSettings[key]
}
