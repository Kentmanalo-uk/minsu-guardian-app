-- Sample data for demos and testing (all names are fictional).
-- Loaded by database/setup.js when SEED_SAMPLE_DATA=true and the students table is empty.

INSERT INTO students (student_id, student_name, email, phone, course, year_level) VALUES
  ('MBC2023-0101', 'Juan Dela Cruz',   'juan.delacruz@example.edu.ph',   '09171230101', 'BS Information Technology', '3rd Year'),
  ('MBC2023-0102', 'Maria Santos',     'maria.santos@example.edu.ph',    '09171230102', 'BS Criminology',            '2nd Year'),
  ('MBC2024-0201', 'Pedro Reyes',      'pedro.reyes@example.edu.ph',     '09171230201', 'BS Education',              '1st Year'),
  ('MBC2022-0301', 'Ana Garcia',       'ana.garcia@example.edu.ph',      '09171230301', 'BS Fisheries',              '4th Year'),
  ('MBC2023-0103', 'Jose Mendoza',     'jose.mendoza@example.edu.ph',    '09171230103', 'BS Information Technology', '3rd Year'),
  ('MBC2024-0202', 'Liza Villanueva',  'liza.villanueva@example.edu.ph', '09171230202', 'BS Tourism Management',     '1st Year');

INSERT INTO disciplinary_cases (student_id, status, created_at) VALUES
  ('MBC2023-0101', 'resolved', '2026-08-18 09:15:00'),
  ('MBC2023-0102', 'active',   '2026-09-04 13:40:00'),
  ('MBC2024-0201', 'pending',  '2026-10-12 08:05:00'),
  ('MBC2022-0301', 'pending',  '2026-10-27 15:20:00');

UPDATE disciplinary_cases
SET case_number = CONCAT('CASE-', YEAR(created_at), '-', LPAD(id, 5, '0'))
WHERE case_number IS NULL;

INSERT INTO incidents (case_id, offense_level, description, date_of_incident, location, reported_by, submitted_by, created_at)
SELECT c.id, v.offense_level, v.description, v.date_of_incident, v.location, v.reported_by,
       (SELECT MIN(id) FROM users WHERE role = 'admin'), v.created_at
FROM (
  SELECT 'MBC2023-0101' AS student_id, '1st Offense' AS offense_level, 'Not wearing the prescribed uniform' AS description, DATE('2026-08-18') AS date_of_incident, 'Main Gate' AS location, 'Security Guard R. Ramos' AS reported_by, TIMESTAMP('2026-08-18 09:15:00') AS created_at
  UNION ALL SELECT 'MBC2023-0102', '1st Offense', 'Cutting classes (3 consecutive meetings)', '2026-09-04', 'CIT Building', 'Prof. L. Aquino', '2026-09-04 13:40:00'
  UNION ALL SELECT 'MBC2023-0102', '2nd Offense', 'Smoking inside the campus', '2026-10-02', 'Behind the Gymnasium', 'Security Guard R. Ramos', '2026-10-02 16:10:00'
  UNION ALL SELECT 'MBC2024-0201', '1st Offense', 'Vandalism of classroom chairs', '2026-10-12', 'Room 204, Education Building', 'Prof. M. Castillo', '2026-10-12 08:05:00'
  UNION ALL SELECT 'MBC2022-0301', '1st Offense', 'Using a borrowed ID to enter the library', '2026-09-15', 'Library', 'Librarian J. Flores', '2026-09-15 10:30:00'
  UNION ALL SELECT 'MBC2022-0301', '2nd Offense', 'Disrespectful behavior toward a faculty member', '2026-10-08', 'Fisheries Laboratory', 'Prof. A. Bautista', '2026-10-08 14:00:00'
  UNION ALL SELECT 'MBC2022-0301', '3rd Offense', 'Fighting with another student', '2026-10-27', 'Canteen', 'Security Guard R. Ramos', '2026-10-27 15:20:00'
) AS v
JOIN disciplinary_cases c ON c.student_id = v.student_id;
