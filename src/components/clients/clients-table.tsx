'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { useAppStore } from '@/stores/use-app-store'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Search, Users, DollarSign, Loader2, Receipt, Truck, X, Trash2, Printer, FileText, Mail, Pencil, Phone, MapPin, ShoppingCart, Eye, EyeOff, AlertTriangle, Upload, ChevronLeft, ChevronRight, Filter, UserCheck, UserX, UsersRound, RefreshCw, CalendarCheck, CalendarDays, CheckCircle2, CreditCard, Banknote, ArrowLeftRight, Clock, Smartphone, CircleDollarSign, type LucideIcon } from 'lucide-react'
import { ClientBulkImport } from './client-bulk-import'
import { FALLBACK_METHODS } from '@/lib/payment-methods'
import { toast } from 'sonner'
import { useSetting } from '@/stores/use-app-store'
import { useCurrency } from '@/hooks/use-currency'

interface PaymentMethodOption {
  code: string
  name: string
  icon: string
  enabled: boolean
  needsReference: boolean
  isLocalCurrency: boolean
  isCash: boolean
  isCredit: boolean
}

const RENEW_ICON_MAP: Record<string, LucideIcon> = {
  Banknote,
  CreditCard,
  ArrowLeftRight,
  Clock,
  Smartphone,
  CircleDollarSign,
}

function getRenewIcon(iconName: string): LucideIcon {
  return RENEW_ICON_MAP[iconName] || CircleDollarSign
}

interface Client {
  id: string
  name: string
  cedula: string | null
  lastName: string | null
  gender: string | null
  phone: string | null
  email: string | null
  address: string | null
  note: string | null
  deletedAt: string | null
  pendingBalance: number
  membership: {
    id: string
    status: string | null
    tarifa: string | null
    endDate: string | null
    daysRemaining: number
    ticketsRemaining: number
  } | null
  _count: { sales: number }
}

interface PlanOption {
  id: string
  name: string
  durationType: string
  durationDays: number | null
  cost: number
  active: boolean
}

interface SaleRecord {
  id: string
  date: string
  total: number
  status: string
  user: { name: string }
  branch: { name: string }
  payments: Array<{ method: string; amount: number; currency: { symbol: string } }>
  lines: Array<{ product: { name: string }; quantity: number; unitPrice: number; lineTotal: number }>
  receivables: Array<{ pendingBalance: number; status: string; dueDate: string | null }>
}

interface ProductOption {
  id: string
  name: string
  price: number
  currency: { symbol: string }
  inventories: Array<{ stock: number; branchId: string }>
}

interface DispatchLine {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  stock: number
}

