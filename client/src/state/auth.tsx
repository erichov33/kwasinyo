import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'

export type Role = 'cashier' | 'owner'
export type SessionUser = { id: number; username: string; role: Role }

type AuthState = {
  bootstrapped: boolean | null
  apiError: string | null
  user: SessionUser | null
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [bootstrapped, setBootstrapped] = useState<boolean | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [user, setUser] = useState<SessionUser | null>(null)

  const refresh = async () => {
    setApiError(null)
    try {
      const status = await api<{ bootstrapped: boolean }>('/api/auth/bootstrap-status')
      setBootstrapped(status.bootstrapped)
      if (!status.bootstrapped) {
        setUser(null)
        return
      }
      try {
        const me = await api<{ user: SessionUser }>('/api/auth/me')
        setUser(me.user)
      } catch {
        setUser(null)
      }
    } catch (e: any) {
      setBootstrapped(false)
      setUser(null)
      setApiError(e?.message ?? 'api_unreachable')
    }
  }

  const logout = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) })
    } finally {
      setUser(null)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const value = useMemo(() => ({ bootstrapped, apiError, user, refresh, logout }), [bootstrapped, apiError, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('AuthProvider missing')
  return ctx
}
