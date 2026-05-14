import { createApp } from '../server/src/app.js'

const appPromise = createApp()

export default async function handler(req, res) {
  try {
    if (typeof req?.url === 'string' && req.url.startsWith('/api?') && req.url.includes('__path=')) {
      const u = new URL(req.url, 'http://internal')
      const p = u.searchParams.get('__path')
      if (p) {
        u.searchParams.delete('__path')
        const qs = u.searchParams.toString()
        req.url = `/api/${p}${qs ? `?${qs}` : ''}`
      }
    }
    const app = await appPromise
    return app(req, res)
  } catch (e) {
    try {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'internal_error' }))
    } catch {}
  }
}
