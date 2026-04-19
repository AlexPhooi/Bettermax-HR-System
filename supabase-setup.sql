-- Bettermax Enterprise HR System — Supabase Setup
-- Run this in Supabase SQL Editor if starting fresh

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  passport_no TEXT UNIQUE,
  permit_no TEXT,
  permit_expire DATE,
  phone TEXT,
  daily_rate DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Note: named hr_attendance to avoid conflict with other Supabase projects
CREATE TABLE IF NOT EXISTS hr_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  hours_worked DECIMAL(5,2),
  days_worked DECIMAL(5,4),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_attendance_employee_date_idx
  ON hr_attendance(employee_id, work_date);

CREATE TABLE IF NOT EXISTS salary_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  total_days DECIMAL(6,4),
  daily_rate DECIMAL(10,2),
  gross_salary DECIMAL(10,2),
  total_advances DECIMAL(10,2) DEFAULT 0,
  net_salary DECIMAL(10,2),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','finalized')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  advance_date DATE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  month TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin','viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin user must be created manually via Supabase dashboard or a one-time seed script.
