import { db } from '@/lib/db'
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export interface LogActionParams {
  action: string   // create, update, delete, login, logout, open_cash, close_cash, etc.
  entity: string   // client, supplier, product, sale, expense, category, user, branch, settings, cash_register, etc.
  entityId?: string
  details?: Record<string, unknown>
  request?: NextRequest
}

/**
 * Log an audit action. If a request is provided, extracts user info from session
 * and IP/userAgent from headers. Otherwise, requires explicit user info.
 */
export async function logAction(params: LogActionParams): Promise<void> {
  try {
    let userId = ''
    let userName = ''
    let userRole = ''
    let ipAddress: string | undefined
    let userAgent: string | undefined

    // Try to extract user from session if request is available
    if (params.request) {
      const session = await getServerSession(authOptions)
      if (session?.user) {
        userId = (session.user as Record<string, unknown>).id as string || ''
        userName = session.user.name || ''
        userRole = (session.user as Record<string, unknown>).role as string || ''
      }

      // Extract IP and User-Agent
      const req = params.request
      ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || undefined
      userAgent = req.headers.get('user-agent') || undefined
    }

    // If no session/user found, use a system fallback
    if (!userId) {
      userId = params.entityId ? `system` : 'system'
      userName = 'Sistema'
      userRole = 'system'
    }

    await db.auditLog.create({
      data: {
        userId,
        userName,
        userRole,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        details: params.details || undefined,
        ipAddress,
        userAgent,
      },
    })
  } catch (error) {
    // Audit logging should never break the main operation
    console.error('[AuditLog] Failed to log action:', error)
  }
}
