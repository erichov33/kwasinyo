import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : process.env.VERCEL
    ? path.resolve('/tmp', 'kwasinyo-data')
    : path.resolve(process.cwd(), 'data')
fs.mkdirSync(dataDir, { recursive: true })

const dbPath = path.join(dataDir, 'kwasinyo.sqlite')
export const db = new Database(dbPath)
db.pragma('foreign_keys = ON')

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('cashier','owner')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vehicle_types (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS service_types (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS price_matrix (
      vehicle_type_id INTEGER NOT NULL REFERENCES vehicle_types(id) ON DELETE CASCADE,
      service_type_id INTEGER NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
      updated_at TEXT NOT NULL,
      PRIMARY KEY (vehicle_type_id, service_type_id)
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number INTEGER NOT NULL UNIQUE,
      day_date TEXT NOT NULL,
      plate TEXT NOT NULL,
      vehicle_type_id INTEGER NOT NULL REFERENCES vehicle_types(id),
      vehicle_type_name TEXT NOT NULL,
      service_type_id INTEGER NOT NULL REFERENCES service_types(id),
      service_type_name TEXT NOT NULL,
      base_price_cents INTEGER NOT NULL CHECK (base_price_cents >= 0),
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
      price_overridden INTEGER NOT NULL DEFAULT 0 CHECK (price_overridden IN (0,1)),
      payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','card','other')),
      cashier_user_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_day_date ON tickets(day_date);

    CREATE TABLE IF NOT EXISTS day_reconciliations (
      day_date TEXT PRIMARY KEY,
      tickets_count INTEGER NOT NULL CHECK (tickets_count >= 0),
      expected_revenue_cents INTEGER NOT NULL CHECK (expected_revenue_cents >= 0),
      expected_cash_cents INTEGER NOT NULL CHECK (expected_cash_cents >= 0),
      declared_cash_cents INTEGER NOT NULL CHECK (declared_cash_cents >= 0),
      discrepancy_cash_cents INTEGER NOT NULL,
      cashier_submitted_at TEXT NOT NULL,
      owner_confirmed_at TEXT,
      owner_note TEXT
    );
  `)

  ensureTicketNameColumns()
  seedDefaults()
}

function ensureTicketNameColumns() {
  const cols = db.prepare("PRAGMA table_info('tickets')").all().map((r) => r.name)
  const hasVehicleName = cols.includes('vehicle_type_name')
  const hasServiceName = cols.includes('service_type_name')

  if (!hasVehicleName) {
    db.exec("ALTER TABLE tickets ADD COLUMN vehicle_type_name TEXT NOT NULL DEFAULT ''")
  }
  if (!hasServiceName) {
    db.exec("ALTER TABLE tickets ADD COLUMN service_type_name TEXT NOT NULL DEFAULT ''")
  }

  db.exec(`
    UPDATE tickets
    SET vehicle_type_name = (SELECT name FROM vehicle_types WHERE id = tickets.vehicle_type_id)
    WHERE vehicle_type_name = '';
  `)
  db.exec(`
    UPDATE tickets
    SET service_type_name = (SELECT name FROM service_types WHERE id = tickets.service_type_id)
    WHERE service_type_name = '';
  `)
}

function seedDefaults() {
  const vehicleCount = db.prepare('SELECT COUNT(*) AS c FROM vehicle_types').get().c
  const serviceCount = db.prepare('SELECT COUNT(*) AS c FROM service_types').get().c

  if (vehicleCount === 0) {
    const insert = db.prepare('INSERT INTO vehicle_types (name, sort_order, active) VALUES (?, ?, 1)')
    const vehicles = ['Sedan', 'SUV', 'Bakkie', 'Minivan']
    db.transaction(() => {
      vehicles.forEach((name, idx) => insert.run(name, idx))
    })()
  }

  if (serviceCount === 0) {
    const insert = db.prepare('INSERT INTO service_types (name, sort_order, active) VALUES (?, ?, 1)')
    const services = ['Basic Wash', 'Full Wash', 'Premium Detail']
    db.transaction(() => {
      services.forEach((name, idx) => insert.run(name, idx))
    })()
  }

  const hasAnyPrice = db.prepare('SELECT COUNT(*) AS c FROM price_matrix').get().c
  if (hasAnyPrice === 0) {
    const vehicles = db.prepare('SELECT id, name FROM vehicle_types ORDER BY sort_order ASC, id ASC').all()
    const services = db.prepare('SELECT id, name FROM service_types ORDER BY sort_order ASC, id ASC').all()
    const insert = db.prepare(
      'INSERT INTO price_matrix (vehicle_type_id, service_type_id, price_cents, updated_at) VALUES (?, ?, ?, ?)',
    )
    const now = new Date().toISOString()
    const defaultPrices = new Map([
      ['Sedan|Basic Wash', 4000],
      ['Sedan|Full Wash', 6000],
      ['Sedan|Premium Detail', 9000],
      ['SUV|Basic Wash', 5000],
      ['SUV|Full Wash', 7500],
      ['SUV|Premium Detail', 11000],
      ['Bakkie|Basic Wash', 5500],
      ['Bakkie|Full Wash', 8000],
      ['Bakkie|Premium Detail', 12000],
      ['Minivan|Basic Wash', 6000],
      ['Minivan|Full Wash', 8500],
      ['Minivan|Premium Detail', 13000],
    ])

    db.transaction(() => {
      for (const v of vehicles) {
        for (const s of services) {
          const key = `${v.name}|${s.name}`
          const price = defaultPrices.get(key) ?? 0
          insert.run(v.id, s.id, price, now)
        }
      }
    })()
  }
}

export function isBootstrapped() {
  const c = db.prepare('SELECT COUNT(*) AS c FROM users').get().c
  return c > 0
}
