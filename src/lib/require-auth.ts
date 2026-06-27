import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { fetchPermissions } from '@/lib/permissions'
import type { UserPermissions } from '@/lib/permissions'

/**
 * Validates that the current request has an authenticated session.
 * Returns the session and role, or an error response if not authenticated.
 */
export async function requireAuth(): Promise<
  | { session: Awaited<ReturnType<typeof getServerSession>>; role: string; userId: string }
  | NextResponse
> {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const user = session.user as Record<string, unknown>
  const role = (user.role as string) || 'cajero'
  const userId = (user.id as string) || ''
  return { session, role, userId }
}

/**
 * Validates that the current user has admin role.
 */
export async function requireAdmin(): Promise<
  | { session: Awaited<ReturnType<typeof getServerSession>>; userId: string }
  | NextResponse
> {
  const result = await requireAuth()
  if ('status' in result) return result
  if (result.role !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado. Solo administradores.' }, { status: 403 })
  }
  return { session: result.session, userId: result.userId }
}

/**
 * Validates that the current user can manage users (checks canManageUsers permission).
 */
export async function requireManageUsers(): Promise<
  | { session: Awaited<ReturnType<typeof getServerSession>>; role: string; userId: string }
  | NextResponse
> {
  const result = await requireAuth()
  if ('status' in result) return result
  const perms = await fetchPermissions(result.role)
  if (!perms.canManageUsers) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }
  return result
}

/**
 * Generic async permission check — reads from DB so it works in Vercel serverless.
 * Returns auth info + permissions, or a 403 NextResponse if the ability is false.
 */
export async function requirePermission(
  ability: keyof UserPermissions
): Promise<
  | { session: Awaited<ReturnType<typeof getServerSession>>; role: string; userId: string; perms: UserPermissions }
  | NextResponse
> {
  const result = await requireAuth()
  if ('status' in result) return result
  const perms = await fetchPermissions(result.role)
  if (!perms[ability]) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }
  return { ...result, perms }
}