import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

export type Reconciliation = {
  dayDate: string
  ticketsCount: number
  expectedRevenueCents: number
  expectedCashCents: number
  declaredCashCents: number
  discrepancyCashCents: number
  cashierSubmittedAt: string
  ownerConfirmedAt: string | null
  ownerNote: string | null
}

export type TodaySummary = {
  dayDate: string
  ticketsCount: number
  expectedRevenueCents: number
  expectedCashCents: number
  reconciliation: Reconciliation | null
}

export function useTodaySummary() {
  const [data, setData] = useState<TodaySummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await api<TodaySummary>('/api/closeout/today-summary')
      setData(s)
    } catch (e: any) {
      setError(e?.message ?? 'load_failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { data, loading, error, reload: load }
}
