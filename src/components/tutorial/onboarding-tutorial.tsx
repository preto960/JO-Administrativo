'use client'

import { useEffect, useCallback } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useAppStore } from '@/stores/use-app-store'
import { useAuth } from '@/hooks/use-auth'
import { canAccessView } from '@/lib/permissions'

let driverObj: ReturnType<typeof driver> | null = null

function getSteps(userRole: string) {
  const steps: Array<{
    element?: string
    popover: {
      title: string
      description: string
      side?: 'top' | 'bottom' | 'left' | 'right'
      align?: 'start' | 'center' | 'end'
    }
  }> = []

  // Step 0: Welcome (popover without element)
  steps.push({
    popover: {
      title: '¡Bienvenido a JO-Administrativo! 🎉',
      description: 'Te guiaremos por las principales funciones del sistema. Seguimos los pasos destacando cada sección.',
      side: 'bottom',
      align: 'center',
    },
  })

  // Step 1: Sidebar menu
  steps.push({
    element: '[data-sidebar] [data-sidebar="content"]',
    popover: {
      title: 'Menú de Navegación',
      description: 'Desde aquí accedes a todas las secciones del sistema. Cada botón te lleva a una vista diferente.',
      side: 'right',
      align: 'start',
    },
  })

  // Step 2: POS nav button
  steps.push({
    element: '[data-tutorial="nav-pos"]',
    popover: {
      title: 'Punto de Venta',
      description: 'Hacé click para ir al POS — es donde procesas todas las ventas. Te llevaré ahí ahora...',
      side: 'right',
      align: 'start',
    },
  })

  // Step 3: POS search (only if we navigated to pos)
  steps.push({
    element: '[data-tutorial="pos-search"]',
    popover: {
      title: 'Buscar Productos',
      description: 'Escribí el nombre o marca del producto para encontrarlo rápidamente. También podés escanear el código de barras.',
      side: 'bottom',
      align: 'start',
    },
  })

  // Step 4: POS pay button
  steps.push({
    element: '[data-tutorial="pos-pay"]',
    popover: {
      title: 'Botón de Cobrar',
      description: 'Cuando tengas productos en el carrito, presioná acá para procesar el pago con diferentes métodos: efectivo, punto de venta, transferencia o pago mixto.',
      side: 'left',
      align: 'end',
    },
  })

  // Step 5: Dashboard
  if (canAccessView(userRole, 'dashboard')) {
    steps.push({
      element: '[data-tutorial="nav-dashboard"]',
      popover: {
        title: 'Dashboard Financiero',
        description: 'Acá ves el panorama completo: ingresos, gastos, utilidades y gráficas de tus ventas. Hacé click para verlo.',
        side: 'right',
        align: 'start',
      },
    })
  }

  // Step 6: Products
  if (canAccessView(userRole, 'products')) {
    steps.push({
      element: '[data-tutorial="nav-products"]',
      popover: {
        title: 'Productos e Inventario',
        description: 'Gestioná tu catálogo: creá productos, ajustá precios, categorías y monitoreá el stock disponible por sucursal.',
        side: 'right',
        align: 'start',
      },
    })
  }

  // Step 7: Clients
  if (canAccessView(userRole, 'clients')) {
    steps.push({
      element: '[data-tutorial="nav-clients"]',
      popover: {
        title: 'Clientes',
        description: 'Registra tus clientes, vinculalos a ventas y genera estados de cuenta para control de pagos.',
        side: 'right',
        align: 'start',
      },
    })
  }

  // Step 8: Suppliers
  if (canAccessView(userRole, 'suppliers')) {
    steps.push({
      element: '[data-tutorial="nav-suppliers"]',
      popover: {
        title: 'Proveedores',
        description: 'Gestioná tus proveedores, registrá compras y controlá cuentas por pagar con pagos parciales.',
        side: 'right',
        align: 'start',
      },
    })
  }

  // Step 9: Cash
  if (canAccessView(userRole, 'cash')) {
    steps.push({
      element: '[data-tutorial="nav-cash"]',
      popover: {
        title: 'Caja',
        description: 'Abrí caja al inicio del turno, registrá gastos y cerrá al final para ver el resumen completo.',
        side: 'right',
        align: 'start',
      },
    })
  }

  // Step 10: Expenses
  if (canAccessView(userRole, 'expenses')) {
    steps.push({
      element: '[data-tutorial="nav-expenses"]',
      popover: {
        title: 'Gastos',
        description: 'Registra gastos operativos: servicios, compras menores, pagos varios. Se reflejan en el cierre de caja y dashboard.',
        side: 'right',
        align: 'start',
      },
    })
  }

  // Step 11: Settings (if admin)
  if (canAccessView(userRole, 'settings')) {
    steps.push({
      element: '[data-tutorial="nav-settings"]',
      popover: {
        title: 'Configuración',
        description: 'Personalizá el sistema: datos de la empresa, tasas de cambio, usuarios, roles, categorías, IVA y colores.',
        side: 'right',
        align: 'start',
      },
    })
  }

  // Step 12: Done
  steps.push({
    popover: {
      title: '¡Tutorial Completado! 🚀',
      description: 'Ya conocés lo principal. Podés volver a ver este tutorial cuando quieras desde el menú de tu perfil (Ver Tutorial).',
      side: 'bottom',
      align: 'center',
    },
  })

  return steps
}

export function OnboardingTutorial() {
  const setActiveView = useAppStore((s) => s.setActiveView)
  const { user } = useAuth()

  const startTour = useCallback(() => {
    if (driverObj) {
      driverObj.destroy()
    }

    const role = user?.role || 'cajero'

    driverObj = driver({
      showProgress: true,
      animate: true,
      overlayColor: '0, 0, 0, 0.65',
      stagePadding: 8,
      stageRadius: 8,
      popoverClass: 'driverjs-theme',
      nextBtnText: 'Siguiente →',
      prevBtnText: '← Atrás',
      doneBtnText: 'Finalizar',
      progressText: '{{current}} de {{total}}',
      disableActiveInteraction: false,
      allowClose: true,
      onHighlightStarted: (element, step, opts) => {
        // When highlighting POS nav button, navigate to POS
        if (step.popover.title === 'Punto de Venta') {
          setActiveView('pos')
        }
        // When highlighting dashboard nav button, navigate there
        if (step.popover.title === 'Dashboard Financiero') {
          setActiveView('dashboard')
        }
        // Return false to allow the highlight (we handle navigation ourselves)
        return true
      },
      onDestroyed: () => {
        localStorage.setItem('jo-admin-tutorial-completed', 'true')
        driverObj = null
      },
    })

    driverObj.setSteps(getSteps(role))
    driverObj.drive()
  }, [user?.role, setActiveView])

  useEffect(() => {
    const completed = localStorage.getItem('jo-admin-tutorial-completed')
    if (!completed) {
      const timer = setTimeout(() => {
        startTour()
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [startTour])

  // Expose restart function globally
  useEffect(() => {
    ;(window as unknown as Record<string, () => void>).__restartTutorial = startTour
    return () => {
      const w = window as unknown as Record<string, () => void>
      delete w.__restartTutorial
    }
  }, [startTour])

  // This component renders nothing — driver.js handles its own UI
  return null
}

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
