import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import cookieSession from 'cookie-session'
import { initDb } from './db.js'
import { attachAuthRoutes } from './auth.js'
import { attachPriceBoardRoutes } from './routes/priceBoard.js'
import { attachTicketRoutes } from './routes/tickets.js'
import { attachCloseoutRoutes } from './routes/closeout.js'
import { attachOwnerRoutes } from './routes/owner.js'

initDb()

const app = express()
app.disable('x-powered-by')

app.use(express.json({ limit: '200kb' }))

const sessionSecret = process.env.SESSION_SECRET ?? crypto.randomBytes(32).toString('hex')
app.use(
  cookieSession({
    name: 'kwasinyo_session',
    keys: [sessionSecret],
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  }),
)

attachAuthRoutes(app)
attachPriceBoardRoutes(app)
attachTicketRoutes(app)
attachCloseoutRoutes(app)
attachOwnerRoutes(app)

app.get('/api/health', (_req, res) => res.json({ ok: true }))

const clientDist = path.resolve(process.cwd(), '../client/dist')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

const port = Number(process.env.PORT ?? 5174)
app.listen(port, () => {})
