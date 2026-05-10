import { createApp } from '../server/src/app.js'

const app = createApp()

export default function handler(req, res) {
  return app(req, res)
}

