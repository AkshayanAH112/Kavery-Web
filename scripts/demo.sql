-- Demo rows for looking at the console and landing page with data in them.
-- LOCAL ONLY:  npm run db:demo   /  npm run db:demo:clear
-- Every id starts with "demo-" and every name says "Demo", so nothing here can be
-- mistaken for a real student, member or match. Never run this against production.

INSERT OR IGNORE INTO batches (id, name, year, grades, auto_promote, created_at, updated_at)
VALUES ('demo-batch', 'Demo batch 2026/27', 2027, '[4,5]', 0, strftime('%s','now') * 1000, strftime('%s','now') * 1000);

WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 24)
INSERT OR IGNORE INTO students (id, name, guardian_name, guardian_phone, grade, qr_code, registration_number, registration_date, batch_id, is_active, total_leaves, current_leave_cycle, cycle_generation, created_at, updated_at)
SELECT 'demo-student-' || i, 'Demo Student ' || i, 'Demo Guardian ' || i, '0770000000', 5, 'KEDA-5-DE' || substr('000000' || i, -6), 'KEDA/80/' || (1000 + i), strftime('%s','now') * 1000 - 60 * 86400000, 'demo-batch', 1, 0, 0, 0, strftime('%s','now') * 1000, strftime('%s','now') * 1000
FROM n;

WITH d(k) AS (VALUES (0), (1), (2), (4), (5))
INSERT OR IGNORE INTO class_sessions (id, batch_id, grade, date, time, subject, created_at, updated_at)
SELECT 'demo-class-' || k, 'demo-batch', 5, strftime('%s','now') * 1000 - k * 86400000, '16:00', 'Mathematics', strftime('%s','now') * 1000, strftime('%s','now') * 1000
FROM d;

WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 24), d(k) AS (VALUES (0), (1), (2), (4), (5))
INSERT OR IGNORE INTO attendance (id, student_id, class_id, present, date, counted_as_leave, created_at, updated_at)
SELECT 'demo-att-' || i || '-' || k, 'demo-student-' || i, 'demo-class-' || k,
       CASE WHEN ((i * 7 + k * 3) % 6) = 0 THEN 0 ELSE 1 END,
       strftime('%s','now') * 1000 - k * 86400000,
       CASE WHEN ((i * 7 + k * 3) % 6) = 0 THEN 1 ELSE 0 END,
       strftime('%s','now') * 1000, strftime('%s','now') * 1000
FROM n, d;

-- Keep the leave counters in step with the rows above, as the real attendance writer would.
UPDATE students
SET total_leaves = (SELECT count(*) FROM attendance a WHERE a.student_id = students.id AND a.counted_as_leave = 1),
    current_leave_cycle = (SELECT count(*) FROM attendance a WHERE a.student_id = students.id AND a.counted_as_leave = 1)
WHERE id LIKE 'demo-%';

INSERT OR IGNORE INTO leave_alerts (id, student_id, registration_number, student_name, type, cycle_generation, leave_count, leave_dates, status, created_at, updated_at) VALUES
  ('demo-alert-1', 'demo-student-6', 'KEDA/80/1006', 'Demo Student 6', 'admin_critical', 0, 3, '[]', 'pending', strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('demo-alert-2', 'demo-student-12', 'KEDA/80/1012', 'Demo Student 12', 'parent_warning', 0, 2, '[]', 'pending', strftime('%s','now') * 1000 - 3600000, strftime('%s','now') * 1000);

-- Cricket demo data is not here: it is played through the scoring API by scripts/demo-cricket.mjs,
-- so every score has real deliveries behind it (npm run db:demo:cricket).

WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 13)
INSERT OR IGNORE INTO members (id, full_name, phone, status, renewal_status, created_at, updated_at)
SELECT 'demo-member-' || i, 'Demo Member ' || i, '0770000000', CASE WHEN i <= 9 THEN 'approved' WHEN i <= 12 THEN 'pending' ELSE 'rejected' END, 'none', strftime('%s','now') * 1000, strftime('%s','now') * 1000
FROM n;

