// Module 2 — Incident Reporting. Takes a report, checks the student with the Student module,
// and records the offense through the Case module (which saves it in the `incidents` table).
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { db } from './lib/db.js'
import { requireAuth } from './lib/auth.js'
import { HttpError, callService, requireFields, errorHandler } from './lib/http.js'

const { STUDENT_SERVICE_URL, CASE_SERVICE_URL } = process.env

const app = express()
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*' }))
app.use(express.json())

app.get('/health', (req, res) => res.json({ service: 'incident-service', status: 'ok' }))

app.use('/incidents', requireAuth)

// Students for the report form, with how many offenses each already has
app.get('/incidents/students', async (req, res) => {
  const [students, offenseCounts] = await Promise.all([
    callService(STUDENT_SERVICE_URL, '/students', { token: req.token }),
    callService(CASE_SERVICE_URL, '/cases/offense-counts', { token: req.token }),
  ])

  res.json(students.map(s => ({
    name: s.student_name,
    id: s.student_id,
    course: s.course,
    year_level: s.year_level,
    offenseCount: offenseCounts[s.student_id] || 0,
  })))
})

app.post('/incidents', async (req, res) => {
  requireFields(req.body, ['student_id', 'violation_type', 'description', 'date_of_incident', 'location', 'reported_by'])
  const { student_id, violation_type, description, date_of_incident, location, reported_by } = req.body

  let student
  try {
    student = await callService(STUDENT_SERVICE_URL, `/students/${encodeURIComponent(student_id)}`, { token: req.token })
  } catch (err) {
    if (err.status === 404) throw new HttpError(404, `Student ${student_id} is not registered. Add them under Students first.`)
    throw err
  }

  const caseResult = await callService(CASE_SERVICE_URL, '/cases/offenses', {
    method: 'POST',
    token: req.token,
    body: {
      student_id,
      student_name: student.student_name,
      violation_type,
      description,
      date_of_incident,
      location,
      reported_by,
    },
  })

  res.status(201).json(caseResult)
})

// ?student_id=  — incident log, newest first
app.get('/incidents', async (req, res) => {
  const params = []
  let sql = `SELECT i.id, c.student_id, s.student_name, i.offense_level AS violation_type, i.description,
                    i.date_of_incident, i.location, i.reported_by, i.case_id, c.case_number, i.submitted_by, i.created_at
             FROM incidents i
             JOIN disciplinary_cases c ON c.id = i.case_id
             JOIN students s ON s.student_id = c.student_id`
  if (req.query.student_id) { sql += ' WHERE c.student_id = ?'; params.push(req.query.student_id) }
  const [rows] = await db.query(sql + ' ORDER BY i.created_at DESC, i.id DESC', params)
  res.json(rows)
})

app.use(errorHandler)

const PORT = process.env.PORT || 4003
app.listen(PORT, () => console.log(`incident-service listening on :${PORT}`))
