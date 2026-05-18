'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppStore } from '@/stores/use-app-store'
import { useAuth } from '@/hooks/use-auth'
import { canAccessView } from '@/lib/permissions'
import { ArrowLeft, ArrowRight, X, Wallet, ShoppingCart, Store, Package, Building2, DollarSign, Percent, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'

// ── Types ───────────────────────────────────────────────

interface TourStep {
  /** CSS selector for the element to highlight. Omit for welcome/finish steps. */
  target?: string
  title: string
  description: string
  /** Which view must be active for this step. Navigates automatically. */
  navigateTo?: string
  /** Side where the popover appears relative to the target. */
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Icon to show in the step header. */
  icon?: React.ReactNode
}

// ── Helper: find element and scroll into view ──────────

function findElement(selector: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(selector)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  }
  return el
}

// ── Helper: get the bounding rect of the target, with padding ──

interface Rect {
  top: number
  left: number
  width: number
  height: number
  right: number
  bottom: number
}

function getTargetRect(el: HTMLElement, padding = 8): Rect {
  const r = el.getBoundingClientRect()
  return {
    top: r.top - padding,
    left: r.left - padding,
    width: r.width + padding * 2,
    height: r.height + padding * 2,
    right: r.right + padding,
    bottom: r.bottom + padding,
  }
}

// ── Step builders per role ─────────────────────────────
//
// ADMIN FLOW (sistema recién instalado):
// 1. Bienvenida
// 2. Configurar Empresa (nombre, RIF, etc.)
// 3. Configurar Moneda (tasa de cambio)
// 4. Configurar IVA
// 5. Crear Categorías (para organizar productos)
// 6. Crear Productos (sin productos no hay POS)
// 7. Abrir Caja (sin caja no hay POS)
// 8. Punto de Venta (buscar, agregar, cobrar)
// 9. Dashboard, Clientes, Proveedores, Gastos, Sucursales, Usuarios, Roles, Sistema, Apariencia
// 10. Completado

