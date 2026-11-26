// RailPulse Pro — Frontend Application Controller
const App = (function () {
  const state = {
    user: null,
    stations: [],
    schedules: [],
    adminSchedules: [],
    adminTrains: [],
    tripMode: 'oneway', // 'oneway' | 'roundtrip'
    rtOutbound: null,   // saved outbound leg when booking round-trip
    bookingCtx: {
      schedule: null,
      travelDate: '',
      coaches: [],
      bookedSeats: new Set(),
      activeCoachIdx: 2, // Default to Coach C (Economy)
      selectedSeats: [],
      promo: null,
      paymentMethod: 'FPX Online Banking'
    },
    currentReport: null,
    lastOverviewData: null
  };

  const t = (k) => (window.RailI18n ? window.RailI18n.t(k) : k);

  function todayStr(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  }

  function formatDuration(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }

  function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  async function api(url, opts = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function statusBadge(status) {
    const map = {
      'On Time': 'badge-success',
      'Confirmed': 'badge-info',
      'Checked-In': 'badge-success',
      'Boarding': 'badge-warn',
      'Delayed': 'badge-warn',
      'Departed': 'badge-info',
      'Cancelled': 'badge-danger',
      'Operational': 'badge-success',
      'Maintenance': 'badge-warn'
    };
    return `<span class="badge ${map[status] || 'badge-info'}">${status}</span>`;
  }

  function tierClass(type) {
    if (type === 'ETS Platinum') return 'tier-platinum';
    if (type === 'ETS Gold') return 'tier-gold';
    return 'tier-express';
  }

  // ==================== THEME & LANGUAGE ====================
  function initThemeAndLang() {
    const savedTheme = localStorage.getItem('rp_theme') || 'dark';
    applyTheme(savedTheme);
    const savedLang = window.RailI18n ? window.RailI18n.getLang() : 'bm';
    applyLangUI(savedLang);
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('rp_theme', theme);
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀';
    if (state.lastOverviewData && document.getElementById('view-admin').classList.contains('active')) {
      setTimeout(() => {
        window.RailCharts.drawRevenueAreaChart(document.getElementById('chart-revenue'), state.lastOverviewData.daily_revenue);
        window.RailCharts.drawDonutChart(document.getElementById('chart-class'), state.lastOverviewData.by_class);
      }, 30);
    }
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    toast(next === 'light' ? 'Daylight Platinum (Light Mode)' : 'Cyber-Executive Obsidian (Dark Mode)');
  }

  function applyLangUI(lang) {
    if (window.RailI18n) window.RailI18n.setLang(lang);
    const bmBtn = document.getElementById('lang-bm-btn');
    const enBtn = document.getElementById('lang-en-btn');
    if (bmBtn) bmBtn.classList.toggle('active', lang === 'bm');
    if (enBtn) enBtn.classList.toggle('active', lang === 'en');
  }

  function setLanguage(lang) {
    applyLangUI(lang);
    renderNavAuth();
    renderRtBanner();
    const date = state.rtOutbound
      ? (document.getElementById('search-return-date').value || todayStr(2))
      : (document.getElementById('search-date').value || todayStr(0));
    if (state.schedules.length) renderScheduleCards(state.schedules, date);
    toast(lang === 'bm' ? 'Bahasa ditukar kepada Bahasa Melayu' : 'Language switched to English');
  }

  // ==================== TRIP MODE (ONE-WAY / ROUND-TRIP) ====================
  function setTripMode(mode) {
    state.tripMode = mode;
    state.rtOutbound = null;
    document.getElementById('pill-oneway').classList.toggle('active', mode === 'oneway');
    document.getElementById('pill-roundtrip').classList.toggle('active', mode === 'roundtrip');
    document.getElementById('return-date-group').style.display = mode === 'roundtrip' ? 'flex' : 'none';
    document.getElementById('search-form').classList.toggle('round-trip-grid', mode === 'roundtrip');
    if (mode === 'roundtrip') {
      const dep = document.getElementById('search-date').value || todayStr(0);
      const retEl = document.getElementById('search-return-date');
      if (!retEl.value || retEl.value < dep) retEl.value = todayStr(2);
    }
    renderRtBanner();
    handleSearch();
  }

  function resetRoundTripOutbound() {
    state.rtOutbound = null;
    renderRtBanner();
    handleSearch();
  }

  function renderRtBanner() {
    const banner = document.getElementById('rt-status-banner');
    if (!banner) return;
    if (state.tripMode !== 'roundtrip') {
      banner.style.display = 'none';
      return;
    }
    banner.style.display = 'flex';
    if (!state.rtOutbound) {
      banner.innerHTML = `
        <div>
          <strong style="color:var(--cyan-bright);">${t('rtBannerStep1')}</strong>
        </div>
        <span class="badge badge-warn">5% Round-Trip Discount Active</span>
      `;
    } else {
      const o = state.rtOutbound;
      banner.innerHTML = `
        <div>
          <div style="font-size:0.78rem;color:var(--emerald);font-weight:800;">✓ ${t('rtOutboundSaved')}: ${o.schedule.train_code} (${o.schedule.origin_code} → ${o.schedule.dest_code}) · ${o.travelDate} · ${o.coach.coach} [${o.seats.join(', ')}]</div>
          <strong style="color:var(--gold-bright);">${t('rtBannerStep2')}</strong>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="App.resetRoundTripOutbound()">${t('rtChangeOutbound')}</button>
      `;
    }
  }

  // ==================== INIT ====================
  async function init() {
    document.getElementById('search-date').value = todayStr(0);
    document.getElementById('search-return-date').value = todayStr(2);
    document.getElementById('rep-from').value = todayStr(-30);
    document.getElementById('rep-to').value = todayStr(30);
    document.getElementById('rep-manifest-date').value = todayStr(0);

    initThemeAndLang();
    await Promise.all([loadSession(), loadStations()]);
    await handleSearch();
  }

  async function loadSession() {
    try {
      const { user } = await api('/api/auth/me');
      state.user = user;
    } catch {
      state.user = null;
    }
    renderNavAuth();
  }

  function renderNavAuth() {
    const area = document.getElementById('nav-auth-area');
    const adminBtn = document.getElementById('nav-admin-btn');
    if (state.user) {
      adminBtn.style.display = state.user.role === 'admin' ? 'inline-flex' : 'none';
      const initials = state.user.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
      area.innerHTML = `
        <div class="user-chip">
          <div class="user-avatar">${initials}</div>
          <div class="user-chip-info">
            <div class="user-chip-name">${escapeHtml(state.user.full_name)}</div>
            <div class="user-chip-role">${state.user.role}</div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="App.logout()">${t('logout')}</button>
      `;
    } else {
      adminBtn.style.display = 'none';
      area.innerHTML = `
        <button class="btn btn-ghost btn-sm" onclick="App.openAuthModal('login')">${t('signIn')}</button>
        <button class="btn btn-primary btn-sm" onclick="App.openAuthModal('register')">${t('register')}</button>
      `;
    }
  }

  async function loadStations() {
    const { stations } = await api('/api/stations');
    state.stations = stations;
    const opts = `<option value="">Any Station</option>` +
      stations.map(s => `<option value="${s.id}">${s.code} — ${s.name} (${s.city})</option>`).join('');
    document.getElementById('search-origin').innerHTML = opts;
    document.getElementById('search-dest').innerHTML = opts;
    // Default popular route: KL Sentral -> Any
    document.getElementById('search-origin').value = '1';
  }

  // ==================== VIEW SWITCHING ====================
  function switchView(viewName) {
    if (viewName === 'admin' && (!state.user || state.user.role !== 'admin')) {
      toast('Please sign in with an Admin account to access Command Center.', 'error');
      openAuthModal('login');
      return;
    }
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === viewName));

    if (viewName === 'board') loadLiveBoard();
    if (viewName === 'my-bookings') loadMyBookings();
    if (viewName === 'admin') switchAdminTab('overview');
  }

  function openModal(id) { document.getElementById(id).classList.add('open'); }
  function closeModal(id) { document.getElementById(id).classList.remove('open'); }

  // ==================== AUTH ====================
  function openAuthModal(mode = 'login') {
    setAuthMode(mode);
    openModal('auth-modal');
  }

  function setAuthMode(mode) {
    const isLogin = mode === 'login';
    document.getElementById('login-form').style.display = isLogin ? 'flex' : 'none';
    document.getElementById('register-form').style.display = isLogin ? 'none' : 'flex';
    document.getElementById('auth-modal-title').textContent = isLogin ? 'Sign In to RailPulse Pro' : 'Create Passenger Account';
    document.getElementById('tab-login-btn').className = isLogin ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
    document.getElementById('tab-reg-btn').className = !isLogin ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
  }

  async function handleLogin(e) {
    e.preventDefault();
    try {
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-pass').value;
      const { user } = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      state.user = user;
      renderNavAuth();
      closeModal('auth-modal');
      toast(`Welcome back, ${user.full_name}!`, 'success');
      if (user.role === 'admin') switchView('admin');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function demoLogin(email, pass) {
    document.getElementById('login-email').value = email;
    document.getElementById('login-pass').value = pass;
    await handleLogin({ preventDefault: () => {} });
  }

  async function handleRegister(e) {
    e.preventDefault();
    try {
      const payload = {
        full_name: document.getElementById('reg-name').value,
        email: document.getElementById('reg-email').value,
        phone: document.getElementById('reg-phone').value,
        ic_passport: document.getElementById('reg-ic').value,
        password: document.getElementById('reg-pass').value
      };
      const { user } = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) });
      state.user = user;
      renderNavAuth();
      closeModal('auth-modal');
      toast(`Account created! Welcome, ${user.full_name}.`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    state.user = null;
    renderNavAuth();
    switchView('book');
    toast('Signed out successfully.');
  }

  // ==================== SEARCH & SCHEDULES ====================
  function swapStations() {
    const o = document.getElementById('search-origin');
    const d = document.getElementById('search-dest');
    const tmp = o.value;
    o.value = d.value;
    d.value = tmp;
  }

  function quickRoute(originId, destId) {
    document.getElementById('search-origin').value = originId;
    document.getElementById('search-dest').value = destId;
    handleSearch();
  }

  async function handleSearch(e) {
    if (e) {
      e.preventDefault();
      state.rtOutbound = null;
      renderRtBanner();
    }
    const isReturnStep = state.tripMode === 'roundtrip' && !!state.rtOutbound;
    const origin = isReturnStep ? state.rtOutbound.schedule.destination_station_id : document.getElementById('search-origin').value;
    const destination = isReturnStep ? state.rtOutbound.schedule.origin_station_id : document.getElementById('search-dest').value;
    const date = isReturnStep
      ? (document.getElementById('search-return-date').value || todayStr(2))
      : (document.getElementById('search-date').value || todayStr(0));
    const type = document.getElementById('search-type').value;

    const qs = new URLSearchParams({ date, type });
    if (origin) qs.set('origin', origin);
    if (destination) qs.set('destination', destination);

    try {
      const { schedules } = await api(`/api/schedules/search?${qs.toString()}`);
      state.schedules = schedules;
      renderScheduleCards(schedules, date);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function renderScheduleCards(schedules, date) {
    const wrap = document.getElementById('schedule-results');
    const isReturnStep = state.tripMode === 'roundtrip' && !!state.rtOutbound;
    document.getElementById('results-heading').textContent = `${schedules.length} ${t('resultsFound')}`;
    document.getElementById('results-sub').textContent = `${t('resultsSub')} ${date}.`;

    if (!schedules.length) {
      wrap.innerHTML = `
        <div class="panel-card" style="text-align:center;padding:48px 20px;">
          <h3 style="margin-bottom:8px;">Tiada tren terus untuk laluan ini / No direct trains found</h3>
          <p style="color:var(--text-secondary);margin-bottom:18px;">Cuba tukar stesen atau klik "Papar Semua Pelepasan".</p>
          <button class="btn btn-primary" onclick="App.quickRoute('','')">${t('showAllDepartures')}</button>
        </div>`;
      return;
    }

    const ctaLabel = isReturnStep
      ? t('selectReturnBtn')
      : (state.tripMode === 'roundtrip' ? t('selectOutboundBtn') : t('selectSeatsBtn'));

    wrap.innerHTML = schedules.map(s => {
      const availPct = Math.round((s.available_seats / s.total_capacity) * 100);
      const amenities = (s.amenities || '').split(',').slice(0, 4).map(a => `<span class="amenity-tag">${escapeHtml(a.trim())}</span>`).join('');
      const isCancelled = s.status === 'Cancelled';
      return `
        <div class="train-card">
          <div>
            <span class="train-tier ${tierClass(s.train_type)}">${escapeHtml(s.train_type)}</span>
            <div class="train-name">${escapeHtml(s.train_name)}</div>
            <div class="train-code">${escapeHtml(s.train_code)} · ${escapeHtml(s.platform)}</div>
            <div class="train-amenities">${amenities}</div>
          </div>

          <div class="route-timeline">
            <div class="time-block">
              <div class="time">${s.departure_time}</div>
              <div class="stn-code">${s.origin_code}</div>
              <div class="stn-name">${escapeHtml(s.origin_name)}</div>
            </div>
            <div class="timeline-track">
              <div class="duration-label">${formatDuration(s.duration_mins)} · ${t('directTrip')}</div>
              <div class="track-line"></div>
              <div class="platform-status">${statusBadge(s.status)}</div>
            </div>
            <div class="time-block" style="text-align:right;">
              <div class="time">${s.arrival_time}</div>
              <div class="stn-code">${s.dest_code}</div>
              <div class="stn-name">${escapeHtml(s.dest_name)}</div>
            </div>
          </div>

          <div class="train-pricing">
            <div class="fare-tiers">
              <div class="fare-mini">
                <div class="fare-mini-cls">Economy</div>
                <div class="fare-mini-price">RM${s.base_fare_economy.toFixed(0)}</div>
              </div>
              <div class="fare-mini">
                <div class="fare-mini-cls">Business</div>
                <div class="fare-mini-price" style="color:var(--cyan-bright)">RM${s.base_fare_business.toFixed(0)}</div>
              </div>
              <div class="fare-mini">
                <div class="fare-mini-cls">First</div>
                <div class="fare-mini-price" style="color:var(--gold-bright)">RM${s.base_fare_first.toFixed(0)}</div>
              </div>
            </div>

            <div>
              <div class="seat-bar-wrap">
                <span>${t('liveAvail')}</span>
                <strong class="mono" style="color:${s.available_seats < 15 ? 'var(--gold-bright)' : 'var(--emerald)'}">${s.available_seats} / ${s.total_capacity} ${t('seatsWord')}</strong>
              </div>
              <div class="seat-progress">
                <div class="seat-progress-fill" style="width:${availPct}%"></div>
              </div>
            </div>

            <button class="btn ${isCancelled ? 'btn-ghost' : (isReturnStep ? 'btn-gold' : 'btn-primary')}" ${isCancelled ? 'disabled' : ''} onclick="App.openSeatPicker(${s.id}, '${date}')">
              ${isCancelled ? t('cancelledBtn') : ctaLabel}
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // ==================== SEAT PICKER & BOOKING ====================
  async function openSeatPicker(scheduleId, date) {
    if (!state.user) {
      toast('Please sign in or use 1-Click Demo Login to book tickets.', 'info');
      openAuthModal('login');
      return;
    }
    try {
      const data = await api(`/api/schedules/${scheduleId}/seats?date=${encodeURIComponent(date)}`);
      state.bookingCtx = {
        schedule: data.schedule,
        travelDate: data.travel_date,
        coaches: data.coaches,
        bookedSeats: new Set(data.booked_seats),
        activeCoachIdx: 2,
        selectedSeats: [],
        promo: null,
        paymentMethod: 'FPX Online Banking'
      };
      document.getElementById('bm-title').textContent = `${data.schedule.train_code} · ${data.schedule.origin_code} → ${data.schedule.dest_code}`;
      document.getElementById('bm-subtitle').textContent = `${data.schedule.train_name} (${data.schedule.train_type}) · Travel Date: ${data.travel_date} · Departs ${data.schedule.departure_time}`;
      document.getElementById('bm-promo-input').value = '';
      document.getElementById('bm-promo-msg').textContent = '';

      renderCoachTabs();
      renderSeatGrid();
      updateCheckoutSummary();
      openModal('booking-modal');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function getUnitFare(coachClass) {
    const s = state.bookingCtx.schedule;
    if (coachClass === 'First Class') return s.base_fare_first;
    if (coachClass === 'Business') return s.base_fare_business;
    return s.base_fare_economy;
  }

  function renderCoachTabs() {
    const { coaches, activeCoachIdx } = state.bookingCtx;
    document.getElementById('bm-coach-tabs').innerHTML = coaches.map((c, idx) => `
      <div class="coach-tab ${idx === activeCoachIdx ? 'active' : ''}" onclick="App.switchCoach(${idx})">
        <div class="coach-tab-name">${c.coach}</div>
        <div class="coach-tab-cls">${c.className}</div>
        <div class="mono" style="font-size:0.74rem;margin-top:3px;">RM ${getUnitFare(c.className).toFixed(0)}</div>
      </div>
    `).join('');
  }

  function switchCoach(idx) {
    if (state.bookingCtx.activeCoachIdx === idx) return;
    state.bookingCtx.activeCoachIdx = idx;
    state.bookingCtx.selectedSeats = []; // Keep seats within one coach per booking
    renderCoachTabs();
    renderSeatGrid();
    updateCheckoutSummary();
  }

  function renderSeatGrid() {
    const { coaches, activeCoachIdx, bookedSeats, selectedSeats } = state.bookingCtx;
    const coach = coaches[activeCoachIdx];
    const grid = document.getElementById('bm-seat-grid');
    let html = '';
    let seatNum = 1;

    for (let r = 1; r <= coach.rows; r++) {
      const leftCount = coach.layout === '1+2' ? 1 : 2;
      const rightCount = 2;
      let leftHtml = '';
      let rightHtml = '';

      for (let i = 0; i < leftCount; i++) {
        const code = `${coach.prefix}${seatNum++}`;
        const occ = bookedSeats.has(code);
        const sel = selectedSeats.includes(code);
        leftHtml += `<button type="button" class="seat-btn ${occ ? 'occupied' : ''} ${sel ? 'selected' : ''}" ${occ ? 'disabled' : ''} onclick="App.toggleSeat('${code}')">${code}</button>`;
      }
      for (let i = 0; i < rightCount; i++) {
        const code = `${coach.prefix}${seatNum++}`;
        const occ = bookedSeats.has(code);
        const sel = selectedSeats.includes(code);
        rightHtml += `<button type="button" class="seat-btn ${occ ? 'occupied' : ''} ${sel ? 'selected' : ''}" ${occ ? 'disabled' : ''} onclick="App.toggleSeat('${code}')">${code}</button>`;
      }

      html += `<div class="seat-row">${leftHtml}<div class="seat-aisle">R${r}</div>${rightHtml}</div>`;
    }
    grid.innerHTML = html;
  }

  function toggleSeat(code) {
    const sel = state.bookingCtx.selectedSeats;
    const idx = sel.indexOf(code);
    if (idx >= 0) {
      sel.splice(idx, 1);
    } else {
      if (sel.length >= 6) return toast('Maximum 6 seats per booking.', 'error');
      sel.push(code);
    }
    renderSeatGrid();
    updateCheckoutSummary();
  }

  function updateCheckoutSummary() {
    const { coaches, activeCoachIdx, selectedSeats, promo } = state.bookingCtx;
    const coach = coaches[activeCoachIdx];
    const unitFare = getUnitFare(coach.className);
    const currentSub = unitFare * selectedSeats.length;
    const isRoundTripStep1 = state.tripMode === 'roundtrip' && !state.rtOutbound;
    const isRoundTripStep2 = state.tripMode === 'roundtrip' && !!state.rtOutbound;

    const outSub = isRoundTripStep2 ? state.rtOutbound.subtotal : 0;
    const combinedSub = currentSub + outSub;
    const fee = selectedSeats.length ? (isRoundTripStep2 ? 6.00 : 3.00) : 0;
    const rtDisc = (isRoundTripStep2 && selectedSeats.length) ? Number((combinedSub * 0.05).toFixed(2)) : 0;

    let promoDisc = 0;
    if (promo && combinedSub > 0) {
      promoDisc = Math.min(promo.max_discount, Number(((combinedSub * promo.discount_percent) / 100).toFixed(2)));
    }
    const total = Math.max(0, combinedSub - rtDisc - promoDisc + fee);

    document.getElementById('bm-selected-seats-display').textContent = selectedSeats.length
      ? `${coach.coach} (${coach.className}) · Seats: ${selectedSeats.join(', ')}`
      : t('clickSeatsHint');

    document.getElementById('bm-outbound-row').style.display = isRoundTripStep2 ? 'flex' : 'none';
    document.getElementById('bm-outbound-fare').textContent = `RM ${outSub.toFixed(2)}`;
    document.getElementById('bm-subtotal-lbl').textContent = isRoundTripStep2 ? t('returnFare') : t('fareSubtotal');
    document.getElementById('bm-subtotal').textContent = `RM ${currentSub.toFixed(2)}`;
    document.getElementById('bm-rt-disc-row').style.display = rtDisc > 0 ? 'flex' : 'none';
    document.getElementById('bm-rt-disc').textContent = `-RM ${rtDisc.toFixed(2)}`;
    document.getElementById('bm-fee').textContent = `RM ${fee.toFixed(2)}`;
    document.getElementById('bm-discount-row').style.display = promoDisc > 0 ? 'flex' : 'none';
    document.getElementById('bm-discount').textContent = `-RM ${promoDisc.toFixed(2)}`;
    document.getElementById('bm-total').textContent = `RM ${total.toFixed(2)}`;

    const confirmBtn = document.getElementById('bm-confirm-btn');
    confirmBtn.textContent = isRoundTripStep1 ? t('continueReturnBtn') : t('confirmPayBtn');

    // Passenger detail inputs
    const paxContainer = document.getElementById('bm-passenger-inputs');
    if (!selectedSeats.length) {
      paxContainer.innerHTML = '';
    } else {
      paxContainer.innerHTML = selectedSeats.map((seat, i) => `
        <div style="display:grid;grid-template-columns:56px 1fr 1fr;gap:6px;align-items:center;">
          <span class="badge badge-info mono">${seat}</span>
          <input type="text" class="form-control pax-name" data-seat="${seat}" style="padding:7px 10px;font-size:0.8rem;" placeholder="Nama Penumpang / Name" value="${i === 0 && state.user ? escapeHtml(state.user.full_name) : ''}" />
          <input type="text" class="form-control pax-ic" data-seat="${seat}" style="padding:7px 10px;font-size:0.8rem;" placeholder="IC / Passport" value="${i === 0 && state.user ? escapeHtml(state.user.ic_passport) : ''}" />
        </div>
      `).join('');
    }
  }

  async function applyPromo() {
    const code = document.getElementById('bm-promo-input').value.trim();
    if (!code) return;
    try {
      const { promo } = await api('/api/promo/validate', { method: 'POST', body: JSON.stringify({ code }) });
      state.bookingCtx.promo = promo;
      document.getElementById('bm-promo-msg').textContent = `Applied: ${promo.code} (${promo.discount_percent}% off, max RM${promo.max_discount})`;
      updateCheckoutSummary();
      toast(`Promo ${promo.code} applied!`, 'success');
    } catch (err) {
      state.bookingCtx.promo = null;
      document.getElementById('bm-promo-msg').textContent = '';
      updateCheckoutSummary();
      toast(err.message, 'error');
    }
  }

  function selectPayment(el, method) {
    document.querySelectorAll('#bm-pay-methods .pay-option').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    state.bookingCtx.paymentMethod = method;
  }

  async function confirmBooking() {
    const { schedule, travelDate, coaches, activeCoachIdx, selectedSeats, promo, paymentMethod } = state.bookingCtx;
    if (!selectedSeats.length) return toast('Sila pilih sekurang-kurangnya 1 kerusi / Select at least 1 seat.', 'error');

    const coach = coaches[activeCoachIdx];
    const nameInputs = document.querySelectorAll('.pax-name');
    const icInputs = document.querySelectorAll('.pax-ic');
    const passengers = selectedSeats.map((seat, i) => ({
      seat,
      name: nameInputs[i]?.value.trim() || state.user.full_name,
      ic: icInputs[i]?.value.trim() || state.user.ic_passport
    }));

    // Round-Trip Step 1: Save outbound & switch search to return leg
    if (state.tripMode === 'roundtrip' && !state.rtOutbound) {
      state.rtOutbound = {
        schedule,
        travelDate,
        coach,
        seats: [...selectedSeats],
        passengers,
        subtotal: getUnitFare(coach.className) * selectedSeats.length
      };
      closeModal('booking-modal');
      renderRtBanner();
      toast('Tren Pergi disimpan! Sekarang pilih Tren Balik anda.', 'success');
      await handleSearch();
      return;
    }

    const btn = document.getElementById('bm-confirm-btn');
    btn.disabled = true;
    btn.textContent = 'Memproses Bayaran...';

    try {
      if (state.tripMode === 'roundtrip' && state.rtOutbound) {
        const out = state.rtOutbound;
        const { outbound, inbound } = await api('/api/bookings/round-trip', {
          method: 'POST',
          body: JSON.stringify({
            outbound: {
              schedule_id: out.schedule.id,
              travel_date: out.travelDate,
              coach_class: out.coach.className,
              coach_number: out.coach.coach,
              seat_numbers: out.seats
            },
            inbound: {
              schedule_id: schedule.id,
              travel_date: travelDate,
              coach_class: coach.className,
              coach_number: coach.coach,
              seat_numbers: selectedSeats
            },
            passengers,
            payment_method: paymentMethod,
            promo_code: promo ? promo.code : null
          })
        });
        state.rtOutbound = null;
        renderRtBanner();
        closeModal('booking-modal');
        toast(`Tempahan Pergi-Balik Berjaya! PNR: ${outbound.pnr_code} & ${inbound.pnr_code}`, 'success');
        showTicketModal([outbound, inbound]);
        handleSearch();
      } else {
        const { booking } = await api('/api/bookings', {
          method: 'POST',
          body: JSON.stringify({
            schedule_id: schedule.id,
            travel_date: travelDate,
            coach_class: coach.className,
            coach_number: coach.coach,
            seat_numbers: selectedSeats,
            passengers,
            payment_method: paymentMethod,
            promo_code: promo ? promo.code : null
          })
        });
        closeModal('booking-modal');
        toast(`Tempahan Berjaya! PNR: ${booking.pnr_code}`, 'success');
        showTicketModal(booking);
        handleSearch();
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = t('confirmPayBtn');
    }
  }

  // ==================== DIGITAL E-TICKET & OFFICIAL RECEIPT MODAL ====================
  function renderSingleBoardingPass(b, legTitle = '') {
    let paxList = [];
    try { paxList = JSON.parse(b.passenger_details_json); } catch {}
    const qrPayload = `RAILPULSE|${b.pnr_code}|${b.train_code}|${b.travel_date}|${b.coach_number}|${b.seat_numbers}`;
    const qrSvg = window.RailQR.renderSVG(qrPayload, 142);

    return `
      <div class="boarding-pass" style="margin-bottom:18px;">
        <div class="bp-header">
          <div>
            <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.14em;opacity:0.9;font-weight:700;">${legTitle ? `${legTitle} · ` : ''}${t('officialEticket')}</div>
            <div style="font-size:1.2rem;font-weight:800;margin-top:2px;">${escapeHtml(b.train_name)} (${b.train_code})</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:0.68rem;text-transform:uppercase;opacity:0.85;">${t('pnrRef')}</div>
            <div class="mono" style="font-size:1.3rem;font-weight:800;letter-spacing:0.06em;">${b.pnr_code}</div>
          </div>
        </div>

        <div class="bp-body">
          <div class="bp-main">
            <div class="route-timeline" style="margin-bottom:16px;">
              <div class="time-block">
                <div class="time">${b.departure_time}</div>
                <div class="stn-code">${b.origin_code}</div>
                <div class="stn-name">${escapeHtml(b.origin_name)}</div>
              </div>
              <div class="timeline-track">
                <div class="duration-label">${formatDuration(b.duration_mins)}</div>
                <div class="track-line"></div>
                <div>${statusBadge(b.booking_status)}</div>
              </div>
              <div class="time-block" style="text-align:right;">
                <div class="time">${b.arrival_time}</div>
                <div class="stn-code">${b.dest_code}</div>
                <div class="stn-name">${escapeHtml(b.dest_name)}</div>
              </div>
            </div>

            <div class="bp-grid">
              <div><div class="bp-field-lbl">${t('travelDate')}</div><div class="bp-field-val mono">${b.travel_date}</div></div>
              <div><div class="bp-field-lbl">${t('cabinClass')}</div><div class="bp-field-val" style="color:var(--gold-bright)">${b.coach_class}</div></div>
              <div><div class="bp-field-lbl">${t('platform')}</div><div class="bp-field-val">${b.platform}</div></div>
              <div><div class="bp-field-lbl">${t('coachSeats')}</div><div class="bp-field-val mono" style="color:var(--cyan-bright)">${b.coach_number} · ${b.seat_numbers}</div></div>
              <div><div class="bp-field-lbl">${t('payment')}</div><div class="bp-field-val">${escapeHtml(b.payment_method)}</div></div>
              <div><div class="bp-field-lbl">${t('totalPaid')}</div><div class="bp-field-val mono">RM ${Number(b.total_amount).toFixed(2)}</div></div>
            </div>

            <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border-subtle);display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div>
                <div class="bp-field-lbl" style="margin-bottom:5px;">${t('paxManifest')}</div>
                ${paxList.map(p => `<div style="font-size:0.8rem;display:flex;justify-content:space-between;margin-bottom:2px;"><span><strong>${escapeHtml(p.name)}</strong></span><span class="mono" style="color:var(--cyan-bright)">${p.seat}</span></div>`).join('')}
              </div>
              <div style="border-left:1px solid var(--border-subtle);padding-left:12px;">
                <div class="bp-field-lbl" style="margin-bottom:5px;">${t('receiptSummary')}</div>
                <div style="font-size:0.78rem;display:flex;justify-content:space-between;"><span>Subjumlah:</span><span class="mono">RM ${Number(b.subtotal || 0).toFixed(2)}</span></div>
                ${Number(b.discount || 0) > 0 ? `<div style="font-size:0.78rem;display:flex;justify-content:space-between;color:var(--emerald);"><span>Diskaun (${b.promo_code || 'PROMO'}):</span><span class="mono">-RM ${Number(b.discount).toFixed(2)}</span></div>` : ''}
                <div style="font-size:0.78rem;display:flex;justify-content:space-between;"><span>Caj Platform:</span><span class="mono">RM ${Number(b.service_fee || 3).toFixed(2)}</span></div>
                ${b.linked_pnr ? `<div style="font-size:0.74rem;margin-top:4px;color:var(--gold-bright);">${t('linkedPnrLbl')}: <strong class="mono">${b.linked_pnr}</strong></div>` : ''}
              </div>
            </div>
          </div>

          <div class="bp-qr-side">
            <div class="qr-frame">${qrSvg}</div>
            <div class="mono" style="font-size:0.78rem;font-weight:800;letter-spacing:0.1em;">${b.pnr_code}</div>
            <div style="font-size:0.7rem;color:var(--text-secondary);text-align:center;">${t('scanGateNote')}</div>
          </div>
        </div>
      </div>
    `;
  }

  function showTicketModal(bookingOrList) {
    const list = Array.isArray(bookingOrList) ? bookingOrList : [bookingOrList];
    const html = list.map((b, idx) => {
      const legTitle = list.length === 2 ? (idx === 0 ? t('outboundLeg') : t('returnLeg')) : '';
      return renderSingleBoardingPass(b, legTitle);
    }).join('');
    document.getElementById('ticket-modal-body').innerHTML = html;
    openModal('ticket-modal');
  }

  // ==================== LIVE BOARD & PNR ====================
  async function lookupPNR(e) {
    e.preventDefault();
    const pnr = document.getElementById('pnr-lookup-input').value.trim().toUpperCase();
    if (!pnr) return;
    try {
      const { booking } = await api(`/api/bookings/pnr/${encodeURIComponent(pnr)}`);
      showTicketModal(booking);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function loadLiveBoard() {
    try {
      const today = todayStr(0);
      const { schedules } = await api(`/api/schedules/search?date=${today}`);
      document.getElementById('live-board-tbody').innerHTML = schedules.map(s => `
        <tr>
          <td class="mono" style="font-weight:800;font-size:1rem;color:var(--cyan-bright)">${s.departure_time}</td>
          <td><strong>${escapeHtml(s.train_code)}</strong><br><span style="font-size:0.76rem;color:var(--text-secondary)">${escapeHtml(s.train_name)}</span></td>
          <td><strong>${s.origin_code} → ${s.dest_code}</strong><br><span style="font-size:0.76rem;color:var(--text-secondary)">${escapeHtml(s.origin_name)} to ${escapeHtml(s.dest_name)}</span></td>
          <td class="mono">${s.arrival_time}</td>
          <td>${escapeHtml(s.platform)}</td>
          <td class="mono">${s.available_seats} / ${s.total_capacity}</td>
          <td>${statusBadge(s.status)}</td>
          <td><button class="btn btn-primary btn-sm" onclick="App.openSeatPicker(${s.id}, '${today}')">Book</button></td>
        </tr>
      `).join('');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ==================== MY BOOKINGS ====================
  async function loadMyBookings() {
    const container = document.getElementById('my-bookings-container');
    if (!state.user) {
      container.innerHTML = `
        <div style="text-align:center;padding:44px 20px;">
          <h3 style="margin-bottom:8px;">Sign in to view your tickets</h3>
          <p style="color:var(--text-secondary);margin-bottom:18px;">Access all your upcoming E-Tickets, QR codes, and booking history.</p>
          <button class="btn btn-primary" onclick="App.openAuthModal('login')">Sign In Now</button>
        </div>`;
      return;
    }
    try {
      const { bookings } = await api('/api/bookings/my');
      if (!bookings.length) {
        container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-secondary);">You have no bookings yet. Book your first train journey now!</div>`;
        return;
      }
      container.innerHTML = `
        <div class="board-table-wrap">
          <table class="data-table">
            <thead>
              <tr><th>PNR</th><th>Train & Route</th><th>Travel Date</th><th>Class & Seats</th><th>Total</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${bookings.map(b => `
                <tr>
                  <td class="mono" style="font-weight:800;color:var(--cyan-bright)">${b.pnr_code}</td>
                  <td><strong>${b.origin_code} → ${b.dest_code}</strong><br><span style="font-size:0.76rem;color:var(--text-secondary)">${b.train_code} · ${b.departure_time}</span></td>
                  <td class="mono">${b.travel_date}</td>
                  <td>${b.coach_class}<br><span class="mono" style="font-size:0.78rem;color:var(--text-secondary)">${b.coach_number}: ${b.seat_numbers}</span></td>
                  <td class="mono">RM ${Number(b.total_amount).toFixed(2)}</td>
                  <td>${statusBadge(b.booking_status)}</td>
                  <td style="display:flex;gap:6px;">
                    <button class="btn btn-primary btn-sm" onclick='App.showTicketModal(${JSON.stringify(b).replace(/'/g, "&#39;")})'>E-Ticket QR</button>
                    ${b.booking_status === 'Confirmed' ? `<button class="btn btn-danger btn-sm" onclick="App.cancelBooking(${b.id})">Cancel</button>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function cancelBooking(id) {
    if (!confirm('Cancel this ticket? You will receive an automatic 80% refund and your seats will be released.')) return;
    try {
      const { refund_amount } = await api(`/api/bookings/${id}/cancel`, { method: 'POST' });
      toast(`Ticket cancelled. Refund of RM ${refund_amount.toFixed(2)} processed.`, 'success');
      loadMyBookings();
      if (document.getElementById('view-admin').classList.contains('active')) loadAdminBookings();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ==================== ADMIN COMMAND CENTER ====================
  function switchAdminTab(tab) {
    document.querySelectorAll('.admin-pane').forEach(p => p.style.display = 'none');
    document.getElementById(`admin-tab-${tab}`).style.display = 'block';
    document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.adminTab === tab));

    if (tab === 'overview') loadAdminOverview();
    if (tab === 'reports') initReportTab();
    if (tab === 'bookings') loadAdminBookings();
    if (tab === 'schedules') loadAdminSchedules();
    if (tab === 'fleet') loadAdminFleet();
  }

  async function loadAdminOverview() {
    try {
      const data = await api('/api/admin/overview');
      state.lastOverviewData = data;
      const k = data.kpis;
      document.getElementById('admin-kpi-grid').innerHTML = `
        <div class="kpi-card">
          <div class="kpi-label">Net Ticket Revenue</div>
          <div class="kpi-value" style="color:var(--cyan-bright)">RM ${k.net_revenue.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</div>
          <div class="kpi-sub">Gross: RM ${k.gross_revenue.toFixed(2)} · Refunds: RM ${k.total_refunds.toFixed(2)}</div>
        </div>
        <div class="kpi-card emerald">
          <div class="kpi-label">Tickets Sold</div>
          <div class="kpi-value">${k.tickets_sold}</div>
          <div class="kpi-sub">${k.total_bookings} total orders · ${k.checked_in_pax} checked-in</div>
        </div>
        <div class="kpi-card gold">
          <div class="kpi-label">Active Rail Network</div>
          <div class="kpi-value">${k.active_trains} Trains</div>
          <div class="kpi-sub">${k.active_schedules} scheduled daily departures</div>
        </div>
        <div class="kpi-card rose">
          <div class="kpi-label">Registered Passengers</div>
          <div class="kpi-value">${k.registered_passengers}</div>
          <div class="kpi-sub">Verified customer accounts</div>
        </div>
      `;

      setTimeout(() => {
        window.RailCharts.drawRevenueAreaChart(document.getElementById('chart-revenue'), data.daily_revenue);
        window.RailCharts.drawDonutChart(document.getElementById('chart-class'), data.by_class);
      }, 40);

      document.getElementById('admin-top-routes').innerHTML = data.top_routes.map(r => `
        <tr>
          <td><strong>${r.route_code}</strong><br><span style="font-size:0.74rem;color:var(--text-secondary)">${escapeHtml(r.route_name)}</span></td>
          <td class="mono">${r.passengers}</td>
          <td class="mono" style="color:var(--emerald);font-weight:700">RM ${r.revenue.toFixed(2)}</td>
        </tr>
      `).join('');

      document.getElementById('admin-recent-bookings').innerHTML = data.recent_bookings.map(b => `
        <tr>
          <td class="mono" style="color:var(--cyan-bright);font-weight:700">${b.pnr_code}</td>
          <td>${escapeHtml(b.buyer_name)}</td>
          <td>${b.origin_code} → ${b.dest_code}</td>
          <td class="mono">RM ${Number(b.total_amount).toFixed(2)}</td>
          <td>${statusBadge(b.booking_status)}</td>
        </tr>
      `).join('');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ==================== REPORT GENERATOR STUDIO ====================
  async function initReportTab() {
    if (!state.adminSchedules.length) {
      const { schedules } = await api('/api/admin/schedules');
      state.adminSchedules = schedules;
    }
    const sel = document.getElementById('rep-manifest-sched');
    sel.innerHTML = `<option value="ALL">All Departures on Selected Date</option>` +
      state.adminSchedules.map(s => `<option value="${s.id}">${s.departure_time} · ${s.train_code} (${s.origin_code}→${s.dest_code})</option>`).join('');
    toggleReportFilters();
    generateReport();
  }

  function toggleReportFilters() {
    const type = document.getElementById('rep-type').value;
    document.querySelectorAll('.rep-range-field').forEach(el => el.style.display = type === 'manifest' ? 'none' : 'flex');
    document.querySelectorAll('.rep-sales-field').forEach(el => el.style.display = type === 'sales' ? 'flex' : 'none');
    document.querySelectorAll('.rep-manifest-field').forEach(el => el.style.display = type === 'manifest' ? 'flex' : 'none');
  }

  async function generateReport() {
    const type = document.getElementById('rep-type').value;
    const from = document.getElementById('rep-from').value;
    const to = document.getElementById('rep-to').value;
    const cls = document.getElementById('rep-class').value;
    const mDate = document.getElementById('rep-manifest-date').value;
    const mSched = document.getElementById('rep-manifest-sched').value;

    try {
      let url = '';
      if (type === 'sales') url = `/api/admin/reports/sales?from=${from}&to=${to}&class=${encodeURIComponent(cls)}`;
      else if (type === 'manifest') url = `/api/admin/reports/manifest?date=${mDate}&schedule_id=${mSched}`;
      else url = `/api/admin/reports/routes?from=${from}&to=${to}`;

      const data = await api(url);
      state.currentReport = data;
      renderReport(data);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function renderReport(data) {
    const kpiEl = document.getElementById('report-summary-kpis');
    const thead = document.getElementById('report-thead');
    const tbody = document.getElementById('report-tbody');
    document.getElementById('print-report-meta').textContent = `Report Type: ${data.report_type.toUpperCase()} | Generated: ${new Date(data.generated_at).toLocaleString()}`;

    if (data.report_type === 'sales') {
      const s = data.summary;
      kpiEl.innerHTML = `
        <div class="kpi-card"><div class="kpi-label">Net Revenue</div><div class="kpi-value" style="color:var(--cyan-bright)">RM ${s.net_revenue.toFixed(2)}</div><div class="kpi-sub">Gross RM ${s.gross_revenue.toFixed(2)}</div></div>
        <div class="kpi-card emerald"><div class="kpi-label">Tickets Sold</div><div class="kpi-value">${s.total_tickets}</div><div class="kpi-sub">${s.active_bookings} active orders</div></div>
        <div class="kpi-card gold"><div class="kpi-label">Promo Discounts</div><div class="kpi-value">RM ${s.total_discounts.toFixed(2)}</div><div class="kpi-sub">Marketing incentives</div></div>
        <div class="kpi-card rose"><div class="kpi-label">Refunds Issued</div><div class="kpi-value">RM ${s.total_refunds.toFixed(2)}</div><div class="kpi-sub">${s.cancelled_bookings} cancelled</div></div>
      `;
      thead.innerHTML = `<tr><th>PNR</th><th>Booked</th><th>Travel</th><th>Customer</th><th>Train / Route</th><th>Class</th><th>Pax</th><th>Total (RM)</th><th>Status</th></tr>`;
      tbody.innerHTML = data.rows.length ? data.rows.map(r => `
        <tr>
          <td class="mono" style="font-weight:700">${r.pnr_code}</td>
          <td class="mono">${r.booking_date}</td>
          <td class="mono">${r.travel_date}</td>
          <td>${escapeHtml(r.buyer_name)}</td>
          <td><strong>${r.train_code}</strong> · ${r.route}</td>
          <td>${r.coach_class}</td>
          <td class="mono">${r.passenger_count}</td>
          <td class="mono" style="font-weight:700">RM ${Number(r.total_amount).toFixed(2)}</td>
          <td>${statusBadge(r.booking_status)}</td>
        </tr>
      `).join('') : `<tr><td colspan="9" style="text-align:center;color:var(--text-secondary);padding:28px;">No sales records found for this filter.</td></tr>`;
    } else if (data.report_type === 'manifest') {
      const s = data.summary;
      kpiEl.innerHTML = `
        <div class="kpi-card"><div class="kpi-label">Total Manifest Pax</div><div class="kpi-value">${s.total_passengers}</div><div class="kpi-sub">Travel Date: ${data.filters.date}</div></div>
        <div class="kpi-card emerald"><div class="kpi-label">Checked-In</div><div class="kpi-value" style="color:var(--emerald)">${s.checked_in}</div><div class="kpi-sub">Verified at gate</div></div>
        <div class="kpi-card gold"><div class="kpi-label">Pending Boarding</div><div class="kpi-value">${s.pending_boarding}</div><div class="kpi-sub">Awaiting gate scan</div></div>
        <div class="kpi-card"><div class="kpi-label">Load Factor</div><div class="kpi-value">${s.occupancy_percent}%</div><div class="kpi-sub">Per standard 128-seat train</div></div>
      `;
      thead.innerHTML = `<tr><th>Seat</th><th>Coach</th><th>Passenger Name</th><th>IC / Passport</th><th>PNR</th><th>Train & Route</th><th>Departure</th><th>Status</th></tr>`;
      tbody.innerHTML = data.rows.length ? data.rows.map(r => `
        <tr>
          <td class="mono" style="font-weight:800;color:var(--cyan-bright)">${r.seat}</td>
          <td>${r.coach_number} (${r.coach_class})</td>
          <td><strong>${escapeHtml(r.passenger_name)}</strong></td>
          <td class="mono">${escapeHtml(r.ic_passport)}</td>
          <td class="mono">${r.pnr_code}</td>
          <td>${r.train_code} · ${r.route}</td>
          <td class="mono">${r.departure_time}</td>
          <td>${statusBadge(r.status)}</td>
        </tr>
      `).join('') : `<tr><td colspan="8" style="text-align:center;color:var(--text-secondary);padding:28px;">No passengers manifested for this date/departure.</td></tr>`;
    } else {
      const s = data.summary;
      kpiEl.innerHTML = `
        <div class="kpi-card"><div class="kpi-label">Active Corridors</div><div class="kpi-value">${s.total_routes}</div><div class="kpi-sub">Scheduled routes</div></div>
        <div class="kpi-card emerald"><div class="kpi-label">Total Corridor Revenue</div><div class="kpi-value" style="color:var(--cyan-bright)">RM ${s.total_revenue.toFixed(2)}</div><div class="kpi-sub">Selected date window</div></div>
        <div class="kpi-card gold"><div class="kpi-label">Total Passengers</div><div class="kpi-value">${s.total_passengers}</div><div class="kpi-sub">Confirmed & Checked-In</div></div>
        <div class="kpi-card"><div class="kpi-label">Top Corridor</div><div class="kpi-value" style="font-size:1.3rem">${s.top_route}</div><div class="kpi-sub">Highest revenue share</div></div>
      `;
      thead.innerHTML = `<tr><th>Route Code</th><th>Corridor Name</th><th>Daily Trips</th><th>Bookings</th><th>Passengers</th><th>Avg Order (RM)</th><th>Gross Revenue (RM)</th></tr>`;
      tbody.innerHTML = data.rows.map(r => `
        <tr>
          <td class="mono" style="font-weight:800;color:var(--cyan-bright)">${r.route_code}</td>
          <td>${escapeHtml(r.route_name)}</td>
          <td class="mono">${r.active_schedules}</td>
          <td class="mono">${r.total_bookings}</td>
          <td class="mono">${r.total_passengers}</td>
          <td class="mono">RM ${Number(r.avg_ticket_value).toFixed(2)}</td>
          <td class="mono" style="font-weight:800;color:var(--emerald)">RM ${Number(r.gross_revenue).toFixed(2)}</td>
        </tr>
      `).join('');
    }
  }

  function exportReportCSV() {
    const type = document.getElementById('rep-type').value;
    const from = document.getElementById('rep-from').value;
    const to = document.getElementById('rep-to').value;
    const date = document.getElementById('rep-manifest-date').value;
    const url = `/api/admin/reports/export-csv?type=${type}&from=${from}&to=${to}&date=${date}`;
    window.location.href = url;
    toast('Downloading CSV report...', 'success');
  }

  // ==================== ADMIN BOOKINGS, SCHEDULES & FLEET ====================
  async function loadAdminBookings() {
    const q = document.getElementById('admin-book-search').value;
    const status = document.getElementById('admin-book-status').value;
    const { bookings } = await api(`/api/admin/bookings?q=${encodeURIComponent(q)}&status=${status}`);
    document.getElementById('admin-bookings-tbody').innerHTML = bookings.map(b => `
      <tr>
        <td class="mono" style="font-weight:800;color:var(--cyan-bright)">${b.pnr_code}</td>
        <td><strong>${escapeHtml(b.buyer_name)}</strong><br><span style="font-size:0.74rem;color:var(--text-secondary)">${escapeHtml(b.buyer_phone)}</span></td>
        <td>${b.train_code} · ${b.origin_code}→${b.dest_code}<br><span class="mono" style="font-size:0.76rem;color:var(--text-secondary)">${b.travel_date} @ ${b.departure_time}</span></td>
        <td>${b.coach_class}<br><span class="mono" style="font-size:0.76rem;color:var(--text-secondary)">${b.coach_number}: ${b.seat_numbers}</span></td>
        <td class="mono">RM ${Number(b.total_amount).toFixed(2)}</td>
        <td>${statusBadge(b.booking_status)}</td>
        <td style="display:flex;gap:6px;flex-wrap:wrap;">
          ${b.booking_status === 'Confirmed' ? `<button class="btn btn-emerald btn-sm" onclick="App.checkInBooking(${b.id})">Check-In</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick='App.showTicketModal(${JSON.stringify(b).replace(/'/g, "&#39;")})'>QR</button>
          ${b.booking_status !== 'Cancelled' ? `<button class="btn btn-danger btn-sm" onclick="App.cancelBooking(${b.id})">Cancel</button>` : ''}
        </td>
      </tr>
    `).join('');
  }

  async function checkInBooking(id) {
    try {
      await api(`/api/admin/bookings/${id}/checkin`, { method: 'POST' });
      toast('Passenger verified & checked in!', 'success');
      loadAdminBookings();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function loadAdminSchedules() {
    const [schedRes, trainRes, stnRes] = await Promise.all([
      api('/api/admin/schedules'),
      api('/api/admin/trains'),
      api('/api/admin/stations')
    ]);
    state.adminSchedules = schedRes.schedules;
    state.adminTrains = trainRes.trains;

    document.getElementById('ns-train').innerHTML = trainRes.trains.map(t => `<option value="${t.id}">${t.train_code} — ${t.name}</option>`).join('');
    const stnOpts = stnRes.stations.map(s => `<option value="${s.id}">${s.code} — ${s.name}</option>`).join('');
    document.getElementById('ns-origin').innerHTML = stnOpts;
    document.getElementById('ns-dest').innerHTML = stnOpts;
    if (stnRes.stations.length > 1) document.getElementById('ns-dest').value = stnRes.stations[1].id;

    document.getElementById('admin-schedules-tbody').innerHTML = schedRes.schedules.map(s => `
      <tr>
        <td><strong>${s.train_code}</strong><br><span style="font-size:0.74rem;color:var(--text-secondary)">${s.train_type}</span></td>
        <td>${s.origin_code} → ${s.dest_code}</td>
        <td class="mono">${s.departure_time} - ${s.arrival_time}</td>
        <td class="mono">RM${s.base_fare_economy} / RM${s.base_fare_business} / RM${s.base_fare_first}</td>
        <td>${escapeHtml(s.platform)}</td>
        <td>
          <select class="form-control" style="padding:6px 10px;font-size:0.78rem;width:130px;" onchange="App.updateScheduleStatus(${s.id}, this.value)">
            ${['On Time', 'Boarding', 'Delayed', 'Departed', 'Cancelled'].map(st => `<option value="${st}" ${s.status === st ? 'selected' : ''}>${st}</option>`).join('')}
          </select>
        </td>
        <td><button class="btn btn-danger btn-sm" onclick="App.deleteSchedule(${s.id})">Delete</button></td>
      </tr>
    `).join('');
  }

  async function createSchedule(e) {
    e.preventDefault();
    try {
      await api('/api/admin/schedules', {
        method: 'POST',
        body: JSON.stringify({
          train_id: document.getElementById('ns-train').value,
          origin_station_id: document.getElementById('ns-origin').value,
          destination_station_id: document.getElementById('ns-dest').value,
          departure_time: document.getElementById('ns-dep').value,
          arrival_time: document.getElementById('ns-arr').value,
          duration_mins: document.getElementById('ns-dur').value,
          base_fare_economy: document.getElementById('ns-eco').value,
          base_fare_business: document.getElementById('ns-biz').value,
          base_fare_first: document.getElementById('ns-first').value,
          platform: document.getElementById('ns-plat').value
        })
      });
      toast('New train schedule added!', 'success');
      loadAdminSchedules();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function updateScheduleStatus(id, status) {
    try {
      await api(`/api/admin/schedules/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
      toast(`Schedule status updated to "${status}".`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function deleteSchedule(id) {
    if (!confirm('Delete this schedule?')) return;
    await api(`/api/admin/schedules/${id}`, { method: 'DELETE' });
    toast('Schedule deleted.');
    loadAdminSchedules();
  }

  async function loadAdminFleet() {
    const [tRes, sRes] = await Promise.all([api('/api/admin/trains'), api('/api/admin/stations')]);
    document.getElementById('admin-trains-tbody').innerHTML = tRes.trains.map(t => `
      <tr>
        <td class="mono" style="font-weight:700;color:var(--cyan-bright)">${t.train_code}</td>
        <td>${escapeHtml(t.name)}</td>
        <td>${t.type}</td>
        <td>${statusBadge(t.status)}</td>
      </tr>
    `).join('');
    document.getElementById('admin-stations-tbody').innerHTML = sRes.stations.map(s => `
      <tr>
        <td class="mono" style="font-weight:700;color:var(--gold-bright)">${s.code}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.city)}, ${escapeHtml(s.state)}</td>
        <td class="mono">${s.platform_count}</td>
      </tr>
    `).join('');
  }

  async function createTrain(e) {
    e.preventDefault();
    try {
      await api('/api/admin/trains', {
        method: 'POST',
        body: JSON.stringify({
          train_code: document.getElementById('nt-code').value,
          name: document.getElementById('nt-name').value,
          type: document.getElementById('nt-type').value
        })
      });
      e.target.reset();
      toast('Train added to fleet!', 'success');
      loadAdminFleet();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function createStation(e) {
    e.preventDefault();
    try {
      await api('/api/admin/stations', {
        method: 'POST',
        body: JSON.stringify({
          code: document.getElementById('nst-code').value,
          name: document.getElementById('nst-name').value,
          city: document.getElementById('nst-city').value,
          state: document.getElementById('nst-state').value
        })
      });
      e.target.reset();
      toast('Station added to network!', 'success');
      loadAdminFleet();
      loadStations();
    } catch (err) { toast(err.message, 'error'); }
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  window.addEventListener('DOMContentLoaded', init);

  return {
    switchView, openAuthModal, setAuthMode, closeModal,
    toggleTheme, setLanguage, setTripMode, resetRoundTripOutbound,
    handleLogin, demoLogin, handleRegister, logout,
    swapStations, quickRoute, handleSearch,
    openSeatPicker, switchCoach, toggleSeat, applyPromo, selectPayment, confirmBooking,
    showTicketModal, lookupPNR, loadLiveBoard, cancelBooking,
    switchAdminTab, toggleReportFilters, generateReport, exportReportCSV,
    loadAdminBookings, checkInBooking, createSchedule, updateScheduleStatus, deleteSchedule,
    createTrain, createStation
  };
})();
