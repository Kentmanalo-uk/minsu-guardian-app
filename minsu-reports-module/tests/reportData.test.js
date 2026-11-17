import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ordinal,
  parseOffenseLevel,
  toDate,
  normalizeCases,
  buildReport,
  filterOffenses,
  csvCell,
  buildCsv,
  CSV_COLUMNS,
  GOOD_MORAL_MAX_OFFENSES,
} from '../src/modules/reports/reportData.js'
import { makeSampleCases } from '../src/standalone/sampleCases.js'

const NOW = new Date(2026, 9, 29, 18, 0) // Oct 29, 2026

function daysAgo(days) {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('ordinal suffixes', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal),
    ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th'])
})

test('parseOffenseLevel only reads level labels', () => {
  assert.equal(parseOffenseLevel('3rd Offense'), 3)
  assert.equal(parseOffenseLevel(' 12th offense'), 12)
  assert.equal(parseOffenseLevel('Academic Dishonesty'), null)
  assert.equal(parseOffenseLevel(undefined), null)
})

test('toDate handles every stored format', () => {
  const local = toDate('2026-01-31')
  assert.equal(local.getFullYear(), 2026)
  assert.equal(local.getMonth(), 0)
  assert.equal(local.getDate(), 31)
  assert.equal(toDate('2026-02-31'), null)
  assert.equal(toDate('TBD'), null)
  assert.equal(toDate(''), null)
  const ts = { toDate: () => new Date(2025, 4, 1) }
  assert.equal(toDate(ts).getMonth(), 4)
  assert.equal(toDate({ seconds: 0 }).getTime(), 0)
  assert.equal(toDate({}), null)
})

test('offense number comes from history, not the stored label', () => {
  const raw = [{
    id: 'c1',
    student_id: 'S1',
    student_name: 'Ana',
    status: 'pending',
    violation_type: '2nd Offense',
    offense_history: [
      { offense_level: '1st Offense', date_of_incident: '2026-01-10' },
      { offense_level: '2nd Offense', date_of_incident: '2026-03-10' },
      { offense_level: '2nd Offense', date_of_incident: '2026-05-10' },
      { offense_level: '2nd Offense', date_of_incident: '2026-07-10' },
    ],
  }]
  const { offenses, students } = normalizeCases(raw)
  assert.deepEqual(offenses.map((o) => o.offenseNumber), [1, 2, 3, 4])
  assert.equal(offenses.filter((o) => o.levelMismatch).length, 2)
  const student = students.get('id:s1')
  assert.equal(student.totalOffenses, 4)
  assert.equal(student.goodMoralEligible, false)
})

test('legacy one-doc-per-incident records are grouped per student and keep categories', () => {
  const raw = [
    { id: 'b', student_id: '2024-1', student_name: 'Ben', violation_type: 'Misconduct', date_of_incident: '2026-04-02', status: 'active' },
    { id: 'a', student_id: '2024-1', student_name: 'Ben', violation_type: 'Academic Dishonesty', date_of_incident: '2026-02-01', status: 'resolved' },
  ]
  const { offenses, students } = normalizeCases(raw)
  const byCase = Object.fromEntries(offenses.map((o) => [o.caseId, o]))
  assert.equal(byCase.a.offenseNumber, 1)
  assert.equal(byCase.b.offenseNumber, 2)
  assert.equal(byCase.a.violationType, 'Academic Dishonesty')
  assert.equal(byCase.a.recordedLevel, null)
  assert.equal(students.get('id:2024-1').goodMoralEligible, GOOD_MORAL_MAX_OFFENSES >= 2)
})

test('merged history entries whose offense_level is a category are treated as categories', () => {
  const { offenses } = normalizeCases([{
    id: 'm', student_id: 'X', student_name: 'X', status: 'resolved',
    offense_history: [{ offense_level: 'Dress Code Violation', date_of_incident: '2026-01-01' }],
  }])
  assert.equal(offenses[0].violationType, 'Dress Code Violation')
  assert.equal(offenses[0].levelMismatch, false)
})

test('garbage input does not crash and empty input gives zeros', () => {
  const normalized = normalizeCases([null, 42, 'x'])
  const report = buildReport(normalized, 'all', NOW)
  assert.equal(report.totals.cases, 0)
  assert.equal(report.totals.offenses, 0)
  assert.deepEqual(report.monthlyTrend, [])
  assert.equal(buildReport(normalizeCases([]), '30d', NOW).totals.students, 0)
})