function buildAdminSteps(): TourStep[] {
  const steps: TourStep[] = []

  // ═══════════════════════════════════════════════════════
  // FASE 1: BIENVENIDA
  // ═══════════════════════════════════════════════════════
  steps.push({
    title: 'Bienvenido a JO-Administrativo',
    description: 'Tu sistema esta recien instalado. Antes de poder vender, necesitamos configurar los datos basicos. Te guiaremos paso a paso para que en unos minutos estes operando.',
    icon: <Store className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-sidebar] [data-sidebar="content"]',
    title: 'Menu de Navegacion',
    description: 'Desde aqui accedes a todas las secciones del sistema. Vamos a ir moviendonos por cada una segun la necesites.',
    side: 'right',
  })

  // ═══════════════════════════════════════════════════════
  // FASE 2: CONFIGURACION INICIAL
  // ═══════════════════════════════════════════════════════

  // --- Paso 1: Ir a Configuración ---
  steps.push({
    target: '[data-tutorial="nav-settings"]',
    title: 'Vamos a Configurar',
    description: 'Primero vamos a la seccion de Configuracion para poner los datos de tu empresa, las tasas de cambio y demas datos antes de empezar a vender.',
    side: 'right',
    navigateTo: 'settings',
    icon: <Building2 className="h-5 w-5" />,
  })

  // --- Paso 2: Datos de la Empresa ---
  steps.push({
    target: '[data-tutorial="settings-tab-empresa"]',
    title: 'Paso 1: Datos de la Empresa',
    description: 'Aqui debes registrar el nombre de tu negocio, RIF, correo, telefono y direccion. Estos datos aparecen en tus comprobantes de venta y reportes. Haz click en la pestana "Empresa" para configurarlos.',
    side: 'bottom',
    navigateTo: 'settings',
    icon: <Building2 className="h-5 w-5" />,
  })

  // --- Paso 3: Moneda y Tasa de Cambio ---
  steps.push({
    target: '[data-tutorial="settings-tab-moneda"]',
    title: 'Paso 2: Tasa de Cambio',
    description: 'Configura la moneda de referencia (USD o EUR) y la tasa de cambio. Puedes actualizar automaticamente con las tasas del BCV o ingresar una tasa personalizada. Esto es clave para que los precios se conviertan correctamente.',
    side: 'bottom',
    navigateTo: 'settings',
    icon: <DollarSign className="h-5 w-5" />,
  })

  // --- Paso 4: IVA ---
  steps.push({
    target: '[data-tutorial="settings-tab-iva"]',
    title: 'Paso 3: Impuesto I.V.A.',
    description: 'Activa o desactiva el IVA y define el porcentaje (por defecto 16%). Si tu negocio cobra IVA, activa esta opcion antes de hacer la primera venta para que se calcule en cada operacion.',
    side: 'bottom',
    navigateTo: 'settings',
    icon: <Percent className="h-5 w-5" />,
  })

  // --- Paso 5: Categorías ---
  steps.push({
    target: '[data-tutorial="settings-tab-categorias"]',
    title: 'Paso 4: Crear Categorias',
    description: 'Antes de crear productos, define las categorias para organizar tu catalogo. Por ejemplo: Alimentos, Bebidas, Limpieza, etc. Las categorias se usan como filtros en el Punto de Venta. Haz click en "Categorias" y luego en "Nueva".',
    side: 'bottom',
    navigateTo: 'settings',
    icon: <Tag className="h-5 w-5" />,
  })

  // ═══════════════════════════════════════════════════════
  // FASE 3: PRODUCTOS
  // ═══════════════════════════════════════════════════════

  steps.push({
    target: '[data-tutorial="nav-products"]',
    title: 'Paso 5: Crear Productos',
    description: 'Sin productos no hay nada que vender. Vamos a la seccion de Productos para crear tu catalogo. Define nombre, precio, categoria y stock de cada uno.',
    side: 'right',
    navigateTo: 'products',
    icon: <Package className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-tutorial="products-new-btn"]',
    title: 'Boton "Nuevo" Producto',
    description: 'Presiona este boton para registrar un nuevo producto. Completa los campos: nombre, SKU, precio, categoria, stock y sube una foto si quieres. Repite este proceso para todos tus productos.',
    side: 'left',
    navigateTo: 'products',
  })

  // ═══════════════════════════════════════════════════════
  // FASE 4: CAJA
  // ═══════════════════════════════════════════════════════

  steps.push({
    target: '[data-tutorial="nav-cash"]',
    title: 'Paso 6: Abrir Caja',
    description: 'Ya tienes todo configurado. El ultimo paso antes de vender es abrir una caja. Sin caja abierta el Punto de Venta esta bloqueado.',
    side: 'right',
    navigateTo: 'cash',
    icon: <Wallet className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-tutorial="cash-open-btn"]',
    title: 'Pulsa "Abrir Caja"',
    description: 'Haz click aqui para registrar la apertura de caja. Indica el monto inicial con el que arranca el dia y asigna un cajero. Una vez abierta, el Punto de Venta se desbloqueara automaticamente.',
    side: 'right',
    navigateTo: 'cash',
  })

  // ═══════════════════════════════════════════════════════
  // FASE 5: PUNTO DE VENTA
  // ═══════════════════════════════════════════════════════

  steps.push({
    target: '[data-tutorial="nav-pos"]',
    title: 'Paso 7: Punto de Venta',
    description: 'Ahora si, tu sistema esta listo. Vamos al Punto de Venta donde procesaras todas las ventas diarias.',
    side: 'right',
    navigateTo: 'pos',
    icon: <ShoppingCart className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-tutorial="pos-search"]',
    title: 'Buscar Productos',
    description: 'Escribe el nombre o marca del producto para encontrarlo rapido. Tambien puedes escanear el codigo de barras con un lector externo o con la camara.',
    side: 'bottom',
    navigateTo: 'pos',
  })

  steps.push({
    target: '[data-tutorial="pos-products"]',
    title: 'Tu Catalogo',
    description: 'Aqui se muestran todos tus productos con precio y stock. Haz click en un producto para agregarlo al carrito. Usa los filtros de categoria para buscar mas rapido.',
    side: 'top',
    navigateTo: 'pos',
  })

  steps.push({
    target: '[data-tutorial="pos-pay"]',
    title: 'Cobrar',
    description: 'Cuando tengas productos en el carrito, presiona aqui para procesar el pago: efectivo, punto de venta, transferencia o pago mixto.',
    side: 'left',
    navigateTo: 'pos',
  })

  // ═══════════════════════════════════════════════════════
  // FASE 6: RESTO DEL SISTEMA
  // ═══════════════════════════════════════════════════════

  steps.push({
    target: '[data-tutorial="nav-dashboard"]',
    title: 'Dashboard Financiero',
    description: 'Aqui veras el panorama completo: ingresos, gastos, utilidades y graficas de ventas por periodo.',
    side: 'right',
    navigateTo: 'dashboard',
  })

  steps.push({
    target: '[data-tutorial="nav-clients"]',
    title: 'Clientes',
    description: 'Registra clientes, vincularlos a ventas y generar estados de cuenta para control de pagos a credito.',
    side: 'right',
    navigateTo: 'clients',
  })

  steps.push({
    target: '[data-tutorial="nav-suppliers"]',
    title: 'Proveedores',
    description: 'Gestiona proveedores, registra compras y controla cuentas por pagar con pagos parciales.',
    side: 'right',
    navigateTo: 'suppliers',
  })

  steps.push({
    target: '[data-tutorial="nav-expenses"]',
    title: 'Gastos',
    description: 'Registra gastos operativos: servicios, compras menores y otros egresos. Se reflejan en el cierre de caja y dashboard.',
    side: 'right',
    navigateTo: 'expenses',
  })

  // --- Resto de Configuración (ya se mostró antes) ---
  steps.push({
    target: '[data-tutorial="settings-tab-sucursales"]',
    title: 'Sucursales',
    description: 'Si tienes mas de una sede, puedes crear sucursales aqui. Cada una tiene su propio inventario y cajas. Ya tienes una "Sucursal Principal" por defecto.',
    side: 'bottom',
    navigateTo: 'settings',
  })

  steps.push({
    target: '[data-tutorial="settings-tab-usuarios"]',
    title: 'Usuarios',
    description: 'Crea cuentas para tu equipo: cajeros, vendedores y gerentes. Cada rol tiene permisos diferentes sobre las vistas y acciones del sistema.',
    side: 'bottom',
    navigateTo: 'settings',
  })

  steps.push({
    target: '[data-tutorial="settings-tab-roles"]',
    title: 'Permisos por Rol',
    description: 'Personaliza que vistas y acciones puede realizar cada rol segun las necesidades de tu negocio.',
    side: 'bottom',
    navigateTo: 'settings',
  })

  steps.push({
    target: '[data-tutorial="settings-tab-sistema"]',
    title: 'Sistema',
    description: 'Ajusta la duracion de las sesiones de usuario y administra las notificaciones.',
    side: 'bottom',
    navigateTo: 'settings',
  })

  steps.push({
    target: '[data-tutorial="settings-tab-apariencia"]',
    title: 'Apariencia',
    description: 'Personaliza los colores del sistema para que coincidan con la identidad visual de tu negocio.',
    side: 'bottom',
    navigateTo: 'settings',
  })

  // ═══════════════════════════════════════════════════════
  // COMPLETADO
  // ═══════════════════════════════════════════════════════
  steps.push({
    title: 'Tutorial Completado',
    description: 'Tu sistema esta listo para operar. Recuerda: configura datos de empresa, tasa de cambio, crea categorias y productos, abre caja al inicio del turno y cierrala al final. Puedes ver este tutorial de nuevo desde tu menu de perfil.',
    icon: <Store className="h-5 w-5" />,
  })

  return steps
}