-- Approved demo members carry what approval issues: a member id and a year's validity (one has lapsed).
UPDATE members
SET member_code = 'KSC-M-D' || substr('0' || replace(id, 'demo-member-', ''), -2),
    valid_from = created_at,
    valid_until = strftime('%s','now') * 1000 + CASE WHEN id = 'demo-member-9' THEN -20 ELSE 330 END * 86400000
WHERE id LIKE 'demo-member-%' AND status = 'approved' AND member_code IS NULL;

INSERT OR IGNORE INTO push_log (id, topic, title, body, delivered, failed, created_at) VALUES
  ('demo-push-1', 'cricket', 'Demo: toss in 15 minutes', NULL, 18, 1, strftime('%s','now') * 1000 - 5400000),
  ('demo-push-2', 'keda', 'Demo: no class this Saturday', NULL, 31, 0, strftime('%s','now') * 1000 - 2 * 86400000);

-- The demo students can be opened on the parent page (/en/parents): index numbers KEDA/80/1001 to
-- KEDA/80/1012 with phone 0770000000, or card codes KEDA-5-DE000001 to KEDA-5-DE000012. Exam year 80
-- and the DE prefix keep them clear of anything issued to a real student.
-- Two tests for the demo batch. The term test is Part 1 and Part 2 on different days, fully entered and
-- published, so a parent sees a total. The model exam is both parts on one day with Part 2 only partly
-- entered, so the publishing gate can be tried.
INSERT OR IGNORE INTO tests (id, name, kind, grade, batch_id, is_published, published_at, created_at, updated_at) VALUES
  ('demo-test-1', 'Demo term test 1', 'test', 5, 'demo-batch', 1, strftime('%s','now') * 1000, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('demo-test-2', 'Demo model exam 1', 'model', 5, 'demo-batch', 0, NULL, strftime('%s','now') * 1000, strftime('%s','now') * 1000);

INSERT OR IGNORE INTO exams (id, test_id, part, subject, grade, batch_id, exam_date, max_marks, created_at, updated_at) VALUES
  ('demo-exam-1', 'demo-test-1', 1, 'Part 1', 5, 'demo-batch', strftime('%s','now') * 1000 - 8 * 86400000, 100, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('demo-exam-2', 'demo-test-1', 2, 'Part 2', 5, 'demo-batch', strftime('%s','now') * 1000 - 6 * 86400000, 100, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('demo-exam-3', 'demo-test-2', 1, 'Part 1', 5, 'demo-batch', strftime('%s','now') * 1000 - 1 * 86400000, 100, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('demo-exam-4', 'demo-test-2', 2, 'Part 2', 5, 'demo-batch', strftime('%s','now') * 1000 - 1 * 86400000, 100, strftime('%s','now') * 1000, strftime('%s','now') * 1000);

-- Scores are arithmetic on the student number, not random, so the demo looks the same every time.
-- Term test: every sixth student is absent from Part 1 and every eighth from Part 2, so students 6, 12
-- and 18 have only Part 2, 8 and 16 only Part 1, and 24 missed both (no total).
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 24)
INSERT OR IGNORE INTO marks (id, exam_id, student_id, marks, is_absent, created_at, updated_at)
SELECT 'demo-mark-1-' || i, 'demo-exam-1', 'demo-student-' || i, CASE WHEN i % 6 = 0 THEN 0 ELSE 38 + (i * 37) % 58 END, CASE WHEN i % 6 = 0 THEN 1 ELSE 0 END, strftime('%s','now') * 1000, strftime('%s','now') * 1000
FROM n;

WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 24)
INSERT OR IGNORE INTO marks (id, exam_id, student_id, marks, is_absent, created_at, updated_at)
SELECT 'demo-mark-2-' || i, 'demo-exam-2', 'demo-student-' || i, CASE WHEN i % 8 = 0 THEN 0 ELSE 40 + (i * 23) % 55 END, CASE WHEN i % 8 = 0 THEN 1 ELSE 0 END, strftime('%s','now') * 1000, strftime('%s','now') * 1000
FROM n;

-- Model exam: Part 1 entered for everyone, Part 2 for the first sixteen only.
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 24)
INSERT OR IGNORE INTO marks (id, exam_id, student_id, marks, is_absent, created_at, updated_at)
SELECT 'demo-mark-3-' || i, 'demo-exam-3', 'demo-student-' || i, 42 + (i * 31) % 54, 0, strftime('%s','now') * 1000, strftime('%s','now') * 1000
FROM n;

WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 16)
INSERT OR IGNORE INTO marks (id, exam_id, student_id, marks, is_absent, created_at, updated_at)
SELECT 'demo-mark-4-' || i, 'demo-exam-4', 'demo-student-' || i, 45 + (i * 29) % 50, 0, strftime('%s','now') * 1000, strftime('%s','now') * 1000
FROM n;

