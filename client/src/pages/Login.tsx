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
    <main className="auth">
      <div className="auth__inner">
        <div className="auth__hero">
          <div className="auth__kicker">Welcome to</div>
          <div className="auth__title">
            <span className="auth__brand">KWA SINYO</span>
            <span className="auth__brandAccent">CAR WASH</span>
          </div>
          <div className="auth__subTitle">Clean Car. Great Experience.</div>
          <div className="auth__sub">Log in to manage tickets, pricing, and daily closeout.</div>

          <div className="auth__art" aria-hidden="true">
            <svg viewBox="0 0 560 280" role="presentation" focusable="false">
              <defs>
                <linearGradient id="kw-auth-car" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0" stopColor="rgba(96,165,250,0.9)" />
                  <stop offset="1" stopColor="rgba(59,130,246,0.22)" />
                </linearGradient>
                <linearGradient id="kw-auth-foam" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0" stopColor="rgba(255,255,255,0.9)" />
                  <stop offset="1" stopColor="rgba(255,255,255,0.14)" />
                </linearGradient>
              </defs>

              <g opacity="0.95">
                <path
                  d="M132 170c6-26 16-44 31-54 19-13 70-19 117-19 45 0 88 4 114 14 19 8 34 26 46 56 9 1 17 6 23 14 6 9 9 20 9 32 0 11-3 21-9 30-7 10-17 15-30 15h-24c-6 0-10-3-12-9l-5-13H167l-5 13c-2 6-7 9-12 9h-24c-13 0-23-5-30-15-6-9-9-19-9-30 0-12 3-23 9-32 6-8 14-13 23-14z"
                  fill="url(#kw-auth-car)"
                />
                <path
                  d="M178 143c22-18 58-25 102-25 47 0 87 7 111 25 9 7 14 18 16 33H162c2-15 7-26 16-33z"
                  fill="rgba(255,255,255,0.14)"
                />
                <circle cx="198" cy="220" r="26" fill="rgba(15,23,42,0.35)" />
                <circle cx="198" cy="220" r="16" fill="rgba(15,23,42,0.65)" />
                <circle cx="374" cy="220" r="26" fill="rgba(15,23,42,0.35)" />
                <circle cx="374" cy="220" r="16" fill="rgba(15,23,42,0.65)" />
                <path d="M152 178h256" stroke="rgba(255,255,255,0.22)" strokeWidth="6" strokeLinecap="round" />
              </g>

              <g opacity="0.95">
                <path
                  d="M126 92c16-10 36-16 58-18 29-3 66 4 87 14 12 6 25 7 39 0 22-10 58-17 87-14 21 2 41 8 57 18-20-4-41-4-63-1-31 4-55 15-81 25-18 7-43 7-62 0-26-10-50-21-81-25-22-3-43-3-63 1z"
                  fill="url(#kw-auth-foam)"
                />
                <circle cx="130" cy="86" r="12" fill="rgba(255,255,255,0.55)" />
                <circle cx="170" cy="62" r="10" fill="rgba(255,255,255,0.4)" />
                <circle cx="208" cy="86" r="8" fill="rgba(255,255,255,0.35)" />
                <circle cx="410" cy="70" r="12" fill="rgba(255,255,255,0.45)" />
                <circle cx="444" cy="90" r="9" fill="rgba(255,255,255,0.35)" />
                <circle cx="470" cy="62" r="8" fill="rgba(255,255,255,0.3)" />
              </g>
            </svg>
          </div>
        </div>

        <div className="card auth__card">
          <h1 className="auth__cardTitle">Login</h1>
          <p className="muted">Use your cashier or owner account.</p>
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
      </div>
    </main>
  )
}
