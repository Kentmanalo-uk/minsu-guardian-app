// Module 2 — Student Records. Owns the `students` table (primary key = student_id).
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { db } from './lib/db.js'
import { requireAuth } from './lib/auth.js'
import { HttpError, requireFields, errorHandler } from './lib/http.js'

const EDITABLE = ['student_name', 'email', 'phone', 'course', 'year_level']
const pick = (body) => Object.fromEntries(EDITABLE.filter(k => body[k] !== undefined).map(k => [k, body[k]]))
// `id` mirrors student_id so the pages can keep using row.id
const toStudent = (row) => ({ id: row.student_id, ...row })

async function findStudent(id) {
  const [rows] = await db.query('SELECT * FROM students WHERE student_id = ?', [id])
  return rows[0]
}

const app = express()
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*' }))
app.use(express.json())

app.get('/health', (req, res) => res.json({ service: 'student-service', status: 'ok' }))

app.use('/students', requireAuth)

app.get('/students', async (req, res) => {
  const [rows] = await db.query('SELECT * FROM students ORDER BY student_name')
  res.json(rows.map(toStudent))
})

app.get('/students/:id', async (req, res) => {
  const row = await findStudent(req.params.id)
  if (!row) throw new HttpError(404, 'Student not found')
  res.json(toStudent(row))
})

app.post('/students', async (req, res) => {
  requireFields(req.body, ['student_id', 'student_name'])
  const studentId = String(req.body.student_id).trim()
  try {
    await db.query('INSERT INTO students SET ?', [{ ...pick(req.body), student_id: studentId }])
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, `Student ${studentId} already exists`)
    throw err
  }
  res.status(201).json(toStudent(await findStudent(studentId)))
})

app.put('/students/:id', async (req, res) => {
  const fields = pick(req.body)
  if (!Object.keys(fields).length) throw new HttpError(400, 'Nothing to update')
  const [result] = await db.query('UPDATE students SET ? WHERE student_id = ?', [fields, req.params.id])
  if (!result.affectedRows) throw new HttpError(404, 'Student not found')
  res.json(toStudent(await findStudent(req.params.id)))
})

app.delete('/students/:id', async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM students WHERE student_id = ?', [req.params.id])
    if (!result.affectedRows) throw new HttpError(404, 'Student not found')
  } catch (err) {
    // The foreign key keeps disciplinary records from losing their student
    if (err.code === 'ER_ROW_IS_REFERENCED_2') throw new HttpError(409, 'This student has a disciplinary case and cannot be deleted')
    throw err
  }
  res.status(204).end()
})

app.use(errorHandler)

const PORT = process.env.PORT || 4002
app.listen(PORT, () => console.log(`student-service listening on :${PORT}`))