test('date ranges filter by incident date; undated offenses only appear in all time', () => {
  const raw = [
    { id: '1', student_id: 'A', student_name: 'A', violation_type: '1st Offense', date_of_incident: daysAgo(10), status: 'pending' },
    { id: '2', student_id: 'B', student_name: 'B', violation_type: '1st Offense', date_of_incident: daysAgo(40), status: 'active' },
    { id: '3', student_id: 'C', student_name: 'C', violation_type: '1st Offense', date_of_incident: 'TBD', status: 'resolved' },
    { id: '4', student_id: 'D', student_name: 'D', violation_type: '1st Offense', date_of_incident: '2025-12-31', status: 'resolved' },
  ]
  const normalized = normalizeCases(raw)
  assert.deepEqual(filterOffenses(normalized.offenses, '30d', NOW).map((o) => o.caseId), ['1'])
  assert.deepEqual(filterOffenses(normalized.offenses, '90d', NOW).map((o) => o.caseId).sort(), ['1', '2'])
  assert.deepEqual(filterOffenses(normalized.offenses, 'ytd', NOW).map((o) => o.caseId).sort(), ['1', '2'])
  assert.equal(filterOffenses(normalized.offenses, '12m', NOW).length, 3)

  const all = buildReport(normalized, 'all', NOW)
  assert.equal(all.totals.offenses, 4)
  assert.equal(all.undatedOffenses, 1)
  assert.deepEqual(all.byStatus, { pending: 1, active: 1, resolved: 2, other: 0 })

  const month = buildReport(normalized, '30d', NOW)
  assert.equal(month.totals.cases, 1)
  assert.deepEqual(month.byStatus, { pending: 1, active: 0, resolved: 0, other: 0 })
})

test('eligibility always uses the full history even inside a short range', () => {
  const raw = [{
    id: 'c', student_id: 'Z', student_name: 'Zed', status: 'active',
    offense_history: [
      { offense_level: '1st Offense', date_of_incident: daysAgo(300) },
      { offense_level: '2nd Offense', date_of_incident: daysAgo(200) },
      { offense_level: '3rd Offense', date_of_incident: daysAgo(5) },
    ],
  }]
  const report = buildReport(normalizeCases(raw), '30d', NOW)
  assert.equal(report.totals.offenses, 1)
  assert.equal(report.topStudents[0].offensesInRange, 1)
  assert.equal(report.topStudents[0].totalOffenses, 3)
  assert.equal(report.topStudents[0].goodMoralEligible, false)
  assert.equal(report.byLevel.find((b) => b.level === '3rd').offenses, 1)
})

test('monthly trend fills empty months with zero', () => {
  const raw = [
    { id: '1', student_id: 'A', violation_type: '1st Offense', date_of_incident: '2026-01-15', status: 'pending' },
    { id: '2', student_id: 'B', violation_type: '1st Offense', date_of_incident: '2026-04-02', status: 'pending' },
  ]
  const trend = buildReport(normalizeCases(raw), 'all', NOW).monthlyTrend
  assert.deepEqual(trend.map((t) => [t.month, t.offenses]), [
    ['2026-01', 1], ['2026-02', 0], ['2026-03', 0], ['2026-04', 1],
  ])
})

test('unknown status is counted as other, not dropped', () => {
  const report = buildReport(normalizeCases([
    { id: '1', student_id: 'A', violation_type: '1st Offense', date_of_incident: '2026-01-15' },
    { id: '2', student_id: 'B', violation_type: '1st Offense', date_of_incident: '2026-01-15', status: 'Closed' },
  ]), 'all', NOW)
  assert.equal(report.byStatus.other, 2)
})

test('csvCell quotes and neutralizes formulas', () => {
  assert.equal(csvCell('plain'), 'plain')
  assert.equal(csvCell('Dela Cruz, Juan'), '"Dela Cruz, Juan"')
  assert.equal(csvCell('He said "hi"'), '"He said ""hi"""')
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"')
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"')
  assert.equal(csvCell('+63 912'), "'+63 912")
  assert.equal(csvCell(null), '')
  assert.equal(csvCell(3), '3')
})

test('CSV export includes every offense in range, not just ten', () => {
  const raw = Array.from({ length: 25 }, (_, i) => ({
    id: `c${i}`, student_id: `S${i}`, student_name: `Student ${i}`,
    violation_type: '1st Offense', date_of_incident: daysAgo(i + 1), status: 'pending',
  }))
  const report = buildReport(normalizeCases(raw), 'all', NOW)
  const csv = buildCsv(report.offenses)
  assert.ok(csv.startsWith('﻿'))
  const lines = csv.slice(1).trimEnd().split('\r\n')
  assert.equal(lines.length, 26)
  assert.equal(lines[0], CSV_COLUMNS.join(','))
})

test('sample data exercises every special case', () => {
  const normalized = normalizeCases(makeSampleCases(NOW))
  const report = buildReport(normalized, 'all', NOW)
  assert.equal(report.totals.cases, 12)
  assert.equal(report.totals.offenses, 19)
  assert.ok(report.levelMismatches >= 2)
  assert.equal(report.undatedOffenses, 1)
  assert.equal(report.byStatus.other, 1)
  assert.ok(report.byViolationType.length >= 2)
  const santos = report.topStudents.find((s) => s.studentName === 'Jose Miguel Santos')
  assert.equal(santos.totalOffenses, 4)
  assert.equal(santos.goodMoralEligible, false)
  for (const range of ['30d', '90d', '12m', 'ytd']) {
    assert.ok(buildReport(normalized, range, NOW).totals.offenses > 0, `${range} has data`)
  }
})
