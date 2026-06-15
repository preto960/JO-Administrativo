'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useCurrency } from '@/hooks/use-currency'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { Plus, Pencil, Trash2, Loader2, DollarSign, CalendarDays, Tag } from 'lucide-react'
import { toast } from 'sonner'

type DurationType = '1_mes' | 'bimestral' | 'anual' | 'dia' | 'otro'

const DURATION_OPTIONS: { value: DurationType; label: string; icon: string }[] = [
  { value: '1_mes', label: '1 Mes', icon: '30' },
  { value: 'bimestral', label: 'Bimestral', icon: '2M' },
  { value: 'anual', label: 'Anual', icon: '1A' },
  { value: 'dia', label: 'Día', icon: '1D' },
  { value: 'otro', label: 'Otro', icon: '?' },
]

function getDurationLabel(type: DurationType, days?: number | null): string {
  switch (type) {
    case '1_mes': return '1 Mes (30 días)'
    case 'bimestral': return 'Bimestral (60 días)'
    case 'anual': return 'Anual (365 días)'
    case 'dia': return '1 Día'
    case 'otro': return `${days || 0} días`
    default: return type
  }
}

interface Plan {
  id: string
  name: string
  durationType: string
  durationDays: number | null
  cost: number
  description: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export function PlansTab() {
  const { fmt } = useCurrency()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Form state
  const [formName, setFormName] = useState('')
  const [formDurationType, setFormDurationType] = useState<DurationType>('1_mes')
  const [formCustomDays, setFormCustomDays] = useState('')
  const [formCost, setFormCost] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formActive, setFormActive] = useState(true)

  const fetchPlans = async () => {
    try {
      const data = await api.get<Plan[]>('/api/plans')
      setPlans(data)
    } catch {
      toast.error('Error al cargar planes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPlans() }, [])

  const resetForm = () => {
    setFormName('')
    setFormDurationType('1_mes')
    setFormCustomDays('')
    setFormCost('')
    setFormDescription('')
    setFormActive(true)
  }

  const openCreate = () => {
    setEditingPlan(null)
    resetForm()
    setShowDialog(true)
  }

  const openEdit = (plan: Plan) => {
    setEditingPlan(plan)
    setFormName(plan.name)
    setFormDurationType(plan.durationType as DurationType)
    setFormCustomDays(plan.durationDays ? String(plan.durationDays) : '')
    setFormCost(plan.cost ? String(plan.cost) : '')
    setFormDescription(plan.description || '')
    setFormActive(plan.active)
    setShowDialog(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    if (formDurationType === 'otro' && (!formCustomDays || Number(formCustomDays) <= 0)) {
      toast.error('Especifica la cantidad de días')
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: formName.trim(),
        durationType: formDurationType,
        durationDays: formDurationType === 'otro' ? Number(formCustomDays) : null,
        cost: Number(formCost) || 0,
        description: formDescription.trim() || null,
      }

      if (editingPlan) {
        await api.put('/api/plans', { ...payload, id: editingPlan.id, active: formActive })
        toast.success('Plan actualizado')
      } else {
        await api.post('/api/plans', payload)
        toast.success('Plan creado')
      }
      setShowDialog(false)
      fetchPlans()
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error al guardar'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.del(`/api/plans?id=${deleteTarget.id}`)
      toast.success('Plan eliminado')
      fetchPlans()
    } catch {
      toast.error('Error al eliminar plan')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  const handleToggleActive = async (plan: Plan) => {
    try {
      await api.put('/api/plans', {
        id: plan.id,
        name: plan.name,
        durationType: plan.durationType,
        durationDays: plan.durationDays,
        cost: plan.cost,
        description: plan.description,
        active: !plan.active,
      })
      fetchPlans()
    } catch {
      toast.error('Error al cambiar estado')
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-base">Planes de Membresía</CardTitle>
            <CardDescription>Configura los planes disponibles para asignar a los clientes</CardDescription>
          </div>
          <Button onClick={openCreate} size="sm">
            <Plus className="mr-2 h-4 w-4" /> Nuevo Plan
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Tag className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No hay planes configurados</p>
              <p className="text-xs mt-1">Crea tu primer plan para empezar a asignarlo a clientes</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Duración</TableHead>
                    <TableHead>Costo</TableHead>
                    <TableHead className="hidden md:table-cell">Descripción</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-[100px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map((plan) => (
                    <TableRow key={plan.id} className={!plan.active ? 'opacity-50' : ''}>
                      <TableCell className="font-medium">{plan.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm">
                          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                          {getDurationLabel(plan.durationType as DurationType, plan.durationDays)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm font-semibold">
                          <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                          {fmt(plan.cost)}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[250px] truncate">
                        {plan.description || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-[10px] ${
                            plan.active
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                              : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                          }`}
                        >
                          {plan.active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Switch
                            checked={plan.active}
                            onCheckedChange={() => handleToggleActive(plan)}
                            className="scale-75"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => openEdit(plan)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                            onClick={() => setDeleteTarget(plan)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPlan ? 'Editar Plan' : 'Nuevo Plan'}</DialogTitle>
            <DialogDescription>
              {editingPlan ? 'Modifica los datos del plan' : 'Configura un nuevo plan de membresía'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Nombre */}
            <div className="space-y-2">
              <Label htmlFor="plan-name">Nombre del Plan *</Label>
              <Input
                id="plan-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ej: Mensual, Trimestral, Premium..."
              />
            </div>

            {/* Duración - Quick Select */}
            <div className="space-y-2">
              <Label>Duración *</Label>
              <div className="flex flex-wrap gap-2">
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormDurationType(opt.value)}
                    className={`
                      flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                      border-2 transition-all duration-150
                      ${formDurationType === opt.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-gray-500'
                      }
                    `}
                  >
                    <span className={`
                      flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold
                      ${formDurationType === opt.value
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                      }
                    `}>
                      {opt.icon}
                    </span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom days (only when "Otro" selected) */}
            {formDurationType === 'otro' && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <Label htmlFor="plan-custom-days">Cantidad de días *</Label>
                <Input
                  id="plan-custom-days"
                  type="number"
                  min={1}
                  value={formCustomDays}
                  onChange={(e) => setFormCustomDays(e.target.value)}
                  placeholder="Ej: 45, 90, 120..."
                />
                <p className="text-xs text-muted-foreground">
                  Ingresa la cantidad de días que durará el plan
                </p>
              </div>
            )}

            {/* Costo */}
            <div className="space-y-2">
              <Label htmlFor="plan-cost">Costo del Plan *</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="plan-cost"
                  type="number"
                  min={0}
                  step={0.01}
                  value={formCost}
                  onChange={(e) => setFormCost(e.target.value)}
                  placeholder="0.00"
                  className="pl-9"
                />
              </div>
            </div>

            {/* Descripción */}
            <div className="space-y-2">
              <Label htmlFor="plan-desc">Descripción</Label>
              <Input
                id="plan-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Descripción opcional del plan..."
              />
            </div>

            {/* Active toggle (only on edit) */}
            {editingPlan && (
              <div className="flex items-center gap-3">
                <Switch
                  id="plan-active"
                  checked={formActive}
                  onCheckedChange={setFormActive}
                />
                <Label htmlFor="plan-active" className="cursor-pointer">Plan activo</Label>
              </div>
            )}

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {saving ? 'Guardando...' : editingPlan ? 'Actualizar Plan' : 'Crear Plan'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Plan</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de eliminar el plan &quot;{deleteTarget?.name}&quot;? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}