import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  FaDownload, FaChartPie, FaChartBar, FaChartLine, FaSync, FaExclamationTriangle,
  FaUserGraduate, FaTags, FaHistory, FaTable,
} from 'react-icons/fa'
import {
  DATE_RANGES, GOOD_MORAL_MAX_OFFENSES, STATUS_KEYS,
  normalizeCases, buildReport, buildCsv, csvFileName,
  offenseLabel, statusLabel, formatDisplayDate,
} from './reportData.js'
import { createFirestoreLoader } from './firestoreSource.js'

// Colors. Charts use a colorblind-checked set (blue / orange / aqua) and every
// colored mark also has a text label, legend or table, so color is never the
// only way to read a value. Text always stays gray.
const C = {
  brand: '#059669',
  grid: '#e5e7eb',
  axis: '#6b7280',
  text: '#374151',
  status: { pending: '#2a78d6', active: '#eb6834', resolved: '#1baf7a', other: '#9ca3af' },
  eligible: '#2a78d6',
  notEligible: '#eb6834',
}

const tooltipStyle = {
  contentStyle: { borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' },
  labelStyle: { color: '#111827', fontWeight: 600 },
}

const axisProps = {
  stroke: C.grid,
  tick: { fill: C.axis, fontSize: 12 },
  tickLine: false,
}

function truncate(text, max = 18) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function friendlyError(error) {
  const code = error?.code || ''
  if (code === 'permission-denied') {
    return 'You do not have access to case records. Sign in with an active (non-archived) account.'
  }
  if (code === 'unavailable') return 'Could not reach the database. Check your internet connection.'
  if (/No Firebase App/i.test(error?.message || '')) {
    return 'Firebase is not set up for this page. Pass a `db` prop or initialize Firebase before rendering.'
  }
  return 'Something went wrong while loading the report.'
}

/**
 * Reports & Analytics page.
 *
 * Self-contained: it does not depend on the app's Layout, Modal, auth hook or
 * toasts. Integration points are props:
 *   loadCases       async () => rawCaseDocs[]   (default: read Firestore)
 *   db              Firestore instance for the default loader
 *   collectionName  defaults to 'disciplinary_cases'
 *   onOpenCase      (caseId) => void; when given, recent rows and students link out
 */
export default function ReportsPage({ loadCases, db, collectionName, onOpenCase }) {
  const [range, setRange] = useState('all')
  const [state, setState] = useState({ phase: 'loading', rawCases: [], loadedAt: null, error: null })
  const [refreshing, setRefreshing] = useState(false)

  const loaderRef = useRef(null)
  loaderRef.current = loadCases ?? createFirestoreLoader({ db, collectionName })
  const requestId = useRef(0)

  const load = useCallback(async (isRefresh) => {
    const id = ++requestId.current
    if (isRefresh) setRefreshing(true)
    else setState((s) => ({ ...s, phase: 'loading', error: null }))
    try {
      const rows = await loaderRef.current()
      if (id !== requestId.current) return
      setState({ phase: 'ready', rawCases: Array.isArray(rows) ? rows : [], loadedAt: new Date(), error: null })
    } catch (error) {
      if (id !== requestId.current) return
      console.error('Reports: failed to load cases', error)
      setState((s) => ({ ...s, phase: s.phase === 'ready' ? 'ready' : 'error', error }))
    } finally {
      if (id === requestId.current) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load(false)
    return () => { requestId.current += 1 }
  }, [load, db, collectionName])

  const normalized = useMemo(() => normalizeCases(state.rawCases), [state.rawCases])
  const report = useMemo(
    () => buildReport(normalized, range, state.loadedAt ?? new Date()),
    [normalized, range, state.loadedAt],
  )

  const handleExport = () => {
    const blob = new Blob([buildCsv(report.offenses)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = csvFileName(range, new Date())
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const rangeLabel = DATE_RANGES.find((r) => r.value === range)?.label ?? 'All time'

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header + the one filter row that scopes everything below */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Reports &amp; Analytics</h2>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Disciplinary statistics by incident date
            {state.loadedAt && (
              <span className="text-gray-400"> · updated {state.loadedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs font-medium text-gray-600">
            Date range
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              disabled={state.phase !== 'ready'}
              className="mt-1 h-10 min-w-[10rem] rounded-lg border-2 border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            >
              {DATE_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={state.phase === 'loading' || refreshing}
            className="flex h-10 items-center gap-2 rounded-lg border-2 border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <FaSync className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={state.phase !== 'ready' || report.offenses.length === 0}
            title={`Download all ${report.offenses.length} offense record(s) for ${rangeLabel.toLowerCase()} as CSV`}
            className="flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FaDownload aria-hidden="true" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {state.phase === 'loading' && (
        <div className="flex justify-center py-16" role="status" aria-live="polite">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-600" />
          <span className="sr-only">Loading report…</span>
        </div>
      )}

      {state.phase === 'error' && (
        <ErrorCard error={state.error} onRetry={() => load(false)} />
      )}

      {state.phase === 'ready' && (
        <div className={`space-y-4 sm:space-y-6 transition-opacity ${refreshing ? 'opacity-60' : ''}`} aria-busy={refreshing}>
          {state.error && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
              <FaExclamationTriangle className="mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span>Refresh failed: {friendlyError(state.error)} Showing the last loaded data.</span>
            </div>
          )}

          <StatTiles report={report} />
          <DataNotes report={report} />

          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
            <StatusCard report={report} />
            <LevelCard report={report} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
            <TrendCard report={report} />
            <TopStudentsCard report={report} onOpenCase={onOpenCase} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
            <ViolationTypeCard report={report} />
            <RecentActivityCard report={report} onOpenCase={onOpenCase} />
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function ErrorCard({ error, onRetry }) {
  return (
    <div className="rounded-xl border-2 border-red-200 bg-white p-8 text-center shadow-lg" role="alert">
      <FaExclamationTriangle className="mx-auto mb-3 text-4xl text-red-500" aria-hidden="true" />
      <h3 className="text-lg font-bold text-gray-900">Couldn't load the report</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">{friendlyError(error)}</p>
      {error?.code && <p className="mt-1 text-xs text-gray-400">Error code: {error.code}</p>}
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        Try again
      </button>
    </div>
  )
}

function Swatch({ color, shape = 'square' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2.5 w-2.5 flex-shrink-0 ${shape === 'dot' ? 'rounded-full' : 'rounded-sm'}`}
      style={{ backgroundColor: color }}
    />
  )
}

function StatusPill({ status }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
      <Swatch color={C.status[status]} shape="dot" />
      {statusLabel(status)}
    </span>
  )
}

function StatTiles({ report }) {
  const { totals, byStatus } = report
  const tiles = [
    {
      label: 'Total cases',
      value: totals.cases,
      note: `${totals.offenses} offense${totals.offenses === 1 ? '' : 's'} · ${totals.students} student${totals.students === 1 ? '' : 's'}`,
    },
    ...STATUS_KEYS.map((key) => ({ label: statusLabel(key), value: byStatus[key], color: C.status[key], note: 'cases' })),
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-xl border-2 border-emerald-500 bg-white p-4 shadow-lg sm:p-6">
          <p className="flex items-center gap-2 text-xs font-medium text-gray-600 sm:text-sm">
            {tile.color && <Swatch color={tile.color} shape="dot" />}
            {tile.label}
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900 sm:mt-2 sm:text-3xl">{tile.value.toLocaleString()}</p>
          <p className="mt-1 text-xs text-gray-500">{tile.note}</p>
        </div>
      ))}
    </div>
  )
}

function DataNotes({ report }) {
  const notes = []
  if (report.levelMismatches > 0) {
    notes.push(`${report.levelMismatches} offense${report.levelMismatches === 1 ? ' was' : 's were'} saved with an offense level that doesn't match the student's history. This report counts each student's actual offenses instead.`)
  }
  if (report.undatedOffenses > 0) {
    notes.push(`${report.undatedOffenses} offense${report.undatedOffenses === 1 ? ' has' : 's have'} no valid incident date, so ${report.undatedOffenses === 1 ? 'it is' : 'they are'} left out of the monthly trend and the date-range filters.`)
  }
  if (report.byStatus.other > 0) {
    notes.push(`${report.byStatus.other} case${report.byStatus.other === 1 ? ' has' : 's have'} a missing or unrecognized status and ${report.byStatus.other === 1 ? 'is' : 'are'} shown as "Unknown".`)
  }
  if (notes.length === 0) return null
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <FaExclamationTriangle className="mt-0.5 flex-shrink-0 text-amber-600" aria-hidden="true" />
      <ul className="space-y-1">
        {notes.map((note) => <li key={note}>{note}</li>)}
      </ul>
    </div>
  )
}

/** Card with a Chart / Table switch, so every value is readable without hovering. */
function ChartCard({ icon: Icon, title, subtitle, isEmpty, emptyText, chart, table, fill = false }) {
  const [view, setView] = useState('chart')
  return (
    <section className="flex flex-col rounded-xl border-2 border-emerald-500 bg-white p-4 shadow-lg sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-bold text-gray-900 sm:text-lg">
            <Icon className="flex-shrink-0 text-emerald-600" aria-hidden="true" />
            {title}
          </h3>
          {subtitle && <p className="mt-1 text-xs text-gray-500 sm:text-sm">{subtitle}</p>}
        </div>
        {!isEmpty && table && (
          <div className="flex flex-shrink-0 rounded-lg bg-gray-100 p-0.5 text-xs font-semibold" role="group" aria-label={`${title} view`}>
            {['chart', 'table'].map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 capitalize transition-colors ${view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {v === 'table' && <FaTable aria-hidden="true" />}
                {v}
              </button>
            ))}
          </div>
        )}
      </div>
      {isEmpty
        ? <div className="flex flex-1 items-center justify-center py-12 text-center text-sm text-gray-500">{emptyText}</div>
        : view === 'table' ? table
          : fill
            ? <div className="relative min-h-[260px] flex-1"><div className="absolute inset-0">{chart}</div></div>
            : chart}
    </section>
  )
}

function DataTable({ columns, rows }) {
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-3 py-2 font-semibold ${c.numeric ? 'text-right' : ''}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={row.__key ?? i}>
              {columns.map((c) => (
                <td key={c.key} className={`px-3 py-2 text-gray-700 ${c.numeric ? 'text-right tabular-nums' : ''}`}>{row[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatusCard({ report }) {
  const total = report.totals.cases
  const data = [...STATUS_KEYS, 'other']
    .map((key) => ({ key, name: statusLabel(key), value: report.byStatus[key], color: C.status[key] }))
    .filter((d) => d.value > 0)
  const pct = (v) => (total ? `${Math.round((v / total) * 100)}%` : '0%')

  return (
    <ChartCard
      icon={FaChartPie}
      title="Cases by Status"
      subtitle="Current status of each case record"
      isEmpty={total === 0}
      emptyText="No cases in this period."
      chart={(
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <div className="relative h-56 w-56 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="95%" stroke="#ffffff" strokeWidth={2} isAnimationActive={false}>
                  {data.map((d) => <Cell key={d.key} fill={d.color} />)}
                </Pie>
                <Tooltip {...tooltipStyle} formatter={(value, name) => [`${value} (${pct(value)})`, name]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-gray-900">{total}</span>
              <span className="text-xs text-gray-500">cases</span>
            </div>
          </div>
          <ul className="space-y-2 text-sm">
            {data.map((d) => (
              <li key={d.key} className="flex items-center gap-2">
                <Swatch color={d.color} />
                <span className="w-20 text-gray-700">{d.name}</span>
                <span className="w-8 text-right font-semibold tabular-nums text-gray-900">{d.value}</span>
                <span className="w-10 text-right tabular-nums text-gray-500">{pct(d.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      table={(
        <DataTable
          columns={[{ key: 'name', label: 'Status' }, { key: 'value', label: 'Cases', numeric: true }, { key: 'share', label: 'Share', numeric: true }]}
          rows={data.map((d) => ({ __key: d.key, name: d.name, value: d.value, share: pct(d.value) }))}
        />
      )}
    />
  )
}

function LevelCard({ report }) {
  const data = report.byLevel.map((b) => ({ ...b, name: `${b.level} offense` }))
  return (
    <ChartCard
      icon={FaChartBar}
      title="Offenses by Level"
      subtitle="Counted from each student's full history, in date order"
      isEmpty={report.totals.offenses === 0}
      emptyText="No offenses in this period."
      fill
      chart={(
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="level" {...axisProps} interval={0} />
            <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
            <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(5,150,105,0.06)' }} formatter={(v) => [v, 'Offenses']} />
            <Bar dataKey="offenses" fill={C.brand} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              <LabelList dataKey="offenses" position="top" fill={C.text} fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      table={(
        <DataTable
          columns={[{ key: 'name', label: 'Level' }, { key: 'offenses', label: 'Offenses', numeric: true }]}
          rows={data.map((d) => ({ ...d, __key: d.level }))}
        />
      )}
    />
  )
}

function TrendCard({ report }) {
  const data = report.monthlyTrend
  return (
    <ChartCard
      icon={FaChartLine}
      title="Monthly Trend"
      subtitle="Offenses per month, by incident date"
      isEmpty={data.length === 0}
      emptyText="No dated offenses in this period."
      fill
      chart={(
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 16, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
            <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
            <Tooltip {...tooltipStyle} cursor={{ stroke: C.axis, strokeWidth: 1 }} formatter={(v) => [v, 'Offenses']} />
            <Line
              type="linear"
              dataKey="offenses"
              stroke={C.brand}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              dot={{ r: 4, fill: C.brand, stroke: '#ffffff', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: C.brand, stroke: '#ffffff', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
      table={(
        <DataTable
          columns={[{ key: 'label', label: 'Month' }, { key: 'offenses', label: 'Offenses', numeric: true }]}
          rows={[...data].reverse().map((d) => ({ ...d, __key: d.month }))}
        />
      )}
    />
  )
}

function StudentTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const s = payload[0].payload
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="text-sm font-semibold text-gray-900">{s.studentName}</p>
      {s.studentId && <p className="text-gray-500">ID {s.studentId}</p>}
      <p className="mt-1 text-gray-700"><span className="font-semibold text-gray-900">{s.offensesInRange}</span> in this period · <span className="font-semibold text-gray-900">{s.totalOffenses}</span> total</p>
      <p className="mt-1 flex items-center gap-1.5 text-gray-700">
        <Swatch color={s.goodMoralEligible ? C.eligible : C.notEligible} />
        {s.goodMoralEligible ? 'Eligible for Good Moral' : 'Not eligible for Good Moral'}
      </p>
    </div>
  )
}

function TopStudentsCard({ report, onOpenCase }) {
  const data = report.topStudents
  const height = Math.max(180, data.length * 34 + 24)
  return (
    <ChartCard
      icon={FaUserGraduate}
      title="Students with Most Offenses"
      subtitle={`Top ${data.length || 10} in this period · Good Moral allows up to ${GOOD_MORAL_MAX_OFFENSES} offenses in total`}
      isEmpty={data.length === 0}
      emptyText="No offenses in this period."
      chart={(
        <div>
          <ResponsiveContainer width="100%" height={height}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 28, left: 0, bottom: 0 }}
            >
              <CartesianGrid horizontal={false} stroke={C.grid} />
              <XAxis type="number" allowDecimals={false} {...axisProps} />
              <YAxis
                type="category"
                dataKey="studentName"
                width={130}
                {...axisProps}
                axisLine={false}
                tickFormatter={(name) => truncate(name)}
              />
              <Tooltip content={<StudentTooltip />} cursor={{ fill: 'rgba(5,150,105,0.06)' }} />
              <Bar
                dataKey="offensesInRange"
                maxBarSize={20}
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
                cursor={onOpenCase ? 'pointer' : undefined}
                onClick={onOpenCase ? (_, index) => { const s = data[index]; if (s) onOpenCase(s.latestCaseId) } : undefined}
              >
                {data.map((s) => <Cell key={s.key} fill={s.goodMoralEligible ? C.eligible : C.notEligible} />)}
                <LabelList dataKey="offensesInRange" position="right" fill={C.text} fontSize={12} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs text-gray-600 sm:text-sm">
            <span className="flex items-center gap-2"><Swatch color={C.eligible} />Eligible for Good Moral</span>
            <span className="flex items-center gap-2"><Swatch color={C.notEligible} />Not eligible ({GOOD_MORAL_MAX_OFFENSES + 1}+ offenses)</span>
          </div>
        </div>
      )}
      table={(
        <DataTable
          columns={[
            { key: 'name', label: 'Student' },
            { key: 'studentId', label: 'ID' },
            { key: 'offensesInRange', label: 'In period', numeric: true },
            { key: 'totalOffenses', label: 'Total', numeric: true },
            { key: 'goodMoral', label: 'Good Moral' },
          ]}
          rows={data.map((s) => ({
            __key: s.key,
            name: onOpenCase
              ? <button type="button" className="text-left font-medium text-emerald-700 hover:underline" onClick={() => onOpenCase(s.latestCaseId)}>{s.studentName}</button>
              : s.studentName,
            studentId: s.studentId || '—',
            offensesInRange: s.offensesInRange,
            totalOffenses: s.totalOffenses,
            goodMoral: s.goodMoralEligible ? 'Eligible' : 'Not eligible',
          }))}
        />
      )}
    />
  )
}

function ViolationTypeCard({ report }) {
  const data = report.byViolationType
  const unspecified = report.unspecifiedType
  return (
    <ChartCard
      icon={FaTags}
      title="Offenses by Violation Type"
      subtitle={unspecified > 0 && data.length > 0
        ? `${unspecified} offense${unspecified === 1 ? ' has' : 's have'} no violation type recorded`
        : 'Grouped by the violation category saved with each offense'}
      isEmpty={data.length === 0}
      emptyText={report.totals.offenses === 0
        ? 'No offenses in this period.'
        : 'No violation types recorded. The current incident form saves only the offense level, so there is nothing to group by yet.'}
      chart={(
        <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34 + 24)}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 28, left: 0, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke={C.grid} />
            <XAxis type="number" allowDecimals={false} {...axisProps} />
            <YAxis type="category" dataKey="type" width={140} {...axisProps} axisLine={false} tickFormatter={(t) => truncate(t, 20)} />
            <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(5,150,105,0.06)' }} formatter={(v) => [v, 'Offenses']} />
            <Bar dataKey="offenses" fill={C.brand} maxBarSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <LabelList dataKey="offenses" position="right" fill={C.text} fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      table={(
        <DataTable
          columns={[{ key: 'type', label: 'Violation type' }, { key: 'offenses', label: 'Offenses', numeric: true }]}
          rows={[...data, ...(unspecified ? [{ type: 'Not recorded', offenses: unspecified }] : [])].map((d) => ({ ...d, __key: d.type }))}
        />
      )}
    />
  )
}

function RecentActivityCard({ report, onOpenCase }) {
  const items = report.recent
  return (
    <section className="rounded-xl border-2 border-emerald-500 bg-white p-4 shadow-lg sm:p-6">
      <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-gray-900 sm:text-lg">
        <FaHistory className="text-emerald-600" aria-hidden="true" />
        Recent Offenses
      </h3>
      {items.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-500">No offenses in this period.</p>
      ) : (
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {items.map((o) => {
            const body = (
              <>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">
                    {o.studentName || '(No name)'}
                    <span className="font-normal text-gray-500"> · {offenseLabel(o.offenseNumber)}</span>
                  </p>
                  <p className="mt-0.5 truncate text-sm text-gray-600">{o.violationType || o.description || 'No description'}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {o.caseNumber || 'No case number'} · {o.date ? formatDisplayDate(o.date) : 'No valid date'}
                    {o.levelMismatch && <span className="text-amber-700"> · saved as {o.recordedLevelText}</span>}
                  </p>
                </div>
                <StatusPill status={o.caseStatus} />
              </>
            )
            return (
              <li key={o.key}>
                {onOpenCase ? (
                  <button
                    type="button"
                    onClick={() => onOpenCase(o.caseId)}
                    className="flex w-full items-start gap-3 rounded-lg bg-gray-50 p-3 text-left transition-colors hover:bg-gray-100"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
