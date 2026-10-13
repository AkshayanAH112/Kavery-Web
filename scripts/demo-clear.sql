-- Removes everything scripts/demo.sql added. Children before parents.
DELETE FROM marks WHERE id LIKE 'demo-%';
DELETE FROM exams WHERE id LIKE 'demo-%';
DELETE FROM attendance WHERE id LIKE 'demo-%';
DELETE FROM leave_alerts WHERE id LIKE 'demo-%';
DELETE FROM class_sessions WHERE id LIKE 'demo-%';
DELETE FROM students WHERE id LIKE 'demo-%';
DELETE FROM batches WHERE id LIKE 'demo-%';
DELETE FROM members WHERE id LIKE 'demo-%';
DELETE FROM push_log WHERE id LIKE 'demo-%';
