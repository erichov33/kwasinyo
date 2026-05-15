import { createApp } from '../server/src/app.js'

const appPromise = createApp()

async function withTimeout(promise, ms) {
  let t = null
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error('timeout')), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (t) clearTimeout(t)
  }
}

export default async function handler(req, res) {
  try {
    if (typeof req?.url === 'string' && req.url.startsWith('/api/health')) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true }))
      return
    }
    const app = await withTimeout(appPromise, Number(process.env.APP_INIT_TIMEOUT_MS ?? 8000))
    return app(req, res)
  } catch (e) {
    try {
      res.statusCode = String(e?.message ?? '').includes('timeout') ? 503 : 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: res.statusCode === 503 ? 'api_unavailable' : 'internal_error' }))
    } catch {}
  }
}
