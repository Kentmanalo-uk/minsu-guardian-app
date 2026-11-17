// Fictional records used only when the module runs on its own without Firebase
// (demo mode). Dates are relative to "now" so every date-range filter has data.
// The set deliberately mixes the shapes found in the real database:
//   - per-student documents with offense_history (current app)
//   - one-document-per-incident records with a real violation category (old seed data)
//   - a mislabeled level, a missing status, and an unreadable date

function daysAgo(now, days) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function stamp(now, days) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, 9, 30)
}

function entry(now, days, level, description, location, reportedBy) {
  return {
    offense_level: level,
    description,
    date_of_incident: daysAgo(now, days),
    location,
    reported_by: reportedBy,
    reported_at: stamp(now, days - 1),
  }
}

function studentCase(now, id, caseNo, studentId, name, status, history) {
  const latest = history[history.length - 1]
  return {
    id,
    case_number: caseNo,
    student_id: studentId,
    student_name: name,
    violation_type: latest.offense_level,
    description: latest.description,
    date_of_incident: latest.date_of_incident,
    location: latest.location,
    reported_by: latest.reported_by,
    offense_history: history,
    offense_count: history.length,
    status,
    created_at: history[0].reported_at,
    updated_at: latest.reported_at,
  }
}

export function makeSampleCases(now = new Date()) {
  return [
    studentCase(now, 'demo-01', 'CASE-1001', '2023-01042', 'Andrea Villanueva', 'resolved', [
      entry(now, 400, '1st Offense', 'Left campus during class hours without a pass.', 'Main Gate', 'Guard R. Salazar'),
    ]),
    studentCase(now, 'demo-02', 'CASE-1002', '2023-01188', 'Mark Anthony Reyes', 'active', [
      entry(now, 330, '1st Offense', 'Not wearing the prescribed uniform on a regular class day.', 'CTE Building', 'Prof. L. Mendoza'),
      entry(now, 160, '2nd Offense', 'Repeated uniform violation after a written warning.', 'CTE Building', 'Prof. L. Mendoza'),
    ]),
    // Four offenses, but the latest was saved as "2nd Offense" - the bug the
    // report now corrects by counting the history itself.
    studentCase(now, 'demo-03', 'CASE-1003', '2022-00871', 'Jose Miguel Santos', 'pending', [
      entry(now, 300, '1st Offense', 'Vandalism on a classroom desk.', 'Room 204, CBM Building', 'Prof. A. Ramos'),
      entry(now, 210, '2nd Offense', 'Smoking inside campus premises.', 'Covered Court', 'Guard R. Salazar'),
      entry(now, 75, '2nd Offense', 'Disrupting a class with loud behavior.', 'Room 101, Main Building', 'Prof. C. Aquino'),
      entry(now, 12, '2nd Offense', 'Using a classmate\'s ID to enter the library.', 'Library', 'Librarian M. Torres'),
    ]),
    studentCase(now, 'demo-04', 'CASE-1004', '2024-00315', 'Kristine Joy Peñaflor', 'resolved', [
      entry(now, 250, '1st Offense', 'Late submission of a falsified excuse letter.', 'OSAS Office', 'OSAS Staff'),
    ]),
    studentCase(now, 'demo-05', 'CASE-1005', '2024-00402', 'Dela Cruz, Juan Paolo', 'active', [
      entry(now, 140, '1st Offense', 'Cheating during a quiz, "copying from notes".', 'Room 303, CAS Building', 'Prof. J. Garcia'),
      entry(now, 95, '2nd Offense', 'Unauthorized use of a lab computer.', 'ICT Laboratory', 'Lab Tech. D. Castillo'),
      entry(now, 20, '3rd Offense', 'Cheating during the midterm examination.', 'Room 303, CAS Building', 'Prof. J. Garcia'),
    ]),
    studentCase(now, 'demo-06', 'CASE-1006', '2025-00019', 'Rhea Mae Bautista', 'pending', [
      entry(now, 6, '1st Offense', 'Bringing a prohibited item (lighter) to class.', 'Room 110, Main Building', 'Prof. A. Ramos'),
    ]),
    studentCase(now, 'demo-07', 'CASE-1007', '2023-00654', 'Carlo Fernandez', 'resolved', [
      entry(now, 190, '1st Offense', 'Littering in the campus garden.', 'Campus Garden', 'Guard R. Salazar'),
      entry(now, 45, '2nd Offense', 'Loitering in a restricted area after hours.', 'Admin Building', 'Guard P. Navarro'),
    ]),
    studentCase(now, 'demo-08', 'CASE-1008', '2025-00140', 'Liza Marie Cruz', 'active', [
      entry(now, 3, '1st Offense', 'Disrespectful language toward a staff member.', 'Registrar', 'Registrar Staff'),
    ]),
    // Missing status: shown as "Unknown" instead of crashing the page.
    studentCase(now, 'demo-09', 'CASE-1009', '2024-00777', 'Nathaniel Ocampo', undefined, [
      entry(now, 55, '1st Offense', 'Unauthorized posting of flyers.', 'Bulletin Board, Main Building', 'OSAS Staff'),
    ]),
    // Older one-document-per-incident records with real violation categories.
    {
      id: 'demo-10',
      case_number: 'CASE-0901',
      student_id: '2022-00512',
      student_name: 'Patricia Lim',
      violation_type: 'Academic Dishonesty',
      description: 'Submitted a plagiarized research paper.',
      date_of_incident: daysAgo(now, 360),
      location: 'Online submission',
      reported_by: 'Prof. E. Velasco',
      status: 'resolved',
      created_at: stamp(now, 358),
    },
    {
      id: 'demo-11',
      case_number: 'CASE-0902',
      student_id: '2022-00512',
      student_name: 'Patricia Lim',
      violation_type: 'Dress Code Violation',
      description: 'Wore slippers inside the laboratory.',
      date_of_incident: daysAgo(now, 120),
      location: 'Chemistry Laboratory',
      reported_by: 'Lab Tech. D. Castillo',
      status: 'resolved',
      created_at: stamp(now, 119),
    },
    {
      id: 'demo-12',
      case_number: 'CASE-0903',
      student_id: '2023-00990',
      student_name: 'Vincent Manalo',
      violation_type: 'Misconduct',
      description: 'Incident date was never filled in correctly.',
      date_of_incident: 'TBD',
      location: 'Canteen',
      reported_by: 'Canteen Staff',
      status: 'pending',
      created_at: stamp(now, 30),
    },
  ]
}

export function loadSampleCases() {
  // Small delay so loading states behave like a real request.
  return new Promise((resolve) => setTimeout(() => resolve(makeSampleCases()), 250))
}
