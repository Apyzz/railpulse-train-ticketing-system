const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const { db, hashPassword, verifyPassword } = require('./database/db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_SECRET = 'railpulse-pro-secret-2026-v1';

// In-memory session store (maps token -> { userId, role, email, fullName })
const sessions = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    ic_passport: user.ic_passport,
    role: user.role
  });
  return token;
}

function getSession(req) {
  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers.cookie) {
    const match = req.headers.cookie.match(/rp_session=([^;]+)/);
    if (match) token = match[1];
  }
  if (!token) return null;
  return sessions.get(token) || null;
}

function sendJson(res, statusCode, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}

function sendCsv(res, filename, headers, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.map(esc).join(',')];
  for (const row of rows) {
    lines.push(row.map(esc).join(','));
  }
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store'
  });
  res.end('\uFEFF' + lines.join('\r\n'));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 2_000_000) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function generatePNR() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'RP-';
  for (let i = 0; i < 6; i++) {
    code += chars[crypto.randomInt(0, chars.length)];
  }
  return code;
}

function getCoachConfig() {
  return [
    { coach: 'Coach A', className: 'First Class', prefix: 'A', cols: 3, rows: 8, total: 24, layout: '1+2' },
    { coach: 'Coach B', className: 'Business', prefix: 'B', cols: 4, rows: 8, total: 32, layout: '2+2' },
    { coach: 'Coach C', className: 'Economy', prefix: 'C', cols: 4, rows: 9, total: 36, layout: '2+2' },
    { coach: 'Coach D', className: 'Economy', prefix: 'D', cols: 4, rows: 9, total: 36, layout: '2+2' }
  ];
}

function getBookedSeatsForSchedule(scheduleId, travelDate) {
  const rows = db.prepare(`
    SELECT coach_number, seat_numbers FROM bookings
    WHERE schedule_id = ? AND travel_date = ? AND booking_status != 'Cancelled'
  `).all(scheduleId, travelDate);
  const booked = new Set();
  for (const r of rows) {
    for (const s of r.seat_numbers.split(',')) {
      if (s.trim()) booked.add(s.trim());
    }
  }
  return booked;
}

