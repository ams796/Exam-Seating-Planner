-- Exam Seating Planner: database schema (run once in the Neon SQL Editor).
-- Shared by all three services. Table owners are noted in each comment.

-- Shared (Auth)
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE,
  student_code  TEXT UNIQUE,
  password_hash TEXT NOT NULL,                       -- scrypt hash, never the password
  role          TEXT NOT NULL CHECK (role IN ('admin', 'proctor', 'student')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR student_code IS NOT NULL)
);

-- Shared (Auth): login sessions, like SocialSessions in Lab 8.
-- Only a SHA-256 hash of the token is stored, so a database leak does not leak sessions.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Hall & Seat Layout Service (Mohamed Rishi)
CREATE TABLE IF NOT EXISTS halls (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  building   TEXT NOT NULL,
  row_count  INT NOT NULL CHECK (row_count BETWEEN 1 AND 40),
  col_count  INT NOT NULL CHECK (col_count BETWEEN 1 AND 40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seats (
  id      SERIAL PRIMARY KEY,
  hall_id INT NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  row_no  INT NOT NULL CHECK (row_no >= 1),
  col_no  INT NOT NULL CHECK (col_no >= 1),
  label   TEXT NOT NULL,                              -- e.g. "C7" = row C, seat 7
  status  TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'blocked')),
  UNIQUE (hall_id, row_no, col_no),
  UNIQUE (hall_id, label)
);

-- Exam & Enrolment Service (Nour)
CREATE TABLE IF NOT EXISTS exams (
  id                SERIAL PRIMARY KEY,
  course_code       TEXT NOT NULL,
  title             TEXT NOT NULL,
  exam_date         DATE NOT NULL,
  start_time        TIME NOT NULL,
  duration_min      INT NOT NULL CHECK (duration_min BETWEEN 30 AND 240),
  holiday_note      TEXT,
  allocation_status TEXT NOT NULL DEFAULT 'none'
                    CHECK (allocation_status IN ('none', 'draft', 'published')),  -- written by Seat Allocation
  spacing           BOOLEAN NOT NULL DEFAULT false,                               -- written by Seat Allocation
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- position = the order the admin wants halls filled in (1 = fill first)
CREATE TABLE IF NOT EXISTS exam_halls (
  exam_id  INT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  hall_id  INT NOT NULL REFERENCES halls(id) ON DELETE RESTRICT,
  position INT NOT NULL DEFAULT 1,
  PRIMARY KEY (exam_id, hall_id)
);

CREATE TABLE IF NOT EXISTS enrollments (
  exam_id    INT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS proctor_assignments (
  id         SERIAL PRIMARY KEY,
  exam_id    INT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  hall_id    INT NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  proctor_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (exam_id, hall_id, proctor_id)
);

-- Seat Allocation & Lookup Service (Mohamed Attallah)
-- The two UNIQUE rules make double-booking impossible, even if the code had a bug.
-- seat_id is RESTRICT: a seat cannot be deleted (hall resize) while a student sits on it.
CREATE TABLE IF NOT EXISTS seat_assignments (
  id         SERIAL PRIMARY KEY,
  exam_id    INT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  seat_id    INT NOT NULL REFERENCES seats(id) ON DELETE RESTRICT,
  student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, seat_id),    -- one student per seat
  UNIQUE (exam_id, student_id)  -- one seat per student
);

CREATE INDEX IF NOT EXISTS idx_assignments_student ON seat_assignments (student_id);
CREATE INDEX IF NOT EXISTS idx_assignments_seat ON seat_assignments (seat_id);

-- Shared (Logging): security and change events. Never stores passwords or tokens.
CREATE TABLE IF NOT EXISTS audit_logs (
  id      SERIAL PRIMARY KEY,
  at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id INT,
  role    TEXT,
  action  TEXT NOT NULL,          -- e.g. LOGIN_FAILED, ACCESS_DENIED, ALLOCATION_RUN
  target  TEXT,
  outcome TEXT NOT NULL,          -- success / denied / failed
  ip      TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_logs (at);
