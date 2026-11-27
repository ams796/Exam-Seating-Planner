-- Least privilege (Lab 7 idea: give the app only what it needs).
-- Run ONCE in the Neon SQL Editor as the owner role, AFTER schema.sql.
-- Then use the app_user connection string as DATABASE_URL on Vercel.
--
-- The app needs to read, add, change and delete ROWS (delete a hall, clear an allocation),
-- so it gets SELECT, INSERT, UPDATE, DELETE on our tables.
-- It does NOT get CREATE, ALTER, DROP or TRUNCATE: a bug or a stolen DATABASE_URL
-- cannot drop tables or change the schema. Schema changes are done by the team as the owner.

-- 1. Create the role (replace the password with a long random one; never commit it).
CREATE ROLE app_user WITH LOGIN PASSWORD 'REPLACE-WITH-A-LONG-RANDOM-PASSWORD';

-- 2. Allow it to connect and see the public schema, but not create objects in it.
GRANT CONNECT ON DATABASE neondb TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
REVOKE CREATE ON SCHEMA public FROM app_user;

-- 3. Row-level operations only, on our tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  users, sessions, halls, seats, exams, exam_halls, enrollments,
  proctor_assignments, seat_assignments, audit_logs
TO app_user;

-- 4. Needed so INSERT can use the SERIAL id counters.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Check (should list only SELECT/INSERT/UPDATE/DELETE):
-- SELECT table_name, privilege_type FROM information_schema.role_table_grants
-- WHERE grantee = 'app_user' ORDER BY table_name, privilege_type;
