// Drop-in replacement for the main app's src/pages/Reports.jsx.
// The page itself lives in src/modules/reports and has no dependencies on the
// rest of the app. Host-specific wiring (which database, where clicks go) is here.
import { ReportsPage } from '../modules/reports'
import { db } from '../lib/firebase'

export default function Reports() {
  return <ReportsPage db={db} />
}

// When Case Management can open a case from the URL, pass a handler so the
// Recent Offenses rows and student bars link to it, for example:
//
//   import { useNavigate } from 'react-router-dom'
//   const navigate = useNavigate()
//   <ReportsPage db={db} onOpenCase={(caseId) => navigate(`/app/cases?open=${caseId}`)} />
