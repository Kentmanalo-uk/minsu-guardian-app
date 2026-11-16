// Module 3 — Case Management & Sanctions. Owns the `disciplinary_cases` and `incidents`
// tables: one case per student, one incidents row per reported offense.
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { db, transaction } from './lib/db.js'
import { requireAuth } from './lib/auth.js'
import { HttpError, callService, requireFields, errorHandler } from './lib/http.js'

const STATUSES = ['pending', 'active', 'resolved']
const GOOD_MORAL_MAX_OFFENSES = 2 // Only 1st and 2nd offense are eligible

// A case row with its student's name and the details of its latest incident
const CASE_SELECT = `
  SELECT c.id, c.case_number, c.student_id, s.student_name, c.status, c.created_at, c.updated_at,
         li.offense_level AS violation_type, li.description, li.date_of_incident, li.location, li.reported_by,
         (SELECT COUNT(*) FROM incidents i WHERE i.case_id = c.id) AS offense_count
  FROM disciplinary_cases c
  JOIN students s ON s.student_id = c.student_id
  LEFT JOIN incidents li ON li.id = (SELECT MAX(id) FROM incidents WHERE case_id = c.id)`

// Offense level and good-moral eligibility, derived from the stored case
function withOffenseInfo(case_) {
  let offenseCount = case_.offense_count || 1
  const offenseLevel = case_.violation_type || '1st Offense'
  const offenseMatch = offenseLevel.match(/(\d+)(st|nd|rd|th)/)
  if (offenseMatch) offenseCount = parseInt(offenseMatch[1])

  return {
    ...case_,
    violationCount: offenseCount,
    offenseNumber: offenseCount,
    offenseLevel,
    isEligibleForGoodMoral: offenseCount <= GOOD_MORAL_MAX_OFFENSES,
  }
}

// Attach offense_history (oldest first) to each case
async function withHistory(cases) {
  if (!cases.length) return cases
  const [rows] = await db.query(
    `SELECT case_id, offense_level, description, date_of_incident, location, reported_by, created_at AS reported_at
     FROM incidents WHERE case_id IN (?) ORDER BY id`,
    [cases.map(c => c.id)],
  )
  return cases.map(c => withOffenseInfo({
    ...c,
    offense_history: rows.filter(r => r.case_id === c.id).map(({ case_id, ...r }) => r),
  }))
}

async function findCase(where, params) {
  const [rows] = await db.query(`${CASE_SELECT} WHERE ${where}`, params)
  return rows.length ? (await withHistory(rows))[0] : null
}

const app = express()
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*' }))
app.use(express.json())

app.get('/health', (req, res) => res.json({ service: 'case-service', status: 'ok' }))

app.use('/cases', requireAuth)

// ?status=pending|active|resolved  ?limit=10
app.get('/cases', async (req, res) => {
  const params = []
  let sql = CASE_SELECT
  if (req.query.status) { sql += ' WHERE c.status = ?'; params.push(req.query.status) }
  sql += ' ORDER BY c.created_at DESC, c.id DESC'
  if (req.query.limit) { sql += ' LIMIT ?'; params.push(Math.min(parseInt(req.query.limit) || 10, 500)) }

  const [rows] = await db.query(sql, params)
  res.json(await withHistory(rows))
})

// { [student_id]: number of offenses so far } — used to suggest the next offense level
app.get('/cases/offense-counts', async (req, res) => {
  const [rows] = await db.query(
    `SELECT c.student_id, COUNT(i.id) AS n FROM disciplinary_cases c
     LEFT JOIN incidents i ON i.case_id = c.id GROUP BY c.student_id`,
  )
  res.json(Object.fromEntries(rows.map(r => [r.student_id, Number(r.n)])))
})

// Good-moral certificate check: combines this module's case data with the Student module's record
app.get('/cases/good-moral/:studentId', async (req, res) => {
  const { studentId } = req.params
  const case_ = await findCase('c.student_id = ?', [studentId])

  let student = null
  try {
    student = await callService(process.env.STUDENT_SERVICE_URL, `/students/${encodeURIComponent(studentId)}`, { token: req.token })
  } catch (err) {
    if (err.status !== 404) throw err
  }
  if (!student && !case_) throw new HttpError(404, 'Student not found')

  res.json({
    student_id: studentId,
    student_name: student?.student_name || case_.student_name,
    course: student?.course || null,
    year_level: student?.year_level || null,
    offenseCount: case_?.offenseNumber || 0,
    offenseLevel: case_?.offenseLevel || null,
    eligible: case_ ? case_.isEligibleForGoodMoral : true,
  })
})

app.get('/cases/:id', async (req, res) => {
  const case_ = await findCase('c.id = ?', [req.params.id])
  if (!case_) throw new HttpError(404, 'Case not found')
  res.json(case_)
})

// Record an offense: added to the student's existing case, or opens a new one.
// Called by the Incident module. The whole thing is one transaction.
app.post('/cases/offenses', async (req, res) => {
  requireFields(req.body, ['student_id', 'violation_type', 'description', 'date_of_incident', 'location', 'reported_by'])
  const { student_id, violation_type, description, date_of_incident, location, reported_by } = req.body
  const submittedBy = req.user?.uid ?? null

  const result = await transaction(async (conn) => {
    // FOR UPDATE locks the student's case row, so two simultaneous reports can't both create a case
    const [existing] = await conn.query('SELECT id, case_number FROM disciplinary_cases WHERE student_id = ? FOR UPDATE', [student_id])
    let caseId, caseNumber, created = false

    if (existing.length) {
      caseId = existing[0].id
      caseNumber = existing[0].case_number
      await conn.query("UPDATE disciplinary_cases SET status = 'pending' WHERE id = ?", [caseId])
    } else {
      const [ins] = await conn.query('INSERT INTO disciplinary_cases (student_id) VALUES (?)', [student_id])
      caseId = ins.insertId
      caseNumber = `CASE-${new Date().getFullYear()}-${String(caseId).padStart(5, '0')}`
      await conn.query('UPDATE disciplinary_cases SET case_number = ? WHERE id = ?', [caseNumber, caseId])
      created = true
    }

    await conn.query(
      `INSERT INTO incidents (case_id, offense_level, description, date_of_incident, location, reported_by, submitted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [caseId, violation_type, description, date_of_incident, location, reported_by, submittedBy],
    )
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM incidents WHERE case_id = ?', [caseId])
    return { id: caseId, case_number: caseNumber, offense_count: Number(n), created }
  }).catch(err => {
    if (err.code === 'ER_NO_REFERENCED_ROW_2') throw new HttpError(404, `Student ${student_id} is not registered`)
    throw err
  })

  res.status(result.created ? 201 : 200).json({ ...result, violation_type })
})

app.patch('/cases/:id/status', async (req, res) => {
  const { status } = req.body
  if (!STATUSES.includes(status)) throw new HttpError(400, `Status must be one of: ${STATUSES.join(', ')}`)
  const [result] = await db.query('UPDATE disciplinary_cases SET status = ? WHERE id = ?', [status, req.params.id])
  if (!result.affectedRows) throw new HttpError(404, 'Case not found')
  res.json(await findCase('c.id = ?', [req.params.id]))
})

// Kept for the "Merge duplicates" button. The UNIQUE key on student_id means
// MySQL never stores two cases for one student, so there is nothing to merge.
app.post('/cases/merge-duplicates', (req, res) => res.json({ mergedCount: 0 }))

app.use(errorHandler)

const PORT = process.env.PORT || 4004
app.listen(PORT, () => console.log(`case-service listening on :${PORT}`))