-- Two earlier published term tests, so the parent page's marks analysis has a trend and rank changes
-- to show. Each is both parts on one day; every ninth student missed the second one entirely.
INSERT OR IGNORE INTO tests (id, name, kind, grade, batch_id, is_published, published_at, created_at, updated_at) VALUES
  ('demo-test-3', 'Demo monthly test 1', 'test', 5, 'demo-batch', 1, strftime('%s','now') * 1000 - 33 * 86400000, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('demo-test-4', 'Demo monthly test 2', 'test', 5, 'demo-batch', 1, strftime('%s','now') * 1000 - 19 * 86400000, strftime('%s','now') * 1000, strftime('%s','now') * 1000);

INSERT OR IGNORE INTO exams (id, test_id, part, subject, grade, batch_id, exam_date, max_marks, created_at, updated_at) VALUES
  ('demo-exam-5', 'demo-test-3', 1, 'Part 1', 5, 'demo-batch', strftime('%s','now') * 1000 - 36 * 86400000, 100, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('demo-exam-6', 'demo-test-3', 2, 'Part 2', 5, 'demo-batch', strftime('%s','now') * 1000 - 36 * 86400000, 100, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('demo-exam-7', 'demo-test-4', 1, 'Part 1', 5, 'demo-batch', strftime('%s','now') * 1000 - 22 * 86400000, 100, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('demo-exam-8', 'demo-test-4', 2, 'Part 2', 5, 'demo-batch', strftime('%s','now') * 1000 - 22 * 86400000, 100, strftime('%s','now') * 1000, strftime('%s','now') * 1000);

WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 24)
INSERT OR IGNORE INTO marks (id, exam_id, student_id, marks, is_absent, created_at, updated_at)
SELECT 'demo-mark-5-' || i, 'demo-exam-5', 'demo-student-' || i, 30 + (i * 41) % 52, 0, strftime('%s','now') * 1000, strftime('%s','now') * 1000
FROM n;

WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 24)
INSERT OR IGNORE INTO marks (id, exam_id, student_id, marks, is_absent, created_at, updated_at)
SELECT 'demo-mark-6-' || i, 'demo-exam-6', 'demo-student-' || i, 34 + (i * 19) % 48, 0, strftime('%s','now') * 1000, strftime('%s','now') * 1000
FROM n;

WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 24)
INSERT OR IGNORE INTO marks (id, exam_id, student_id, marks, is_absent, created_at, updated_at)
SELECT 'demo-mark-7-' || i, 'demo-exam-7', 'demo-student-' || i, CASE WHEN i % 9 = 0 THEN 0 ELSE 36 + (i * 29) % 54 END, CASE WHEN i % 9 = 0 THEN 1 ELSE 0 END, strftime('%s','now') * 1000, strftime('%s','now') * 1000
FROM n;

WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 24)
INSERT OR IGNORE INTO marks (id, exam_id, student_id, marks, is_absent, created_at, updated_at)
SELECT 'demo-mark-8-' || i, 'demo-exam-8', 'demo-student-' || i, CASE WHEN i % 9 = 0 THEN 0 ELSE 38 + (i * 17) % 50 END, CASE WHEN i % 9 = 0 THEN 1 ELSE 0 END, strftime('%s','now') * 1000, strftime('%s','now') * 1000
FROM n;
