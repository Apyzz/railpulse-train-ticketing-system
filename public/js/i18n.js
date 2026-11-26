// RailPulse Pro — Bahasa Melayu (BM) & English (EN) Bilingual Engine
window.RailI18n = (function () {
  const dict = {
    bm: {
      brandSub: 'Sistem Tiket & Telemetri Berkelajuan Tinggi',
      navBook: 'Tempah Tiket',
      navBoard: 'Papan Jadual & PNR',
      navMyTickets: 'Tiket Saya',
      navAdmin: 'Admin & Laporan',
      signIn: 'Log Masuk',
      register: 'Daftar',
      logout: 'Keluar',

      heroBadge: 'Rangkaian Aktif · Inventori Tempat Duduk Masa Nyata',
      heroTitle1: 'Sistem Tiket Kereta Api Generasi Baru,',
      heroTitle2: 'Pantas, Moden & Profesional.',
      heroSub: 'Tempah tren ETS Platinum, ETS Gold & Ekspres di seluruh Malaysia dengan pilihan tempat duduk gerabak interaktif, pas masuk QR segera, dan resit rasmi.',
      statHubs: 'Stesen Utama',
      statOnTime: 'Ketepatan Masa',
      statClasses: 'Kelas Kabin',

      tripOneWay: 'Sehala (One-Way)',
      tripRoundTrip: 'Pergi-Balik (Diskaun 5%)',
      originStation: 'Stesen Berlepas',
      destStation: 'Stesen Destinasi',
      departDate: 'Tarikh Pergi',
      returnDate: 'Tarikh Balik',
      trainService: 'Perkhidmatan Tren',
      allServices: 'Semua Perkhidmatan',
      anyStation: 'Mana-mana Stesen',
      searchTrains: 'Cari Tren',
      popularRoutes: 'Laluan Popular:',
      showAllDepartures: 'Papar Semua Pelepasan',

      rtBannerStep1: 'MOD PERGI-BALIK · LANGKAH 1/2: Pilih Tren & Tempat Duduk PERGI',
      rtBannerStep2: 'MOD PERGI-BALIK · LANGKAH 2/2: Tren Pergi disimpan! Sekarang pilih Tren BALIK',
      rtOutboundSaved: 'Tren Pergi Dipilih',
      rtChangeOutbound: 'Tukar Tren Pergi',

      resultsFound: 'Pelepasan Tren Ditemui',
      resultsSub: 'Memaparkan inventori tempat duduk masa nyata untuk',
      liveAvail: 'Baki Tempat Duduk',
      seatsWord: 'kerusi',
      selectSeatsBtn: 'Pilih Kerusi & Tempah →',
      selectOutboundBtn: 'Pilih Tren Pergi →',
      selectReturnBtn: 'Pilih Tren Balik & Bayar →',
      cancelledBtn: 'Pelepasan Dibatalkan',
      directTrip: 'Terus',

      pnrTitle: 'Semakan Pantas E-Tiket & PNR',
      pnrSub: 'Semak status tiket atau cetak semula Pas Masuk Digital menggunakan kod PNR 6-aksara (cth: RP-884102).',
      pnrPlaceholder: 'Masukkan Kod PNR (cth: RP-884102)',
      trackTicket: 'Semak Tiket',
      liveBoardTitle: 'Papan Pelepasan Stesen Langsung',
      liveBoardSub: 'Status operasi masa nyata bagi semua koridor aktif.',
      refreshBoard: 'Muat Semula',

      myTicketsTitle: 'Tiket Saya & Sejarah Perjalanan',
      myTicketsSub: 'Akses pas masuk QR digital, resit rasmi, atau batalkan tiket dengan pulangan automatik 80%.',
      bookNewTicket: '+ Tempah Tiket Baru',
      signInToView: 'Log masuk untuk melihat tiket anda',
      signInToViewSub: 'Akses semua E-Tiket, kod QR, dan resit perjalanan anda.',
      noBookingsYet: 'Anda belum mempunyai sebarang tempahan. Tempah perjalanan pertama anda sekarang!',

      // Modal & Checkout
      coachFront: '▲ Arah Perjalanan · Bahagian Hadapan Gerabak ▲',
      legendAvail: 'Tersedia',
      legendSelected: 'Dipilih',
      legendOccupied: 'Penuh',
      selectedSeatsLbl: 'Tempat Duduk Dipilih (Maks 6)',
      clickSeatsHint: 'Klik kerusi pada peta gerabak untuk memilih',
      promoCodeLbl: 'Kod Promo',
      applyBtn: 'Guna',
      paymentMethodLbl: 'Kaedah Pembayaran',
      fareSubtotal: 'Subjumlah Tambang',
      outboundFare: 'Tambang Pergi',
      returnFare: 'Tambang Balik',
      rtBundleDisc: 'Diskaun Pakej Pergi-Balik (5%)',
      platformFee: 'Caj Platform & Keselamatan',
      promoDiscount: 'Diskaun Promo',
      totalPayable: 'Jumlah Perlu Dibayar',
      confirmPayBtn: 'Sahkan & Bayar Sekarang',
      continueReturnBtn: 'Simpan Tren Pergi & Pilih Tren Balik →',

      // Official Receipt / E-Ticket (BM)
      ticketModalTitle: 'Pas Masuk Digital & Resit Rasmi',
      printPdfBtn: 'Cetak / Simpan PDF',
      officialEticket: 'RailPulse Pro · E-Tiket & Resit Rasmi',
      pnrRef: 'Rujukan Tempahan (PNR)',
      travelDate: 'Tarikh Perjalanan',
      cabinClass: 'Kelas Kabin',
      platform: 'Platform',
      coachSeats: 'Gerabak & Kerusi',
      payment: 'Kaedah Bayaran',
      totalPaid: 'Jumlah Dibayar',
      paxManifest: 'Senarai Penumpang',
      scanGateNote: 'Imbas di Pintu Automatik 20 minit sebelum berlepas',
      receiptSummary: 'Ringkasan Resit Rasmi',
      outboundLeg: 'PERJALANAN PERGI (OUTBOUND)',
      returnLeg: 'PERJALANAN BALIK (RETURN)',
      linkedPnrLbl: 'PNR Berkaitan',

      // Admin
      adminCmdCenter: 'Pusat Kawalan',
      adminOps: 'Operasi Kereta Api',
      adminOverview: 'Ringkasan Eksekutif',
      adminReports: 'Studio Penjana Laporan',
      adminBookings: 'Tempahan & Daftar Masuk',
      adminSchedules: 'Jadual & Status Langsung',
      adminFleet: 'Tren & Stesen',
      reportTitle: 'Studio Penjana Laporan Profesional',
      reportSub: 'Jana laporan kewangan jualan, manifes penumpang, dan prestasi laluan. Eksport terus ke CSV (Excel) atau Cetak/PDF.',
      exportCsvBtn: 'Eksport CSV (Excel)',
      generateReportBtn: 'Jana Laporan'
    },
    en: {
      brandSub: 'High-Speed Ticketing & Telemetry',
      navBook: 'Book Tickets',
      navBoard: 'Live Board & PNR',
      navMyTickets: 'My Tickets',
      navAdmin: 'Admin & Reports',
      signIn: 'Sign In',
      register: 'Register',
      logout: 'Logout',

      heroBadge: 'Live Network Active · Real-Time Seat Inventory',
      heroTitle1: 'Next-Gen Railway Ticketing,',
      heroTitle2: 'Engineered for Speed.',
      heroSub: 'Reserve ETS Platinum, ETS Gold & Express trains across Malaysia with interactive coach seat selection, instant QR boarding passes, and official receipts.',
      statHubs: 'Major Hubs',
      statOnTime: 'On-Time Rate',
      statClasses: 'Cabin Classes',

      tripOneWay: 'One-Way',
      tripRoundTrip: 'Round-Trip (5% Off)',
      originStation: 'Origin Station',
      destStation: 'Destination Station',
      departDate: 'Departure Date',
      returnDate: 'Return Date',
      trainService: 'Train Service',
      allServices: 'All Services',
      anyStation: 'Any Station',
      searchTrains: 'Search Trains',
      popularRoutes: 'Popular Routes:',
      showAllDepartures: 'Show All Departures',

      rtBannerStep1: 'ROUND-TRIP MODE · STEP 1/2: Select your OUTBOUND Train & Seats',
      rtBannerStep2: 'ROUND-TRIP MODE · STEP 2/2: Outbound saved! Now select your RETURN Train',
      rtOutboundSaved: 'Outbound Selected',
      rtChangeOutbound: 'Change Outbound',

      resultsFound: 'Train Departures Found',
      resultsSub: 'Showing real-time seat inventory for',
      liveAvail: 'Live Availability',
      seatsWord: 'seats',
      selectSeatsBtn: 'Select Seats & Book →',
      selectOutboundBtn: 'Select Outbound Seats →',
      selectReturnBtn: 'Select Return & Pay →',
      cancelledBtn: 'Departure Cancelled',
      directTrip: 'Direct',

      pnrTitle: 'Instant E-Ticket & PNR Lookup',
      pnrSub: 'Verify any ticket status or reprint a Digital Boarding Pass using your 6-character PNR code (e.g. RP-884102).',
      pnrPlaceholder: 'Enter PNR Code (e.g. RP-884102)',
      trackTicket: 'Track Ticket',
      liveBoardTitle: 'Live Station Departure Board',
      liveBoardSub: 'Real-time operational status across all active corridors.',
      refreshBoard: 'Refresh Board',

      myTicketsTitle: 'My Tickets & Travel History',
      myTicketsSub: 'Access your digital QR boarding passes, official receipts, or request an instant 80% refund cancellation.',
      bookNewTicket: '+ Book New Ticket',
      signInToView: 'Sign in to view your tickets',
      signInToViewSub: 'Access all your upcoming E-Tickets, QR codes, and booking history.',
      noBookingsYet: 'You have no bookings yet. Book your first train journey now!',

      coachFront: '▲ Direction of Travel · Front of Coach ▲',
      legendAvail: 'Available',
      legendSelected: 'Selected',
      legendOccupied: 'Occupied',
      selectedSeatsLbl: 'Selected Seats (Max 6)',
      clickSeatsHint: 'Click seats on the coach map to select',
      promoCodeLbl: 'Promo Code',
      applyBtn: 'Apply',
      paymentMethodLbl: 'Payment Method',
      fareSubtotal: 'Fare Subtotal',
      outboundFare: 'Outbound Fare',
      returnFare: 'Return Fare',
      rtBundleDisc: 'Round-Trip Bundle Discount (5%)',
      platformFee: 'Platform & Security Fee',
      promoDiscount: 'Promo Discount',
      totalPayable: 'Total Payable',
      confirmPayBtn: 'Confirm & Pay Now',
      continueReturnBtn: 'Save Outbound & Pick Return Train →',

      ticketModalTitle: 'Digital Boarding Pass & Official Receipt',
      printPdfBtn: 'Print / Save PDF',
      officialEticket: 'RailPulse Pro · Official E-Ticket & Receipt',
      pnrRef: 'Booking Reference (PNR)',
      travelDate: 'Travel Date',
      cabinClass: 'Cabin Class',
      platform: 'Platform',
      coachSeats: 'Coach & Seats',
      payment: 'Payment Method',
      totalPaid: 'Total Paid',
      paxManifest: 'Passenger Manifest',
      scanGateNote: 'Scan at Auto-Gate 20 mins before departure',
      receiptSummary: 'Official Receipt Breakdown',
      outboundLeg: 'OUTBOUND JOURNEY',
      returnLeg: 'RETURN JOURNEY',
      linkedPnrLbl: 'Linked PNR',

      adminCmdCenter: 'Command Center',
      adminOps: 'Railway Operations',
      adminOverview: 'Executive Overview',
      adminReports: 'Report Generator Studio',
      adminBookings: 'Bookings & Gate Check-In',
      adminSchedules: 'Schedules & Live Status',
      adminFleet: 'Trains & Stations',
      reportTitle: 'Professional Report Generator Studio',
      reportSub: 'Generate auditable financial sales reports, train passenger manifests, and corridor performance analytics. Export directly to CSV (Excel) or Print/PDF.',
      exportCsvBtn: 'Export CSV (Excel)',
      generateReportBtn: 'Generate Report'
    }
  };

  let currentLang = localStorage.getItem('rp_lang') || 'bm';

  function getLang() {
    return currentLang;
  }

  function setLang(lang) {
    currentLang = lang === 'en' ? 'en' : 'bm';
    localStorage.setItem('rp_lang', currentLang);
    applyStaticTranslations();
  }

  function t(key) {
    return (dict[currentLang] && dict[currentLang][key]) || dict.en[key] || key;
  }

  function applyStaticTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) el.setAttribute('placeholder', t(key));
    });
  }

  return { getLang, setLang, t, applyStaticTranslations };
})();