export function ClientsTable() {
  const { user, permissions } = useAuth()
  const canManage = permissions.canManageClients
  const selectedBranchId = useAppStore((s) => s.selectedBranchId)
  const isGym = useSetting('businessType') === 'gym'
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [bulkImportOpen, setBulkImportOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [formName, setFormName] = useState('')
  const [formLastName, setFormLastName] = useState('')
  const [formCedula, setFormCedula] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [formNote, setFormNote] = useState('')

  // Sales/dispatch history dialog
  const [historyClient, setHistoryClient] = useState<Client | null>(null)
  const [sales, setSales] = useState<SaleRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showHistoryDialog, setShowHistoryDialog] = useState(false)

  // Sale lines detail modal
  const [detailSale, setDetailSale] = useState<SaleRecord | null>(null)

  // Statement email
  const [sendingStatement, setSendingStatement] = useState<string | null>(null)

  // Payment dialog
  const [paymentClient, setPaymentClient] = useState<Client | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [paying, setPaying] = useState(false)
  const [openCashRegId, setOpenCashRegId] = useState<string | null>(null)
  const baseCurrencyId = useAppStore((s) => s.baseCurrencyId || '')
  const country = useSetting('country') || 'VE'
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([])

  const referenceCurrency = useSetting('referenceCurrency')
  const { sym: currencySymbol, baseSym, rate: exchangeRate, fmt } = useCurrency()
  const selectedPm = paymentMethods.find(m => m.code === paymentMethod)
  const isLocalMethod = selectedPm?.isLocalCurrency ?? false

  // Delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.del(`/api/clients?id=${deleteTarget.id}`)
      toast.success('Cliente eliminado')
      fetchClients()
    } catch {
      toast.error('Error al eliminar cliente')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  // Edit client
  const [editingClient, setEditingClient] = useState<Client | null>(null)

  // Dispatch dialog
  const [dispatchClient, setDispatchClient] = useState<Client | null>(null)
  const [showDispatchDialog, setShowDispatchDialog] = useState(false)
  const [products, setProducts] = useState<ProductOption[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [dispatchLines, setDispatchLines] = useState<DispatchLine[]>([])
  const [savingDispatch, setSavingDispatch] = useState(false)

  // Show deleted clients toggle
  const [showInactive, setShowInactive] = useState(false)
  const [membershipFilter, setMembershipFilter] = useState<'todos' | 'activo' | 'vencido' | 'sin'>('activo')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 20

  const fetchClients = async () => {
    try {
      // Check expirations in background (gym only)
      if (isGym) api.get('/api/clients/check-expirations').catch(() => {})

      const params = showInactive ? '?includeDeleted=true' : ''
      const data = await api.get<Client[]>(`/api/clients${params}`)
      setClients(data)
    } catch {
      toast.error('Error al cargar clientes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchClients() }, [showInactive])

  // React to pendingClientId from navigation (e.g. from notification click)
  const pendingClientId = useAppStore((s) => s.pendingClientId)
  const clearPendingClient = useAppStore((s) => s.clearPendingClient)

  useEffect(() => {
    if (!pendingClientId || clients.length === 0) return
    const client = clients.find(c => c.id === pendingClientId)
    if (client) {
      openHistory(client)
      clearPendingClient()
    }
  }, [pendingClientId, clients.length])

  // Fetch open cash register and payment methods
  useEffect(() => {
    api.get<Array<{ id: string; status: string }>>('/api/cash-register')
      .then(regs => {
        const openReg = regs?.find(r => r.status === 'abierta')
        if (openReg) setOpenCashRegId(openReg.id)
      })
      .catch(() => {})
    api.get<PaymentMethodOption[]>(`/api/payment-methods?country=${country}`)
      .then(methods => {
        if (Array.isArray(methods) && methods.length > 0) {
          setPaymentMethods(methods.filter(m => m.enabled && !m.isCredit))
        } else {
          setPaymentMethods(FALLBACK_METHODS.filter(m => m.enabled && !m.isCredit))
        }
      })
      .catch(() => {
        setPaymentMethods(FALLBACK_METHODS.filter(m => m.enabled && !m.isCredit))
      })
  }, [country])

  // Capitalize helper: "jUAN pEREZ" → "Juan Perez"
  const cap = (str: string | null | undefined): string => {
    if (!str) return ''
    return str
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }

  const inactiveCount = clients.filter((c) => c.deletedAt !== null).length
  const activeCount = clients.filter((c) => !c.deletedAt && c.membership?.status === 'Activo').length
  const expiredCount = clients.filter((c) => !c.deletedAt && c.membership?.status === 'Vencido').length
  const noMembershipCount = clients.filter((c) => !c.deletedAt && (!c.membership?.status || c.membership?.status === 'Sin membresia')).length

  const searchLower = search.toLowerCase().trim()
  const filtered = clients.filter((c) => {
    // Membership filter (gym only)
    if (isGym) {
      if (membershipFilter === 'activo' && c.membership?.status !== 'Activo') return false
      if (membershipFilter === 'vencido' && c.membership?.status !== 'Vencido') return false
      if (membershipFilter === 'sin' && c.membership?.status && c.membership?.status !== 'Sin membresia') return false
    }

    // Search filter
    if (!searchLower) return true
    const fullName = `${c.name} ${c.lastName || ''}`.toLowerCase()
    if (fullName.includes(searchLower)) return true
    if (isGym && c.cedula && c.cedula.includes(search)) return true
    if (c.phone && c.phone.includes(search)) return true
    if (c.email && c.email.toLowerCase().includes(searchLower)) return true
    return false
  })

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginatedClients = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  useEffect(() => { setCurrentPage(1) }, [search, membershipFilter, showInactive])

  // Plans state
  const [plans, setPlans] = useState<PlanOption[]>([])
  const [formPlanId, setFormPlanId] = useState('')

  // Renew dialog
  const [renewClient, setRenewClient] = useState<Client | null>(null)
  const [renewPlanId, setRenewPlanId] = useState('')
  const [showRenewDialog, setShowRenewDialog] = useState(false)
  const [renewing, setRenewing] = useState(false)
  const [renewPaymentMethod, setRenewPaymentMethod] = useState('')
  const [renewPaymentReference, setRenewPaymentReference] = useState('')
  const [renewMethods, setRenewMethods] = useState<PaymentMethodOption[]>([])
  const [renewCurrencies, setRenewCurrencies] = useState<{ id: string; code: string; symbol: string; isBase: boolean }[]>([])
  const [renewSuccess, setRenewSuccess] = useState(false)

  // Attendance dialog
  const [attClient, setAttClient] = useState<Client | null>(null)
  const [showAttDialog, setShowAttDialog] = useState(false)
  const [loadingAtt, setLoadingAtt] = useState(false)
  const [markingAtt, setMarkingAtt] = useState(false)
  const [attData, setAttData] = useState<{
    attendances: Array<{ id: string; date: string }>;
    stats: {
      totalPlanDays: number;
      planName: string | null;
      daysRemaining: number;
      totalAttendances: number;
      monthAttendanceCount: number;
      monthName: string;
    };
  } | null>(null)

  // Fetch plans for selectors
  useEffect(() => {
    api.get<PlanOption[]>('/api/plans')
      .then(data => setPlans(Array.isArray(data) ? data.filter(p => p.active) : []))
      .catch(() => {})
  }, [])

  const openCreate = () => {
    setEditingClient(null)
    setFormName('')
    setFormLastName('')
    setFormCedula('')
    setFormPhone('')
    setFormEmail('')
    setFormAddress('')
    setFormNote('')
    setFormPlanId('')
    setDialogOpen(true)
  }

  const openEdit = (client: Client) => {
    setEditingClient(client)
    setFormName(client.name)
    setFormLastName(client.lastName || '')
    setFormCedula(client.cedula || '')
    setFormPhone(client.phone || '')
    setFormEmail(client.email || '')
    setFormAddress(client.address || '')
    setFormNote(client.note || '')
    setDialogOpen(true)
  }

  const handleSave = async () => {
    // Name validation
    const trimmedName = formName.trim()
    if (!trimmedName) {
      toast.error('El nombre es obligatorio')
      return
    }
    if (trimmedName.length < 2) {
      toast.error('El nombre debe tener al menos 2 caracteres')
      return
    }

    // Last name validation (gym only)
    const trimmedLastName = formLastName.trim()
    if (isGym && !trimmedLastName) {
      toast.error('El apellido es obligatorio')
      return
    }

    // Phone validation
    if (formPhone.trim()) {
      const digitsOnly = formPhone.trim().replace(/[\s\-()]/g, '')
      if (!/^\+?\d{7,}$/.test(digitsOnly)) {
        toast.error('El teléfono debe tener al menos 7 dígitos (solo números, se permite +)')
        return
      }
    }

    // Email validation
    if (formEmail.trim()) {
      if (!formEmail.trim().includes('@') || !formEmail.trim().includes('.')) {
        toast.error('El formato del email no es válido')
        return
      }
    }

    // Address validation
    if (formAddress.trim() && formAddress.trim().length < 3) {
      toast.error('La dirección debe tener al menos 3 caracteres')
      return
    }

    setSaving(true)
    try {
      if (editingClient) {
        await api.put('/api/clients', {
          id: editingClient.id,
          name: trimmedName,
          lastName: trimmedLastName,
          cedula: formCedula.trim() || null,
          phone: formPhone.trim() || null,
          email: formEmail.trim() || null,
          address: formAddress.trim() || null,
          note: formNote.trim() || null,
        })
        toast.success('Cliente actualizado')
      } else {
        const newClient = await api.post<Client>('/api/clients', {
          name: trimmedName,
          lastName: trimmedLastName,
          cedula: formCedula.trim() || null,
          phone: formPhone.trim() || null,
          email: formEmail.trim() || null,
          address: formAddress.trim() || null,
          note: formNote.trim() || null,
        })
        // If plan selected, assign it via renew endpoint
        if (formPlanId) {
          try {
            await api.post(`/api/clients/${newClient.id}/renew`, { planId: formPlanId })
          } catch {
            toast.warning('Cliente creado pero no se pudo asignar el plan')
          }
        }
        toast.success('Cliente creado')
      }
      setDialogOpen(false)
      fetchClients()
    } catch {
      toast.error(editingClient ? 'Error al actualizar cliente' : 'Error al crear cliente')
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadStatement = async (client: Client) => {
    try {
      const res = await fetch(`/api/clients/${client.id}/statement`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `estado_cuenta_${client.name.replace(/\s+/g, '_')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Estado de cuenta descargado')
    } catch {
      toast.error('Error al descargar el estado de cuenta')
    }
  }

  const handleSendStatement = async (client: Client) => {
    if (!client.email) {
      toast.error('El cliente no tiene email registrado')
      return
    }
    setSendingStatement(client.id)
    try {
      const res = await fetch(`/api/clients/${client.id}/send-statement`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Estado de cuenta enviado a ${client.email}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al enviar'
      toast.error(msg)
    } finally {
      setSendingStatement(null)
    }
  }

  const openHistory = async (client: Client) => {
    setHistoryClient(client)
    setShowHistoryDialog(true)
    setLoadingHistory(true)
    try {
      const data = await api.get<{ sales: SaleRecord[] }>(`/api/clients/${client.id}/sales`)
      setSales(data.sales)
    } catch {
      toast.error('Error al cargar historial')
    } finally {
      setLoadingHistory(false)
    }
  }

  const openPayment = (client: Client) => {
    setPaymentClient(client)
    // Set default to first available non-credit method
    const firstNonCredit = paymentMethods.find(m => !m.isCredit)
    setPaymentMethod(firstNonCredit?.code || paymentMethods[0]?.code || '')
    setPaymentReference('')
    // Set amount in reference currency by default
    setPaymentAmount(client.pendingBalance.toFixed(2))
    setShowPaymentDialog(true)
  }

  // When payment method changes, toggle between local and reference currency
  const handlePaymentMethodChange = (methodCode: string) => {
    setPaymentMethod(methodCode)
    setPaymentReference('')
    if (paymentClient) {
      const pm = paymentMethods.find(m => m.code === methodCode)
      const isLocal = pm?.isLocalCurrency ?? false
      if (isLocal && exchangeRate > 0) {
        setPaymentAmount((paymentClient.pendingBalance * exchangeRate).toFixed(2))
      } else {
        setPaymentAmount(paymentClient.pendingBalance.toFixed(2))
      }
    }
  }

  // Convert displayed amount to reference currency
  const paymentAmountInRef = (() => {
    const parsed = parseFloat(paymentAmount) || 0
    if (isLocalMethod && exchangeRate > 0) {
      return Math.round((parsed / exchangeRate) * 100) / 100
    }
    return parsed
  })()

  const openDispatch = async (client: Client) => {
    setDispatchClient(client)
    setDispatchLines([])
    setShowDispatchDialog(true)
    setLoadingProducts(true)
    try {
      const branchParam = selectedBranchId ? `?branchId=${selectedBranchId}` : ''
      const data = await api.get<{ products: ProductOption[] }>(`/api/products?active=true${branchParam}`)
      setProducts(data.products)
    } catch {
      toast.error('Error al cargar productos')
    } finally {
      setLoadingProducts(false)
    }
  }

  const handlePayment = async () => {
    if (!paymentClient) return
    if (!user?.id) {
      toast.error('No se pudo identificar al usuario. Inicie sesión de nuevo.')
      return
    }
    if (!baseCurrencyId) {
      toast.error('No hay moneda base configurada. Configure la moneda base en ajustes.')
      return
    }
    const amt = parseFloat(paymentAmount)
    if (!amt || amt <= 0) {
      toast.error('El monto debe ser mayor a 0')
      return
    }
    if (paymentAmountInRef > paymentClient.pendingBalance) {
      toast.error(`El monto no puede ser mayor al saldo pendiente (${fmt(paymentClient.pendingBalance)})`)
      return
    }
    if (selectedPm?.isCash && !openCashRegId) {
      toast.error('No hay caja abierta. Abra una caja registradora antes de cobrar en efectivo.')
      return
    }
    setPaying(true)
    try {
      await api.post(`/api/clients/${paymentClient.id}/payment`, {
        amount: paymentAmountInRef,
        method: paymentMethod,
        reference: paymentReference || undefined,
        cashRegId: openCashRegId || undefined,
        userId: user.id,
        currencyId: baseCurrencyId,
      })
      const displayLabel = isLocalMethod ? `Bs. ${parseFloat(paymentAmount).toFixed(2)}` : `${fmt(paymentAmountInRef)}`
      toast.success(`Cobro de ${displayLabel} registrado exitosamente`)
      setShowPaymentDialog(false)
      fetchClients()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al registrar cobro'
      toast.error(msg)
    } finally {
      setPaying(false)
    }
  }

  const addDispatchLine = (productId: string) => {
    const product = products.find(p => p.id === productId)
    if (!product) return

    const existingLine = dispatchLines.find(l => l.productId === productId)
    if (existingLine) {
      // Increment quantity
      if (existingLine.quantity >= existingLine.stock) {
        toast.error('Stock insuficiente')
        return
      }
      setDispatchLines(dispatchLines.map(l =>
        l.productId === productId
          ? { ...l, quantity: l.quantity + 1 }
          : l
      ))
    } else {
      const branchInv = product.inventories.find(i => i.branchId === selectedBranchId)
      const stock = branchInv?.stock ?? 0
      if (stock <= 0) {
        toast.error('Sin stock disponible')
        return
      }
      setDispatchLines([...dispatchLines, {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPrice: product.price,
        stock,
      }])
    }
  }

  const updateDispatchLineQty = (productId: string, qty: number) => {
    const line = dispatchLines.find(l => l.productId === productId)
    if (!line) return
    if (qty > line.stock) {
      toast.error(`Stock insuficiente. Máximo: ${line.stock}`)
      return
    }
    if (qty <= 0) {
      setDispatchLines(dispatchLines.filter(l => l.productId !== productId))
    } else {
      setDispatchLines(dispatchLines.map(l =>
        l.productId === productId ? { ...l, quantity: qty } : l
      ))
    }
  }

  const dispatchTotal = dispatchLines.reduce((sum, l) => sum + (l.unitPrice * l.quantity), 0)

  const handleDispatch = async () => {
    if (!dispatchClient || dispatchLines.length === 0) return
    setSavingDispatch(true)
    try {
      await api.post(`/api/clients/${dispatchClient.id}/dispatch`, {
        lines: dispatchLines.map(l => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
        userId: user?.id || '',
        branchId: selectedBranchId || undefined,
      })
      toast.success(`Despacho registrado. Total: ${fmt(dispatchTotal)}`)
      setShowDispatchDialog(false)
      fetchClients()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al registrar despacho'
      toast.error(msg)
    } finally {
      setSavingDispatch(false)
    }
  }

  const openRenew = (client: Client) => {
    setRenewClient(client)
    setRenewPlanId('')
    setRenewPaymentMethod('')
    setRenewPaymentReference('')
    setShowRenewDialog(true)
    // Load subscription-specific payment methods and open cash register
    const countryVal = country
    Promise.all([
      api.get<PaymentMethodOption[]>(`/api/payment-methods?country=${countryVal}&context=subscription`),
      api.get<Array<{ id: string; status: string }>>('/api/cash-register'),
      api.get<{ id: string; code: string; symbol: string; isBase: boolean }[]>('/api/currencies'),
    ]).then(([methods, registers, currencies]) => {
      const list = Array.isArray(methods) && methods.length > 0 ? methods : FALLBACK_METHODS.filter(m => m.enabled)
      setRenewMethods(list)
      if (list.length > 0) setRenewPaymentMethod(list[0].code)
      const openReg = registers?.find((r: { status: string }) => r.status === 'abierta')
      if (openReg) setOpenCashRegId(openReg.id)
      if (Array.isArray(currencies)) setRenewCurrencies(currencies)
    }).catch(() => {
      const fallback = FALLBACK_METHODS.filter(m => m.enabled)
      setRenewMethods(fallback)
      if (fallback.length > 0) setRenewPaymentMethod(fallback[0].code)
    })
  }

  const handleRenew = async () => {
    if (!renewClient || !renewPlanId) {
      toast.error('Selecciona un plan')
      return
    }
    if (!renewPaymentMethod) {
      toast.error('Selecciona un método de pago')
      return
    }
    const selectedMethod = renewMethods.find(m => m.code === renewPaymentMethod)
    if (selectedMethod?.needsReference && !renewPaymentReference.trim()) {
      toast.error(`La referencia es obligatoria para ${selectedMethod.name}`)
      return
    }
    setRenewing(true)
    try {
      const baseCurr = renewCurrencies.find(c => c.isBase)
      const res = await api.post<{ message: string }>(`/api/clients/${renewClient.id}/renew`, {
        planId: renewPlanId,
        paymentMethod: renewPaymentMethod,
        paymentReference: renewPaymentReference.trim() || undefined,
        cashRegId: openCashRegId || undefined,
        branchId: selectedBranchId || undefined,
        currencyId: baseCurr?.id || baseCurrencyId || '',
      })
      setRenewSuccess(true)
      toast.success(res.message || 'Suscripción renovada')
      setTimeout(() => {
        setShowRenewDialog(false)
        setRenewSuccess(false)
        fetchClients()
      }, 1500)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al renovar'
      toast.error(msg)
    } finally {
      setRenewing(false)
    }
  }

  const openAttendance = async (client: Client) => {
    setAttClient(client)
    setAttData(null)
    setShowAttDialog(true)
    setLoadingAtt(true)
    try {
      const data = await api.get<typeof attData>(`/api/clients/${client.id}/attendance`)
      setAttData(data)
    } catch {
      toast.error('Error al cargar asistencia')
    } finally {
      setLoadingAtt(false)
    }
  }

  const markAttendance = async () => {
    if (!attClient) return
    setMarkingAtt(true)
    try {
      await api.post(`/api/clients/${attClient.id}/attendance`, {})
      toast.success('Asistencia marcada correctamente')
      // Refresh attendance data
      openAttendance(attClient)
      fetchClients()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al marcar asistencia'
      toast.error(msg)
    } finally {
      setMarkingAtt(false)
    }
  }

  const handleReactivate = async (client: Client) => {
    try {
      await api.put('/api/clients', { id: client.id, reactivate: true })
      toast.success(`Cliente "${client.name}" reactivado`)
      fetchClients()
    } catch {
      toast.error('Error al reactivar cliente')
    }
  }

  return (
    <div className="space-y-4">
      {/* Top bar: search + filters + actions */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por nombre, apellido, cédula o teléfono..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Switch
              id="show-inactive-clients"
              checked={showInactive}
              onCheckedChange={setShowInactive}
            />
            <Label htmlFor="show-inactive-clients" className="cursor-pointer select-none">
              {showInactive ? <Eye className="inline h-4 w-4 mr-1" /> : <EyeOff className="inline h-4 w-4 mr-1" />}
              Inactivos ({inactiveCount})
            </Label>
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              {isGym && (
              <Button variant="outline" onClick={() => setBulkImportOpen(true)} className="text-primary border-primary/30 hover:bg-primary/5">
                <Upload className="mr-2 h-4 w-4" /> Carga Masiva
              </Button>
              )}
              <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 text-white">
                <Plus className="mr-2 h-4 w-4" /> Nuevo Cliente
              </Button>
            </div>
          )}
        </div>

        {/* Membership filter bar (gym only) */}
        {isGym && (
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground mr-1">Membresía:</span>
          {([
            { key: 'todos' as const, label: 'Todos', count: clients.filter(c => !c.deletedAt).length, icon: <UsersRound className="h-3.5 w-3.5" /> },
            { key: 'activo' as const, label: 'Activos', count: activeCount, icon: <UserCheck className="h-3.5 w-3.5" /> },
            { key: 'vencido' as const, label: 'Vencidos', count: expiredCount, icon: <UserX className="h-3.5 w-3.5" /> },
            { key: 'sin' as const, label: 'Sin membresía', count: noMembershipCount, icon: <Users className="h-3.5 w-3.5" /> },
          ]).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setMembershipFilter(opt.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                membershipFilter === opt.key
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {opt.icon}
              {opt.label} ({opt.count})
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="h-52 animate-pulse bg-muted" />
          ))}
        </div>
      ) : paginatedClients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Users className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-sm">No se encontraron clientes</p>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginatedClients.map((client) => {
            const memStatus = client.membership?.status
            const hasMembership = memStatus && memStatus !== 'Sin membresia'
            return (
            <Card key={client.id} className={`relative overflow-hidden hover:shadow-md transition-shadow ${client.deletedAt ? 'opacity-60' : ''}`}>
              {/* Top color bar */}
              <div className={`h-1 ${
                client.deletedAt ? 'bg-gray-400' :
                isGym && memStatus === 'Activo' ? 'bg-emerald-500' :
                isGym && memStatus === 'Vencido' ? 'bg-red-500' :
                'bg-gray-300 dark:bg-gray-600'
              }`} />
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-sm truncate">{cap(client.name)}{isGym && client.lastName ? ` ${cap(client.lastName)}` : ''}</h3>
                    {isGym && client.cedula && (
                      <p className="text-[11px] text-muted-foreground font-mono">{client.cedula}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {client.deletedAt && (
                      <Badge variant="outline" className="text-muted-foreground text-[10px] px-1.5 py-0">
                        Deshabilitado
                      </Badge>
                    )}
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${client.pendingBalance > 0
                      ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                      : 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                    }`}>
                      {client.pendingBalance > 0
                        ? `${fmt(client.pendingBalance)}`
                        : 'Sin deuda'
                      }
                    </span>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  {client.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span className="truncate">{client.phone}</span>
                    </div>
                  )}
                  {client.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{client.email.toLowerCase()}</span>
                    </div>
                  )}
                  {client.address && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{cap(client.address)}</span>
                    </div>
                  )}
                </div>

                {/* Membership info below contact (gym only) */}
                {isGym && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge
                    className={`text-[10px] px-1.5 py-0 ${
                      memStatus === 'Activo'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                        : memStatus === 'Vencido'
                        ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                        : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                    }`}
                  >
                    {memStatus === 'Activo' ? 'Activo' : memStatus === 'Vencido' ? 'Vencido' : 'Sin membresia'}
                  </Badge>
                  {hasMembership && client.membership?.tarifa && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                      {cap(client.membership.tarifa)}
                    </Badge>
                  )}
                  {hasMembership && client.membership!.endDate && (
                    <span className="text-[10px] text-muted-foreground">
                      Vence: {new Date(client.membership!.endDate).toLocaleDateString('es-VE')}
                    </span>
                  )}
                  {memStatus === 'Activo' && hasMembership && client.membership!.daysRemaining > 0 && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      {client.membership!.daysRemaining}d restantes
                    </span>
                  )}
                </div>
                )}

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <ShoppingCart className="h-3 w-3" />
                    <span>{client._count.sales} venta{client._count.sales !== 1 ? 's' : ''}</span>
                  </div>
                  {client.pendingBalance > 0 && (
                    <div className="text-red-600 font-medium">
                      Debe: {fmt(client.pendingBalance)}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 pt-2 border-t">
                  {!client.deletedAt && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Ver Historial" onClick={() => openHistory(client)}>
                        <Receipt className="h-3.5 w-3.5" />
                      </Button>
                      {canManage && isGym && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40" title="Marcar Asistencia" onClick={() => openAttendance(client)}>
                          <CalendarCheck className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canManage && isGym && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40" title="Renovar Suscripción" onClick={() => openRenew(client)}>
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Estado de Cuenta (PDF)" onClick={() => handleDownloadStatement(client)}>
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                      {client.email && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Enviar por Email" onClick={() => handleSendStatement(client)} disabled={sendingStatement === client.id}>
                          {sendingStatement === client.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Mail className="h-3.5 w-3.5" />
                          }
                        </Button>
                      )}
                      {canManage && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Despachar" onClick={() => openDispatch(client)}>
                          <Truck className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {client.pendingBalance > 0 && (
                        <Button size="sm" variant="outline" className="h-7 text-xs text-primary hover:text-primary" onClick={() => openPayment(client)}>
                          <DollarSign className="mr-1 h-3 w-3" /> Cobrar
                        </Button>
                      )}
                      <div className="flex-1" />
                      {canManage && (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Editar" onClick={() => openEdit(client)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" title="Eliminar" onClick={() => setDeleteTarget(client)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </>
                  )}
                  {client.deletedAt && canManage && (
                    <>
                      <div className="flex-1" />
                      <Button size="sm" variant="outline" className="h-7 text-xs" title="Reactivar cliente" onClick={() => handleReactivate(client)}>
                        <Eye className="mr-1 h-3 w-3" /> Reactivar
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
            )})}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(1)}
              >
                «
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium px-2">
                {currentPage} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
              >
                »
              </Button>
            </div>
          </div>
        )}
        </>
      )}

      {/* Create Client Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
            <DialogDescription>{editingClient ? 'Modifica los datos del cliente' : 'Registra un nuevo cliente en el sistema'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cname">Nombre *</Label>
                <Input id="cname" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Nombre" />
              </div>
              {isGym && (
              <div className="space-y-2">
                <Label htmlFor="clastname">Apellido *</Label>
                <Input id="clastname" value={formLastName} onChange={(e) => setFormLastName(e.target.value)} placeholder="Apellido" />
              </div>
              )}
            </div>
            {isGym && (
            <div className="space-y-2">
              <Label htmlFor="ccedula">Cédula</Label>
              <Input id="ccedula" value={formCedula} onChange={(e) => setFormCedula(e.target.value)} placeholder="V-00000000" />
            </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cphone">Teléfono</Label>
                <Input id="cphone" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="+58 412-0000000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cemail">Email</Label>
                <Input id="cemail" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="correo@ejemplo.com" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="caddress">Dirección</Label>
              <Input id="caddress" value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="Dirección" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnote">Notas</Label>
              <Input id="cnote" value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="Notas internas" />
            </div>
            {isGym && !editingClient && plans.length > 0 && (
              <div className="space-y-2">
                <Label>Asignar Plan (opcional)</Label>
                <Select value={formPlanId} onValueChange={setFormPlanId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin plan — puedes asignarlo después" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — {fmt(p.cost)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button className="w-full bg-primary hover:bg-primary/90 text-white" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : editingClient ? 'Actualizar Cliente' : 'Crear Cliente'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dispatch Dialog */}
      <Dialog open={showDispatchDialog} onOpenChange={setShowDispatchDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Despachar a {dispatchClient?.name}</DialogTitle>
            <DialogDescription>Selecciona productos y cantidades para despachar</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Product selector */}
            <div className="space-y-2">
              <Label>Agregar Producto</Label>
              <Select onValueChange={(v) => { addDispatchLine(v); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar producto..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => {
                    const branchInv = p.inventories.find(i => i.branchId === selectedBranchId)
                    const stock = branchInv?.stock ?? 0
                    return (
                      <SelectItem key={p.id} value={p.id} disabled={stock <= 0}>
                        {p.name} — {p.currency.symbol}{p.price.toFixed(2)} (Stock: {stock})
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Lines */}
            {dispatchLines.length > 0 ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Productos a Despachar</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {dispatchLines.map((line) => (
                      <div key={line.productId} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{line.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            {fmt(line.unitPrice)} c/u · Stock: {line.stock}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0"
                            onClick={() => updateDispatchLineQty(line.productId, line.quantity - 1)}
                          >
                            -
                          </Button>
                          <span className="text-sm font-medium w-8 text-center">{line.quantity}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0"
                            onClick={() => updateDispatchLineQty(line.productId, line.quantity + 1)}
                          >
                            +
                          </Button>
                        </div>
                        <div className="text-right w-20">
                          <p className="text-sm font-semibold">{fmt(line.unitPrice * line.quantity)}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-red-600"
                          onClick={() => setDispatchLines(dispatchLines.filter(l => l.productId !== line.productId))}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}

                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm font-medium">Total del Despacho:</span>
                      <span className="text-lg font-bold text-primary">{fmt(dispatchTotal)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-md border border-dashed p-6 text-center">
                <Truck className="mx-auto mb-2 h-8 w-8 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">Selecciona productos arriba para agregar al despacho</p>
              </div>
            )}

            <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2 text-xs text-amber-700 dark:text-amber-400">
              El despacho genera una venta a credito con vencimiento a 30 dias. El cliente podra pagar la factura desde la opcion &quot;Cobrar&quot;.
            </div>

            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white"
              onClick={handleDispatch}
              disabled={savingDispatch || dispatchLines.length === 0}
            >
              {savingDispatch ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
              {savingDispatch ? 'Procesando...' : `Confirmar Despacho (${fmt(dispatchTotal)})`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sales/Dispatch History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Historial de {historyClient?.name}</DialogTitle>
            <DialogDescription>Ventas y despachos realizados a este cliente</DialogDescription>
          </DialogHeader>
          {loadingHistory ? (
            <div className="h-48 rounded-lg bg-muted animate-pulse" />
          ) : (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Ventas</p>
                    <p className="text-xl font-bold">{sales.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Comprado</p>
                    <p className="text-xl font-bold">
                      {fmt(sales.reduce((s, sale) => s + sale.total, 0))}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Detalle de Ventas</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {sales.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">Sin ventas registradas</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>N° Factura</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead className="hidden md:table-cell">Productos</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="hidden lg:table-cell">Método</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sales.map((sale) => {
                            const isCredit = sale.payments.some(p => {
                              const pm = paymentMethods.find(m => m.code === p.method)
                              return pm?.isCredit
                            }) || sale.receivables.some(r => r.status === 'pendiente')
                            return (
                              <TableRow key={sale.id}>
                                <TableCell className="text-xs font-mono whitespace-nowrap">
                                  {sale.id.slice(0, 8)}
                                </TableCell>
                                <TableCell className="text-xs whitespace-nowrap pr-4">
                                  {new Date(sale.date).toLocaleDateString('es-VE')}
                                </TableCell>
                                <TableCell className="hidden md:table-cell">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-xs text-muted-foreground hover:text-primary gap-1"
                                    title="Ver productos"
                                    onClick={() => setDetailSale(sale)}
                                  >
                                    <Eye className="h-3 w-3" />
                                    {sale.lines.length}
                                  </Button>
                                </TableCell>
                                <TableCell className="text-sm font-medium text-right whitespace-nowrap">
                                  {fmt(sale.total)}
                                </TableCell>
                                <TableCell className="text-xs hidden lg:table-cell">
                                  {sale.payments.map(p => p.method).join(', ') || '—'}
                                </TableCell>
                                <TableCell>
                                  {isCredit ? (
                                    <Badge variant="outline" className="text-amber-600 border-amber-300">
                                      {sale.receivables[0]?.pendingBalance > 0
                                        ? `Pendiente: ${fmt(sale.receivables[0].pendingBalance)}`
                                        : 'Credito'}
                                    </Badge>
                                  ) : (
                                    <Badge variant={sale.status === 'completada' ? 'default' : 'secondary'}>
                                      {sale.status}
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    title="Imprimir Factura"
                                    onClick={async () => {
                                      try {
                                        const res = await fetch(`/api/sales/${sale.id}/invoice`)
                                        if (!res.ok) throw new Error()
                                        const blob = await res.blob()
                                        const url = URL.createObjectURL(blob)
                                        const a = document.createElement('a')
                                        a.href = url
                                        a.download = `factura_${sale.id.slice(0, 8)}.pdf`
                                        a.click()
                                        URL.revokeObjectURL(url)
                                      } catch {
                                        toast.error('Error al generar factura')
                                      }
                                    }}
                                  >
                                    <Printer className="h-3.5 w-3.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sale Lines Detail Modal */}
      <Dialog open={!!detailSale} onOpenChange={(open) => { if (!open) setDetailSale(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Productos — Factura {detailSale?.id.slice(0, 8)}
            </DialogTitle>
            <DialogDescription>
              {detailSale ? new Date(detailSale.date).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' }) : ''}
            </DialogDescription>
          </DialogHeader>
          {detailSale && (
            <div className="space-y-3">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-center">Cant.</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailSale.lines.map((line, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm font-medium">{line.product.name}</TableCell>
                        <TableCell className="text-sm text-center">{line.quantity}</TableCell>
                        <TableCell className="text-sm text-right">{fmt(line.unitPrice)}</TableCell>
                        <TableCell className="text-sm text-right font-medium">{fmt(line.lineTotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between px-1">
                <span className="text-sm text-muted-foreground">
                  {detailSale.lines.length} producto{detailSale.lines.length !== 1 ? 's' : ''}
                </span>
                <span className="text-base font-bold">
                  Total: {fmt(detailSale.total)}
                </span>
              </div>
              {detailSale.receivables.length > 0 && detailSale.receivables[0].pendingBalance > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-2 text-xs text-amber-700 dark:text-amber-400">
                  Saldo pendiente: {fmt(detailSale.receivables[0].pendingBalance)}
                  {detailSale.receivables[0].dueDate && ` — Vence: ${new Date(detailSale.receivables[0].dueDate).toLocaleDateString('es-VE')}`}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cobrar a {paymentClient?.name}</DialogTitle>
            <DialogDescription>
              Registrar pago de deuda pendiente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {paymentClient && (
              <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cliente:</span>
                  <span className="font-medium">{paymentClient.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deuda pendiente:</span>
                  <span className="font-medium text-red-600">{fmt(paymentClient.pendingBalance)}</span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Método de Pago</Label>
              <Select value={paymentMethod} onValueChange={handlePaymentMethodChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {paymentMethods.map(pm => (
                    <SelectItem key={pm.code} value={pm.code}>
                      {pm.name}{pm.isLocalCurrency ? ` (${baseSym})` : ` (${currencySymbol})`}
                    </SelectItem>
                  ))}
                  {paymentMethods.length === 0 && (
                    <SelectItem value="">Cargando métodos...</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpaymentAmt">Monto a Cobrar {isLocalMethod ? '(Bs.)' : `(${currencySymbol})`}</Label>
              <Input
                id="cpaymentAmt"
                type="number"
                step="0.01"
                min="0"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
              />
              {isLocalMethod && exchangeRate > 0 && (
                <p className="text-xs text-muted-foreground">
                  Equivale a {fmt(paymentAmountInRef)} (Tasa: {exchangeRate.toFixed(2)} {baseSym}/{referenceCurrency})
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Saldo después del cobro: {fmt((paymentClient?.pendingBalance || 0) - paymentAmountInRef)}
              </p>
            </div>
            {selectedPm?.needsReference && (
              <div className="space-y-2">
                <Label>Referencia</Label>
                <Input
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="Número de referencia"
                />
              </div>
            )}
            {selectedPm?.isCash && !openCashRegId && (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">No hay caja registradora abierta</p>
                  <p>Debe abrir una caja antes de registrar pagos en efectivo. El cobro no quedará registrado como entrada de caja.</p>
                </div>
              </div>
            )}
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white"
              onClick={handlePayment}
              disabled={paying || !parseFloat(paymentAmount) || parseFloat(paymentAmount) <= 0}
            >
              {paying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
              {paying ? 'Procesando...' : 'Registrar Cobro'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Renew Subscription Dialog — POS-style payment */}
      <Dialog open={showRenewDialog} onOpenChange={(open) => { if (!open) { setShowRenewDialog(false); setRenewSuccess(false) } }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-emerald-600" />
              Renovar Suscripción
            </DialogTitle>
            <DialogDescription>
              {renewClient?.name}{renewClient?.lastName ? ` ${renewClient.lastName}` : ''}
            </DialogDescription>
          </DialogHeader>

          {renewSuccess ? (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <div className="rounded-full bg-emerald-100 dark:bg-emerald-950/30 p-4">
                <CheckCircle2 className="h-12 w-12 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-emerald-700 dark:text-emerald-400">¡Suscripción Renovada!</h3>
              <p className="text-sm text-muted-foreground">Cerrando automáticamente...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Current membership info */}
              {renewClient?.membership && (
                <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Estado actual:</span>
                    <Badge className={`text-[10px] ${
                      renewClient.membership.status === 'Activo'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                    }`}>
                      {renewClient.membership.status === 'Activo' ? 'Activo' : 'Vencido'}
                    </Badge>
                  </div>
                  {renewClient.membership.tarifa && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Plan actual:</span>
                      <span className="font-medium">{renewClient.membership.tarifa}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Días restantes:</span>
                    <span className="font-medium">{renewClient.membership.daysRemaining}</span>
                  </div>
                </div>
              )}

              {/* Plan selector */}
              <div className="space-y-2">
                <Label>Seleccionar Plan *</Label>
                <Select value={renewPlanId} onValueChange={setRenewPlanId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Elige un plan..." />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center justify-between gap-4">
                          <span>{p.name}</span>
                          <span className="text-muted-foreground font-mono">{fmt(p.cost)}</span>
                        </div>
                      </SelectItem>
                    ))}
                    {plans.length === 0 && (
                      <SelectItem value="none" disabled>No hay planes activos configurados</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Cost display */}
              {renewPlanId && (() => {
                const selectedPlan = plans.find(p => p.id === renewPlanId)
                if (!selectedPlan) return null
                return (
                  <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-emerald-600" />
                      <span className="text-sm font-medium">Costo del plan:</span>
                    </div>
                    <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{fmt(selectedPlan.cost)}</span>
                  </div>
                )
              })()}

              <Separator />

              {/* Payment method selector — POS-style RadioGroup with icons */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5" />
                  Método de Pago *
                </Label>
                {renewMethods.length > 0 ? (
                  <RadioGroup
                    value={renewPaymentMethod}
                    onValueChange={(v) => { setRenewPaymentMethod(v); setRenewPaymentReference('') }}
                    className="grid grid-cols-2 gap-3"
                  >
                    {renewMethods.map((pm) => {
                      const Icon = getRenewIcon(pm.icon)
                      return (
                        <label
                          key={pm.code}
                          className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 p-3 transition-colors ${
                            renewPaymentMethod === pm.code
                              ? 'border-primary bg-primary/5 dark:bg-primary/10'
                              : 'border-muted hover:border-muted-foreground/30'
                          }`}
                        >
                          <RadioGroupItem value={pm.code} className="sr-only" />
                          <Icon className={`h-5 w-5 ${renewPaymentMethod === pm.code ? 'text-primary' : 'text-muted-foreground'}`} />
                          <span className={`text-xs font-medium ${renewPaymentMethod === pm.code ? 'text-primary dark:text-primary' : ''}`}>
                            {pm.name}
                          </span>
                          {pm.isCredit && (
                            <span className="text-[9px] text-amber-600 dark:text-amber-400 font-medium">Genera deuda</span>
                          )}
                        </label>
                      )
                    })}
                  </RadioGroup>
                ) : (
                  <p className="text-xs text-center text-muted-foreground py-2">
                    No hay métodos de pago activos para suscripciones
                  </p>
                )}
              </div>

              {/* Reference input */}
              {renewMethods.find(m => m.code === renewPaymentMethod)?.needsReference && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <Label htmlFor="renew-reference">Referencia *</Label>
                  <Input
                    id="renew-reference"
                    value={renewPaymentReference}
                    onChange={(e) => setRenewPaymentReference(e.target.value)}
                    placeholder="Número de referencia..."
                  />
                </div>
              )}

              {/* No cash register warning */}
              {!openCashRegId && renewMethods.find(m => m.code === renewPaymentMethod)?.isCash && (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-2.5 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>No hay caja abierta. El pago en efectivo no se registrará en caja.</span>
                </div>
              )}

              {/* Credit info */}
              {renewMethods.find(m => m.code === renewPaymentMethod)?.isCredit && (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-2.5 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>El pago a crédito generará una cuenta por cobrar para el cliente. No se sumará al saldo de caja.</span>
                </div>
              )}

              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                size="lg"
                onClick={handleRenew}
                disabled={renewing || !renewPlanId || !renewPaymentMethod}
              >
                {renewing ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Renovando...</>
                ) : (
                  <><RefreshCw className="mr-2 h-4 w-4" /> Renovar Suscripción</>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Attendance Dialog */}
      <Dialog open={showAttDialog} onOpenChange={setShowAttDialog}>
        <DialogContent className="sm:max-w-lg max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-blue-600" />
              Asistencia de {attClient?.name}
            </DialogTitle>
            <DialogDescription>
              Historial de asistencias y estadísticas
            </DialogDescription>
          </DialogHeader>
          {loadingAtt ? (
            <div className="h-48 rounded-lg bg-muted animate-pulse" />
          ) : attData ? (
            <div className="space-y-4 max-h-[65vh] overflow-y-auto">
              {/* Stats cards */}
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Plan</p>
                    <p className="text-lg font-bold">{attData.stats.totalPlanDays || '—'}</p>
                    <p className="text-[10px] text-muted-foreground">días total</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">Restantes</p>
                    <p className={`text-lg font-bold ${attData.stats.daysRemaining <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {attData.stats.daysRemaining}
                    </p>
                    <p className="text-[10px] text-muted-foreground">de {attData.stats.totalPlanDays}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">{attData.stats.monthName}</p>
                    <p className="text-lg font-bold text-blue-600">{attData.stats.monthAttendanceCount}</p>
                    <p className="text-[10px] text-muted-foreground">asistencias</p>
                  </CardContent>
                </Card>
              </div>

              {/* Plan name */}
              {attData.stats.planName && (
                <div className="flex items-center gap-2 rounded-md bg-muted p-2 text-sm">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Plan:</span>
                  <span className="font-medium">{attData.stats.planName}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    Total asistencias: {attData.stats.totalAttendances}
                  </span>
                </div>
              )}

              {/* Mark attendance button — always available, attendance is just tracking */}
              {canManage && (
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={markAttendance}
                  disabled={markingAtt}
                >
                  {markingAtt ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  {markingAtt ? 'Marcando...' : 'Marcar Asistencia de Hoy'}
                </Button>
              )}

              {!canManage && (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Solo usuarios con permisos pueden marcar asistencia.
                </div>
              )}

              {/* Attendance list */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Registro de Asistencias</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {attData.attendances.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4 text-center">Sin asistencias registradas</p>
                  ) : (
                    <ScrollArea className="max-h-[250px]">
                      <div className="divide-y">
                        {attData.attendances.map((att) => {
                          const attDate = new Date(att.date)
                          const isToday = attDate.toDateString() === new Date().toDateString()
                          return (
                            <div key={att.id} className="flex items-center gap-3 px-4 py-2.5">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                isToday
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                  : 'bg-muted text-muted-foreground'
                              }`}>
                                {attDate.getDate()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">
                                  {attDate.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'short' })}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {attDate.toLocaleDateString('es-VE', { year: 'numeric' })}
                                </p>
                              </div>
                              {isToday && (
                                <Badge className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                  Hoy
                                </Badge>
                              )}
                              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                            </div>
                          )
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No se pudo cargar la información</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Cliente</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de eliminar el cliente "{deleteTarget?.name}"? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isGym && <ClientBulkImport open={bulkImportOpen} onOpenChange={setBulkImportOpen} />}
    </div>
  )
}
