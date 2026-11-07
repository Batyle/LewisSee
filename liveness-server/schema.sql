-- FaceAttend MySQL schema
-- Safe to import repeatedly: it only creates missing tables and indexes.
-- Connect MySQL Workbench to Aiven's `defaultdb` schema before running this file.

USE `LewisSee`;

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
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY one_checkin_per_class_day (student_id, attendance_date, section),
  KEY attendance_by_date (attendance_date, section)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
