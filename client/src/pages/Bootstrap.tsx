import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../state/auth'

export function Bootstrap() {
  const { refresh } = useAuth()
  const nav = useNavigate()

  const [ownerUsername, setOwnerUsername] = useState('owner')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [cashierUsername, setCashierUsername] = useState('cashier')
  const [cashierPassword, setCashierPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const canSubmit = useMemo(
    () => ownerUsername.trim() && ownerPassword.length >= 6 && cashierUsername.trim() && cashierPassword.length >= 6,
    [ownerUsername, ownerPassword, cashierUsername, cashierPassword],
  )

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await api('/api/auth/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ ownerUsername, ownerPassword, cashierUsername, cashierPassword }),
      })
      await refresh()
      nav('/login', { replace: true })
    } catch (err: any) {
      setError(err?.message ?? 'setup_failed')
    }
  }

  return (
    <main className="page">
      <div className="card">
        <h1>KwaSinyo Setup</h1>
        <p className="muted">Create the first Owner and Cashier login.</p>
        {error ? <div className="alert alert--bad">{error}</div> : null}
        <form onSubmit={onSubmit} className="form">
          <div className="field">
            <label>Owner username</label>
            <input value={ownerUsername} onChange={(e) => setOwnerUsername(e.target.value)} autoCapitalize="none" />
          </div>
          <div className="field">
            <label>Owner password</label>
            <input
              type="password"
              value={ownerPassword}
              onChange={(e) => setOwnerPassword(e.target.value)}
              autoCapitalize="none"
            />
          </div>
          <div className="field">
            <label>Cashier username</label>
            <input value={cashierUsername} onChange={(e) => setCashierUsername(e.target.value)} autoCapitalize="none" />
          </div>
          <div className="field">
            <label>Cashier password</label>
            <input
              type="password"
              value={cashierPassword}
              onChange={(e) => setCashierPassword(e.target.value)}
              autoCapitalize="none"
            />
          </div>
          <button type="submit" className="primary" disabled={!canSubmit}>
            Create Accounts
          </button>
        </form>
      </div>
    </main>
  )
}