async function handleApi(req, res, urlObj) {
  const pathname = urlObj.pathname;
  const method = req.method;
  const user = getSession(req);

  try {
    // ==================== AUTH ====================
    if (pathname === '/api/auth/me' && method === 'GET') {
      return sendJson(res, 200, { user: user || null });
    }

    if (pathname === '/api/auth/register' && method === 'POST') {
      const body = await parseBody(req);
      const { full_name, email, phone, ic_passport, password } = body;
      if (!full_name || !email || !phone || !ic_passport || !password) {
        return sendJson(res, 400, { error: 'Semua maklumat wajib diisi / All fields are required.' });
      }
      if (password.length < 6) {
        return sendJson(res, 400, { error: 'Password must be at least 6 characters.' });
      }
      const existing = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(email.trim());
      if (existing) {
        return sendJson(res, 409, { error: 'Email already registered. Please sign in.' });
      }
      const result = db.prepare(`
        INSERT INTO users (full_name, email, phone, ic_passport, password_hash, role)
        VALUES (?, ?, ?, ?, ?, 'passenger')
      `).run(full_name.trim(), email.trim().toLowerCase(), phone.trim(), ic_passport.trim(), hashPassword(password));
      const newUser = db.prepare('SELECT id, full_name, email, phone, ic_passport, role FROM users WHERE id = ?').get(result.lastInsertRowid);
      const token = createSession(newUser);
      return sendJson(res, 201, { user: newUser, token }, {
        'Set-Cookie': `rp_session=${token}; HttpOnly; Path=/; SameSite=Lax`
      });
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await parseBody(req);
      const { email, password } = body;
      if (!email || !password) {
        return sendJson(res, 400, { error: 'Email and password are required.' });
      }
      const found = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email.trim());
      if (!found || !verifyPassword(password, found.password_hash)) {
        return sendJson(res, 401, { error: 'Invalid email or password.' });
      }
      const safeUser = {
        id: found.id,
        full_name: found.full_name,
        email: found.email,
        phone: found.phone,
        ic_passport: found.ic_passport,
        role: found.role
      };
      const token = createSession(safeUser);
      return sendJson(res, 200, { user: safeUser, token }, {
        'Set-Cookie': `rp_session=${token}; HttpOnly; Path=/; SameSite=Lax`
      });
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        sessions.delete(authHeader.slice(7).trim());
      }
      if (req.headers.cookie) {
        const match = req.headers.cookie.match(/rp_session=([^;]+)/);
        if (match) sessions.delete(match[1]);
      }
      return sendJson(res, 200, { ok: true }, {
        'Set-Cookie': 'rp_session=; HttpOnly; Path=/; Max-Age=0'
      });
    }

    // ==================== PUBLIC / PASSENGER ====================
    if (pathname === '/api/stations' && method === 'GET') {
      const stations = db.prepare("SELECT * FROM stations WHERE status = 'Active' ORDER BY id ASC").all();
      return sendJson(res, 200, { stations });
    }

    if (pathname === '/api/schedules/search' && method === 'GET') {
      const origin = urlObj.searchParams.get('origin');
      const destination = urlObj.searchParams.get('destination');
      const date = urlObj.searchParams.get('date') || new Date().toISOString().slice(0, 10);
      const trainType = urlObj.searchParams.get('type');

      let sql = `
        SELECT s.*,
               t.train_code, t.name AS train_name, t.type AS train_type, t.amenities,
               o.code AS origin_code, o.name AS origin_name, o.city AS origin_city,
               d.code AS dest_code, d.name AS dest_name, d.city AS dest_city
        FROM schedules s
        JOIN trains t ON s.train_id = t.id
        JOIN stations o ON s.origin_station_id = o.id
        JOIN stations d ON s.destination_station_id = d.id
        WHERE t.status = 'Operational'
      `;
      const params = [];
      if (origin) {
        sql += ' AND s.origin_station_id = ?';
        params.push(Number(origin));
      }
      if (destination) {
        sql += ' AND s.destination_station_id = ?';
        params.push(Number(destination));
      }
      if (trainType && trainType !== 'ALL') {
        sql += ' AND t.type = ?';
        params.push(trainType);
      }
      sql += ' ORDER BY s.departure_time ASC';

      const rows = db.prepare(sql).all(...params);
      const totalCapacity = getCoachConfig().reduce((acc, c) => acc + c.total, 0);

      const results = rows.map(r => {
        const booked = getBookedSeatsForSchedule(r.id, date);
        const bookedByClass = { 'First Class': 0, 'Business': 0, 'Economy': 0 };
        for (const s of booked) {
          if (s.startsWith('A')) bookedByClass['First Class']++;
          else if (s.startsWith('B')) bookedByClass['Business']++;
          else bookedByClass['Economy']++;
        }
        return {
          ...r,
          travel_date: date,
          total_capacity: totalCapacity,
          booked_count: booked.size,
          available_seats: totalCapacity - booked.size,
          class_availability: {
            'First Class': 24 - bookedByClass['First Class'],
            'Business': 32 - bookedByClass['Business'],
            'Economy': 72 - bookedByClass['Economy']
          }
        };
      });

      return sendJson(res, 200, { schedules: results, date });
    }

    const seatMatch = pathname.match(/^\/api\/schedules\/(\d+)\/seats$/);
    if (seatMatch && method === 'GET') {
      const scheduleId = Number(seatMatch[1]);
      const date = urlObj.searchParams.get('date') || new Date().toISOString().slice(0, 10);
      const sched = db.prepare(`
        SELECT s.*, t.train_code, t.name AS train_name, t.type AS train_type, t.amenities,
               o.code AS origin_code, o.name AS origin_name,
               d.code AS dest_code, d.name AS dest_name
        FROM schedules s
        JOIN trains t ON s.train_id = t.id
        JOIN stations o ON s.origin_station_id = o.id
        JOIN stations d ON s.destination_station_id = d.id
        WHERE s.id = ?
      `).get(scheduleId);

      if (!sched) return sendJson(res, 404, { error: 'Schedule not found.' });

      const booked = Array.from(getBookedSeatsForSchedule(scheduleId, date));
      return sendJson(res, 200, {
        schedule: sched,
        travel_date: date,
        coaches: getCoachConfig(),
        booked_seats: booked
      });
    }

    if (pathname === '/api/promo/validate' && method === 'POST') {
      const body = await parseBody(req);
      const code = (body.code || '').trim().toUpperCase();
      if (!code) return sendJson(res, 400, { error: 'Please enter a promo code.' });
      const promo = db.prepare('SELECT * FROM promo_codes WHERE upper(code) = ? AND active = 1').get(code);
      if (!promo) return sendJson(res, 404, { error: 'Invalid or expired promo code.' });
      return sendJson(res, 200, { promo });
    }

    if (pathname === '/api/bookings' && method === 'POST') {
      if (!user) return sendJson(res, 401, { error: 'Please sign in to complete your booking.' });
      const body = await parseBody(req);
      const { schedule_id, travel_date, coach_class, coach_number, seat_numbers, passengers, payment_method, promo_code } = body;

      if (!schedule_id || !travel_date || !coach_class || !coach_number || !Array.isArray(seat_numbers) || seat_numbers.length === 0) {
        return sendJson(res, 400, { error: 'Incomplete booking details.' });
      }
      if (seat_numbers.length > 6) {
        return sendJson(res, 400, { error: 'Maximum 6 seats per booking.' });
      }

      const sched = db.prepare('SELECT * FROM schedules WHERE id = ?').get(Number(schedule_id));
      if (!sched) return sendJson(res, 404, { error: 'Schedule not found.' });
      if (sched.status === 'Cancelled') return sendJson(res, 400, { error: 'This train departure has been cancelled.' });

      // Atomic seat conflict verification
      const alreadyBooked = getBookedSeatsForSchedule(Number(schedule_id), travel_date);
      const conflicts = seat_numbers.filter(s => alreadyBooked.has(s));
      if (conflicts.length > 0) {
        return sendJson(res, 409, { error: `Seat(s) ${conflicts.join(', ')} were just booked by another passenger. Please choose different seats.` });
      }

      let unitFare = sched.base_fare_economy;
      if (coach_class === 'Business') unitFare = sched.base_fare_business;
      if (coach_class === 'First Class') unitFare = sched.base_fare_first;

      const subtotal = Number((unitFare * seat_numbers.length).toFixed(2));
      const serviceFee = 3.00;
      let discount = 0;
      let validPromoCode = null;

      if (promo_code) {
        const promo = db.prepare('SELECT * FROM promo_codes WHERE upper(code) = ? AND active = 1').get(promo_code.trim().toUpperCase());
        if (promo) {
          discount = Math.min(promo.max_discount, Number(((subtotal * promo.discount_percent) / 100).toFixed(2)));
          validPromoCode = promo.code;
        }
      }

      const totalAmount = Number(Math.max(0, subtotal - discount + serviceFee).toFixed(2));
      const pnr = generatePNR();

      const paxDetails = seat_numbers.map((seat, idx) => ({
        seat,
        name: (passengers && passengers[idx] && passengers[idx].name) ? passengers[idx].name.trim() : user.full_name,
        ic: (passengers && passengers[idx] && passengers[idx].ic) ? passengers[idx].ic.trim() : user.ic_passport
      }));

      const insertRes = db.prepare(`
        INSERT INTO bookings (
          pnr_code, user_id, schedule_id, travel_date, coach_class, coach_number,
          seat_numbers, passenger_count, passenger_details_json, subtotal, service_fee,
          discount, promo_code, total_amount, payment_method, payment_status, booking_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Paid', 'Confirmed')
      `).run(
        pnr, user.id, Number(schedule_id), travel_date, coach_class, coach_number,
        seat_numbers.join(','), seat_numbers.length, JSON.stringify(paxDetails),
        subtotal, serviceFee, discount, validPromoCode, totalAmount, payment_method || 'FPX Online Banking'
      );

      const booking = getFullBookingById(insertRes.lastInsertRowid);
      return sendJson(res, 201, { booking });
    }

    if (pathname === '/api/bookings/round-trip' && method === 'POST') {
      if (!user) return sendJson(res, 401, { error: 'Please sign in to complete your booking.' });
      const body = await parseBody(req);
      const { outbound, inbound, passengers, payment_method, promo_code } = body;

      if (!outbound || !inbound || !outbound.schedule_id || !inbound.schedule_id ||
          !Array.isArray(outbound.seat_numbers) || !outbound.seat_numbers.length ||
          !Array.isArray(inbound.seat_numbers) || !inbound.seat_numbers.length) {
        return sendJson(res, 400, { error: 'Incomplete round-trip booking details.' });
      }

      const outSched = db.prepare('SELECT * FROM schedules WHERE id = ?').get(Number(outbound.schedule_id));
      const inSched = db.prepare('SELECT * FROM schedules WHERE id = ?').get(Number(inbound.schedule_id));
      if (!outSched || !inSched) return sendJson(res, 404, { error: 'One of the selected schedules was not found.' });
      if (outSched.status === 'Cancelled' || inSched.status === 'Cancelled') {
        return sendJson(res, 400, { error: 'One of the selected departures has been cancelled.' });
      }

      // Check seat conflicts for BOTH legs before inserting
      const outBooked = getBookedSeatsForSchedule(Number(outbound.schedule_id), outbound.travel_date);
      const outConflicts = outbound.seat_numbers.filter(s => outBooked.has(s));
      if (outConflicts.length > 0) {
        return sendJson(res, 409, { error: `Outbound seat(s) ${outConflicts.join(', ')} are already taken.` });
      }
      const inBooked = getBookedSeatsForSchedule(Number(inbound.schedule_id), inbound.travel_date);
      const inConflicts = inbound.seat_numbers.filter(s => inBooked.has(s));
      if (inConflicts.length > 0) {
        return sendJson(res, 409, { error: `Return seat(s) ${inConflicts.join(', ')} are already taken.` });
      }

      const calcFare = (sched, cls) => cls === 'First Class' ? sched.base_fare_first : (cls === 'Business' ? sched.base_fare_business : sched.base_fare_economy);
      const outSub = Number((calcFare(outSched, outbound.coach_class) * outbound.seat_numbers.length).toFixed(2));
      const inSub = Number((calcFare(inSched, inbound.coach_class) * inbound.seat_numbers.length).toFixed(2));
      const combinedSub = outSub + inSub;

      // 5% Round-Trip Bundle Discount + optional promo code
      let totalDiscount = Number((combinedSub * 0.05).toFixed(2));
      let validPromo = 'ROUNDTRIP5';
      if (promo_code) {
        const promo = db.prepare('SELECT * FROM promo_codes WHERE upper(code) = ? AND active = 1').get(promo_code.trim().toUpperCase());
        if (promo) {
          const promoDisc = Math.min(promo.max_discount, Number(((combinedSub * promo.discount_percent) / 100).toFixed(2)));
          totalDiscount = Number((totalDiscount + promoDisc).toFixed(2));
          validPromo = `RT5+${promo.code}`;
        }
      }

      const outShare = combinedSub > 0 ? outSub / combinedSub : 0.5;
      const outDisc = Number((totalDiscount * outShare).toFixed(2));
      const inDisc = Number((totalDiscount - outDisc).toFixed(2));
      const feePerLeg = 3.00;
      const outTotal = Number(Math.max(0, outSub - outDisc + feePerLeg).toFixed(2));
      const inTotal = Number(Math.max(0, inSub - inDisc + feePerLeg).toFixed(2));

      const outPnr = generatePNR();
      const inPnr = generatePNR();

      const buildPax = (seats) => seats.map((seat, idx) => ({
        seat,
        name: (passengers && passengers[idx] && passengers[idx].name) ? passengers[idx].name.trim() : user.full_name,
        ic: (passengers && passengers[idx] && passengers[idx].ic) ? passengers[idx].ic.trim() : user.ic_passport
      }));

      const insertStmt = db.prepare(`
        INSERT INTO bookings (
          pnr_code, user_id, schedule_id, travel_date, coach_class, coach_number,
          seat_numbers, passenger_count, passenger_details_json, subtotal, service_fee,
          discount, promo_code, total_amount, payment_method, payment_status,
          booking_status, trip_type, linked_pnr
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Paid', 'Confirmed', 'Round-Trip', ?)
      `);

      const r1 = insertStmt.run(
        outPnr, user.id, Number(outbound.schedule_id), outbound.travel_date, outbound.coach_class, outbound.coach_number,
        outbound.seat_numbers.join(','), outbound.seat_numbers.length, JSON.stringify(buildPax(outbound.seat_numbers)),
        outSub, feePerLeg, outDisc, validPromo, outTotal, payment_method || 'FPX Online Banking', inPnr
      );
      const r2 = insertStmt.run(
        inPnr, user.id, Number(inbound.schedule_id), inbound.travel_date, inbound.coach_class, inbound.coach_number,
        inbound.seat_numbers.join(','), inbound.seat_numbers.length, JSON.stringify(buildPax(inbound.seat_numbers)),
        inSub, feePerLeg, inDisc, validPromo, inTotal, payment_method || 'FPX Online Banking', outPnr
      );

      return sendJson(res, 201, {
        outbound: getFullBookingById(r1.lastInsertRowid),
        inbound: getFullBookingById(r2.lastInsertRowid)
      });
    }

    if (pathname === '/api/bookings/my' && method === 'GET') {
      if (!user) return sendJson(res, 401, { error: 'Authentication required.' });
      const rows = db.prepare(`
        SELECT b.*,
               s.departure_time, s.arrival_time, s.duration_mins, s.platform, s.status AS schedule_status,
               t.train_code, t.name AS train_name, t.type AS train_type,
               o.code AS origin_code, o.name AS origin_name,
               d.code AS dest_code, d.name AS dest_name,
               u.full_name AS buyer_name, u.email AS buyer_email
        FROM bookings b
        JOIN schedules s ON b.schedule_id = s.id
        JOIN trains t ON s.train_id = t.id
        JOIN stations o ON s.origin_station_id = o.id
        JOIN stations d ON s.destination_station_id = d.id
        JOIN users u ON b.user_id = u.id
        WHERE b.user_id = ?
        ORDER BY b.created_at DESC
      `).all(user.id);
      return sendJson(res, 200, { bookings: rows });
    }

    const pnrMatch = pathname.match(/^\/api\/bookings\/pnr\/([A-Za-z0-9-]+)$/);
    if (pnrMatch && method === 'GET') {
      const pnr = pnrMatch[1].toUpperCase();
      const booking = db.prepare(`
        SELECT b.*,
               s.departure_time, s.arrival_time, s.duration_mins, s.platform, s.status AS schedule_status,
               t.train_code, t.name AS train_name, t.type AS train_type,
               o.code AS origin_code, o.name AS origin_name,
               d.code AS dest_code, d.name AS dest_name,
               u.full_name AS buyer_name, u.email AS buyer_email
        FROM bookings b
        JOIN schedules s ON b.schedule_id = s.id
        JOIN trains t ON s.train_id = t.id
        JOIN stations o ON s.origin_station_id = o.id
        JOIN stations d ON s.destination_station_id = d.id
        JOIN users u ON b.user_id = u.id
        WHERE upper(b.pnr_code) = ?
      `).get(pnr);
      if (!booking) return sendJson(res, 404, { error: `No ticket found for PNR "${pnr}".` });
      return sendJson(res, 200, { booking });
    }

    const cancelMatch = pathname.match(/^\/api\/bookings\/(\d+)\/cancel$/);
    if (cancelMatch && method === 'POST') {
      if (!user) return sendJson(res, 401, { error: 'Authentication required.' });
      const bookingId = Number(cancelMatch[1]);
      const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
      if (!booking) return sendJson(res, 404, { error: 'Booking not found.' });
      if (user.role !== 'admin' && booking.user_id !== user.id) {
        return sendJson(res, 403, { error: 'Forbidden.' });
      }
      if (booking.booking_status === 'Cancelled') {
        return sendJson(res, 400, { error: 'Booking is already cancelled.' });
      }
      if (booking.booking_status === 'Checked-In' && user.role !== 'admin') {
        return sendJson(res, 400, { error: 'Checked-in tickets cannot be self-cancelled.' });
      }
      const refundAmount = Number((booking.total_amount * 0.8).toFixed(2));
      db.prepare(`
        UPDATE bookings
        SET booking_status = 'Cancelled', payment_status = 'Refunded',
            refund_amount = ?, cancelled_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(refundAmount, bookingId);
      return sendJson(res, 200, { booking: getFullBookingById(bookingId), refund_amount: refundAmount });
    }

    // ==================== ADMIN ROUTES ====================
    if (pathname.startsWith('/api/admin/')) {
      if (!user || user.role !== 'admin') {
        return sendJson(res, 403, { error: 'Admin access required.' });
      }

      if (pathname === '/api/admin/overview' && method === 'GET') {
        const totals = db.prepare(`
          SELECT
            COUNT(*) AS total_bookings,
            SUM(CASE WHEN booking_status != 'Cancelled' THEN passenger_count ELSE 0 END) AS tickets_sold,
            SUM(CASE WHEN booking_status != 'Cancelled' THEN total_amount ELSE 0 END) AS gross_revenue,
            SUM(CASE WHEN booking_status = 'Cancelled' THEN refund_amount ELSE 0 END) AS total_refunds,
            SUM(CASE WHEN booking_status = 'Checked-In' THEN passenger_count ELSE 0 END) AS checked_in_pax
          FROM bookings
        `).get();

        const activeTrains = db.prepare("SELECT COUNT(*) AS c FROM trains WHERE status = 'Operational'").get().c;
        const activeSchedules = db.prepare("SELECT COUNT(*) AS c FROM schedules WHERE status != 'Cancelled'").get().c;
        const totalUsers = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'passenger'").get().c;

        const dailyRevenue = db.prepare(`
          SELECT substr(created_at, 1, 10) AS day,
                 ROUND(SUM(CASE WHEN booking_status != 'Cancelled' THEN total_amount ELSE 0 END), 2) AS revenue,
                 SUM(CASE WHEN booking_status != 'Cancelled' THEN passenger_count ELSE 0 END) AS tickets
          FROM bookings
          GROUP BY substr(created_at, 1, 10)
          ORDER BY day ASC
          LIMIT 14
        `).all();

        const byClass = db.prepare(`
          SELECT coach_class,
                 COUNT(*) AS bookings,
                 SUM(passenger_count) AS tickets,
                 ROUND(SUM(total_amount), 2) AS revenue
          FROM bookings
          WHERE booking_status != 'Cancelled'
          GROUP BY coach_class
        `).all();

        const topRoutes = db.prepare(`
          SELECT o.code || ' → ' || d.code AS route_code,
                 o.name || ' → ' || d.name AS route_name,
                 COUNT(b.id) AS bookings,
                 SUM(b.passenger_count) AS passengers,
                 ROUND(SUM(b.total_amount), 2) AS revenue
          FROM bookings b
          JOIN schedules s ON b.schedule_id = s.id
          JOIN stations o ON s.origin_station_id = o.id
          JOIN stations d ON s.destination_station_id = d.id
          WHERE b.booking_status != 'Cancelled'
          GROUP BY s.origin_station_id, s.destination_station_id
          ORDER BY revenue DESC
          LIMIT 6
        `).all();

        const recentBookings = db.prepare(`
          SELECT b.id, b.pnr_code, b.travel_date, b.coach_class, b.seat_numbers, b.total_amount,
                 b.booking_status, b.created_at, u.full_name AS buyer_name,
                 o.code AS origin_code, d.code AS dest_code, t.train_code
          FROM bookings b
          JOIN users u ON b.user_id = u.id
          JOIN schedules s ON b.schedule_id = s.id
          JOIN trains t ON s.train_id = t.id
          JOIN stations o ON s.origin_station_id = o.id
          JOIN stations d ON s.destination_station_id = d.id
          ORDER BY b.created_at DESC
          LIMIT 8
        `).all();

        return sendJson(res, 200, {
          kpis: {
            gross_revenue: Number((totals.gross_revenue || 0).toFixed(2)),
            total_refunds: Number((totals.total_refunds || 0).toFixed(2)),
            net_revenue: Number(((totals.gross_revenue || 0) - (totals.total_refunds || 0)).toFixed(2)),
            tickets_sold: totals.tickets_sold || 0,
            total_bookings: totals.total_bookings || 0,
            checked_in_pax: totals.checked_in_pax || 0,
            active_trains: activeTrains,
            active_schedules: activeSchedules,
            registered_passengers: totalUsers
          },
          daily_revenue: dailyRevenue,
          by_class: byClass,
          top_routes: topRoutes,
          recent_bookings: recentBookings
        });
      }

      // Admin Bookings List & Check-In
      if (pathname === '/api/admin/bookings' && method === 'GET') {
        const q = (urlObj.searchParams.get('q') || '').trim().toLowerCase();
        const status = urlObj.searchParams.get('status') || 'ALL';
        let sql = `
          SELECT b.*,
                 s.departure_time, s.arrival_time, s.platform,
                 t.train_code, t.name AS train_name,
                 o.code AS origin_code, o.name AS origin_name,
                 d.code AS dest_code, d.name AS dest_name,
                 u.full_name AS buyer_name, u.email AS buyer_email, u.phone AS buyer_phone
          FROM bookings b
          JOIN schedules s ON b.schedule_id = s.id
          JOIN trains t ON s.train_id = t.id
          JOIN stations o ON s.origin_station_id = o.id
          JOIN stations d ON s.destination_station_id = d.id
          JOIN users u ON b.user_id = u.id
          WHERE 1=1
        `;
        const params = [];
        if (status !== 'ALL') {
          sql += ' AND b.booking_status = ?';
          params.push(status);
        }
        if (q) {
          sql += ' AND (lower(b.pnr_code) LIKE ? OR lower(u.full_name) LIKE ? OR lower(u.email) LIKE ? OR lower(t.train_code) LIKE ?)';
          const like = `%${q}%`;
          params.push(like, like, like, like);
        }
        sql += ' ORDER BY b.created_at DESC';
        return sendJson(res, 200, { bookings: db.prepare(sql).all(...params) });
      }

      const checkinMatch = pathname.match(/^\/api\/admin\/bookings\/(\d+)\/checkin$/);
      if (checkinMatch && method === 'POST') {
        const id = Number(checkinMatch[1]);
        const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
        if (!b) return sendJson(res, 404, { error: 'Booking not found.' });
        if (b.booking_status === 'Cancelled') return sendJson(res, 400, { error: 'Cannot check in a cancelled ticket.' });
        db.prepare("UPDATE bookings SET booking_status = 'Checked-In' WHERE id = ?").run(id);
        return sendJson(res, 200, { booking: getFullBookingById(id) });
      }

      // Admin Trains CRUD
      if (pathname === '/api/admin/trains' && method === 'GET') {
        return sendJson(res, 200, { trains: db.prepare('SELECT * FROM trains ORDER BY id ASC').all() });
      }
      if (pathname === '/api/admin/trains' && method === 'POST') {
        const { train_code, name, type, total_coaches, seats_per_coach, amenities, status } = await parseBody(req);
        if (!train_code || !name || !type) return sendJson(res, 400, { error: 'Train code, name and type are required.' });
        try {
          const r = db.prepare(`
            INSERT INTO trains (train_code, name, type, total_coaches, seats_per_coach, amenities, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(train_code.trim().toUpperCase(), name.trim(), type, Number(total_coaches) || 4, Number(seats_per_coach) || 32, amenities || 'WiFi, Air-Cond', status || 'Operational');
          return sendJson(res, 201, { train: db.prepare('SELECT * FROM trains WHERE id = ?').get(r.lastInsertRowid) });
        } catch (e) {
          return sendJson(res, 409, { error: 'Train code already exists.' });
        }
      }
      const trainIdMatch = pathname.match(/^\/api\/admin\/trains\/(\d+)$/);
      if (trainIdMatch && method === 'PUT') {
        const id = Number(trainIdMatch[1]);
        const { name, type, amenities, status } = await parseBody(req);
        db.prepare('UPDATE trains SET name = COALESCE(?, name), type = COALESCE(?, type), amenities = COALESCE(?, amenities), status = COALESCE(?, status) WHERE id = ?')
          .run(name || null, type || null, amenities || null, status || null, id);
        return sendJson(res, 200, { train: db.prepare('SELECT * FROM trains WHERE id = ?').get(id) });
      }
      if (trainIdMatch && method === 'DELETE') {
        db.prepare('DELETE FROM trains WHERE id = ?').run(Number(trainIdMatch[1]));
        return sendJson(res, 200, { ok: true });
      }

      // Admin Stations CRUD
      if (pathname === '/api/admin/stations' && method === 'GET') {
        return sendJson(res, 200, { stations: db.prepare('SELECT * FROM stations ORDER BY id ASC').all() });
      }
      if (pathname === '/api/admin/stations' && method === 'POST') {
        const { code, name, city, state, platform_count } = await parseBody(req);
        if (!code || !name || !city || !state) return sendJson(res, 400, { error: 'All station fields are required.' });
        try {
          const r = db.prepare('INSERT INTO stations (code, name, city, state, platform_count) VALUES (?, ?, ?, ?, ?)')
            .run(code.trim().toUpperCase(), name.trim(), city.trim(), state.trim(), Number(platform_count) || 4);
          return sendJson(res, 201, { station: db.prepare('SELECT * FROM stations WHERE id = ?').get(r.lastInsertRowid) });
        } catch {
          return sendJson(res, 409, { error: 'Station code already exists.' });
        }
      }

      // Admin Schedules CRUD
      if (pathname === '/api/admin/schedules' && method === 'GET') {
        const rows = db.prepare(`
          SELECT s.*, t.train_code, t.name AS train_name, t.type AS train_type,
                 o.code AS origin_code, o.name AS origin_name,
                 d.code AS dest_code, d.name AS dest_name
          FROM schedules s
          JOIN trains t ON s.train_id = t.id
          JOIN stations o ON s.origin_station_id = o.id
          JOIN stations d ON s.destination_station_id = d.id
          ORDER BY s.departure_time ASC
        `).all();
        return sendJson(res, 200, { schedules: rows });
      }
      if (pathname === '/api/admin/schedules' && method === 'POST') {
        const b = await parseBody(req);
        if (!b.train_id || !b.origin_station_id || !b.destination_station_id || !b.departure_time || !b.arrival_time) {
          return sendJson(res, 400, { error: 'Missing schedule fields.' });
        }
        if (Number(b.origin_station_id) === Number(b.destination_station_id)) {
          return sendJson(res, 400, { error: 'Origin and destination must be different.' });
        }
        const r = db.prepare(`
          INSERT INTO schedules (train_id, origin_station_id, destination_station_id, departure_time, arrival_time, duration_mins, base_fare_economy, base_fare_business, base_fare_first, platform, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          Number(b.train_id), Number(b.origin_station_id), Number(b.destination_station_id),
          b.departure_time, b.arrival_time, Number(b.duration_mins) || 120,
          Number(b.base_fare_economy) || 40, Number(b.base_fare_business) || 70, Number(b.base_fare_first) || 110,
          b.platform || 'Platform 1', b.status || 'On Time'
        );
        return sendJson(res, 201, { id: r.lastInsertRowid });
      }
      const schedIdMatch = pathname.match(/^\/api\/admin\/schedules\/(\d+)$/);
      if (schedIdMatch && method === 'PUT') {
        const id = Number(schedIdMatch[1]);
        const b = await parseBody(req);
        db.prepare(`
          UPDATE schedules
          SET status = COALESCE(?, status),
              platform = COALESCE(?, platform),
              base_fare_economy = COALESCE(?, base_fare_economy),
              base_fare_business = COALESCE(?, base_fare_business),
              base_fare_first = COALESCE(?, base_fare_first)
          WHERE id = ?
        `).run(
          b.status || null, b.platform || null,
          b.base_fare_economy ? Number(b.base_fare_economy) : null,
          b.base_fare_business ? Number(b.base_fare_business) : null,
          b.base_fare_first ? Number(b.base_fare_first) : null,
          id
        );
        return sendJson(res, 200, { ok: true });
      }
      if (schedIdMatch && method === 'DELETE') {
        db.prepare('DELETE FROM schedules WHERE id = ?').run(Number(schedIdMatch[1]));
        return sendJson(res, 200, { ok: true });
      }

      // ==================== REPORT GENERATOR API ====================
      if (pathname === '/api/admin/reports/sales' && method === 'GET') {
        const from = urlObj.searchParams.get('from') || '2020-01-01';
        const to = urlObj.searchParams.get('to') || '2099-12-31';
        const coachClass = urlObj.searchParams.get('class') || 'ALL';
        const trainId = urlObj.searchParams.get('train_id') || 'ALL';

        let sql = `
          SELECT b.pnr_code, substr(b.created_at, 1, 10) AS booking_date, b.travel_date,
                 u.full_name AS buyer_name, t.train_code, t.name AS train_name,
                 o.code || ' → ' || d.code AS route,
                 b.coach_class, b.seat_numbers, b.passenger_count,
                 b.subtotal, b.discount, b.service_fee, b.total_amount,
                 b.refund_amount, b.payment_method, b.booking_status
          FROM bookings b
          JOIN users u ON b.user_id = u.id
          JOIN schedules s ON b.schedule_id = s.id
          JOIN trains t ON s.train_id = t.id
          JOIN stations o ON s.origin_station_id = o.id
          JOIN stations d ON s.destination_station_id = d.id
          WHERE substr(b.created_at, 1, 10) BETWEEN ? AND ?
        `;
        const params = [from, to];
        if (coachClass !== 'ALL') {
          sql += ' AND b.coach_class = ?';
          params.push(coachClass);
        }
        if (trainId !== 'ALL') {
          sql += ' AND t.id = ?';
          params.push(Number(trainId));
        }
        sql += ' ORDER BY b.created_at DESC';

        const rows = db.prepare(sql).all(...params);
        const summary = rows.reduce((acc, r) => {
          acc.total_transactions++;
          if (r.booking_status !== 'Cancelled') {
            acc.active_bookings++;
            acc.total_tickets += r.passenger_count;
            acc.gross_revenue += r.total_amount;
            acc.total_discounts += r.discount;
          } else {
            acc.cancelled_bookings++;
            acc.total_refunds += r.refund_amount;
          }
          return acc;
        }, { total_transactions: 0, active_bookings: 0, cancelled_bookings: 0, total_tickets: 0, gross_revenue: 0, total_discounts: 0, total_refunds: 0 });
        summary.net_revenue = Number((summary.gross_revenue - summary.total_refunds).toFixed(2));
        summary.gross_revenue = Number(summary.gross_revenue.toFixed(2));
        summary.total_discounts = Number(summary.total_discounts.toFixed(2));
        summary.total_refunds = Number(summary.total_refunds.toFixed(2));

        return sendJson(res, 200, { report_type: 'sales', generated_at: new Date().toISOString(), filters: { from, to, coachClass, trainId }, summary, rows });
      }

      if (pathname === '/api/admin/reports/manifest' && method === 'GET') {
        const scheduleId = urlObj.searchParams.get('schedule_id');
        const travelDate = urlObj.searchParams.get('date') || new Date().toISOString().slice(0, 10);

        let sql = `
          SELECT b.pnr_code, b.travel_date, b.coach_class, b.coach_number, b.seat_numbers,
                 b.passenger_details_json, b.booking_status, b.total_amount,
                 u.full_name AS buyer_name, u.phone AS buyer_phone,
                 s.departure_time, s.arrival_time, s.platform,
                 t.train_code, t.name AS train_name,
                 o.code AS origin_code, o.name AS origin_name,
                 d.code AS dest_code, d.name AS dest_name
          FROM bookings b
          JOIN users u ON b.user_id = u.id
          JOIN schedules s ON b.schedule_id = s.id
          JOIN trains t ON s.train_id = t.id
          JOIN stations o ON s.origin_station_id = o.id
          JOIN stations d ON s.destination_station_id = d.id
          WHERE b.booking_status != 'Cancelled' AND b.travel_date = ?
        `;
        const params = [travelDate];
        if (scheduleId && scheduleId !== 'ALL') {
          sql += ' AND b.schedule_id = ?';
          params.push(Number(scheduleId));
        }
        sql += ' ORDER BY s.departure_time ASC, b.coach_number ASC';

        const bookings = db.prepare(sql).all(...params);
        const passengers = [];
        for (const b of bookings) {
          let list = [];
          try { list = JSON.parse(b.passenger_details_json); } catch { list = []; }
          for (const p of list) {
            passengers.push({
              pnr_code: b.pnr_code,
              train_code: b.train_code,
              route: `${b.origin_code} → ${b.dest_code}`,
              departure_time: b.departure_time,
              platform: b.platform,
              coach_number: b.coach_number,
              coach_class: b.coach_class,
              seat: p.seat,
              passenger_name: p.name,
              ic_passport: p.ic,
              contact_phone: b.buyer_phone,
              status: b.booking_status
            });
          }
        }
        const checkedIn = passengers.filter(p => p.status === 'Checked-In').length;
        return sendJson(res, 200, {
          report_type: 'manifest',
          generated_at: new Date().toISOString(),
          filters: { scheduleId: scheduleId || 'ALL', date: travelDate },
          summary: {
            total_passengers: passengers.length,
            checked_in: checkedIn,
            pending_boarding: passengers.length - checkedIn,
            occupancy_percent: Number(((passengers.length / 128) * 100).toFixed(1))
          },
          rows: passengers
        });
      }

      if (pathname === '/api/admin/reports/routes' && method === 'GET') {
        const from = urlObj.searchParams.get('from') || '2020-01-01';
        const to = urlObj.searchParams.get('to') || '2099-12-31';

        const rows = db.prepare(`
          SELECT o.code || ' → ' || d.code AS route_code,
                 o.name || ' → ' || d.name AS route_name,
                 COUNT(DISTINCT s.id) AS active_schedules,
                 COUNT(CASE WHEN b.booking_status != 'Cancelled' THEN b.id END) AS total_bookings,
                 COALESCE(SUM(CASE WHEN b.booking_status != 'Cancelled' THEN b.passenger_count ELSE 0 END), 0) AS total_passengers,
                 ROUND(COALESCE(SUM(CASE WHEN b.booking_status != 'Cancelled' THEN b.total_amount ELSE 0 END), 0), 2) AS gross_revenue,
                 ROUND(COALESCE(AVG(CASE WHEN b.booking_status != 'Cancelled' THEN b.total_amount END), 0), 2) AS avg_ticket_value
          FROM schedules s
          JOIN stations o ON s.origin_station_id = o.id
          JOIN stations d ON s.destination_station_id = d.id
          LEFT JOIN bookings b ON b.schedule_id = s.id AND substr(b.created_at, 1, 10) BETWEEN ? AND ?
          GROUP BY s.origin_station_id, s.destination_station_id
          ORDER BY gross_revenue DESC
        `).all(from, to);

        const summary = {
          total_routes: rows.length,
          total_passengers: rows.reduce((a, r) => a + r.total_passengers, 0),
          total_revenue: Number(rows.reduce((a, r) => a + r.gross_revenue, 0).toFixed(2)),
          top_route: rows[0] ? rows[0].route_code : '-'
        };
        return sendJson(res, 200, { report_type: 'routes', generated_at: new Date().toISOString(), filters: { from, to }, summary, rows });
      }

      if (pathname === '/api/admin/reports/export-csv' && method === 'GET') {
        const type = urlObj.searchParams.get('type') || 'sales';
        const from = urlObj.searchParams.get('from') || '2020-01-01';
        const to = urlObj.searchParams.get('to') || '2099-12-31';
        const date = urlObj.searchParams.get('date') || new Date().toISOString().slice(0, 10);

        if (type === 'sales') {
          const rows = db.prepare(`
            SELECT b.pnr_code, substr(b.created_at, 1, 10) AS booking_date, b.travel_date,
                   u.full_name, t.train_code, o.code || ' - ' || d.code AS route,
                   b.coach_class, b.seat_numbers, b.passenger_count,
                   b.subtotal, b.discount, b.service_fee, b.total_amount, b.payment_method, b.booking_status
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN schedules s ON b.schedule_id = s.id
            JOIN trains t ON s.train_id = t.id
            JOIN stations o ON s.origin_station_id = o.id
            JOIN stations d ON s.destination_station_id = d.id
            WHERE substr(b.created_at, 1, 10) BETWEEN ? AND ?
            ORDER BY b.created_at DESC
          `).all(from, to);
          return sendCsv(res, `RailPulse_Sales_Report_${from}_to_${to}.csv`,
            ['PNR', 'Booking Date', 'Travel Date', 'Buyer', 'Train', 'Route', 'Class', 'Seats', 'Pax', 'Subtotal (RM)', 'Discount (RM)', 'Fee (RM)', 'Total (RM)', 'Payment', 'Status'],
            rows.map(r => [r.pnr_code, r.booking_date, r.travel_date, r.full_name, r.train_code, r.route, r.coach_class, r.seat_numbers, r.passenger_count, r.subtotal, r.discount, r.service_fee, r.total_amount, r.payment_method, r.booking_status])
          );
        }

        if (type === 'manifest') {
          const bookings = db.prepare(`
            SELECT b.pnr_code, b.coach_number, b.coach_class, b.passenger_details_json, b.booking_status,
                   u.phone, s.departure_time, t.train_code, o.code AS origin_code, d.code AS dest_code
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN schedules s ON b.schedule_id = s.id
            JOIN trains t ON s.train_id = t.id
            JOIN stations o ON s.origin_station_id = o.id
            JOIN stations d ON s.destination_station_id = d.id
            WHERE b.booking_status != 'Cancelled' AND b.travel_date = ?
          `).all(date);
          const out = [];
          for (const b of bookings) {
            let list = [];
            try { list = JSON.parse(b.passenger_details_json); } catch {}
            for (const p of list) {
              out.push([b.pnr_code, b.train_code, `${b.origin_code}-${b.dest_code}`, b.departure_time, b.coach_number, b.coach_class, p.seat, p.name, p.ic, b.phone, b.booking_status]);
            }
          }
          return sendCsv(res, `RailPulse_Passenger_Manifest_${date}.csv`,
            ['PNR', 'Train', 'Route', 'Departure', 'Coach', 'Class', 'Seat', 'Passenger Name', 'IC / Passport', 'Contact', 'Status'],
            out
          );
        }

        const routeRows = db.prepare(`
          SELECT o.code || ' - ' || d.code AS route_code, o.name || ' to ' || d.name AS route_name,
                 COUNT(CASE WHEN b.booking_status != 'Cancelled' THEN b.id END) AS total_bookings,
                 COALESCE(SUM(CASE WHEN b.booking_status != 'Cancelled' THEN b.passenger_count ELSE 0 END), 0) AS total_passengers,
                 ROUND(COALESCE(SUM(CASE WHEN b.booking_status != 'Cancelled' THEN b.total_amount ELSE 0 END), 0), 2) AS gross_revenue
          FROM schedules s
          JOIN stations o ON s.origin_station_id = o.id
          JOIN stations d ON s.destination_station_id = d.id
          LEFT JOIN bookings b ON b.schedule_id = s.id AND substr(b.created_at, 1, 10) BETWEEN ? AND ?
          GROUP BY s.origin_station_id, s.destination_station_id
          ORDER BY gross_revenue DESC
        `).all(from, to);
        return sendCsv(res, `RailPulse_Route_Performance_${from}_to_${to}.csv`,
          ['Route Code', 'Route Name', 'Bookings', 'Passengers', 'Gross Revenue (RM)'],
          routeRows.map(r => [r.route_code, r.route_name, r.total_bookings, r.total_passengers, r.gross_revenue])
        );
      }
    }

    return sendJson(res, 404, { error: 'API endpoint not found.' });
  } catch (err) {
    console.error('[API Error]', err);
    return sendJson(res, 500, { error: err.message || 'Internal server error.' });
  }
}

function getFullBookingById(id) {
  return db.prepare(`
    SELECT b.*,
           s.departure_time, s.arrival_time, s.duration_mins, s.platform, s.status AS schedule_status,
           t.train_code, t.name AS train_name, t.type AS train_type,
           o.code AS origin_code, o.name AS origin_name,
           d.code AS dest_code, d.name AS dest_name,
           u.full_name AS buyer_name, u.email AS buyer_email
    FROM bookings b
    JOIN schedules s ON b.schedule_id = s.id
    JOIN trains t ON s.train_id = t.id
    JOIN stations o ON s.origin_station_id = o.id
    JOIN stations d ON s.destination_station_id = d.id
    JOIN users u ON b.user_id = u.id
    WHERE b.id = ?
  `).get(id);
}

function serveStatic(req, res, urlObj) {
  let reqPath = urlObj.pathname === '/' ? '/index.html' : urlObj.pathname;
  reqPath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, reqPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not Found');
      }
      res.writeHead(500);
      return res.end('Server Error');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (urlObj.pathname.startsWith('/api/')) {
    return handleApi(req, res, urlObj);
  }
  return serveStatic(req, res, urlObj);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n=======================================================`);
  console.log(`  RAILPULSE PRO — Train Ticketing & Operations System`);
  console.log(`  Server running at: http://localhost:${PORT}`);
  console.log(`  Admin Login : admin@railpulse.my / admin123`);
  console.log(`  User Login  : hafiz@railpulse.my / user123`);
  console.log(`=======================================================\n`);
});
