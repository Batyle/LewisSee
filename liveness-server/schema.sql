-- LewisSee / FaceAttend live MySQL schema (Aiven)
-- Import this in MySQL Workbench against the LewisSee database.
-- Safe to re-run: creates missing tables/columns and seeds defaults with IGNORE.

USE `LewisSee`;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS admins (
  uid VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(16) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT admins_role_check CHECK (role = 'admin')
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS instructors (
  uid VARCHAR(64) PRIMARY KEY,
  instructor_id VARCHAR(12) NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  role VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_blocks JSON NOT NULL,
  rejection_reason VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_instructor_id (instructor_id),
  CONSTRAINT instructors_role_check CHECK (role = 'instructor'),
  CONSTRAINT instructors_status_check CHECK (status IN ('pending', 'active', 'suspended', 'terminated', 'rejected'))
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS class_groups (
  course VARCHAR(64) NOT NULL,
  year_level TINYINT UNSIGNED NOT NULL,
  block VARCHAR(12) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (course, year_level, block)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS students (
  student_id VARCHAR(191) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL DEFAULT '',
  course VARCHAR(64) NOT NULL,
  year_level TINYINT UNSIGNED NOT NULL,
  block VARCHAR(12) NOT NULL,
  descriptor_json LONGTEXT NOT NULL,
  photo MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_student_name (name)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance_records (
  id VARCHAR(64) PRIMARY KEY,
  student_id VARCHAR(191) NOT NULL,
  student_name VARCHAR(255) NOT NULL,
  attendance_date DATE NOT NULL,
  section VARCHAR(191) NOT NULL,
  attendance_time VARCHAR(32) NOT NULL,
  status ENUM('Present', 'Late', 'Absent') NOT NULL DEFAULT 'Present',
  time_out VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY one_checkin_per_class_day (student_id, attendance_date, section),
  KEY attendance_by_date (attendance_date, section),
  CONSTRAINT attendance_status_check CHECK (status IN ('Present', 'Late', 'Absent'))
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Time-based attendance policy for a class session (one per section + date).
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id VARCHAR(64) PRIMARY KEY,
  section VARCHAR(191) NOT NULL,
  session_date DATE NOT NULL,
  required_time_in TIME NOT NULL,
  grace_period_minutes INT UNSIGNED NULL,
  late_threshold_minutes INT UNSIGNED NULL,
  time_out TIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY one_session_per_class_day (section, session_date),
  KEY sessions_by_date (session_date, section)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Upgrades for databases created from older schema.sql copies
-- ---------------------------------------------------------------------------

SET @db := DATABASE();

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'instructors' AND COLUMN_NAME = 'instructor_id'
    ),
    'SELECT 1',
    'ALTER TABLE instructors ADD COLUMN instructor_id VARCHAR(12) NULL AFTER uid'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'instructors' AND INDEX_NAME = 'unique_instructor_id'
    ),
    'SELECT 1',
    'CREATE UNIQUE INDEX unique_instructor_id ON instructors (instructor_id)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'instructors' AND COLUMN_NAME = 'password_hash'
    ),
    'SELECT 1',
    'ALTER TABLE instructors ADD COLUMN password_hash VARCHAR(255) NULL AFTER email'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'instructors' AND COLUMN_NAME = 'rejection_reason'
    ),
    'SELECT 1',
    'ALTER TABLE instructors ADD COLUMN rejection_reason VARCHAR(500) NULL'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'students' AND COLUMN_NAME = 'course'
    ),
    'SELECT 1',
    'ALTER TABLE students ADD COLUMN course VARCHAR(64) NOT NULL DEFAULT ''BSIT'' AFTER email'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'students' AND COLUMN_NAME = 'year_level'
    ),
    'SELECT 1',
    'ALTER TABLE students ADD COLUMN year_level TINYINT UNSIGNED NOT NULL DEFAULT 3 AFTER course'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'students' AND COLUMN_NAME = 'block'
    ),
    'SELECT 1',
    'ALTER TABLE students ADD COLUMN block VARCHAR(12) NOT NULL DEFAULT ''A'' AFTER year_level'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'attendance_records' AND COLUMN_NAME = 'status'
    ),
    'SELECT 1',
    'ALTER TABLE attendance_records ADD COLUMN status ENUM(''Present'', ''Late'', ''Absent'') NOT NULL DEFAULT ''Present'' AFTER attendance_time'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE attendance_records
SET status = 'Present'
WHERE status IS NULL OR status NOT IN ('Present', 'Late', 'Absent');

ALTER TABLE attendance_records
  MODIFY COLUMN status ENUM('Present', 'Late', 'Absent') NOT NULL DEFAULT 'Present';

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'attendance_records' AND COLUMN_NAME = 'time_out'
    ),
    'SELECT 1',
    'ALTER TABLE attendance_records ADD COLUMN time_out VARCHAR(32) NULL AFTER status'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Seed data (ignored if already present)
-- Default admin login: admin@lewissee.local / admin123
-- Change this password after first successful sign-in.
-- ---------------------------------------------------------------------------

INSERT IGNORE INTO admins (uid, email, password_hash, role)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'admin@lewissee.local',
  '$2b$12$hqoEbAwxvEuJJXnB6SdLSOb/.BOEW9AyfJk9Jo7XuVcdOzIPJP1wi',
  'admin'
);

INSERT IGNORE INTO class_groups (course, year_level, block) VALUES
  ('BSCS', 2, 'A'),
  ('BSIT', 3, 'A'),
  ('BSIT', 3, 'B'),
  ('BSIT', 1, 'A'),
  ('BSIT', 2, 'A'),
  ('BSIT', 4, 'A');
