import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { fetchToday } from '@/lib/tz-helpers'

// GET /api/attendance/today-count
export async function GET() {
  try {
    const today = await fetchToday()
    const count = await db.attendance.count({
      where: { date: { gte: today, lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) } },
    })
    return NextResponse.json({ count })
  } catch (error) {
    console.error('[Attendance today-count]', error)
    return NextResponse.json({ count: 0 })
  }
}