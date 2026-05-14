'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Search, Receipt, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface Expense {
  id: string
  category: string
  description: string
  amount: number
  date: string
  currency: { symbol: string }
  user: { name: string }
}

export function ExpensesTable() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formCategory, setFormCategory] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formAmount, setFormAmount] = useState('')

  const fetchExpenses = async () => {
    try {
      const data = await api.get<Expense[]>('/api/expenses')
      setExpenses(data)
    } catch {
      toast.error('Error al cargar gastos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchExpenses() }, [])

  const handleCreate = async () => {
    if (!formCategory || !formDescription || !formAmount) {
      toast.error('Todos los campos son obligatorios')
      return
    }
    setSaving(true)
    try {
      await api.post('/api/expenses', {
        category: formCategory,
        description: formDescription,
        amount: parseFloat(formAmount),
        currencyId: 'current-currency',
        userId: 'current-user',
      })
      toast.success('Gasto registrado')
      setShowCreate(false)
      setFormCategory('')
      setFormDescription('')
      setFormAmount('')
      fetchExpenses()
    } catch {
      toast.error('Error al registrar gasto')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="h-64 rounded-lg bg-muted animate-pulse" />
  }

  const totalGastos = expenses.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Total gastos: <span className="font-bold text-red-600">${totalGastos.toFixed(2)}</span>
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-primary hover:bg-primary/90 text-white">
          <Plus className="mr-2 h-4 w-4" /> Nuevo Gasto
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="hidden sm:table-cell">Registrado por</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="text-sm">
                      {new Date(expense.date).toLocaleDateString('es-VE')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{expense.category}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{expense.description}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {expense.user.name}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-red-600">
                      {expense.currency.symbol}{expense.amount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:text-red-600"
                        title="Eliminar"
                        onClick={async () => {
                          if (!confirm('¿Estás seguro de eliminar este gasto?')) return
                          try {
                            await api.del(`/api/expenses?id=${expense.id}`)
                            toast.success('Gasto eliminado')
                            fetchExpenses()
                          } catch {
                            toast.error('Error al eliminar gasto')
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {expenses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      <Receipt className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      No hay gastos registrados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Gasto</DialogTitle>
            <DialogDescription>Registra un nuevo gasto operativo</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Servicios">Servicios</SelectItem>
                  <SelectItem value="Insumos">Insumos</SelectItem>
                  <SelectItem value="Mantenimiento">Mantenimiento</SelectItem>
                  <SelectItem value="Nomina">Nómina</SelectItem>
                  <SelectItem value="Alquiler">Alquiler</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edesc">Descripción *</Label>
              <Input id="edesc" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Descripción del gasto" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eamt">Monto *</Label>
              <Input id="eamt" type="number" step="0.01" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} />
            </div>
            <Button className="w-full bg-primary hover:bg-primary/90 text-white" onClick={handleCreate} disabled={saving}>
              {saving ? 'Registrando...' : 'Registrar Gasto'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
