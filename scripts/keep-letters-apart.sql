-- One-off: write க்ஷ apart (க், zero-width non-joiner, ஷ) in text saved before the
-- server did it on every save (keepLettersApart in lib/keda/bamini.ts).
-- Safe to run more than once: text already written apart no longer contains க்ஷ.
--   npx wrangler d1 execute kavery-db --local  --file scripts/keep-letters-apart.sql
--   npx wrangler d1 execute kavery-db --remote --file scripts/keep-letters-apart.sql
UPDATE students SET
  name = replace(name, 'க்ஷ', 'க்' || char(8204) || 'ஷ'),
  school = replace(school, 'க்ஷ', 'க்' || char(8204) || 'ஷ'),
  address = replace(address, 'க்ஷ', 'க்' || char(8204) || 'ஷ'),
  guardian_name = replace(guardian_name, 'க்ஷ', 'க்' || char(8204) || 'ஷ'),
  notes = replace(notes, 'க்ஷ', 'க்' || char(8204) || 'ஷ')
WHERE instr(name, 'க்ஷ') OR instr(school, 'க்ஷ') OR instr(address, 'க்ஷ') OR instr(guardian_name, 'க்ஷ') OR instr(notes, 'க்ஷ');

UPDATE leave_alerts SET student_name = replace(student_name, 'க்ஷ', 'க்' || char(8204) || 'ஷ')
WHERE instr(student_name, 'க்ஷ');
