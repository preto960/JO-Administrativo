import { db } from '@/lib/db'
import { NextRequest } from 'next/server'

/**
 * Resolve the branchId from the request query parameters.
 * If no branchId is provided, returns the first active branch.
 * Falls back to a hardcoded value for backwards compatibility.
 */
export async function resolveBranchId(request?: NextRequest): Promise<string> {
  // Try from query parameter
  if (request) {
    const { searchParams } = new URL(request.url)
    const queryBranchId = searchParams.get('branchId')
    if (queryBranchId) return queryBranchId
  }

  // Try from request body
  if (request && request.method === 'POST') {
    try {
      const body = await request.json()
      if (body.branchId) return body.branchId
    } catch {
      // Body might not be JSON or already consumed
    }
  }

  // Fall back to first active branch from DB
  try {
    const branch = await db.branch.findFirst({
      where: { active: true },
      orderBy: { isMain: 'desc' },
    })
    if (branch) return branch.id
  } catch {
    // DB might not be ready yet
  }

  return 'sucursal-1'
}
