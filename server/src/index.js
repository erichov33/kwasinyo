import { createApp } from './app.js'

const app = await createApp()
const port = Number(process.env.PORT ?? 5174)
app.listen(port, () => {})
