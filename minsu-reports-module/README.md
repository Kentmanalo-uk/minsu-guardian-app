# MinSU Guardian – Reports module

The Reports & Analytics page, separated from the main app so it can be built
and run on its own, then dropped back in without changes.

```
minsu-reports-module/
├── src/modules/reports/      ← the module (this folder is what you copy into the main app)
│   ├── index.js              public exports – import from here only
│   ├── ReportsPage.jsx       the page (no Layout, Modal, useAuth or toast dependencies)
│   ├── reportData.js         pure logic: counting, filtering, CSV (unit-tested)
│   └── firestoreSource.js    reads `disciplinary_cases` from Firestore
├── src/standalone/           only used when running alone: header, sign-in, demo data
├── integration/Reports.jsx   drop-in replacement for the main app's src/pages/Reports.jsx
└── tests/reportData.test.js
```

## Run it on its own

```bash
npm install
npm run dev        # http://localhost:5174
npm test           # logic tests (no browser or Firebase needed)
npm run build
```

- **No `.env`** → runs with built-in sample records (a "Demo data" badge shows).
- **With `.env`** (copy `.env.example`, same values as the main app) → shows a
  sign-in screen, then loads real cases. The account must be an active user in
  the `users` collection, because the Firestore rules require it.
- `VITE_REPORTS_DEMO=true` forces sample data even when Firebase is configured.

It uses port 5174, so it can run next to the main app on 5173.

## Put it back into the main app

1. Copy `src/modules/reports/` to `src/modules/reports/` in the main repo.
2. Replace `src/pages/Reports.jsx` with `integration/Reports.jsx`.

Nothing else changes: `App.jsx` still routes `/app/reports` to `pages/Reports`,
the main app already has `recharts`, `react-icons` and `firebase`, and its
Tailwind config already scans `src/**`. This was checked by building the
original repo with these two steps applied.

## Props

| Prop | Default | Purpose |
|---|---|---|
| `db` | default Firebase app | Firestore instance to read from |
| `collectionName` | `'disciplinary_cases'` | collection to read |
| `loadCases` | Firestore loader | `async () => rawDocs[]` – replace the data source (tests, demo, another backend) |
| `onOpenCase` | none | `(caseId) => void`. When set, Recent Offenses rows, student bars and table names become clickable |

## What changed from the old Reports page

| Before | Now |
|---|---|
| Counted one offense per case document, so every student showed 1 and "Eligible" | Counts every entry in `offense_history`, numbered by incident date |
| Trusted the typed label ("2nd Offense") | Uses the real count; mismatched labels are flagged on the page |
| Good Moral rule was "1 offense" here but "≤ 2" in Case Management | One rule, `GOOD_MORAL_MAX_OFFENSES = 2`, exported for other pages |
| "Cases by Violation Type" actually grouped 1st/2nd/3rd Offense | Groups real categories; explains when none are recorded |
| Export only had the 10 most recent cases, unescaped | Exports every offense in the selected range; commas, quotes, line breaks, ñ and formula injection handled |
| Date range state existed but did nothing | All time / 30 days / 90 days / 12 months / this year, applied to every number |
| Monthly trend used only each case's latest date; bad dates became `NaN-NaN` | Uses every offense; empty months show 0; undated offenses are reported |
| Cases without `created_at` were silently dropped by `orderBy` | All documents are read |
| Missing status crashed the page | Shown as "Unknown" |
| Chart-only | Every chart has a Table view; colors are colorblind-safe and always labeled |
| No error state | Error card with retry; a failed refresh keeps the last data |

## Separating the other pages the same way

Use this module as the pattern for each page:

1. **One folder per page** under `src/modules/<page>/`, with an `index.js` that
   is the only thing other code imports.
2. **No imports from other pages, `Layout`, or `lib/useAuth`.** Anything the page
   needs from the host comes in as props (`db`, `onOpenCase`, the current user).
3. **Pure logic in its own file** so it can be tested without React or Firebase,
   and shared (for example, Dashboard can import `buildReport` instead of
   counting cases its own way).
4. **A thin wrapper in `src/pages/`** connects the module to the app's router and
   Firebase, so `App.jsx` never changes when a module is swapped in.
5. **A standalone shell** (`src/standalone/`) with demo data so each page can be
   developed and demoed without the rest of the app.

## Known limits

- The current incident form stores only the offense level, not the type of
  violation, so "Offenses by Violation Type" stays empty for new records until
  Case Management saves a category (for example in a `violation_category` field,
  which this module already reads).
- The 30- and 90-day views still group the trend by month.
