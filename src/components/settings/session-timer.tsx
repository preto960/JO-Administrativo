'use client'

import { useEffect, useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { api } from '@/lib/api'
import { Clock, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SystemSettings {
  sessionDuration: number
}

export function SessionTimer() {
  const { data: session } = useSession()
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    // Calculate approximate remaining time based on session token
    const calculateRemaining = () => {
      if (!session) {
        setRemaining(null)
        return
      }

      if (!settings) return

      const exp = (session as Record<string, unknown>).expires as string
      if (exp) {
        const expiresAt = new Date(exp).getTime()
        const now = Date.now()
        const diff = Math.max(0, Math.floor((expiresAt - now) / 1000))
        setRemaining(diff)
      } else {
        setRemaining(settings.sessionDuration)
      }
    }

    // Only fetch settings once (prevent infinite loop)
    if (!loadedRef.current) {
      loadedRef.current = true
      api.get<SystemSettings>('/api/settings')
        .then(setSettings)
        .catch(() => {
          setSettings({ sessionDuration: 28800 })
        })
    }

    calculateRemaining()

    intervalRef.current = setInterval(calculateRemaining, 60000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [session, settings])

  if (!remaining || !settings) return null

  const hours = Math.floor(remaining / 3600)
  const minutes = Math.floor((remaining % 3600) / 60)

  const warning15 = remaining <= 15 * 60 && remaining > 5 * 60
  const warning5 = remaining <= 5 * 60

  if (hours >= 2) return null // Don't show if more than 2 hours

  return (
    <div
      className={cn(
        'hidden md:flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium',
        warning5
          ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400'
          : warning15
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
          : 'text-muted-foreground'
      )}
    >
      {warning5 ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      <span>
        {hours > 0 ? `${hours}h ` : ''}{minutes}m
      </span>
    </div>
  )
}
