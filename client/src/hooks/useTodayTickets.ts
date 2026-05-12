import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

export type TodayTicket = {
  ticketNumber: number
  plate: string
  vehicleTypeName: string
  serviceTypeName: string
  basePriceCents: number
  discountCents: number
  discountReason: string | null
  overrideNote: string | null
  priceCents: number
  paymentMethod: 'cash' | 'card' | 'other'
  priceOverridden: number
  createdAt: string
}

export function useTodayTickets() {
  const [tickets, setTickets] = useState<TodayTicket[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<{ tickets: TodayTicket[] }>('/api/tickets/today')
      setTickets(res.tickets ?? [])
    } catch (e: any) {
      setError(e?.message ?? 'load_failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { tickets, loading, error, reload: load, setTickets }
}