function buildGerenteSteps(): TourStep[] {
  const steps: TourStep[] = []

  // FASE 1: Bienvenida
  steps.push({
    title: 'Bienvenido a JO-Administrativo',
    description: 'Hola Gerente. Te mostraremos las funciones principales a las que tienes acceso y como usar el sistema para operar diariamente.',
    icon: <Store className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-sidebar] [data-sidebar="content"]',
    title: 'Menu de Navegacion',
    description: 'Desde aqui accedes a todas las secciones disponibles para tu rol.',
    side: 'right',
  })

  // FASE 2: Productos
  steps.push({
    target: '[data-tutorial="nav-products"]',
    title: 'Productos e Inventario',
    description: 'Aqui puedes crear y gestionar productos, ajustar precios, categorias y monitorea el stock por sucursal. Es importante tener productos registrados para poder vender.',
    side: 'right',
    navigateTo: 'products',
    icon: <Package className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-tutorial="products-new-btn"]',
    title: 'Crear un Producto',
    description: 'Presiona "Nuevo" para registrar un producto con nombre, precio, categoria y stock.',
    side: 'left',
    navigateTo: 'products',
  })

  // FASE 3: Caja
  steps.push({
    target: '[data-tutorial="nav-cash"]',
    title: 'Caja',
    description: 'Para poder vender necesitas una caja abierta. Si no hay una abierta, ve aqui y presiona "Abrir Caja" con el monto inicial del dia.',
    side: 'right',
    navigateTo: 'cash',
    icon: <Wallet className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-tutorial="cash-open-btn"]',
    title: 'Abrir Caja',
    description: 'Haz click aqui para registrar la apertura. Indica el monto inicial y el cajero asignado. Sin caja abierta el Punto de Venta estara bloqueado.',
    side: 'right',
    navigateTo: 'cash',
  })

  // FASE 4: Punto de Venta
  steps.push({
    target: '[data-tutorial="nav-pos"]',
    title: 'Punto de Venta',
    description: 'Con productos y caja abierta, estas listo para vender. Vamos al POS.',
    side: 'right',
    navigateTo: 'pos',
    icon: <ShoppingCart className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-tutorial="pos-search"]',
    title: 'Buscar Productos',
    description: 'Escribe el nombre o usa el scanner de codigo de barras para encontrar productos.',
    side: 'bottom',
    navigateTo: 'pos',
  })

  steps.push({
    target: '[data-tutorial="pos-products"]',
    title: 'Catalogo de Productos',
    description: 'Productos con precio y stock. Haz click para agregar al carrito.',
    side: 'top',
    navigateTo: 'pos',
  })

  steps.push({
    target: '[data-tutorial="pos-pay"]',
    title: 'Boton de Cobrar',
    description: 'Procesa el pago cuando tengas productos: efectivo, punto de venta, transferencia o pago mixto.',
    side: 'left',
    navigateTo: 'pos',
  })

  // FASE 5: Resto
  steps.push({
    target: '[data-tutorial="nav-dashboard"]',
    title: 'Dashboard Financiero',
    description: 'Revisa ingresos, gastos, utilidades y graficas de ventas.',
    side: 'right',
    navigateTo: 'dashboard',
  })

  steps.push({
    target: '[data-tutorial="nav-clients"]',
    title: 'Clientes',
    description: 'Registra clientes y genera estados de cuenta para creditos.',
    side: 'right',
    navigateTo: 'clients',
  })

  steps.push({
    target: '[data-tutorial="nav-suppliers"]',
    title: 'Proveedores',
    description: 'Gestiona proveedores, compras y cuentas por pagar.',
    side: 'right',
    navigateTo: 'suppliers',
  })

  steps.push({
    target: '[data-tutorial="nav-cash"]',
    title: 'Caja (Revisión)',
    description: 'Aquí puedes registrar movimientos, hacer retiros de excedente y cerrar al final del turno.',
    side: 'right',
    navigateTo: 'cash',
  })

  steps.push({
    target: '[data-tutorial="nav-expenses"]',
    title: 'Gastos',
    description: 'Registra gastos operativos. Se reflejan en el cierre de caja y dashboard.',
    side: 'right',
    navigateTo: 'expenses',
  })

  steps.push({
    title: 'Tutorial Completado',
    description: 'Ya conoces las funciones principales. No tienes acceso a Configuracion ni Usuarios, esas son funciones del Administrador. Puedes ver este tutorial de nuevo desde tu menu de perfil.',
    icon: <Store className="h-5 w-5" />,
  })

  return steps
}

