'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppStore } from '@/stores/use-app-store'
import { useAuth } from '@/hooks/use-auth'
import { canAccessView } from '@/lib/permissions'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
}

// ── Step definitions ────────────────────────────────────

function buildSteps(userRole: string): TourStep[] {
  const steps: TourStep[] = []

  steps.push({
    title: 'Bienvenido a JO-Administrativo',
    description: 'Te guiaremos por las principales funciones del sistema. Sigue los pasos y te iremos destacando cada sección.',
  })

  steps.push({
    target: '[data-sidebar] [data-sidebar="content"]',
    title: 'Menu de Navegacion',
    description: 'Desde aqui accedes a todas las secciones del sistema. Cada boton te lleva a una vista diferente.',
    side: 'right',
  })

  steps.push({
    target: '[data-tutorial="nav-pos"]',
    title: 'Punto de Venta',
    description: 'Hace click para ir al POS. Es donde procesas todas las ventas diarias.',
    side: 'right',
    navigateTo: 'pos',
  })

  steps.push({
    target: '[data-tutorial="pos-search"]',
    title: 'Buscar Productos',
    description: 'Escribe el nombre o marca del producto para encontrarlo rapido. Tambien puedes escanear el codigo de barras.',
    side: 'bottom',
    navigateTo: 'pos',
  })

  steps.push({
    target: '[data-tutorial="pos-pay"]',
    title: 'Boton de Cobrar',
    description: 'Cuando tengas productos en el carrito, presiona aqui para procesar el pago: efectivo, punto de venta, transferencia o pago mixto.',
    side: 'left',
    navigateTo: 'pos',
  })

  if (canAccessView(userRole, 'dashboard')) {
    steps.push({
      target: '[data-tutorial="nav-dashboard"]',
      title: 'Dashboard Financiero',
      description: 'Aqui ves el panorama completo: ingresos, gastos, utilidades y graficas de ventas.',
      side: 'right',
      navigateTo: 'dashboard',
    })
  }

  if (canAccessView(userRole, 'products')) {
    steps.push({
      target: '[data-tutorial="nav-products"]',
      title: 'Productos e Inventario',
      description: 'Gestiona tu catalogo: crea productos, ajusta precios, categorias y monitorea el stock por sucursal.',
      side: 'right',
      navigateTo: 'products',
    })
  }

  if (canAccessView(userRole, 'clients')) {
    steps.push({
      target: '[data-tutorial="nav-clients"]',
      title: 'Clientes',
      description: 'Registra clientes, vincularlos a ventas y generar estados de cuenta para control de pagos.',
      side: 'right',
      navigateTo: 'clients',
    })
  }

  if (canAccessView(userRole, 'suppliers')) {
    steps.push({
      target: '[data-tutorial="nav-suppliers"]',
      title: 'Proveedores',
      description: 'Gestiona proveedores, registra compras y controla cuentas por pagar con pagos parciales.',
      side: 'right',
      navigateTo: 'suppliers',
    })
  }

  if (canAccessView(userRole, 'cash')) {
    steps.push({
      target: '[data-tutorial="nav-cash"]',
      title: 'Caja',
      description: 'Abre caja al inicio del turno, registra gastos y cierra al final para ver el resumen completo.',
      side: 'right',
      navigateTo: 'cash',
    })
  }

  if (canAccessView(userRole, 'expenses')) {
    steps.push({
      target: '[data-tutorial="nav-expenses"]',
      title: 'Gastos',
      description: 'Registra gastos operativos: servicios, compras menores. Se reflejan en el cierre de caja y dashboard.',
      side: 'right',
      navigateTo: 'expenses',
    })
  }

  if (canAccessView(userRole, 'settings')) {
    steps.push({
      target: '[data-tutorial="nav-settings"]',
      title: 'Configuracion',
      description: 'Personaliza el sistema: datos de la empresa, tasas de cambio, usuarios, roles, categorias, IVA y colores.',
      side: 'right',
      navigateTo: 'settings',
    })
  }

  steps.push({
    title: 'Tutorial Completado',
    description: 'Ya conoces lo principal. Puedes volver a ver este tutorial cuando quieras desde tu menu de perfil.',
  })

  return steps
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
    const popoverW = 340
    const popoverH = 200 // approximate
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
      }, 300)
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
        className="absolute z-[10000] pointer-events-auto w-[340px] rounded-xl border bg-popover p-5 shadow-2xl transition-all duration-300"
        style={{
          top: popoverPos.top,
          left: popoverPos.left,
        }}
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
        <h3 className="text-base font-semibold pr-6">{currentStep.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed mt-2">
          {currentStep.description}
        </p>

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
