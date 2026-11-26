-- ============================================================================
-- RailPulse Pro — Train Ticketing System
-- MySQL / XAMPP (phpMyAdmin) Compatible Database Schema
-- Import this file into phpMyAdmin if you want to mirror the database in MySQL
-- ============================================================================

CREATE DATABASE IF NOT EXISTS railpulse_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE railpulse_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(30) NOT NULL,
  ic_passport VARCHAR(40) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('passenger', 'admin') NOT NULL DEFAULT 'passenger',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  city VARCHAR(80) NOT NULL,
  state VARCHAR(80) NOT NULL,
  platform_count INT NOT NULL DEFAULT 4,
  status ENUM('Active', 'Maintenance') NOT NULL DEFAULT 'Active'
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS trains (
  id INT AUTO_INCREMENT PRIMARY KEY,
  train_code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  type ENUM('ETS Platinum', 'ETS Gold', 'Intercity Express', 'Executive Shuttle') NOT NULL,
  total_coaches INT NOT NULL DEFAULT 4,
  seats_per_coach INT NOT NULL DEFAULT 32,
  amenities VARCHAR(255) NOT NULL DEFAULT 'WiFi, Power Socket, Cafe Car, Air-Cond',
  status ENUM('Operational', 'Maintenance', 'Retired') NOT NULL DEFAULT 'Operational'
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  train_id INT NOT NULL,
  origin_station_id INT NOT NULL,
  destination_station_id INT NOT NULL,
  departure_time VARCHAR(10) NOT NULL,
  arrival_time VARCHAR(10) NOT NULL,
  duration_mins INT NOT NULL,
  base_fare_economy DECIMAL(10,2) NOT NULL,
  base_fare_business DECIMAL(10,2) NOT NULL,
  base_fare_first DECIMAL(10,2) NOT NULL,
  platform VARCHAR(30) NOT NULL DEFAULT 'Platform 1',
  status ENUM('On Time', 'Boarding', 'Delayed', 'Departed', 'Cancelled') NOT NULL DEFAULT 'On Time',
  CONSTRAINT fk_schedules_train FOREIGN KEY (train_id) REFERENCES trains(id) ON DELETE CASCADE,
  CONSTRAINT fk_schedules_origin FOREIGN KEY (origin_station_id) REFERENCES stations(id) ON DELETE CASCADE,
  CONSTRAINT fk_schedules_dest FOREIGN KEY (destination_station_id) REFERENCES stations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS promo_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  description VARCHAR(200) NOT NULL,
  discount_percent DECIMAL(5,2) NOT NULL,
  max_discount DECIMAL(10,2) NOT NULL DEFAULT 50.00,
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pnr_code VARCHAR(20) NOT NULL UNIQUE,
  user_id INT NOT NULL,
  schedule_id INT NOT NULL,
  travel_date DATE NOT NULL,
  coach_class ENUM('Economy', 'Business', 'First Class') NOT NULL,
  coach_number VARCHAR(20) NOT NULL,
  seat_numbers VARCHAR(120) NOT NULL,
  passenger_count INT NOT NULL,
  passenger_details_json JSON NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  service_fee DECIMAL(10,2) NOT NULL DEFAULT 3.00,
  discount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  promo_code VARCHAR(30) NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  payment_status ENUM('Paid', 'Refunded') NOT NULL DEFAULT 'Paid',
  booking_status ENUM('Confirmed', 'Checked-In', 'Cancelled') NOT NULL DEFAULT 'Confirmed',
  refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  trip_type ENUM('One-Way', 'Round-Trip') NOT NULL DEFAULT 'One-Way',
  linked_pnr VARCHAR(20) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at DATETIME NULL,
  INDEX idx_bookings_schedule_date (schedule_id, travel_date),
  INDEX idx_bookings_user (user_id),
  CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_bookings_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
) ENGINE=InnoDB;
