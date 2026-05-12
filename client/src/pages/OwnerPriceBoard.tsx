import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '../components/AppShell'
import { api } from '../lib/api'
import { formatMoneyCents, parseMoneyToCents } from '../lib/money'

type VehicleType = { id: number; name: string; active: number; sortOrder: number }
type ServiceType = { id: number; name: string; active: number; sortOrder: number }
type PriceRow = { vehicleTypeId: number; serviceTypeId: number; priceCents: number }

export function OwnerPriceBoard() {
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([])
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([])
  const [prices, setPrices] = useState<PriceRow[]>([])
  const [newVehicle, setNewVehicle] = useState('')
  const [newService, setNewService] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const load = async () => {
    const board = await api<{ vehicleTypes: VehicleType[]; serviceTypes: ServiceType[]; prices: PriceRow[] }>(
      '/api/price-board',
    )
    setVehicleTypes(board.vehicleTypes)
    setServiceTypes(board.serviceTypes)
    setPrices(board.prices)
  }

  useEffect(() => {
    load().catch((e: any) => setError(e?.message ?? 'load_failed'))
  }, [])

  const priceMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of prices) m.set(`${p.vehicleTypeId}|${p.serviceTypeId}`, p.priceCents)
    return m
  }, [prices])

  const updateVehicle = async (id: number, patch: Partial<VehicleType>) => {
    setError(null)
    try {
      await api(`/api/vehicle-types/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'save_failed')
    }
  }

  const updateService = async (id: number, patch: Partial<ServiceType>) => {
    setError(null)
    try {
      await api(`/api/service-types/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'save_failed')
    }
  }

  const addVehicle = async () => {
    if (!newVehicle.trim()) return
    setError(null)
    try {
      await api('/api/vehicle-types', { method: 'POST', body: JSON.stringify({ name: newVehicle.trim() }) })
      setNewVehicle('')
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'add_failed')
    }
  }

  const addService = async () => {
    if (!newService.trim()) return
    setError(null)
    try {
      await api('/api/service-types', { method: 'POST', body: JSON.stringify({ name: newService.trim() }) })
      setNewService('')
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'add_failed')
    }
  }

  const savePrice = async (vehicleTypeId: number, serviceTypeId: number, value: string) => {
    const key = `${vehicleTypeId}|${serviceTypeId}`
    setSavingKey(key)
    setError(null)
    try {
      const priceCents = parseMoneyToCents(value)
      await api('/api/prices', { method: 'PUT', body: JSON.stringify({ vehicleTypeId, serviceTypeId, priceCents }) })
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'save_failed')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <AppShell
      section="Price Board"
      nav={[
        { to: '/owner', label: 'Dashboard', icon: '⌂', end: true },
        { to: '/owner/reports', label: 'Reports', icon: '▦' },
        { to: '/owner/customers', label: 'Customers', icon: '◎' },
        { to: '/owner/price-board', label: 'Price Board', icon: '≡' },
      ]}
    >
      <div className="shellInner stack">
        {error ? <div className="alert alert--bad">{error}</div> : null}

        <div className="card">
          <div className="row">
            <h1 className="h1">Price Board</h1>
          </div>
          <div className="dashGrid">
            <div className="card card--sub">
              <div className="row">
                <h2 className="h2">Vehicle types</h2>
              </div>
              <div className="list">
                {vehicleTypes.map((v) => (
                  <div key={v.id} className="listrow">
                    <div className="listrow__main">
                      <input
                        value={v.name}
                        onChange={(e) =>
                          setVehicleTypes((prev) =>
                            prev.map((x) => (x.id === v.id ? { ...x, name: e.target.value } : x)),
                          )
                        }
                        onBlur={(e) => updateVehicle(v.id, { name: e.target.value.trim() || v.name })}
                      />
                      <div className="row">
                        <button
                          type="button"
                          className={v.active ? 'btn btn--outline btn--small' : 'btn btn--ghost btn--small'}
                          onClick={() => updateVehicle(v.id, { active: v.active ? 0 : 1 })}
                        >
                          {v.active ? 'Active' : 'Inactive'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="row">
                <input value={newVehicle} onChange={(e) => setNewVehicle(e.target.value)} placeholder="Add vehicle type" />
                <button type="button" className="btn btn--solid btn--small" onClick={() => addVehicle()}>
                  Add
                </button>
              </div>
            </div>

            <div className="card card--sub">
              <div className="row">
                <h2 className="h2">Service types</h2>
              </div>
              <div className="list">
                {serviceTypes.map((s) => (
                  <div key={s.id} className="listrow">
                    <div className="listrow__main">
                      <input
                        value={s.name}
                        onChange={(e) =>
                          setServiceTypes((prev) =>
                            prev.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)),
                          )
                        }
                        onBlur={(e) => updateService(s.id, { name: e.target.value.trim() || s.name })}
                      />
                      <div className="row">
                        <button
                          type="button"
                          className={s.active ? 'btn btn--outline btn--small' : 'btn btn--ghost btn--small'}
                          onClick={() => updateService(s.id, { active: s.active ? 0 : 1 })}
                        >
                          {s.active ? 'Active' : 'Inactive'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="row">
                <input value={newService} onChange={(e) => setNewService(e.target.value)} placeholder="Add service type" />
                <button type="button" className="btn btn--solid btn--small" onClick={() => addService()}>
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="h2">Matrix</h2>
          <div className="muted">Tap a cell, change the amount, then leave the field to save.</div>
          <div className="matrix">
            <div className="matrix__head">
              <div className="matrix__corner"></div>
              {serviceTypes.map((s) => (
                <div key={s.id} className="matrix__hcell">
                  {s.name}
                </div>
              ))}
            </div>
            {vehicleTypes.map((v) => (
              <div key={v.id} className="matrix__row">
                <div className="matrix__vcell">{v.name}</div>
                {serviceTypes.map((s) => {
                  const key = `${v.id}|${s.id}`
                  const price = priceMap.get(key) ?? 0
                  return (
                    <div key={key} className="matrix__cell">
                      <input
                        key={`${key}-${price}`}
                        className={savingKey === key ? 'money money--saving' : 'money'}
                        inputMode="decimal"
                        defaultValue={(price / 100).toFixed(2)}
                        onBlur={(e) => savePrice(v.id, s.id, e.target.value)}
                      />
                      <div className="muted tiny">{formatMoneyCents(price)}</div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
