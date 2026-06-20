'use client'

import { useState, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Store, Loader2, Copyright } from 'lucide-react'
import { applyBothColors } from '@/components/settings/color-picker'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [businessName, setBusinessName] = useState('JO-Administrativo')
  const [logoUrl, setLogoUrl] = useState('')
  const [isWideLogo, setIsWideLogo] = useState(false)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const { setTheme } = useTheme()

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(s => {
        if (s?.businessName) {
          setBusinessName(s.businessName)
          document.title = s.businessName
        }
        if (s?.logoUrl) {
          setLogoUrl(s.logoUrl)
          // Update favicon
          const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
          if (link) {
            link.href = s.logoUrl
          } else {
            const newLink = document.createElement('link')
            newLink.rel = 'icon'
            newLink.href = s.logoUrl
            document.head.appendChild(newLink)
          }
        }
        if (s?.primaryColor) {
          applyBothColors(s.primaryColor, s.secondaryColor || 'slate')
        }
        // Apply theme (dark/light) to match the system
        if (s?.theme) {
          setTheme(s.theme)
        }
      })
      .catch(() => {})
      .finally(() => setMounted(true))
  }, [setTheme])

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
        router.replace('/')
        router.refresh()
      }
    } catch {
      setError('Error al iniciar sesión. Intente nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) return null

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-background p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          {logoUrl ? (
            <div className="flex flex-col items-center">
              <img
                src={logoUrl}
                alt={businessName}
                className={`rounded-xl object-contain ${isWideLogo ? 'h-12 w-48' : 'h-14 w-14'}`}
                onLoad={(e) => {
                  const img = e.currentTarget
                  setIsWideLogo(img.naturalWidth > img.naturalHeight * 1.1)
                }}
              />
              {!isWideLogo && (
                <h1 className="text-2xl font-bold text-primary mt-3">
                  {businessName}
                </h1>
              )}
            </div>
          ) : (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white mb-4 shadow-lg">
                <Store className="h-8 w-8" />
              </div>
              <h1 className="text-2xl font-bold text-primary">
                {businessName}
              </h1>
            </>
          )}
        </div>

        <Card className="shadow-xl border-primary/10">
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

            <div className="mt-4 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>v1.0.0</span>
              <div className="flex items-center gap-0.5">
                <Copyright className="h-3 w-3" />
                <span>JO-System</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}