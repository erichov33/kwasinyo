import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

export type VehicleType = { id: number; name: string; active: number; sortOrder?: number }
export type ServiceType = { id: number; name: string; active: number; sortOrder?: number }
export type PriceRow = { vehicleTypeId: number; serviceTypeId: number; priceCents: number }

export type PriceBoard = { vehicleTypes: VehicleType[]; serviceTypes: ServiceType[]; prices: PriceRow[] }

export function usePriceBoard(opts?: { activeOnly?: boolean }) {
  const [data, setData] = useState<PriceBoard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = opts?.activeOnly ? '?activeOnly=1' : ''
      const board = await api<PriceBoard>(`/api/price-board${qs}`)
      setData(board)
    } catch (e: any) {
      setError(e?.message ?? 'load_failed')
    } finally {
      setLoading(false)
    }
  }, [opts?.activeOnly])

  useEffect(() => {
    load()
  }, [load])

  return { data, loading, error, reload: load }
}

