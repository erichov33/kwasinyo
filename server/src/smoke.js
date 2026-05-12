import fs from 'node:fs/promises'
import path from 'node:path'

function fail(msg) {
  process.stderr.write(`${msg}\n`)
  process.exitCode = 1
}

async function readText(p) {
  return fs.readFile(p, 'utf8')
}

function mustInclude(haystack, needle, label) {
  if (!haystack.includes(needle)) fail(`Missing expected ${label}: ${needle}`)
}

function mustNotMatch(haystack, re, label) {
  if (re.test(haystack)) fail(`Found forbidden ${label}: ${String(re)}`)
}

async function main() {
  const here = path.dirname(new URL(import.meta.url).pathname)
  const serverSrc = here
  const serverRoot = path.resolve(serverSrc, '..')

  const dbPath = path.join(serverSrc, 'db.js')
  const ownerPath = path.join(serverSrc, 'routes', 'owner.js')
  const ticketsPath = path.join(serverSrc, 'routes', 'tickets.js')
  const closeoutPath = path.join(serverSrc, 'routes', 'closeout.js')
  const customersPath = path.join(serverSrc, 'routes', 'customers.js')
  const priceBoardPath = path.join(serverSrc, 'routes', 'priceBoard.js')

  const db = await readText(dbPath)
  mustInclude(db, "id: '001_init'", 'migration id')
  mustInclude(db, "id: '002_timestamps_and_day_date'", 'migration id')
  mustInclude(db, 'TYPE timestamptz', 'timestamptz alters')
  mustInclude(db, 'ALTER COLUMN day_date TYPE date', 'day_date -> date')
  mustInclude(db, "id: '003_updated_at_triggers'", 'migration id')
  mustInclude(db, "id: '004_align_price_matrix_updated_at_trigger'", 'migration id')
  mustInclude(db, 'public.set_updated_at', 'trigger function')
  mustInclude(db, 'trg_price_matrix_set_updated_at', 'price_matrix trigger')
  mustInclude(db, 'trg_customers_updated_at', 'customers trigger')

  const owner = await readText(ownerPath)
  const tickets = await readText(ticketsPath)
  const closeout = await readText(closeoutPath)
  const customers = await readText(customersPath)
  const priceBoard = await readText(priceBoardPath)

  const serverTree = await fs.readdir(serverRoot, { recursive: true })
  for (const rel of serverTree) {
    if (!String(rel).endsWith('.js')) continue
    const abs = path.join(serverRoot, rel)
    const st = await fs.stat(abs)
    if (!st.isFile()) continue
    const txt = await readText(abs)
    mustNotMatch(txt, /\/api\/dev\//, '/api/dev endpoints')
  }

  const dateCompareMustCast = [
    { name: 'tickets.js', txt: tickets },
    { name: 'closeout.js', txt: closeout },
    { name: 'owner.js', txt: owner },
    { name: 'customers.js', txt: customers },
  ]
  for (const f of dateCompareMustCast) {
    const badEq = /day_date\s*=\s*\$\d+(?!\s*::date)/g
    const badGte = /day_date\s*>=\s*\$\d+(?!\s*::date)/g
    const badLte = /day_date\s*<=\s*\$\d+(?!\s*::date)/g
    if (badEq.test(f.txt)) fail(`${f.name}: found day_date equality without ::date cast`)
    if (badGte.test(f.txt)) fail(`${f.name}: found day_date >= without ::date cast`)
    if (badLte.test(f.txt)) fail(`${f.name}: found day_date <= without ::date cast`)
  }

  if (priceBoard.includes('new Date().toISOString()')) {
    fail('priceBoard.js: still uses JS timestamps; expected DB now() for updated_at')
  }

  if (process.exitCode !== 1) {
    process.stdout.write('Smoke tests passed\n')
  }
}

await main()
