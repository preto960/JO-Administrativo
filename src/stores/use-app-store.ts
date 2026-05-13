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

interface AppState {
  activeView: AppView
  setActiveView: (view: AppView) => void
}

export const useAppStore = create<AppState>((set) => ({
  activeView: 'pos',
  setActiveView: (view) => set({ activeView: view }),
}))
