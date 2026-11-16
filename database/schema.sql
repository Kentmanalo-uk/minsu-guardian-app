-- MinSU Disciplinary Management System — MySQL 8 schema
-- Shared by all modules. Owned by the leader; change it only after telling the team.

CREATE DATABASE IF NOT EXISTS minsu_disciplinary
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE minsu_disciplinary;

-- Module 1: system accounts
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name     VARCHAR(120) NOT NULL,
  email         VARCHAR(160) NOT NULL UNIQUE,
  password_hash CHAR(60)     NOT NULL,                -- bcrypt
  role          ENUM('admin', 'officer', 'staff') NOT NULL DEFAULT 'officer',
  archived      BOOLEAN      NOT NULL DEFAULT FALSE,
  archived_at   DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Module 2: student records
CREATE TABLE IF NOT EXISTS students (
  student_id   VARCHAR(30)  PRIMARY KEY,
  student_name VARCHAR(120) NOT NULL,
  email        VARCHAR(160) NULL,
  phone        VARCHAR(30)  NULL,
  course       VARCHAR(80)  NULL,
  year_level   VARCHAR(20)  NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Module 3: one case per student (UNIQUE student_id)
CREATE TABLE IF NOT EXISTS disciplinary_cases (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  case_number VARCHAR(20)  NULL UNIQUE,              -- CASE-YYYY-#####, set right after insert
  student_id  VARCHAR(30)  NOT NULL UNIQUE,
  status      ENUM('pending', 'active', 'resolved') NOT NULL DEFAULT 'pending',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cases_student FOREIGN KEY (student_id) REFERENCES students (student_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_cases_status_created (status, created_at)
);

-- Module 2 writes (through case-service), Module 3 reads: each reported offense
CREATE TABLE IF NOT EXISTS incidents (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  case_id          INT UNSIGNED NOT NULL,
  offense_level    VARCHAR(20)  NOT NULL,             -- "1st Offense", "2nd Offense", ...
  description      TEXT         NOT NULL,
  date_of_incident DATE         NOT NULL,
  location         VARCHAR(120) NOT NULL,
  reported_by      VARCHAR(120) NOT NULL,
  submitted_by     INT UNSIGNED NULL,                 -- the logged-in user who filed it
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_incidents_case FOREIGN KEY (case_id) REFERENCES disciplinary_cases (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_incidents_user FOREIGN KEY (submitted_by) REFERENCES users (id)
    ON DELETE SET NULL,
  INDEX idx_incidents_date (date_of_incident)
);
