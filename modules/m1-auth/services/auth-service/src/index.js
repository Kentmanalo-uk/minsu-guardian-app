// Module 1 — Auth & User Management. Owns the `users` table and is the single
// place every other module asks "who is this token, and what role do they have?"
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { db } from './lib/db.js'
import { HttpError, requireFields, errorHandler } from './lib/http.js'

const ROLES = ['admin', 'officer', 'staff']
const MIN_PASSWORD = 8
const { JWT_SECRET, JWT_EXPIRES_IN = '8h' } = process.env
if (!JWT_SECRET) {
  console.error('JWT_SECRET is not set. Add a long random string to .env')
  process.exit(1)
}

// API shape of a user row (the frontend uses fullName, not full_name)
const toUser = (row) => ({
  id: row.id,
  fullName: row.full_name,
  email: row.email,
  role: row.role,
  archived: !!row.archived,
  archivedAt: row.archived_at,
  createdAt: row.created_at,
})

async function findUser(id) {
  const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id])
  return rows[0]
}

// Turn a Bearer token into the current user; rejects archived or deleted accounts
async function loadUser(token) {
  let payload
  try {
    payload = jwt.verify(token, JWT_SECRET)
  } catch {
    throw new HttpError(401, 'Your session has expired. Please log in again.')
  }
  const row = await findUser(payload.uid)
  if (!row) throw new HttpError(401, 'This account no longer exists')
  if (row.archived) throw new HttpError(403, 'This account has been disabled')
  return { uid: row.id, email: row.email, fullName: row.full_name, role: row.role }
}

async function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer /, '')
  if (!token) return next(new HttpError(401, 'Missing authorization token'))
  try {
    req.user = await loadUser(token)
    next()
  } catch (err) {
    next(err)
  }
}

const requireAdmin = (req, res, next) =>
  req.user.role === 'admin' ? next() : next(new HttpError(403, 'Admin access required'))

function checkPassword(password) {
  if (String(password).length < MIN_PASSWORD) {
    throw new HttpError(400, `Password must be at least ${MIN_PASSWORD} characters long`)
  }
}

async function createAccount({ fullName, email, password, role }) {
  if (!ROLES.includes(role)) throw new HttpError(400, `Role must be one of: ${ROLES.join(', ')}`)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Invalid email address format')
  checkPassword(password)

  try {
    const [result] = await db.query(
      'INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [fullName.trim(), email.trim().toLowerCase(), await bcrypt.hash(password, 10), role],
    )
    return toUser(await findUser(result.insertId))
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'This email is already registered')
    throw err
  }
}

const app = express()
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*' }))
app.use(express.json())

app.get('/health', (req, res) => res.json({ service: 'auth-service', status: 'ok' }))

app.post('/auth/login', async (req, res) => {
  requireFields(req.body, ['email', 'password'])
  const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [String(req.body.email).trim().toLowerCase()])
  const row = rows[0]
  // Same message for an unknown email and a wrong password, so the form doesn't reveal which accounts exist
  if (!row || !(await bcrypt.compare(req.body.password, row.password_hash))) {
    throw new HttpError(401, 'Invalid email or password')
  }
  if (row.archived) throw new HttpError(403, 'This account has been disabled')

  const token = jwt.sign({ uid: row.id, role: row.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
  res.json({ token, user: toUser(row) })
})

// Used by the other modules to check a forwarded token, and by the frontend after login
app.get('/auth/verify', authenticate, (req, res) => res.json(req.user))
app.get('/auth/me', authenticate, (req, res) => res.json(req.user))

// Public self-registration (always gets the officer role)
app.post('/auth/register', async (req, res) => {
  requireFields(req.body, ['fullName', 'email', 'password'])
  const { fullName, email, password } = req.body
  res.status(201).json(await createAccount({ fullName, email, password, role: 'officer' }))
})

app.use('/users', authenticate, requireAdmin)

app.get('/users', async (req, res) => {
  const archived = req.query.archived === 'true'
  const [rows] = await db.query('SELECT * FROM users WHERE archived = ? ORDER BY full_name', [archived])
  res.json(rows.map(toUser))
})

app.post('/users', async (req, res) => {
  requireFields(req.body, ['fullName', 'email', 'password', 'role'])
  res.status(201).json(await createAccount(req.body))
})

app.patch('/users/:id/role', async (req, res) => {
  const { role } = req.body
  if (!ROLES.includes(role)) throw new HttpError(400, `Role must be one of: ${ROLES.join(', ')}`)
  const [result] = await db.query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id])
  if (!result.affectedRows) throw new HttpError(404, 'User not found')
  res.json(toUser(await findUser(req.params.id)))
})

// Admin sets a new password (there is no email-based reset)
app.patch('/users/:id/password', async (req, res) => {
  requireFields(req.body, ['password'])
  checkPassword(req.body.password)
  const [result] = await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(req.body.password, 10), req.params.id])
  if (!result.affectedRows) throw new HttpError(404, 'User not found')
  res.status(204).end()
})

app.patch('/users/:id/archive', async (req, res) => {
  const archived = req.body.archived === true
  if (archived && Number(req.params.id) === req.user.uid) throw new HttpError(400, 'You cannot archive your own account')
  const [result] = await db.query(
    'UPDATE users SET archived = ?, archived_at = IF(?, NOW(), NULL) WHERE id = ?',
    [archived, archived, req.params.id],
  )
  if (!result.affectedRows) throw new HttpError(404, 'User not found')
  res.json(toUser(await findUser(req.params.id)))
})

app.use(errorHandler)

const PORT = process.env.PORT || 4001
app.listen(PORT, () => console.log(`auth-service listening on :${PORT}`))