function buildCajeroSteps(): TourStep[] {
  const steps: TourStep[] = []

  steps.push({
    title: 'Bienvenido a JO-Administrativo',
    description: 'Hola Cajero. Te mostraremos como usar el Punto de Venta para procesar ventas rapidamente.',
    icon: <Store className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-sidebar] [data-sidebar="content"]',
    title: 'Tu Menu',
    description: 'Como cajero tienes acceso al Punto de Venta y a la seccion de Caja (solo lectura).',
    side: 'right',
  })

  // POS
  steps.push({
    target: '[data-tutorial="nav-pos"]',
    title: 'Punto de Venta',
    description: 'Aqui procesas todas las ventas. Si la caja no esta abierta, veras un mensaje de bloqueo y deberas contactar al administrador.',
    side: 'right',
    navigateTo: 'pos',
    icon: <ShoppingCart className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-tutorial="pos-search"]',
    title: 'Buscar Productos',
    description: 'Escribe el nombre del producto o escanea el codigo de barras para agregarlo a la venta.',
    side: 'bottom',
    navigateTo: 'pos',
  })

  steps.push({
    target: '[data-tutorial="pos-products"]',
    title: 'Productos Disponibles',
    description: 'Haz click en un producto para agregarlo al carrito de la venta. Se muestra el precio y stock disponible.',
    side: 'top',
    navigateTo: 'pos',
  })

  steps.push({
    target: '[data-tutorial="pos-pay"]',
    title: 'Cobrar',
    description: 'Cuando tengas productos en el carrito, presiona aqui para procesar el pago: efectivo, punto de venta, transferencia o pago mixto.',
    side: 'left',
    navigateTo: 'pos',
  })

  // Caja
  steps.push({
    target: '[data-tutorial="nav-cash"]',
    title: 'Tu Caja',
    description: 'Puedes ver el resumen de tu caja abierta y consultar movimientos. Solo el administrador puede abrir, cerrar o hacer movimientos de caja.',
    side: 'right',
    navigateTo: 'cash',
  })

  steps.push({
    title: 'Tutorial Completado',
    description: 'Ya estas listo para procesar ventas. Recuerda: si la caja se cierra, contacta a un administrador. Puedes ver este tutorial de nuevo desde tu menu de perfil.',
    icon: <Store className="h-5 w-5" />,
  })

  return steps
}

