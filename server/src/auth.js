import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db, isBootstrapped } from './db.js'

export function getSessionUser(req) {
  const { user } = req.session ?? {}
  if (!user) return null
  if (typeof user.id !== 'number') return null
  if (user.role !== 'cashier' && user.role !== 'owner') return null
  if (typeof user.username !== 'string') return null
  return user
}

export function requireAuth(req, res, next) {
  const user = getSessionUser(req)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  req.user = user
  return next()
}

export function requireRole(role) {
  return (req, res, next) => {
    const user = getSessionUser(req)
    if (!user) return res.status(401).json({ error: 'unauthorized' })
    if (user.role !== role) return res.status(403).json({ error: 'forbidden' })
    req.user = user
    return next()
  }
}

export function attachAuthRoutes(app) {
  app.get('/api/auth/bootstrap-status', (_req, res) => {
    res.json({ bootstrapped: isBootstrapped() })
  })

  app.post('/api/auth/bootstrap', (req, res) => {
    if (isBootstrapped()) return res.status(409).json({ error: 'already_bootstrapped' })

    const schema = z.object({
      ownerUsername: z.string().trim().min(1).max(32),
      ownerPassword: z.string().min(6).max(128),
      cashierUsername: z.string().trim().min(1).max(32),
      cashierPassword: z.string().min(6).max(128),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const { ownerUsername, ownerPassword, cashierUsername, cashierPassword } = parsed.data

    const now = new Date().toISOString()
    const insertUser = db.prepare(
      'INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)',
    )

    try {
      db.transaction(() => {
        const ownerHash = bcrypt.hashSync(ownerPassword, 12)
        const cashierHash = bcrypt.hashSync(cashierPassword, 12)
        insertUser.run(ownerUsername, ownerHash, 'owner', now)
        insertUser.run(cashierUsername, cashierHash, 'cashier', now)
      })()
    } catch {
      return res.status(409).json({ error: 'username_conflict' })
    }

    res.json({ ok: true })
  })

  app.post('/api/auth/login', (req, res) => {
    const schema = z.object({
      username: z.string().trim().min(1).max(32),
      password: z.string().min(1).max(128),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const { username, password } = parsed.data
    const row = db
      .prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?')
      .get(username)

    if (!row) return res.status(401).json({ error: 'invalid_credentials' })
    const ok = bcrypt.compareSync(password, row.password_hash)
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' })

    req.session.user = { id: row.id, username: row.username, role: row.role }
    res.json({ ok: true, user: req.session.user })
  })

  app.post('/api/auth/logout', (req, res) => {
    req.session = null
    res.json({ ok: true })
  })

  app.get('/api/auth/me', (req, res) => {
    const user = getSessionUser(req)
    if (!user) return res.status(401).json({ error: 'unauthorized' })
    res.json({ user })
  })
}

