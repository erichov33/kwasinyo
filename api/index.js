import { createApp } from '../server/src/app.js'

const appPromise = createApp()

export default async function handler(req, res) {
  try {
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