function buildVendedorSteps(): TourStep[] {
  const steps: TourStep[] = []

  steps.push({
    title: 'Bienvenido a JO-Administrativo',
    description: 'Hola Vendedor. Te mostraremos como usar el sistema para registrar ventas y gestionar clientes.',
    icon: <Store className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-sidebar] [data-sidebar="content"]',
    title: 'Tu Menu',
    description: 'Como vendedor tienes acceso al Punto de Venta, Productos y Clientes.',
    side: 'right',
  })

  // POS
  steps.push({
    target: '[data-tutorial="nav-pos"]',
    title: 'Punto de Venta',
    description: 'Aqui procesas las ventas. Si no hay caja abierta, veras un mensaje de bloqueo. Contacta a un administrador o gerente para que la abran.',
    side: 'right',
    navigateTo: 'pos',
    icon: <ShoppingCart className="h-5 w-5" />,
  })

  steps.push({
    target: '[data-tutorial="pos-search"]',
    title: 'Buscar Productos',
    description: 'Busca productos por nombre o con el scanner de codigo de barras.',
    side: 'bottom',
    navigateTo: 'pos',
  })

  steps.push({
    target: '[data-tutorial="pos-products"]',
    title: 'Catalogo de Productos',
    description: 'Haz click en un producto para agregarlo al carrito de la venta.',
    side: 'top',
    navigateTo: 'pos',
  })

  steps.push({
    target: '[data-tutorial="pos-pay"]',
    title: 'Cobrar',
    description: 'Procesa el pago: efectivo, punto de venta, transferencia o pago mixto.',
    side: 'left',
    navigateTo: 'pos',
  })

  // Products
  steps.push({
    target: '[data-tutorial="nav-products"]',
    title: 'Productos',
    description: 'Consulta el catalogo completo, precios y stock por sucursal.',
    side: 'right',
    navigateTo: 'products',
    icon: <Package className="h-5 w-5" />,
  })

  // Clients
  steps.push({
    target: '[data-tutorial="nav-clients"]',
    title: 'Clientes',
    description: 'Registra clientes, consulta sus datos y genera estados de cuenta para ventas a credito. Es una de tus funciones principales.',
    side: 'right',
    navigateTo: 'clients',
  })

  steps.push({
    title: 'Tutorial Completado',
    description: 'Ya sabes lo fundamental. Registra clientes, busca productos y procesa ventas. Puedes ver este tutorial de nuevo desde tu menu de perfil.',
    icon: <Store className="h-5 w-5" />,
  })

  return steps
}

// ── Master builder ─────────────────────────────────────

