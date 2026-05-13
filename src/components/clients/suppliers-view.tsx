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
import { Building2 } from 'lucide-react'

interface Supplier {
  id: string
  name: string
  rif: string | null
  phone: string | null
  email: string | null
  address: string | null
  balance: number
  _count: { purchases: number }
}

export function SuppliersView() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<Supplier[]>('/api/suppliers')
      .then(setSuppliers)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="h-64 rounded-lg bg-muted animate-pulse" />
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="hidden sm:table-cell">RIF</TableHead>
                  <TableHead className="hidden md:table-cell">Teléfono</TableHead>
                  <TableHead className="hidden lg:table-cell">Email</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Compras</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">{supplier.rif || '—'}</TableCell>
                    <TableCell className="hidden md:table-cell">{supplier.phone || '—'}</TableCell>
                    <TableCell className="hidden lg:table-cell">{supplier.email || '—'}</TableCell>
                    <TableCell className="text-right">
                      <span className={supplier.balance > 0 ? 'text-amber-600 font-medium' : 'text-emerald-600'}>
                        ${supplier.balance.toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">{supplier._count.purchases}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {suppliers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      <Building2 className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      No hay proveedores registrados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
