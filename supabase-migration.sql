-- ============================================================
-- Supabase Migration: Department Attendance & Leave Register
-- ============================================================
-- Run this SQL in Supabase Dashboard → SQL Editor → New Query
-- It creates all the tables, enables Row-Level Security (RLS),
-- and adds permissive policies so the anon key can read/write.
-- ============================================================

-- 1. BRANCHES
CREATE TABLE IF NOT EXISTS branches (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code       TEXT UNIQUE NOT NULL,
  full_name  TEXT NOT NULL,
  students   INT DEFAULT 0,
  faculty    INT DEFAULT 0
);

-- 2. STUDENTS
CREATE TABLE IF NOT EXISTS students (
  id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name    TEXT NOT NULL,
  roll    TEXT NOT NULL,
  branch  TEXT NOT NULL REFERENCES branches(code),
  UNIQUE (roll, branch)
);

-- 3. ATTENDANCE
CREATE TABLE IF NOT EXISTS attendance (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id  BIGINT NOT NULL REFERENCES students(id),
  branch      TEXT NOT NULL REFERENCES branches(code),
  date        DATE NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('present', 'absent')),
  UNIQUE (student_id, date)
);

-- 4. LEAVE REQUESTS
CREATE TABLE IF NOT EXISTS leave_requests (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  roll        TEXT NOT NULL,
  branch      TEXT NOT NULL REFERENCES branches(code),
  "from"      DATE NOT NULL,
  "to"        DATE NOT NULL,
  reason      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  decided_at  TIMESTAMPTZ
);

-- 5. ARCHIVED YEARLY STATS
CREATE TABLE IF NOT EXISTS archived_stats_yearly (
  id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch  TEXT NOT NULL REFERENCES branches(code),
  year    INT NOT NULL,
  pct     INT NOT NULL,
  UNIQUE (branch, year)
);

-- 6. META (stores auto-increment counters - optional, kept for compatibility)
CREATE TABLE IF NOT EXISTS meta (
  key    TEXT PRIMARY KEY,
  value  BIGINT NOT NULL
);

-- ============================================================
-- Enable Row-Level Security and add permissive policies
-- (since we use the anon/publishable key, RLS must allow it)
-- ============================================================

ALTER TABLE branches             ENABLE ROW LEVEL SECURITY;
ALTER TABLE students             ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance           ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE archived_stats_yearly ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta                 ENABLE ROW LEVEL SECURITY;

-- Allow all operations for the anon role (our app's backend acts as
-- the only client, so this is safe). Tighten these if you add auth.

CREATE POLICY "Allow all on branches"             ON branches             FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on students"             ON students             FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on attendance"           ON attendance           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on leave_requests"       ON leave_requests       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on archived_stats_yearly" ON archived_stats_yearly FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on meta"                 ON meta                 FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Create indexes for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_students_branch     ON students(branch);
CREATE INDEX IF NOT EXISTS idx_attendance_branch   ON attendance(branch);
CREATE INDEX IF NOT EXISTS idx_attendance_date     ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_student  ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_leave_branch        ON leave_requests(branch);
CREATE INDEX IF NOT EXISTS idx_leave_status        ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_archived_branch     ON archived_stats_yearly(branch);
