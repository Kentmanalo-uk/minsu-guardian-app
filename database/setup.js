// Creates the database (when the account is allowed to) and its tables, the first admin account,
// and optional sample data. Safe to run again: it never overwrites existing rows.
// Usage: npm run db:setup   (reads DB_* and ADMIN_* from the root .env)
import fs from 'node:fs'
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'

try { process.loadEnvFile('.env') } catch { /* variables may already be set */ }

const { DB_HOST = '127.0.0.1', DB_PORT = '3306', DB_USER = 'root', DB_PASSWORD = '', DB_NAME = 'minsu_disciplinary', ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME = 'System Administrator' } = process.env

const conn = await mysql.createConnection({
  host: DB_HOST, port: Number(DB_PORT), user: DB_USER, password: DB_PASSWORD, multipleStatements: true,
})

// Hosting accounts (e.g. Hostinger) can't create databases; there the database already exists
try {
  await conn.query('CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [DB_NAME])
} catch (err) {
  if (err.code !== 'ER_DBACCESS_DENIED_ERROR') throw err
}
await conn.query('USE ??', [DB_NAME])

await conn.query(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'))
const [approvalColumns] = await conn.query("SHOW COLUMNS FROM users LIKE 'approved'")
if (approvalColumns.length === 0) {
  await conn.query('ALTER TABLE users ADD COLUMN approved BOOLEAN NOT NULL DEFAULT TRUE AFTER role')
  console.log('✓ Added account approval status; existing accounts remain approved')
}
console.log(`✓ Database ${DB_NAME} and tables are ready`)

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.log('Skipped admin account: set ADMIN_EMAIL and ADMIN_PASSWORD in .env to create one.')
} else if (ADMIN_PASSWORD.length < 8) {
  console.log('Skipped admin account: ADMIN_PASSWORD must be at least 8 characters.')
} else {
  const [rows] = await conn.query('SELECT id FROM users WHERE email = ?', [ADMIN_EMAIL])
  if (rows.length) {
    console.log(`Admin ${ADMIN_EMAIL} already exists; left unchanged.`)
  } else {
    await conn.query(
      "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
      [ADMIN_NAME, ADMIN_EMAIL, await bcrypt.hash(ADMIN_PASSWORD, 10)],
    )
    console.log(`✓ Admin account created: ${ADMIN_EMAIL}`)
  }
}

if (process.env.SEED_SAMPLE_DATA === 'true') {
  const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM students')
  if (n > 0) {
    console.log('Skipped sample data: the database already has students.')
  } else {
    await conn.query(fs.readFileSync(new URL('./sample-data.sql', import.meta.url), 'utf8'))
    console.log('✓ Sample data added (6 students, 4 cases, 7 incidents)')
  }
}

await conn.end()
