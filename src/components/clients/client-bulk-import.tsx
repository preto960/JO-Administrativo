'use client'

import { useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Users,
  UserPlus,
  RefreshCw,
  Eye,
  X,
  Download,
} from 'lucide-react'
import { toast } from 'sonner'
import Papa from 'papaparse'

interface PreviewRow {
  cedula: string
  nombre: string
  apellido: string
  correo: string
  celular: string
  genero: string
  estado_membresia: string
  tarifa: string
  dias_restantes: number
  [key: string]: string | number
}

interface ImportResult {
  created: number
  updated: number
  skipped: number
  errors: string[]
  totalProcessed: number
}

const EXPECTED_COLUMNS = [
  'cedula', 'nombre', 'apellido', 'correo', 'celular',
  'fecha_nacimiento', 'edad', 'genero', 'direccion',
  'estado_membresia', 'tarifa', 'fecha_pago',
  'fecha_inicio_membresia', 'fecha_vencimiento_membresia',
  'dias_restantes', 'tiquetes_restantes',
  'fecha_creacion', 'ultima_asistencia',
]

export function ClientBulkImport({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { permissions } = useAuth()
  const canManage = permissions.canManageClients

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [parsedData, setParsedData] = useState<Record<string, string>[]>([])
  const [columnValidation, setColumnValidation] = useState<{ valid: boolean; missing: string[] }>({ valid: true, missing: [] })
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const reset = useCallback(() => {
    setFile(null)
    setPreview([])
    setParsedData([])
    setColumnValidation({ valid: true, missing: [] })
    setLoading(false)
    setProgress(0)
    setResult(null)
  }, [])

  const handleClose = () => {
    reset()
    onOpenChange(false)
  }

  const processFile = useCallback((f: File) => {
    setFile(f)
    setResult(null)
    setProgress(0)

    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const columns = results.meta.fields || []
        const normalized = columns.map(c => c.toLowerCase().trim().replace(/\s+/g, '_').replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u'))

        const required = ['cedula', 'nombre']
        const missing = required.filter(r => !normalized.includes(r))

        setColumnValidation({ valid: missing.length === 0, missing })

        const rows = results.data as Record<string, string>[]
        setParsedData(rows)

        // Build preview (max 100)
        const previewRows: PreviewRow[] = rows.slice(0, 100).map(row => {
          const get = (keys: string[]) => {
            for (const k of keys) {
              const nk = k.toLowerCase().trim().replace(/\s+/g, '_')
              const found = Object.keys(row).find(col => col.toLowerCase().trim().replace(/\s+/g, '_').replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u') === nk)
              if (found) return (row[found] || '').toString().trim()
            }
            return ''
          }
          return {
            cedula: get(['cedula']),
            nombre: get(['nombre', 'name']),
            apellido: get(['apellido', 'apellido', 'last_name']),
            correo: get(['correo', 'email']),
            celular: get(['celular', 'phone', 'telefono']),
            genero: get(['genero', 'género', 'gender']),
            estado_membresia: get(['estado_membresia', 'estado_membresía']),
            tarifa: get(['tarifa']),
            dias_restantes: parseInt(get(['dias_restantes', 'días_restantes'])) || 0,
            ...row,
          }
        })
        setPreview(previewRows)
      },
      error: () => {
        toast.error('Error al leer el archivo CSV')
      },
    })
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f && (f.name.endsWith('.csv') || f.type === 'text/csv')) {
      processFile(f)
    } else {
      toast.error('Solo se permiten archivos CSV')
    }
  }, [processFile])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) processFile(f)
  }, [processFile])

  const handleImport = async () => {
    if (!parsedData.length) return
    if (!canManage) {
      toast.error('Sin permisos para gestionar clientes')
      return
    }

    setLoading(true)
    setProgress(10)

    try {
      // Normalize column keys in parsed data
      const normalizedData = parsedData.map(row => {
        const normalized: Record<string, string> = {}
        for (const [key, value] of Object.entries(row)) {
          const nk = key.toLowerCase().trim().replace(/\s+/g, '_').replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i').replace(/ó/g, 'o').replace(/ú/g, 'u')
          normalized[nk] = String(value || '')
        }
        return normalized as unknown as Record<string, string>
      })

      setProgress(30)

      const res = await api.post<ImportResult>('/api/clients/bulk-import', {
        clients: normalizedData,
        updateExisting: true,
      })

      setProgress(100)
      setResult(res)

      toast.success(`Importación completada: ${res.created} nuevos, ${res.actualizados || res.updated} actualizados`)
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error al importar'
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const downloadTemplate = () => {
    const headers = EXPECTED_COLUMNS.join(',')
    const exampleRow = [
      '1234567890', 'Juan', 'Pérez', 'juan@email.com', '3001234567',
      '1990-05-15', '36', 'Masculino', 'Calle 123',
      'Activo', 'Mensual', '2026-06-01',
      '2026-06-01', '2026-06-30', '15', '0',
      '2024-11-19', '2026-06-10',
    ].join(',')
    const csv = `${headers}\n${exampleRow}\n`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8-sig;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'plantilla_carga_masiva_clientes.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const activeCount = preview.filter(r => r.estado_membresia === 'Activo').length
  const vencidoCount = preview.filter(r => r.estado_membresia === 'Vencido').length
  const sinMembresiaCount = preview.filter(r => !r.estado_membresia || r.estado_membresia === 'Sin membresia' || r.estado_membresia === 'Sin membresia').length

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Upload className="h-5 w-5" />
                Carga Masiva de Clientes
              </DialogTitle>
              <DialogDescription className="mt-1">
                Importa clientes desde un archivo CSV. Los clientes se identifican por cédula.
              </DialogDescription>
            </div>
            {file && (
              <Button variant="outline" size="sm" onClick={reset} className="shrink-0">
                <X className="h-4 w-4 mr-1" />
                Limpiar
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden px-6 py-4 space-y-4">
          {/* Upload Area */}
          {!file && !result && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`
                border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
                ${dragOver ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'}
              `}
              onClick={() => document.getElementById('csv-input')?.click()}
            >
              <input
                id="csv-input"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileInput}
              />
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium">Arrastra tu archivo CSV aquí</p>
              <p className="text-sm text-muted-foreground mt-1">o haz clic para seleccionar</p>
              <div className="mt-4 flex items-center justify-center gap-3">
                <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); downloadTemplate() }}>
                  <Download className="h-4 w-4 mr-1" />
                  Descargar plantilla
                </Button>
              </div>
            </div>
          )}

          {/* Validation Warnings */}
          {file && !columnValidation.valid && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-destructive font-medium mb-1">
                <AlertTriangle className="h-4 w-4" />
                Columnas faltantes en el archivo
              </div>
              <p className="text-sm text-muted-foreground">
                Faltan las columnas requeridas: <strong>{columnValidation.missing.join(', ')}</strong>
              </p>
            </div>
          )}

          {/* File Stats */}
          {file && !result && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="p-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileSpreadsheet className="h-4 w-4" />
                  Archivo
                </div>
                <p className="font-semibold text-sm mt-1 truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{parsedData.length} filas</p>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Activos
                </div>
                <p className="font-semibold text-lg text-green-600">{activeCount}</p>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <XCircle className="h-4 w-4 text-red-500" />
                  Vencidos
                </div>
                <p className="font-semibold text-lg text-red-500">{vencidoCount}</p>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  Sin membresía
                </div>
                <p className="font-semibold text-lg">{sinMembresiaCount}</p>
              </Card>
            </div>
          )}

          {/* Preview Table */}
          {file && !result && preview.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-muted-foreground">
                  <Eye className="h-4 w-4 inline mr-1" />
                  Vista previa {preview.length < parsedData.length ? `(primeros ${preview.length} de ${parsedData.length})` : ''}
                </h4>
              </div>
              <ScrollArea className="h-64 rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Cédula</th>
                      <th className="px-3 py-2 text-left font-medium">Nombre</th>
                      <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Apellido</th>
                      <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Correo</th>
                      <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">Celular</th>
                      <th className="px-3 py-2 text-center font-medium">Estado</th>
                      <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">Tarifa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-t hover:bg-muted/50 transition-colors">
                        <td className="px-3 py-1.5 font-mono">{row.cedula}</td>
                        <td className="px-3 py-1.5 font-medium">{row.nombre}</td>
                        <td className="px-3 py-1.5 hidden sm:table-cell">{row.apellido}</td>
                        <td className="px-3 py-1.5 hidden md:table-cell text-muted-foreground">{row.correo}</td>
                        <td className="px-3 py-1.5 hidden lg:table-cell">{row.celular}</td>
                        <td className="px-3 py-1.5 text-center">
                          <Badge
                            variant={
                              row.estado_membresia === 'Activo' ? 'default' :
                              row.estado_membresia === 'Vencido' ? 'destructive' :
                              'secondary'
                            }
                            className={
                              row.estado_membresia === 'Activo' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                              row.estado_membresia === 'Vencido' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                              ''
                            }
                          >
                            {row.estado_membresia || 'Sin membresía'}
                          </Badge>
                        </td>
                        <td className="px-3 py-1.5 hidden lg:table-cell text-muted-foreground">{row.tarifa}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          )}

          {/* Progress */}
          {loading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Importando...</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Card className="p-4 border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20">
                  <div className="flex items-center gap-2 text-green-600 mb-1">
                    <UserPlus className="h-5 w-5" />
                    <span className="text-sm font-medium">Nuevos</span>
                  </div>
                  <p className="text-2xl font-bold text-green-700">{result.created}</p>
                </Card>
                <Card className="p-4 border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/20">
                  <div className="flex items-center gap-2 text-blue-600 mb-1">
                    <RefreshCw className="h-5 w-5" />
                    <span className="text-sm font-medium">Actualizados</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-700">{result.updated}</p>
                </Card>
                <Card className="p-4 border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20">
                  <div className="flex items-center gap-2 text-amber-600 mb-1">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="text-sm font-medium">Omitidos</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-700">{result.skipped}</p>
                </Card>
              </div>

              {result.errors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-destructive">
                    Errores ({result.errors.length})
                    {result.errors.length >= 50 && ' — mostrando los primeros 50'}
                  </h4>
                  <ScrollArea className="h-40 rounded-lg border border-destructive/30 bg-destructive/5">
                    <div className="p-3 space-y-1">
                      {result.errors.map((err, i) => (
                        <p key={i} className="text-xs text-destructive/80">{err}</p>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {(!result || file) && (
          <div className="px-6 py-4 border-t shrink-0 flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-1" />
              Plantilla CSV
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>
                {result ? 'Cerrar' : 'Cancelar'}
              </Button>
              {file && !result && columnValidation.valid && (
                <Button
                  onClick={handleImport}
                  disabled={loading || parsedData.length === 0}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importando {parsedData.length} clientes...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Importar {parsedData.length} clientes
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}