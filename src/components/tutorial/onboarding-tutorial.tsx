'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  ArrowRight,
  ShoppingCart,
  LayoutDashboard,
  Package,
  Users,
  Building2,
  Wallet,
  Receipt,
  Settings,
  Sparkles,
  CreditCard,
  BarChart3,
  Store,
  DollarSign,
} from 'lucide-react'

const iconMap: Record<string, React.ElementType> = {
  ShoppingCart,
  LayoutDashboard,
  Package,
  Users,
  Building2,
  Wallet,
  Receipt,
  Settings,
  Sparkles,
  CreditCard,
  BarChart3,
  Store,
  DollarSign,
}

interface TutorialStep {
  title: string
  description: string
  tips: string[]
  icon: string
  accent?: string
}

const steps: TutorialStep[] = [
  {
    title: '¡Bienvenido a JO-Administrativo!',
    description: 'Tu sistema integral para gestionar ventas, inventario, finanzas y más. En pocos pasos conocerás todo lo que puedes hacer.',
    tips: [
      'Este tutorial te guiará por las principales funciones del sistema.',
      'Puedes navegar entre pasos con los botones o los puntos indicadores.',
      'Puedes omitir el tutorial y volver a verlo cuando quieras.',
    ],
    icon: 'Sparkles',
    accent: 'bg-primary/10 text-primary',
  },
  {
    title: 'Punto de Venta (POS)',
    description: 'El corazón del sistema. Aquí procesas todas tus ventas de forma rápida y sencilla.',
    tips: [
      'Busca productos por nombre, marca o escanea el código de barras.',
      'Modifica cantidades directamente desde el carrito lateral.',
      'Cobra en efectivo, con punto de venta, transferencia o pago mixto.',
      'El sistema calcula el cambio automáticamente.',
      'Se genera recibo e invoice para cada venta completada.',
    ],
    icon: 'ShoppingCart',
    accent: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  },
  {
    title: 'Productos e Inventario',
    description: 'Gestiona todo tu catálogo de productos con control de stock por sucursal.',
    tips: [
      'Crea productos con nombre, precio, categoría y código de barras.',
      'Establece precios diferentes por sucursal si lo necesitas.',
      'Filtra y busca productos rápidamente desde la tabla.',
      'Las alertas de stock bajo te avisan cuando un producto se está agotando.',
      'Organiza tus productos con categorías desde Configuración.',
    ],
    icon: 'Package',
    accent: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  },
  {
    title: 'Clientes y Proveedores',
    description: 'Mantén un registro completo de tus clientes y proveedores con información de contacto.',
    tips: [
      'Registra clientes para vincularlos a las ventas y generar estados de cuenta.',
      'Gestiona proveedores para registrar compras y cuentas por pagar.',
      'Puedes registrar pagos parciales y ver el saldo pendiente.',
      'Filtra por nombre, RIF o estado para encontrar rápidamente.',
    ],
    icon: 'Users',
    accent: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
  },
  {
    title: 'Caja y Finanzas',
    description: 'Controla el flujo de dinero con aperturas y cierres de caja, registro de gastos y seguimiento financiero.',
    tips: [
      'Abre la caja al inicio del turno — es obligatorio para poder vender.',
      'Registra gastos (servicios, compras menores) con categoría y concepto.',
      'Al cerrar la caja se genera un resumen: ventas, gastos, retiros y saldo.',
      'El Dashboard te muestra el panorama financiero completo con gráficos.',
    ],
    icon: 'Wallet',
    accent: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  },
  {
    title: 'Dashboard Financiero',
    description: 'Tu centro de control con métricas clave, tendencias y alertas del negocio.',
    tips: [
      'Visualiza ingresos, gastos y utilidades del período seleccionado.',
      'Compara ventas entre sucursales si manejas más de una.',
      'Las gráficas se actualizan con los datos más recientes.',
      'Las alertas te notifican sobre vencimientos y stock bajo.',
    ],
    icon: 'BarChart3',
    accent: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400',
  },
  {
    title: 'Configuración',
    description: 'Personaliza el sistema a la medida de tu negocio. Solo disponible para administradores.',
    tips: [
      'Configura los datos de tu empresa: nombre, RIF, logo y contacto.',
      'Actualiza las tasas de cambio (USD/EUR) con un solo clic.',
      'Gestiona usuarios y asigna roles con permisos personalizados.',
      'Crea categorías para organizar tus productos.',
      'Activa IVA y define la tasa según tu actividad económica.',
      'Personaliza los colores del sistema con la paleta de tu marca.',
    ],
    icon: 'Settings',
    accent: 'bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400',
  },
  {
    title: '¡Listo para comenzar!',
    description: 'Ya conoces lo esencial. Recuerda que puedes volver a ver este tutorial cuando quieras desde el menú.',
    tips: [
      'Selecciona una vista del menú lateral para empezar a trabajar.',
      'Si tienes dudas, revisa este tutorial nuevamente.',
      '¡Éxitos con tu negocio!',
    ],
    icon: 'Sparkles',
    accent: 'bg-primary/10 text-primary',
  },
]

interface OnboardingTutorialProps {
  onComplete?: () => void
}

export function OnboardingTutorial({ onComplete }: OnboardingTutorialProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    const completed = localStorage.getItem('jo-admin-tutorial-completed')
    if (!completed) {
      const timer = setTimeout(() => {
        setIsOpen(true)
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleComplete = useCallback(() => {
    localStorage.setItem('jo-admin-tutorial-completed', 'true')
    setIsOpen(false)
    onComplete?.()
  }, [onComplete])

  const restartTutorial = useCallback(() => {
    localStorage.removeItem('jo-admin-tutorial-completed')
    setCurrentStep(0)
    setIsOpen(true)
  }, [])

  useEffect(() => {
    ;(window as unknown as Record<string, () => void>).__restartTutorial = restartTutorial
    return () => {
      const w = window as unknown as Record<string, () => void>
      delete w.__restartTutorial
    }
  }, [restartTutorial])

  if (!isOpen) return null

  const step = steps[currentStep]
  const StepIcon = iconMap[step.icon] || Sparkles
  const progress = ((currentStep + 1) / steps.length) * 100

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && handleComplete()}>
      <DialogContent className="sm:max-w-lg z-[100] showCloseButton-false" showCloseButton={false}>
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-muted rounded-t-lg overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 ease-out rounded-t-lg"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Icon + Title */}
        <div className="flex flex-col items-center text-center pt-4">
          <div className={cn('inline-flex items-center justify-center h-14 w-14 rounded-2xl mb-4', step.accent)}>
            <StepIcon className="h-7 w-7" />
          </div>
          <DialogHeader className="items-center">
            <DialogTitle className="text-lg">{step.title}</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed max-w-sm">
              {step.description}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Tips list */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-2.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Qué puedes hacer</p>
          {step.tips.map((tip, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="shrink-0 mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
              <p className="text-sm text-foreground leading-relaxed">{tip}</p>
            </div>
          ))}
        </div>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-1.5">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentStep(i)}
              className={cn(
                'h-1.5 rounded-full transition-all duration-200',
                i === currentStep
                  ? 'w-5 bg-primary'
                  : 'w-1.5 bg-muted-foreground/25 hover:bg-muted-foreground/50'
              )}
            />
          ))}
        </div>

        {/* Navigation */}
        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={handlePrev} disabled={currentStep === 0} className="text-muted-foreground">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Atrás
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleComplete} className="text-muted-foreground">
              Omitir
            </Button>
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 text-white"
              onClick={handleNext}
            >
              {currentStep === steps.length - 1 ? 'Comenzar' : 'Siguiente'}
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
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
