'use client'

import dynamic from 'next/dynamic'

const AppShell = dynamic(
  () => import('@/components/layout/app-shell').then(mod => ({ default: mod.AppShell })),
  { ssr: false }
)

export default function Home() {
  return <AppShell />
}
