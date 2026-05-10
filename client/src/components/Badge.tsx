import type React from 'react'

export function Badge({
  tone,
  children,
}: {
  tone: 'neutral' | 'good' | 'warn' | 'bad'
  children: React.ReactNode
}) {
  const className =
    tone === 'good'
      ? 'badge badge--good'
      : tone === 'warn'
        ? 'badge badge--warn'
        : tone === 'bad'
          ? 'badge badge--bad'
          : 'badge'
  return <span className={className}>{children}</span>
}
