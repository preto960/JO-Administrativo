import { create } from 'zustand'

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
}

export const usePosStore = create<PosState>((set, get) => ({
  items: [],
  clientId: null,
  searchQuery: '',
  categoryFilter: '',

  setSearchQuery: (query) => set({ searchQuery: query }),
  setCategoryFilter: (cat) => set({ categoryFilter: cat }),

  addItem: (item) => {
    const { items } = get()
    const existing = items.find((i) => i.productId === item.productId)
    if (existing) {
      const newQty = existing.quantity + item.quantity
      // Validate stock limit
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
      return // Don't allow exceeding stock
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
}))
