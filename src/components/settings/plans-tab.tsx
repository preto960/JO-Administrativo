'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
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
import { Plus, Pencil, Trash2, Loader2, Clock, Tag } from 'lucide-react'
import { toast } from 'sonner'

interface Plan {
  id: string
  name: string
  duration: string
  description: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export function PlansTab() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [formName, setFormName] = useState('')
  const [formDuration, setFormDuration] = useState('')
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

  const openCreate = () => {
    setEditingPlan(null)
    setFormName('')
    setFormDuration('')
    setFormDescription('')
    setFormActive(true)
    setShowDialog(true)
  }

  const openEdit = (plan: Plan) => {
    setEditingPlan(plan)
    setFormName(plan.name)
    setFormDuration(plan.duration)
    setFormDescription(plan.description || '')
    setFormActive(plan.active)
    setShowDialog(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    if (!formDuration.trim()) {
      toast.error('La duración es obligatoria')
      return
    }

    setSaving(true)
    try {
      if (editingPlan) {
        await api.put('/api/plans', {
          id: editingPlan.id,
          name: formName.trim(),
          duration: formDuration.trim(),
          description: formDescription.trim() || null,
          active: formActive,
        })
        toast.success('Plan actualizado')
      } else {
        await api.post('/api/plans', {
          name: formName.trim(),
          duration: formDuration.trim(),
          description: formDescription.trim() || null,
        })
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
        duration: plan.duration,
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
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          {plan.duration}
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
            <div className="space-y-2">
              <Label htmlFor="plan-name">Nombre del Plan *</Label>
              <Input
                id="plan-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ej: Mensual, Trimestral, Semestral..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-duration">Duración *</Label>
              <Input
                id="plan-duration"
                value={formDuration}
                onChange={(e) => setFormDuration(e.target.value)}
                placeholder="Ej: 30 días, 3 meses, 1 año..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-desc">Descripción</Label>
              <Input
                id="plan-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Descripción opcional del plan..."
              />
            </div>
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