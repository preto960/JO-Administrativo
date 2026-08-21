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
  const [error, setError] = useState(false)

  useEffect(() => {
    const fetchTarget = () => {
      api.get<DailyTargetData>('/api/dashboard/my-daily-target')
        .then(setData)
        .catch((err) => {
          console.error('[CashierTarget] Error al cargar meta:', err)
          setError(true)
        })
    }
    fetchTarget()
    const interval = setInterval(fetchTarget, 60000)
    return () => clearInterval(interval)
  }, [])

  // No data yet or loading
  if (!data) return null

  const hasDailyTarget = data.dailyTarget > 0
  const hasMonthlyTarget = data.monthlyTarget > 0

  // No targets configured at all — don't show anything
  if (!hasDailyTarget && !hasMonthlyTarget) return null

  // --- Daily target mode ---
  if (hasDailyTarget) {
    const pct = Math.min(data.dailyPct, 100)
    const achieved = data.dailyAchieved
    const colorClass = achieved
      ? 'text-green-600 dark:text-green-400'
      : pct >= 70
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-primary dark:text-primary'
    const barColor = achieved ? 'bg-green-500' : pct >= 70 ? 'bg-amber-500' : 'bg-primary'

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
                {achieved ? 'Meta diaria cumplida' : 'Meta del dia'}
              </span>
            </div>
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
                Meta aplicada todos los dias de {data.yearMonth}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  // --- Monthly target only mode (no daily target set) ---
  const monthPct = Math.min(data.monthPct, 100)
  const monthAchieved = data.monthTotalSales >= data.monthlyTarget
  const mColorClass = monthAchieved
    ? 'text-green-600 dark:text-green-400'
    : monthPct >= 70
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-primary dark:text-primary'
  const mBarColor = monthAchieved ? 'bg-green-500' : monthPct >= 70 ? 'bg-amber-500' : 'bg-primary'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-muted ${
            monthAchieved ? 'bg-green-50 dark:bg-green-950/30' : 'bg-muted/50'
          }`}
        >
          <Target className={`h-3.5 w-3.5 ${mColorClass}`} />
          <span className={mColorClass}>{data.monthPct}%</span>
          <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${mBarColor}`}
              style={{ width: `${monthPct}%` }}
            />
          </div>
          {monthAchieved && <Zap className="h-3 w-3 text-green-500" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {monthAchieved ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <Target className="h-4 w-4 text-amber-500" />
            )}
            <span className="text-sm font-semibold">
              {monthAchieved ? 'Meta mensual cumplida' : 'Meta del mes'}
            </span>
          </div>
          <div className="space-y-1">
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${mBarColor}`}
                style={{ width: `${monthPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{fmt(data.monthTotalSales)}</span>
              <span>{fmt(data.monthlyTarget)}</span>
            </div>
          </div>
          <div className="text-center">
            <div className="rounded-md bg-muted/50 p-1.5 inline-block min-w-[80px]">
              <p className="text-[9px] text-muted-foreground uppercase">Mes ({data.yearMonth})</p>
              <p className={`text-xs font-bold ${mColorClass}`}>{data.monthPct}%</p>
            </div>
          </div>
          {!monthAchieved && (
            <p className="text-[10px] text-muted-foreground">
              Faltan <span className="font-medium text-foreground">{fmt(Math.max(0, data.monthlyTarget - data.monthTotalSales))}</span> para la meta del mes
            </p>
          )}
          {monthAchieved && (
            <p className="text-[10px] text-green-600 dark:text-green-400 font-medium">
              Supera la meta mensual por {fmt(data.monthTotalSales - data.monthlyTarget)}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
