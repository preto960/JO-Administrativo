'use client'

import { useSession } from 'next-auth/react'
import { useMemo } from 'react'
import { getPermissions, canAccessView, type UserPermissions } from '@/lib/permissions'

interface AuthUser {
  id: string
  name: string
  email: string
  role: string
}

export function useAuth() {
  const { data: session, status } = useSession()

  const user: AuthUser | null = useMemo(() => {
    if (!session?.user) return null
    return {
      id: (session.user as Record<string, unknown>).id as string || '',
      name: session.user.name || '',
      email: session.user.email || '',
      role: (session.user as Record<string, unknown>).role as string || 'cajero',
    }
  }, [session])

  const permissions: UserPermissions = useMemo(() => {
    if (!user) return getPermissions('cajero')
    return getPermissions(user.role)
  }, [user])

  const canView = (view: string): boolean => {
    return canAccessView(user?.role || 'cajero', view)
  }

  const isAuthenticated = status === 'authenticated'
  const isLoading = status === 'loading'

  return {
    user,
    permissions,
    canView,
    isAuthenticated,
    isLoading,
    status,
  }
}
