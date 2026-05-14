import crypto from 'node:crypto'
import express from 'express'
import cookieSession from 'cookie-session'
import { initDb } from './db.js'
import { attachAuthRoutes } from './auth.js'
import { attachPriceBoardRoutes } from './routes/priceBoard.js'
import { attachTicketRoutes } from './routes/tickets.js'
import { attachCloseoutRoutes } from './routes/closeout.js'
import { attachOwnerRoutes } from './routes/owner.js'
import { attachCustomerRoutes } from './routes/customers.js'
import { attachKitchenRoutes } from './routes/kitchen.js'

export async function createApp() {
  await initDb()

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(express.json({ limit: '200kb' }))

  const isProd =
    process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'

  let sessionSecret = process.env.SESSION_SECRET ?? ''
  if (isProd && !sessionSecret) {
    throw new Error('Missing SESSION_SECRET in production')
  }
  if (!sessionSecret) sessionSecret = crypto.randomBytes(32).toString('hex')
  app.use(
    cookieSession({
      name: 'kwasinyo_session',
      keys: [sessionSecret],
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    }),
  )

  attachAuthRoutes(app)
  attachPriceBoardRoutes(app)
  attachTicketRoutes(app)
  attachKitchenRoutes(app)
  attachCloseoutRoutes(app)
  attachOwnerRoutes(app)
  attachCustomerRoutes(app)

  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  app.use((err, _req, res, next) => {
    if (res.headersSent) return next(err)
    const status = typeof err?.status === 'number' ? err.status : 500
    if (status >= 500) {
      try {
        process.stderr.write(`${err?.stack ?? String(err)}\n`)
      } catch {}
      return res.status(500).json({ error: 'internal_error' })
    }
    return res.status(status).json({ error: err?.message ?? 'request_failed' })
  })

  return app
}
