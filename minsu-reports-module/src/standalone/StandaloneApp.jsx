// Shell used only when the Reports module runs by itself (npm run dev).
// It supplies what the main app normally provides: a header, sign-in, and data.
import { useEffect, useMemo, useState } from 'react'
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { FaGavel, FaSignOutAlt, FaInfoCircle } from 'react-icons/fa'
import { ReportsPage } from '../modules/reports'
import { getFirebaseApp, isDemoMode } from './firebaseApp'
import { loadSampleCases } from './sampleCases'

export default function StandaloneApp() {
  return isDemoMode ? <DemoReports /> : <FirebaseReports />
}

function Shell({ right, children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b-4 border-emerald-700 bg-gradient-to-r from-emerald-600 to-green-500 shadow-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-lg text-emerald-600 shadow-lg sm:h-10 sm:w-10">
              <FaGavel aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white sm:text-xl">MinSU Guardian</h1>
              <p className="text-xs text-emerald-100">Reports module · standalone</p>
            </div>
          </div>
          {right}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-8 lg:px-8">{children}</main>
    </div>
  )
}

function InfoBanner({ children }) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 sm:mb-6">
      <FaInfoCircle className="mt-0.5 flex-shrink-0 text-blue-600" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}

function DemoReports() {
  const [opened, setOpened] = useState(null)
  return (
    <Shell right={<span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">Demo data</span>}>
      <InfoBanner>
        Running with built-in sample records because no Firebase settings were found.
        Add a <code className="rounded bg-blue-100 px-1">.env</code> file (see <code className="rounded bg-blue-100 px-1">.env.example</code>) to load real cases.
      </InfoBanner>
      {opened && (
        <InfoBanner>
          In the main app this would open case <strong>{opened}</strong> in Case Management (the <code className="rounded bg-blue-100 px-1">onOpenCase</code> hook).
        </InfoBanner>
      )}
      <ReportsPage loadCases={loadSampleCases} onOpenCase={setOpened} />
    </Shell>
  )
}

function FirebaseReports() {
  const app = useMemo(() => getFirebaseApp(), [])
  const auth = useMemo(() => getAuth(app), [app])
  const db = useMemo(() => getFirestore(app), [app])
  const [user, setUser] = useState(undefined) // undefined = still checking

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), [auth])

  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50" role="status">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-600" />
        <span className="sr-only">Checking sign-in…</span>
      </div>
    )
  }

  if (!user) return <SignIn auth={auth} />

  return (
    <Shell
      right={(
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-white md:inline">{user.email}</span>
          <button
            type="button"
            onClick={() => signOut(auth)}
            className="flex items-center gap-2 rounded-lg bg-white/20 px-3 py-2 text-sm font-medium text-white hover:bg-white/30"
          >
            <FaSignOutAlt aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      )}
    >
      <ReportsPage db={db} />
    </Shell>
  )
}

function SignIn({ auth }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      setError(
        err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found'
          ? 'Invalid email or password.'
          : err.code === 'auth/too-many-requests'
            ? 'Too many attempts. Try again later.'
            : 'Sign-in failed. Check your connection and Firebase settings.'
      )
    }
    setBusy(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-green-50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-emerald-100 bg-white p-6 shadow-xl">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-xl text-white">
            <FaGavel aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Reports module</h1>
          <p className="text-sm text-gray-500">Sign in with your MinSU Guardian account</p>
        </div>
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700" role="alert">{error}</p>}
        <label className="block text-sm font-medium text-gray-700">
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
            className="mt-1 w-full rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Password
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
            className="mt-1 w-full rounded-lg border-2 border-gray-300 px-3 py-2 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </label>
        <button type="submit" disabled={busy}
          className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
