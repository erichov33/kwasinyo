import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../state/auth'

export function Login() {
  const nav = useNavigate()
  const { refresh } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const canSubmit = useMemo(() => username.trim() && password, [username, password])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const res = await api<{ ok: true; user: { role: 'cashier' | 'owner' } }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      await refresh()
      nav(res.user.role === 'owner' ? '/owner' : '/cashier', { replace: true })
    } catch (err: any) {
      setError(err?.message ?? 'login_failed')
    }
  }

  return (
    <main className="page">
      <div className="card">
        <h1>KwaSinyo</h1>
        <p className="muted">Login</p>
        {error ? <div className="alert alert--bad">{error}</div> : null}
        <form onSubmit={onSubmit} className="form">
          <div className="field">
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoCapitalize="none"
            />
          </div>
          <button type="submit" className="primary" disabled={!canSubmit}>
            Login
          </button>
        </form>
      </div>
    </main>
  )
}

