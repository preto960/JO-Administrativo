'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Target, Zap, CheckCircle2 } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useCurrency } from '@/hooks/use-currency'

interface DailyTargetData {
  dailyTarget: number
  monthlyTarget: number
  dailySales: number
  dailyPct: number
  dailyAchieved: boolean
  dailyRemaining: number
  applyDailyAllMonth: boolean
  monthTotalSales: number
  monthPct: number
  todayStr: string
  yearMonth: string
}

export function CashierTargetIndicator() {
  const { fmt } = useCurrency()
  const [data, setData] = useState<DailyTargetData | null>(null)

  useEffect(() => {
    // Fetch immediately
    const fetchTarget = () => {
      api.get<DailyTargetData>('/api/dashboard/my-daily-target')
        .then(setData)
        .catch(() => {})
    }
    fetchTarget()

    // Refresh every 60 seconds
    const interval = setInterval(fetchTarget, 60000)
    return () => clearInterval(interval)
  }, [])

  // No daily target configured — don't show anything
  if (!data || data.dailyTarget <= 0) return null

  const pct = Math.min(data.dailyPct, 100)
  const achieved = data.dailyAchieved

  // Color based on progress
  const colorClass = achieved
    ? 'text-green-600 dark:text-green-400'
    : pct >= 70
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-primary dark:text-primary'

  const barColor = achieved
    ? 'bg-green-500'
    : pct >= 70
      ? 'bg-amber-500'
      : 'bg-primary'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-muted ${
            achieved ? 'bg-green-50 dark:bg-green-950/30' : 'bg-muted/50'
          }`}
        >
          <Target className={`h-3.5 w-3.5 ${colorClass}`} />
          <span className={colorClass}>{data.dailyPct}%</span>
          {/* Mini progress bar */}
          <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {achieved && <Zap className="h-3 w-3 text-green-500" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {achieved ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <Target className="h-4 w-4 text-amber-500" />
            )}
            <span className="text-sm font-semibold">
              {achieved ? 'Meta diaria cumplida' : 'Meta del día'}
            </span>
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{fmt(data.dailySales)}</span>
              <span>{fmt(data.dailyTarget)}</span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-md bg-muted/50 p-1.5">
              <p className="text-[9px] text-muted-foreground uppercase">Hoy</p>
              <p className={`text-xs font-bold ${colorClass}`}>{data.dailyPct}%</p>
            </div>
            <div className="rounded-md bg-muted/50 p-1.5">
              <p className="text-[9px] text-muted-foreground uppercase">Mes</p>
              <p className="text-xs font-bold">{data.monthPct}%</p>
            </div>
          </div>

          {!achieved && (
            <p className="text-[10px] text-muted-foreground">
              Faltan <span className="font-medium text-foreground">{fmt(data.dailyRemaining)}</span> para cumplir la meta de hoy
            </p>
          )}

          {achieved && (
            <p className="text-[10px] text-green-600 dark:text-green-400 font-medium">
              Supera la meta por {fmt(data.dailySales - data.dailyTarget)}
            </p>
          )}

          {data.applyDailyAllMonth && (
            <p className="text-[9px] text-muted-foreground italic">
              Meta aplicada todos los días de {data.yearMonth}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
