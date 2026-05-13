import { create } from 'zustand'

export interface CartItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  unitCost: number
  currencySymbol: string
  lineTotal: number
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
      set({
        items: items.map((i) =>
          i.productId === item.productId
            ? { ...i, quantity: i.quantity + item.quantity, lineTotal: (i.quantity + item.quantity) * i.unitPrice }
            : i
        ),
      })
    } else {
      set({ items: [...items, { ...item, lineTotal: item.quantity * item.unitPrice }] })
    }
  },

  removeItem: (productId) => {
    set({ items: get().items.filter((i) => i.productId !== productId) })
  },

  updateQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(productId)
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
}))
