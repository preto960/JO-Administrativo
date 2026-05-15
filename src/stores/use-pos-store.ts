import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  unitCost: number
  currencySymbol: string
  lineTotal: number
  maxStock: number
}

interface PosState {
  items: CartItem[]
  clientId: string | null
  branchId: string | null
  searchQuery: string
  categoryFilter: string
  setSearchQuery: (query: string) => void
  setCategoryFilter: (cat: string) => void
  addItem: (item: Omit<CartItem, 'lineTotal'>) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  setClientId: (id: string | null) => void
  getTotal: () => number
  getItemCount: () => number
  getCurrentQty: (productId: string) => number
  validateBranch: (currentBranchId: string | null) => void
}

export const usePosStore = create<PosState>()(
  persist(
    (set, get) => ({
      items: [],
      clientId: null,
      branchId: null,
      searchQuery: '',
      categoryFilter: '',

      setSearchQuery: (query) => set({ searchQuery: query }),
      setCategoryFilter: (cat) => set({ categoryFilter: cat }),

      addItem: (item) => {
        const { items, branchId } = get()
        const existing = items.find((i) => i.productId === item.productId)
        if (existing) {
          const newQty = existing.quantity + item.quantity
          if (newQty > item.maxStock) {
            return false
          }
          set({
            items: items.map((i) =>
              i.productId === item.productId
                ? { ...i, quantity: newQty, lineTotal: newQty * i.unitPrice }
                : i
            ),
          })
        } else {
          if (item.quantity > item.maxStock) {
            return false
          }
          set({ items: [...items, { ...item, lineTotal: item.quantity * item.unitPrice }] })
        }
        return true
      },

      removeItem: (productId) => {
        set({ items: get().items.filter((i) => i.productId !== productId) })
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId)
          return
        }
        const item = get().items.find((i) => i.productId === productId)
        if (item && quantity > item.maxStock) {
          return
        }
        set({
          items: get().items.map((i) =>
            i.productId === productId
              ? { ...i, quantity, lineTotal: quantity * i.unitPrice }
              : i
          ),
        })
      },

      clearCart: () => set({ items: [], clientId: null }),
      setClientId: (id) => set({ clientId: id }),

      getTotal: () => get().items.reduce((s, i) => s + i.lineTotal, 0),
      getItemCount: () => get().items.reduce((s, i) => s + i.quantity, 0),
      getCurrentQty: (productId) => {
        const item = get().items.find((i) => i.productId === productId)
        return item?.quantity || 0
      },

      // Clear cart if saved branchId doesn't match current branch
      validateBranch: (currentBranchId) => {
        const { branchId, items } = get()
        if (items.length > 0 && branchId && currentBranchId && branchId !== currentBranchId) {
          set({ items: [], clientId: null, branchId: currentBranchId })
        } else if (currentBranchId) {
          set({ branchId: currentBranchId })
        }
      },
    }),
    {
      name: 'jo-admin-cart',
      partialize: (state) => ({
        items: state.items,
        clientId: state.clientId,
        branchId: state.branchId,
      }),
    }
  )
)
