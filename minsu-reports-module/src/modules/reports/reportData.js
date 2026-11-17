// Pure report logic for the Reports module.
// No React, no Firebase: everything here takes plain objects and returns plain
// objects, so it can be unit-tested and reused by any page that needs the same
// numbers (Dashboard, Case Management, a future Good Moral page, ...).

/** A student is eligible for a Good Moral certificate with at most this many offenses.
 *  Matches the rule Case Management uses when it offers the certificate. */
export const GOOD_MORAL_MAX_OFFENSES = 2

export const STATUS_KEYS = ['pending', 'active', 'resolved']

export const DATE_RANGES = [
  { value: 'all', label: 'All time' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'ytd', label: 'This year' },
]

const LEVEL_RE = /^\s*(\d+)\s*(?:st|nd|rd|th)\b/i
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function ordinal(n) {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

export function offenseLabel(n) {
  return `${ordinal(n)} Offense`
}

/** "3rd Offense" -> 3. Anything that isn't an offense-level label -> null. */
export function parseOffenseLevel(value) {
  if (typeof value !== 'string') return null
  const match = LEVEL_RE.exec(value)
  return match ? parseInt(match[1], 10) : null
}

/** Accepts Firestore Timestamps, {seconds}, Date, 'YYYY-MM-DD', or other date strings. */
export function toDate(value) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      const d = value.toDate()
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null
    }
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000)
    return null
  }
  if (typeof value === 'string') {
    // Date inputs store 'YYYY-MM-DD'. Parse as a local calendar date so the
    // month never shifts because of the viewer's time zone.
    const iso = ISO_DATE_RE.exec(value.trim())
    if (iso) {
      const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
      return d.getMonth() === Number(iso[2]) - 1 ? d : null
    }
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

/** Local calendar date as 'YYYY-MM-DD'. */
export function formatISODate(date) {
  if (!date) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatDisplayDate(date) {
  if (!date) return ''
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function clean(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function normalizeStatus(value) {
  const status = clean(value).toLowerCase()
  return STATUS_KEYS.includes(status) ? status : 'other'
}

export function statusLabel(status) {
  if (status === 'other') return 'Unknown'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function timeOf(date) {
  return date ? date.getTime() : Number.POSITIVE_INFINITY
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Turns raw `disciplinary_cases` documents into cases, individual offenses and
 * students. Handles both shapes found in the database:
 *   - one document per student with an `offense_history` array (current app), and
 *   - one document per incident with no history (older seed data).
 *
 * Offense numbers are computed from each student's full history in date order,
 * not from the label typed into the form, so a 4th offense is always counted as
 * a 4th offense even if it was saved as "2nd Offense".
 */
export function normalizeCases(rawCases = []) {
  const cases = []
  const offenses = []

  rawCases.forEach((raw, docIndex) => {
    if (!raw || typeof raw !== 'object') return

    const id = clean(raw.id) || `row-${docIndex}`
    const studentId = clean(raw.student_id)
    const studentName = clean(raw.student_name)
    const studentKey = studentId
      ? `id:${studentId.toLowerCase()}`
      : studentName
        ? `name:${studentName.toLowerCase()}`
        : `case:${id}`

    const caseRecord = {
      id,
      caseNumber: clean(raw.case_number),
      studentKey,
      studentId,
      studentName,
      status: normalizeStatus(raw.status),
      createdAt: toDate(raw.created_at),
      updatedAt: toDate(raw.updated_at),
    }
    cases.push(caseRecord)

    const history = Array.isArray(raw.offense_history) && raw.offense_history.length > 0
      ? raw.offense_history
      : [raw]

    history.forEach((entry, sequence) => {
      const e = entry && typeof entry === 'object' ? entry : {}
      const isLegacyDoc = e === raw
      const levelText = clean(isLegacyDoc ? raw.violation_type : (e.offense_level ?? e.violation_type))
      const recordedLevel = parseOffenseLevel(levelText)
      // The current app stores the offense *level* in violation_type. Real
      // categories only exist in older data or in a dedicated field.
      const explicitCategory = clean(e.violation_category ?? e.category)
      const violationType = explicitCategory || (recordedLevel === null ? levelText : '')

      offenses.push({
        key: `${id}#${sequence}`,
        caseId: id,
        caseNumber: caseRecord.caseNumber,
        caseStatus: caseRecord.status,
        caseCreatedAt: caseRecord.createdAt,
        studentKey,
        studentId,
        studentName,
        recordedLevel,
        recordedLevelText: recordedLevel === null ? '' : levelText,
        violationType,
        description: clean(e.description),
        date: toDate(e.date_of_incident),
        dateText: clean(e.date_of_incident),
        reportedAt: toDate(e.reported_at) || (isLegacyDoc ? caseRecord.createdAt : null),
        location: clean(e.location),
        reportedBy: clean(e.reported_by),
        sequence,
      })
    })
  })

  // Number each student's offenses in chronological order.
  const groups = new Map()
  offenses.forEach((offense) => {
    if (!groups.has(offense.studentKey)) groups.set(offense.studentKey, [])
    groups.get(offense.studentKey).push(offense)
  })

  const students = new Map()
  groups.forEach((list, studentKey) => {
    list.sort((a, b) =>
      timeOf(a.date) - timeOf(b.date) ||
      timeOf(a.reportedAt) - timeOf(b.reportedAt) ||
      timeOf(a.caseCreatedAt) - timeOf(b.caseCreatedAt) ||
      a.sequence - b.sequence
    )
    const total = list.length
    const eligible = total <= GOOD_MORAL_MAX_OFFENSES
    list.forEach((offense, index) => {
      offense.offenseNumber = index + 1
      offense.studentTotal = total
      offense.goodMoralEligible = eligible
      offense.levelMismatch = offense.recordedLevel !== null && offense.recordedLevel !== offense.offenseNumber
    })
    const latestNamed = [...list].reverse().find((o) => o.studentName) || list[list.length - 1]
    const latestCase = list[list.length - 1]
    students.set(studentKey, {
      key: studentKey,
      studentId: latestNamed.studentId || list.find((o) => o.studentId)?.studentId || '',
      studentName: latestNamed.studentName || '(No name)',
      totalOffenses: total,
      goodMoralEligible: eligible,
      latestCaseId: latestCase.caseId,
    })
  })

  return { cases, offenses, students }
}

// ---------------------------------------------------------------------------
// Date range
// ---------------------------------------------------------------------------

export function rangeStart(range, now = new Date()) {
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  switch (range) {
    case '30d': return new Date(y, m, d - 29)
    case '90d': return new Date(y, m, d - 89)
    case '12m': return new Date(y, m - 11, 1)
    case 'ytd': return new Date(y, 0, 1)
    default: return null
  }
}

function endOfDay(now) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
}

export function filterOffenses(offenses, range, now = new Date()) {
  const start = rangeStart(range, now)
  if (!start) return offenses
  const end = endOfDay(now)
  return offenses.filter((o) => o.date && o.date >= start && o.date <= end)
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function buildMonthlyTrend(offenses, range, now) {
  const dated = offenses.filter((o) => o.date)
  if (dated.length === 0) return []

  const counts = new Map()
  dated.forEach((o) => {
    const key = monthKey(o.date)
    counts.set(key, (counts.get(key) || 0) + 1)
  })

  const start = rangeStart(range, now)
  const firstDate = start || dated.reduce((min, o) => (o.date < min ? o.date : min), dated[0].date)
  const lastDate = start
    ? now
    : dated.reduce((max, o) => (o.date > max ? o.date : max), dated[0].date)

  // Fill every month between the first and last so gaps show as zero instead of
  // the line jumping straight across them.
  const trend = []
  let year = firstDate.getFullYear()
  let month = firstDate.getMonth()
  const lastYear = lastDate.getFullYear()
  const lastMonth = lastDate.getMonth()
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}`
    trend.push({ month: key, label: monthLabel(year, month), offenses: counts.get(key) || 0 })
    month += 1
    if (month > 11) { month = 0; year += 1 }
  }
  return trend
}

/**
 * Everything the Reports page shows, for one date range.
 * Offense numbers and Good Moral eligibility always use the student's full
 * history; the range only decides which offenses are counted in the charts.
 */
export function buildReport(normalized, range = 'all', now = new Date()) {
  const { cases: allCases, offenses: allOffenses, students } = normalized
  const offenses = filterOffenses(allOffenses, range, now)

  const caseIds = new Set(offenses.map((o) => o.caseId))
  const cases = allCases.filter((c) => caseIds.has(c.id))

  const byStatus = { pending: 0, active: 0, resolved: 0, other: 0 }
  cases.forEach((c) => { byStatus[c.status] += 1 })

  const levelBuckets = [
    { level: '1st', offenses: 0 },
    { level: '2nd', offenses: 0 },
    { level: '3rd', offenses: 0 },
    { level: '4th+', offenses: 0 },
  ]
  offenses.forEach((o) => { levelBuckets[Math.min(o.offenseNumber, 4) - 1].offenses += 1 })

  const typeCounts = new Map()
  let unspecifiedType = 0
  offenses.forEach((o) => {
    if (!o.violationType) { unspecifiedType += 1; return }
    typeCounts.set(o.violationType, (typeCounts.get(o.violationType) || 0) + 1)
  })
  let byViolationType = [...typeCounts.entries()]
    .map(([type, count]) => ({ type, offenses: count }))
    .sort((a, b) => b.offenses - a.offenses || a.type.localeCompare(b.type))
  if (byViolationType.length > 8) {
    const rest = byViolationType.slice(7).reduce((sum, t) => sum + t.offenses, 0)
    byViolationType = [...byViolationType.slice(0, 7), { type: 'Other', offenses: rest }]
  }

  const perStudent = new Map()
  offenses.forEach((o) => perStudent.set(o.studentKey, (perStudent.get(o.studentKey) || 0) + 1))
  const topStudents = [...perStudent.entries()]
    .map(([key, count]) => ({ ...students.get(key), offensesInRange: count }))
    .sort((a, b) =>
      b.offensesInRange - a.offensesInRange ||
      b.totalOffenses - a.totalOffenses ||
      a.studentName.localeCompare(b.studentName)
    )
    .slice(0, 10)

  const studentsInRange = [...perStudent.keys()].map((key) => students.get(key))

  const recent = [...offenses]
    .sort((a, b) => {
      const ta = (a.date || a.reportedAt)?.getTime() ?? Number.NEGATIVE_INFINITY
      const tb = (b.date || b.reportedAt)?.getTime() ?? Number.NEGATIVE_INFINITY
      return tb - ta
    })
    .slice(0, 10)

  return {
    range,
    generatedAt: now,
    offenses,
    totals: {
      cases: cases.length,
      offenses: offenses.length,
      students: perStudent.size,
      notEligibleStudents: studentsInRange.filter((s) => !s.goodMoralEligible).length,
    },
    byStatus,
    byLevel: levelBuckets,
    byViolationType,
    unspecifiedType,
    monthlyTrend: buildMonthlyTrend(offenses, range, now),
    topStudents,
    recent,
    undatedOffenses: offenses.filter((o) => !o.date).length,
    levelMismatches: offenses.filter((o) => o.levelMismatch).length,
  }
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

/** Quotes a value for CSV and neutralizes spreadsheet formulas (=, +, -, @). */
export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  if (/[",\r\n]/.test(text) || text !== text.trim()) {
    text = `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export const CSV_COLUMNS = [
  'Case Number',
  'Student ID',
  'Student Name',
  'Offense No.',
  'Recorded Level',
  'Violation Type',
  'Date of Incident',
  'Location',
  'Reported By',
  'Description',
  'Case Status',
  'Total Offenses (all time)',
  'Good Moral Eligible',
]

/** CSV text (with a UTF-8 BOM so Excel shows ñ and other accents correctly). */
export function buildCsv(offenses) {
  const rows = [...offenses]
    .sort((a, b) => timeOf(b.date) === timeOf(a.date)
      ? a.studentName.localeCompare(b.studentName)
      : (b.date ? b.date.getTime() : -Infinity) - (a.date ? a.date.getTime() : -Infinity))
    .map((o) => [
      o.caseNumber,
      o.studentId,
      o.studentName,
      offenseLabel(o.offenseNumber),
      o.recordedLevelText,
      o.violationType,
      o.date ? formatISODate(o.date) : o.dateText,
      o.location,
      o.reportedBy,
      o.description,
      statusLabel(o.caseStatus),
      o.studentTotal,
      o.goodMoralEligible ? 'Yes' : 'No',
    ])
  const lines = [CSV_COLUMNS, ...rows].map((row) => row.map(csvCell).join(','))
  return '﻿' + lines.join('\r\n') + '\r\n'
}

export function csvFileName(range, now = new Date()) {
  return `disciplinary-report-${range}-${formatISODate(now)}.csv`
}
