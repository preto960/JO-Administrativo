'use client'

import { useState, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Store, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [businessName, setBusinessName] = useState('JO-Administrativo')
  const router = useRouter()

  // Load business name from settings API
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(s => {
        if (s?.businessName) setBusinessName(s.businessName)
        // Apply saved primary color on login page too
        if (s?.primaryColor) {
          const root = document.documentElement
          const colorMap: Record<string, string> = {
            emerald: 'oklch(0.508 0.163 160)',
            blue: 'oklch(0.546 0.245 262.881)',
            purple: 'oklch(0.541 0.281 293.009)',
            red: 'oklch(0.577 0.245 27.325)',
            orange: 'oklch(0.637 0.237 47.604)',
            pink: 'oklch(0.592 0.249 342.258)',
            cyan: 'oklch(0.522 0.135 218.811)',
            slate: 'oklch(0.398 0.02 255)',
          }
          const c = colorMap[s.primaryColor]
          if (c) {
            root.style.setProperty('--primary', c)
            root.style.setProperty('--ring', c)
            root.style.setProperty('--chart-1', c)
          }
        }
      })
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('Credenciales inválidas. Verifique su email y contraseña.')
      } else {
        router.push('/')
        router.refresh()
      }
    } catch {
      setError('Error al iniciar sesión. Intente nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-white dark:from-gray-950 dark:to-gray-900 p-4">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white mb-4 shadow-lg">
            <Store className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-primary dark:text-primary">
            {businessName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sistema ERP / Punto de Venta
          </p>
        </div>

        {/* Login Card */}
        <Card className="shadow-xl border-primary/10 dark:border-primary/10">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-xl">Iniciar Sesión</CardTitle>
            <CardDescription>
              Ingrese sus credenciales para acceder al sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@erp.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-white"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Ingresando...
                  </>
                ) : (
                  'Ingresar'
                )}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <p className="text-xs text-muted-foreground">
                v1.0.0 · {businessName} ERP
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
