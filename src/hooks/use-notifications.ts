'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Pusher from 'pusher-js'
import { pusherEvents } from '@/lib/pusher'

interface NotificationMessage {
  id?: string
  title: string
  message: string
  type: 'info' | 'warning' | 'success' | 'error'
  read?: boolean
  createdAt?: string
}

type NotificationHandler = (notification: NotificationMessage) => void

export function useNotifications(userId: string | undefined, onNewNotification?: NotificationHandler) {
  const [notifications, setNotifications] = useState<NotificationMessage[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const pusherRef = useRef<Pusher | null>(null)

  const fetchNotifications = useCallback(async () => {
    if (!userId) return
    try {
      const res = await fetch(`/api/notifications?userId=${userId}`)
      if (res.ok) {
        const data = await res.json()
        setNotifications(data)
        setUnreadCount(data.filter((n: NotificationMessage) => !n.read).length)
      }
    } catch {
      // Silent fail
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return

    // Initialize Pusher
    if (!pusherRef.current) {
      pusherRef.current = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY || '', {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'us2',
      })
    }

    const channel = pusherRef.current.subscribe(`user-${userId}`)
    const publicChannel = pusherRef.current.subscribe('notifications')

    channel.bind(pusherEvents.NOTIFICATION_NEW, (data: NotificationMessage) => {
      setNotifications((prev) => [data, ...prev])
      setUnreadCount((prev) => prev + 1)
      onNewNotification?.(data)
    })

    publicChannel.bind(pusherEvents.NOTIFICATION_NEW, (data: NotificationMessage & { userId?: string }) => {
      if (data.userId === userId) {
        setNotifications((prev) => [data, ...prev])
        setUnreadCount((prev) => prev + 1)
        onNewNotification?.(data)
      }
    })

    // Fetch initial notifications
    let cancelled = false
    const doFetch = async () => {
      if (cancelled) return
      try {
        const res = await fetch(`/api/notifications?userId=${userId}`)
        if (res.ok && !cancelled) {
          const data = await res.json()
          setNotifications(data)
          setUnreadCount(data.filter((n: NotificationMessage) => !n.read).length)
        }
      } catch {
        // Silent fail
      }
    }
    doFetch()

    return () => {
      cancelled = true
      channel.unbind_all()
      channel.unsubscribe()
      publicChannel.unbind_all()
      publicChannel.unsubscribe()
    }
  }, [userId, onNewNotification])

  const markAsRead = useCallback(async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: id }),
      })
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch {
      // Silent fail
    }
  }, [])

  const markAllAsRead = useCallback(async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true, userId }),
      })
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch {
      // Silent fail
    }
  }, [])

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    fetchNotifications,
  }
}
