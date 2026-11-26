const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DB_DIR = path.join(__dirname);
const DB_PATH = path.join(DB_DIR, 'railpulse.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(hash, 'hex'));
}

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      ic_passport TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'passenger' CHECK(role IN ('passenger', 'admin')),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS stations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      platform_count INTEGER NOT NULL DEFAULT 4,
      status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Maintenance'))
    );

    CREATE TABLE IF NOT EXISTS trains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      train_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('ETS Platinum', 'ETS Gold', 'Intercity Express', 'Executive Shuttle')),
      total_coaches INTEGER NOT NULL DEFAULT 4,
      seats_per_coach INTEGER NOT NULL DEFAULT 32,
      amenities TEXT NOT NULL DEFAULT 'WiFi, Power Socket, Cafe Car, Air-Cond',
      status TEXT NOT NULL DEFAULT 'Operational' CHECK(status IN ('Operational', 'Maintenance', 'Retired'))
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      train_id INTEGER NOT NULL,
      origin_station_id INTEGER NOT NULL,
      destination_station_id INTEGER NOT NULL,
      departure_time TEXT NOT NULL,
      arrival_time TEXT NOT NULL,
      duration_mins INTEGER NOT NULL,
      base_fare_economy REAL NOT NULL,
      base_fare_business REAL NOT NULL,
      base_fare_first REAL NOT NULL,
      platform TEXT NOT NULL DEFAULT 'Platform 1',
      status TEXT NOT NULL DEFAULT 'On Time' CHECK(status IN ('On Time', 'Boarding', 'Delayed', 'Departed', 'Cancelled')),
      FOREIGN KEY (train_id) REFERENCES trains(id) ON DELETE CASCADE,
      FOREIGN KEY (origin_station_id) REFERENCES stations(id) ON DELETE CASCADE,
      FOREIGN KEY (destination_station_id) REFERENCES stations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS promo_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      discount_percent REAL NOT NULL,
      max_discount REAL NOT NULL DEFAULT 50,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pnr_code TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      schedule_id INTEGER NOT NULL,
      travel_date TEXT NOT NULL,
      coach_class TEXT NOT NULL CHECK(coach_class IN ('Economy', 'Business', 'First Class')),
      coach_number TEXT NOT NULL,
      seat_numbers TEXT NOT NULL,
      passenger_count INTEGER NOT NULL,
      passenger_details_json TEXT NOT NULL,
      subtotal REAL NOT NULL,
      service_fee REAL NOT NULL DEFAULT 3.00,
      discount REAL NOT NULL DEFAULT 0,
      promo_code TEXT,
      total_amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'Paid' CHECK(payment_status IN ('Paid', 'Refunded')),
      booking_status TEXT NOT NULL DEFAULT 'Confirmed' CHECK(booking_status IN ('Confirmed', 'Checked-In', 'Cancelled')),
      refund_amount REAL NOT NULL DEFAULT 0,
      trip_type TEXT NOT NULL DEFAULT 'One-Way' CHECK(trip_type IN ('One-Way', 'Round-Trip')),
      linked_pnr TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      cancelled_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_schedule_date ON bookings(schedule_id, travel_date);
    CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_pnr ON bookings(pnr_code);
    CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings(created_at);
  `);

  // Safe migration for existing databases created before round-trip support
  const cols = db.prepare("PRAGMA table_info(bookings)").all().map(c => c.name);
  if (!cols.includes('trip_type')) {
    db.exec("ALTER TABLE bookings ADD COLUMN trip_type TEXT NOT NULL DEFAULT 'One-Way';");
  }
  if (!cols.includes('linked_pnr')) {
    db.exec("ALTER TABLE bookings ADD COLUMN linked_pnr TEXT;");
  }

  const stationCount = db.prepare('SELECT COUNT(*) as c FROM stations').get().c;
  if (stationCount === 0) {
    seedData();
  }
}

function seedData() {
  // 1. Seed Users
  const insertUser = db.prepare(`
    INSERT INTO users (full_name, email, phone, ic_passport, password_hash, role)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertUser.run('Administrator RailPulse', 'admin@railpulse.my', '012-8889900', '900101-14-5501', hashPassword('admin123'), 'admin');
  insertUser.run('Mohammad Hafiz', 'hafiz@railpulse.my', '013-7745201', '010512-04-0321', hashPassword('user123'), 'passenger');
  insertUser.run('Nurul Aina Syafiqah', 'aina@railpulse.my', '019-3321980', '990822-10-5412', hashPassword('user123'), 'passenger');
  insertUser.run('Danish Irsyad', 'danish@railpulse.my', '017-6654123', '001103-08-0819', hashPassword('user123'), 'passenger');
  insertUser.run('Siti Hawani', 'hawani@railpulse.my', '011-29834410', '980415-01-6024', hashPassword('user123'), 'passenger');

  // 2. Seed Stations (Major Malaysian Rail Corridors)
  const stations = [
    ['KLS', 'KL Sentral', 'Kuala Lumpur', 'W.P. Kuala Lumpur', 8],
    ['BTW', 'Butterworth Sentral', 'Butterworth', 'Pulau Pinang', 6],
    ['IPH', 'Ipoh Railway Station', 'Ipoh', 'Perak', 5],
    ['JBS', 'JB Sentral', 'Johor Bahru', 'Johor', 6],
    ['GMS', 'Gemas Junction', 'Gemas', 'Negeri Sembilan', 4],
    ['PGB', 'Padang Besar', 'Padang Besar', 'Perlis', 4],
    ['ASR', 'Alor Setar', 'Alor Setar', 'Kedah', 4],
    ['SRB', 'Seremban', 'Seremban', 'Negeri Sembilan', 4],
    ['TMP', 'Pulau Sebang / Tampin', 'Melaka', 'Melaka', 3],
    ['SGP', 'Sungai Petani', 'Sungai Petani', 'Kedah', 3]
  ];
  const insertStation = db.prepare('INSERT INTO stations (code, name, city, state, platform_count) VALUES (?, ?, ?, ?, ?)');
  for (const s of stations) insertStation.run(...s);

  // 3. Seed Trains
  const trains = [
    ['EP-9101', 'ETS Platinum Nusantara', 'ETS Platinum', 4, 32, '5G WiFi, USB-C Power, Bistro Car, VIP Lounge, Silent Zone'],
    ['EP-9105', 'ETS Platinum Aurora', 'ETS Platinum', 4, 32, '5G WiFi, USB-C Power, Bistro Car, Reclining Leather Seats'],
    ['EG-9202', 'ETS Gold Kinabalu', 'ETS Gold', 4, 32, 'Free WiFi, Power Socket, Cafe Counter, Panoramic Windows'],
    ['EG-9208', 'ETS Gold Titiwangsa', 'ETS Gold', 4, 32, 'Free WiFi, Power Socket, Prayer Room, Cafe Counter'],
    ['IX-8301', 'Southern Express Selatan', 'Intercity Express', 4, 32, 'Air-Cond, Power Socket, Snack Trolley, Luggage Rack'],
    ['ES-7401', 'Heritage Executive Shuttle', 'Executive Shuttle', 4, 32, 'Free WiFi, Express Boarding, Coffee Bar, Quiet Cabin']
  ];
  const insertTrain = db.prepare('INSERT INTO trains (train_code, name, type, total_coaches, seats_per_coach, amenities) VALUES (?, ?, ?, ?, ?, ?)');
  for (const t of trains) insertTrain.run(...t);

  // 4. Seed Schedules (IDs: KLS=1, BTW=2, IPH=3, JBS=4, GMS=5, PGB=6, ASR=7, SRB=8, TMP=9, SGP=10)
  const schedules = [
    // KL Sentral -> Butterworth
    [1, 1, 2, '07:30', '11:35', 245, 62.00, 98.00, 145.00, 'Platform 1', 'On Time'],
    [3, 1, 2, '10:15', '14:40', 265, 55.00, 86.00, 128.00, 'Platform 2', 'Boarding'],
    [2, 1, 2, '16:00', '20:05', 245, 65.00, 102.00, 150.00, 'Platform 1', 'On Time'],
    // Butterworth -> KL Sentral
    [2, 2, 1, '08:00', '12:05', 245, 62.00, 98.00, 145.00, 'Platform 3', 'On Time'],
    [4, 2, 1, '14:30', '18:55', 265, 55.00, 86.00, 128.00, 'Platform 2', 'On Time'],
    // KL Sentral -> Ipoh
    [3, 1, 3, '08:20', '10:45', 145, 38.00, 58.00, 88.00, 'Platform 4', 'On Time'],
    [1, 1, 3, '13:10', '15:25', 135, 42.00, 64.00, 95.00, 'Platform 1', 'On Time'],
    [4, 1, 3, '18:45', '21:10', 145, 38.00, 58.00, 88.00, 'Platform 3', 'Delayed'],
    // Ipoh -> KL Sentral
    [3, 3, 1, '09:00', '11:25', 145, 38.00, 58.00, 88.00, 'Platform 1', 'On Time'],
    [1, 3, 1, '17:20', '19:35', 135, 42.00, 64.00, 95.00, 'Platform 2', 'On Time'],
    // KL Sentral -> JB Sentral
    [5, 1, 4, '08:00', '12:15', 255, 58.00, 90.00, 135.00, 'Platform 5', 'On Time'],
    [6, 1, 4, '15:30', '19:40', 250, 64.00, 96.00, 142.00, 'Platform 6', 'On Time'],
    // JB Sentral -> KL Sentral
    [5, 4, 1, '09:15', '13:30', 255, 58.00, 90.00, 135.00, 'Platform 2', 'On Time'],
    [6, 4, 1, '17:00', '21:10', 250, 64.00, 96.00, 142.00, 'Platform 1', 'On Time'],
    // KL Sentral -> Padang Besar
    [1, 1, 6, '09:40', '15:10', 330, 82.00, 125.00, 185.00, 'Platform 1', 'On Time'],
    // KL Sentral -> Alor Setar
    [2, 1, 7, '11:00', '15:45', 285, 72.00, 110.00, 162.00, 'Platform 2', 'On Time'],
    // KL Sentral -> Pulau Sebang / Melaka
    [6, 1, 9, '09:00', '10:40', 100, 28.00, 45.00, 68.00, 'Platform 5', 'On Time'],
    [6, 9, 1, '16:30', '18:10', 100, 28.00, 45.00, 68.00, 'Platform 1', 'On Time'],
    // KL Sentral -> Seremban
    [5, 1, 8, '12:00', '13:05', 65, 18.00, 30.00, 48.00, 'Platform 6', 'On Time'],
    // Butterworth -> Padang Besar
    [4, 2, 6, '10:30', '12:25', 115, 32.00, 50.00, 75.00, 'Platform 4', 'On Time']
  ];
  const insertSched = db.prepare(`
    INSERT INTO schedules (train_id, origin_station_id, destination_station_id, departure_time, arrival_time, duration_mins, base_fare_economy, base_fare_business, base_fare_first, platform, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const sc of schedules) insertSched.run(...sc);

  // 5. Seed Promo Codes
  const promos = [
    ['RAIL10', '10% Welcome Discount for RailPulse Members', 10, 40],
    ['ETSPRO15', '15% Executive & Platinum Tier Promo', 15, 60],
    ['MERDEKA20', '20% Seasonal Malaysia Rail Celebration', 20, 80]
  ];
  const insertPromo = db.prepare('INSERT INTO promo_codes (code, description, discount_percent, max_discount) VALUES (?, ?, ?, ?)');
  for (const p of promos) insertPromo.run(...p);

  // 6. Seed Historical & Upcoming Bookings (so Dashboard & Reports look rich immediately!)
  const today = new Date();
  const fmtDate = (offsetDays) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };
  const fmtDateTime = (offsetDays, timeStr) => `${fmtDate(offsetDays)} ${timeStr}`;

  const sampleBookings = [
    { pnr: 'RP-884102', user_id: 2, schedule_id: 1, travel_date: fmtDate(0), cls: 'First Class', coach: 'Coach A', seats: 'A1,A2', pax: 2, sub: 290, disc: 29, promo: 'RAIL10', method: 'FPX Online Banking', status: 'Checked-In', createdOffset: -5, time: '09:14:22' },
    { pnr: 'RP-884119', user_id: 3, schedule_id: 1, travel_date: fmtDate(0), cls: 'Business', coach: 'Coach B', seats: 'B3,B4', pax: 2, sub: 196, disc: 0, promo: null, method: 'Credit / Debit Card', status: 'Confirmed', createdOffset: -4, time: '14:22:10' },
    { pnr: 'RP-884145', user_id: 4, schedule_id: 1, travel_date: fmtDate(0), cls: 'Economy', coach: 'Coach C', seats: 'C5,C6,C7', pax: 3, sub: 186, disc: 18.6, promo: 'RAIL10', method: 'Touch \'n Go eWallet', status: 'Confirmed', createdOffset: -3, time: '11:05:40' },
    { pnr: 'RP-884201', user_id: 5, schedule_id: 6, travel_date: fmtDate(0), cls: 'Business', coach: 'Coach B', seats: 'B1', pax: 1, sub: 58, disc: 0, promo: null, method: 'FPX Online Banking', status: 'Checked-In', createdOffset: -6, time: '16:40:00' },
    { pnr: 'RP-884233', user_id: 2, schedule_id: 11, travel_date: fmtDate(1), cls: 'First Class', coach: 'Coach A', seats: 'A4', pax: 1, sub: 135, disc: 20.25, promo: 'ETSPRO15', method: 'Credit / Debit Card', status: 'Confirmed', createdOffset: -2, time: '10:15:33' },
    { pnr: 'RP-884278', user_id: 3, schedule_id: 15, travel_date: fmtDate(1), cls: 'Business', coach: 'Coach B', seats: 'B7,B8', pax: 2, sub: 250, disc: 37.5, promo: 'ETSPRO15', method: 'FPX Online Banking', status: 'Confirmed', createdOffset: -2, time: '18:30:12' },
    { pnr: 'RP-884310', user_id: 4, schedule_id: 2, travel_date: fmtDate(-1), cls: 'Economy', coach: 'Coach D', seats: 'D2,D3', pax: 2, sub: 110, disc: 0, promo: null, method: 'Touch \'n Go eWallet', status: 'Checked-In', createdOffset: -7, time: '08:45:19' },
    { pnr: 'RP-884355', user_id: 5, schedule_id: 12, travel_date: fmtDate(-1), cls: 'First Class', coach: 'Coach A', seats: 'A3,A5', pax: 2, sub: 284, disc: 42.6, promo: 'ETSPRO15', method: 'Credit / Debit Card', status: 'Checked-In', createdOffset: -8, time: '13:12:55' },
    { pnr: 'RP-884390', user_id: 2, schedule_id: 17, travel_date: fmtDate(-2), cls: 'Economy', coach: 'Coach C', seats: 'C1,C2', pax: 2, sub: 56, disc: 0, promo: null, method: 'FPX Online Banking', status: 'Checked-In', createdOffset: -9, time: '19:05:11' },
    { pnr: 'RP-884412', user_id: 3, schedule_id: 3, travel_date: fmtDate(-3), cls: 'Business', coach: 'Coach B', seats: 'B5,B6', pax: 2, sub: 204, disc: 20.4, promo: 'RAIL10', method: 'FPX Online Banking', status: 'Checked-In', createdOffset: -10, time: '15:20:44' },
    { pnr: 'RP-884458', user_id: 4, schedule_id: 16, travel_date: fmtDate(-4), cls: 'First Class', coach: 'Coach A', seats: 'A6', pax: 1, sub: 162, disc: 0, promo: null, method: 'Credit / Debit Card', status: 'Checked-In', createdOffset: -11, time: '09:55:02' },
    { pnr: 'RP-884499', user_id: 5, schedule_id: 4, travel_date: fmtDate(0), cls: 'Economy', coach: 'Coach C', seats: 'C10,C11', pax: 2, sub: 124, disc: 0, promo: null, method: 'Touch \'n Go eWallet', status: 'Confirmed', createdOffset: -1, time: '20:11:30' },
    { pnr: 'RP-884515', user_id: 2, schedule_id: 7, travel_date: fmtDate(2), cls: 'Business', coach: 'Coach B', seats: 'B2', pax: 1, sub: 64, disc: 0, promo: null, method: 'FPX Online Banking', status: 'Confirmed', createdOffset: 0, time: '08:10:05' },
    { pnr: 'RP-884532', user_id: 3, schedule_id: 11, travel_date: fmtDate(-2), cls: 'Economy', coach: 'Coach C', seats: 'C8', pax: 1, sub: 58, disc: 0, promo: null, method: 'FPX Online Banking', status: 'Cancelled', createdOffset: -6, time: '12:00:00' }
  ];

  const userNames = { 2: 'Mohammad Hafiz', 3: 'Nurul Aina Syafiqah', 4: 'Danish Irsyad', 5: 'Siti Hawani' };
  const userICs = { 2: '010512-04-0321', 3: '990822-10-5412', 4: '001103-08-0819', 5: '980415-01-6024' };

  const insertBooking = db.prepare(`
    INSERT INTO bookings (
      pnr_code, user_id, schedule_id, travel_date, coach_class, coach_number,
      seat_numbers, passenger_count, passenger_details_json, subtotal, service_fee,
      discount, promo_code, total_amount, payment_method, payment_status,
      booking_status, refund_amount, created_at, cancelled_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const b of sampleBookings) {
    const fee = 3.00;
    const total = Number((b.sub - b.disc + fee).toFixed(2));
    const seatsArr = b.seats.split(',');
    const paxDetails = seatsArr.map((s, idx) => ({
      seat: s,
      name: idx === 0 ? userNames[b.user_id] : `${userNames[b.user_id]} (Guest ${idx})`,
      ic: idx === 0 ? userICs[b.user_id] : `99010${idx}-14-001${idx}`
    }));
    const isCancelled = b.status === 'Cancelled';
    const refund = isCancelled ? Number((total * 0.8).toFixed(2)) : 0;
    insertBooking.run(
      b.pnr, b.user_id, b.schedule_id, b.travel_date, b.cls, b.coach,
      b.seats, b.pax, JSON.stringify(paxDetails), b.sub, fee,
      b.disc, b.promo, total, b.method, isCancelled ? 'Refunded' : 'Paid',
      b.status, refund, fmtDateTime(b.createdOffset, b.time),
      isCancelled ? fmtDateTime(b.createdOffset + 1, '10:00:00') : null
    );
  }
}

initDatabase();

module.exports = {
  db,
  hashPassword,
  verifyPassword,
  DB_PATH
};
