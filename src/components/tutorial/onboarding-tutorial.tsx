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
import { ArrowLeft, ArrowRight, X } from 'lucide-react'

interface TutorialStep {
  title: string
  description: string
  targetId?: string
}

const steps: TutorialStep[] = [
  {
    title: '¡Bienvenido a JO-Administrativo!',
    description: 'Tu sistema ERP/POS integral para gestionar ventas, inventario, finanzas y más. Te guiaremos por las principales funcionalidades.',
  },
  {
    title: 'Navegación con el Menú Lateral',
    description: 'Usa el menú lateral para navegar entre las diferentes secciones del sistema. En dispositivos móviles, toca el ícono de hamburguesa.',
    targetId: 'app-sidebar',
  },
  {
    title: 'Punto de Venta (POS)',
    description: 'Aquí es donde procesas las ventas. Busca productos por nombre o SKU, agrégalos al carrito y cobra con diferentes métodos de pago.',
    targetId: 'pos-view',
  },
  {
    title: 'Gestión de Productos',
    description: 'Administra tu inventario: crea productos, establece precios, gestiona categorías y monitorea el stock disponible.',
    targetId: 'products-view',
  },
  {
    title: 'Dashboard Financiero',
    description: 'Obtén una vista general de tus finanzas: ingresos, gastos, utilidades, tendencias de ventas y alertas importantes.',
    targetId: 'dashboard-view',
  },
  {
    title: 'Configuración del Sistema',
    description: 'Personaliza tu sistema: datos de la empresa, monedas, usuarios, roles y apariencia visual. (Solo disponible para administradores)',
    targetId: 'settings-view',
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

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && handleComplete()}>
      <DialogContent className="sm:max-w-md z-[100]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg">{step.title}</DialogTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleComplete}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <DialogDescription className="text-sm leading-relaxed">
            {step.description}
          </DialogDescription>
        </DialogHeader>

        {/* Progress Dots */}
        <div className="flex items-center justify-center gap-2 py-2">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentStep(i)}
              className={cn(
                'h-2 rounded-full transition-all',
                i === currentStep
                  ? 'w-6 bg-emerald-600'
                  : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
              )}
            />
          ))}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
          <Button variant="ghost" onClick={handlePrev} disabled={currentStep === 0}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Atrás
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleComplete}>
              Omitir
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleNext}
            >
              {currentStep === steps.length - 1 ? 'Finalizar' : 'Siguiente'}
              <ArrowRight className="ml-1 h-4 w-4" />
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