function buildSteps(userRole: string): TourStep[] {
  switch (userRole) {
    case 'admin':
      return buildAdminSteps()
    case 'gerente':
      return buildGerenteSteps()
    case 'cajero':
      return buildCajeroSteps()
    case 'vendedor':
      return buildVendedorSteps()
    default:
      return buildCajeroSteps()
  }
}

// ── Tour Component ─────────────────────────────────────

export function OnboardingTutorial() {
  const setActiveView = useAppStore((s) => s.setActiveView)
  const { user } = useAuth()

  const [isOpen, setIsOpen] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<Rect | null>(null)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; side: string }>({
    top: 0,
    left: 0,
    side: 'bottom',
  })

  const stepsRef = useRef<TourStep[]>([])
  const waitForViewRef = useRef(false)

  const role = user?.role || 'cajero'
  const steps = stepsRef.current
  const currentStep = steps[stepIndex]
  const totalSteps = steps.length
  const isFirst = stepIndex === 0
  const isLast = stepIndex === totalSteps - 1
  const hasTarget = !!currentStep?.target

  // ── Highlight logic ──────────────────────────────────

  const updateHighlight = useCallback((step: TourStep) => {
    if (!step.target) {
      setTargetRect(null)
      setPopoverPos({ top: window.innerHeight / 2, left: window.innerWidth / 2, side: 'bottom' })
      return
    }

    // Try to find the element, retry if view hasn't loaded yet
    let el = findElement(step.target)
    if (!el) {
      // Element not found — might need a frame to render after view change
      requestAnimationFrame(() => {
        el = findElement(step.target!)
        if (el) {
          const rect = getTargetRect(el)
          setTargetRect(rect)
          positionPopover(rect, step.side || 'bottom')
        }
      })
      return
    }

    // Small delay to let scrollIntoView finish
    setTimeout(() => {
      const rect = getTargetRect(el!)
      setTargetRect(rect)
      positionPopover(rect, step.side || 'bottom')
    }, 100)
  }, [])

  function positionPopover(rect: Rect, side: string) {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const popoverW = 360
    const popoverH = 240 // approximate
    const gap = 12

    let top = 0
    let left = 0
    const resolvedSide = side

    switch (side) {
      case 'right': {
        left = rect.right + gap
        top = rect.top + rect.height / 2 - popoverH / 2
        // If doesn't fit on right, go left
        if (left + popoverW > vw - 16) {
          left = rect.left - popoverW - gap
        }
        break
      }
      case 'left': {
        left = rect.left - popoverW - gap
        top = rect.top + rect.height / 2 - popoverH / 2
        if (left < 16) {
          left = rect.right + gap
        }
        break
      }
      case 'bottom': {
        left = rect.left + rect.width / 2 - popoverW / 2
        top = rect.bottom + gap
        if (top + popoverH > vh - 16) {
          top = rect.top - popoverH - gap
        }
        break
      }
      case 'top': {
        left = rect.left + rect.width / 2 - popoverW / 2
        top = rect.top - popoverH - gap
        if (top < 16) {
          top = rect.bottom + gap
        }
        break
      }
    }

    // Clamp to viewport
    left = Math.max(16, Math.min(left, vw - popoverW - 16))
    top = Math.max(16, Math.min(top, vh - popoverH - 16))

    setPopoverPos({ top, left, side: resolvedSide })
  }

  // ── Navigation ───────────────────────────────────────

  const goToStep = useCallback((index: number) => {
    if (index < 0 || index >= steps.length) return

    const step = steps[index]

    // Navigate to the required view first
    if (step.navigateTo) {
      const currentView = useAppStore.getState().activeView
      if (currentView !== step.navigateTo) {
        setActiveView(step.navigateTo)
        // Wait for the view to render, then highlight
        waitForViewRef.current = true
        setStepIndex(index)
        return
      }
    }

    setStepIndex(index)
    updateHighlight(step)
  }, [steps, setActiveView, updateHighlight])

  // When step index changes and we're NOT waiting for a view, highlight
  useEffect(() => {
    if (!isOpen) return
    if (waitForViewRef.current) {
      // Wait for the view to render (give it time to mount)
      const timer = setTimeout(() => {
        waitForViewRef.current = false
        const step = steps[stepIndex]
        if (step) updateHighlight(step)
      }, 350)
      return () => clearTimeout(timer)
    }
    const step = steps[stepIndex]
    if (step) updateHighlight(step)
  }, [stepIndex, isOpen, steps, updateHighlight])

  // Recalculate on resize
  useEffect(() => {
    if (!isOpen || !hasTarget) return
    const handleResize = () => {
      const step = steps[stepIndex]
      if (step?.target) updateHighlight(step)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isOpen, stepIndex, steps, hasTarget, updateHighlight])

  // ── Start / Stop ─────────────────────────────────────

  const startTour = useCallback(() => {
    stepsRef.current = buildSteps(role)
    setStepIndex(0)
    setIsOpen(true)
  }, [role])

  const stopTour = useCallback(() => {
    localStorage.setItem('jo-admin-tutorial-completed', 'true')
    setIsOpen(false)
    setTargetRect(null)
  }, [])

  // Auto-start on first visit
  useEffect(() => {
    const completed = localStorage.getItem('jo-admin-tutorial-completed')
    if (!completed) {
      const timer = setTimeout(() => {
        stepsRef.current = buildSteps(role)
        setStepIndex(0)
        setIsOpen(true)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [role])

  // Expose restart function
  useEffect(() => {
    ;(window as unknown as Record<string, () => void>).__restartTutorial = startTour
    return () => {
      const w = window as unknown as Record<string, () => void>
      delete w.__restartTutorial
    }
  }, [startTour])

  if (!isOpen || !currentStep) return null

  // ── Render ───────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      {/* Overlay with spotlight hole */}
      <svg className="absolute inset-0 w-full h-full pointer-events-auto" aria-hidden="true">
        <defs>
          <mask id="tour-spotlight">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left}
                y={targetRect.top}
                width={targetRect.width}
                height={targetRect.height}
                rx="8"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.65)"
          mask="url(#tour-spotlight)"
        />
      </svg>

      {/* Highlighted element border glow */}
      {targetRect && (
        <div
          className="absolute rounded-lg border-2 border-white/80 shadow-[0_0_0_4px_rgba(59,130,246,0.5)] transition-all duration-300 pointer-events-none"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
          }}
        />
      )}

      {/* Popover */}
      <div
        className={cn(
          'absolute z-[10000] pointer-events-auto w-[360px] rounded-xl border bg-popover p-5 shadow-2xl transition-all duration-300',
          !hasTarget && 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
        )}
        style={
          hasTarget
            ? { top: popoverPos.top, left: popoverPos.left }
            : undefined
        }
      >
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-muted rounded-t-xl overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>

        {/* Close button */}
        <button
          onClick={stopTour}
          className="absolute top-3 right-3 h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Content */}
        <div className="flex items-start gap-3">
          {currentStep.icon && (
            <div className="flex-shrink-0 rounded-lg bg-primary/10 p-2 text-primary mt-0.5">
              {currentStep.icon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold pr-6">{currentStep.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mt-1.5">
              {currentStep.description}
            </p>
          </div>
        </div>

        {/* Step dots */}
        <div className="flex items-center gap-1.5 mt-4">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => goToStep(i)}
              className={cn(
                'h-1.5 rounded-full transition-all duration-200',
                i === stepIndex
                  ? 'w-4 bg-primary'
                  : 'w-1.5 bg-muted-foreground/25 hover:bg-muted-foreground/50'
              )}
            />
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {stepIndex + 1} / {totalSteps}
          </span>
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between mt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={stopTour}
            className="text-xs text-muted-foreground h-8"
          >
            Omitir
          </Button>
          <div className="flex gap-2">
            {!isFirst && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToStep(stepIndex - 1)}
                className="h-8"
              >
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                Atras
              </Button>
            )}
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 text-white h-8"
              onClick={() => {
                if (isLast) {
                  stopTour()
                } else {
                  goToStep(stepIndex + 1)
                }
              }}
            >
              {isLast ? 'Finalizar' : 'Siguiente'}
              {!isLast && <ArrowRight className="ml-1 h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Public API ─────────────────────────────────────────

export function startTutorial() {
  if (typeof window !== 'undefined') {
    const w = window as unknown as Record<string, () => void>
    if (w.__restartTutorial) {
      w.__restartTutorial()
    } else {
      localStorage.removeItem('jo-admin-tutorial-completed')
      window.location.reload()
    }
  }
}
