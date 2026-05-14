'use client'

import { useState, useRef, useEffect } from 'react'
import { Bell, Check, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { useNotifications } from '@/hooks/use-notifications'
import { toast } from 'sonner'

const typeStyles: Record<string, string> = {
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  success: 'bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary',
  error: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diff < 60) return 'Justo ahora'
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)}m`
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`
  return `Hace ${Math.floor(diff / 86400)}d`
}

export function NotificationBell() {
  const { user } = useAuth()
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications(user?.id)
  const [open, setOpen] = useState(false)

  // Check for approaching deadlines every 5 minutes
  useEffect(() => {
    if (!user?.id || !['admin', 'gerente'].includes(user.role || '')) return

    // Check immediately on mount
    fetch('/api/notifications/check-deadlines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {})

    // Then check every 5 minutes
    const interval = setInterval(() => {
      fetch('/api/notifications/check-deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {})
    }, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [user?.id, user?.role])

  const handleNewNotification = (notification: { title: string; message: string; type: string }) => {
    toast(notification.title, {
      description: notification.message,
    })
  }

  // We need to re-fetch to get the callback registered
  // This is handled in the hook already

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 md:h-9 md:w-9">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80 md:w-96" align="end" forceMount>
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notificaciones</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-primary hover:text-primary/80"
              onClick={() => markAllAsRead()}
            >
              <CheckCheck className="mr-1 h-3 w-3" />
              Marcar todas
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="max-h-72">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No hay notificaciones
            </div>
          ) : (
            notifications.slice(0, 20).map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={cn(
                  'flex flex-col items-start gap-1 p-3 cursor-pointer',
                  !notification.read && 'bg-muted/50'
                )}
                onClick={() => {
                  if (!notification.read) markAsRead(notification.id!)
                  setOpen(false)
                }}
              >
                <div className="flex items-center gap-2 w-full">
                  <span
                    className={cn(
                      'inline-block h-2 w-2 rounded-full shrink-0',
                      typeStyles[notification.type]?.split(' ')[0] || 'bg-muted'
                    )}
                  />
                  <span className="text-sm font-medium truncate flex-1">
                    {notification.title}
                  </span>
                  {!notification.read && (
                    <Check
                      className="h-3 w-3 text-muted-foreground shrink-0"
                      title="Marcar como leída"
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 pl-4">
                  {notification.message}
                </p>
                {notification.createdAt && (
                  <span className="text-[10px] text-muted-foreground pl-4">
                    {timeAgo(notification.createdAt)}
                  </span>
                )}
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
