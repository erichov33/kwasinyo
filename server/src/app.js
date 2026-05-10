import crypto from 'node:crypto'
import express from 'express'
import cookieSession from 'cookie-session'
import { initDb } from './db.js'
import { attachAuthRoutes } from './auth.js'
import { attachPriceBoardRoutes } from './routes/priceBoard.js'
import { attachTicketRoutes } from './routes/tickets.js'
import { attachCloseoutRoutes } from './routes/closeout.js'
import { attachOwnerRoutes } from './routes/owner.js'

export function createApp() {
  initDb()

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(express.json({ limit: '200kb' }))

  const sessionSecret = process.env.SESSION_SECRET ?? crypto.randomBytes(32).toString('hex')
  const isProd =
    process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
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
  attachCloseoutRoutes(app)
  attachOwnerRoutes(app)

  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  return app
}
