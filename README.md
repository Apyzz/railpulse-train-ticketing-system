# RailPulse Pro — Professional Train Ticketing & Operations System

Sistem tempahan tiket kereta api versi profesional yang lengkap dengan antara muka moden (*Cyber-Executive UI*), pangkalan data SQL sebenar, pemilihan tempat duduk interaktif mengikut gerabak, pas masuk digital berkod QR (*E-Ticket*), dan **Admin Report Generator Studio** (eksport CSV & Cetak/PDF).

## Cara Jalankan Sistem (1-Klik)
1. Buka folder `D:\RailPulse-Train-Ticketing-System`
2. Klik dua kali (**double-click**) fail **`START_SYSTEM.bat`**
3. Sistem akan dibuka secara automatik di browser pada **`http://localhost:3000`**
   *(Tidak perlu pasang XAMPP — Node.js & SQLite SQL Database terbina dalam!)*

## Akaun Demo (Sedia Digunakan)
| Peranan | Email | Kata Laluan |
|---|---|---|
| **Admin (Dashboard & Reports)** | `admin@railpulse.my` | `admin123` |
| **Penumpang (User)** | `hafiz@railpulse.my` | `user123` |

*(Atau guna butang **1-Click Demo Login** pada skrin Sign In)*

## Kod Promo Ujian
- `RAIL10` — Diskaun 10%
- `ETSPRO15` — Diskaun 15%
- `MERDEKA20` — Diskaun 20%

## Ciri-Ciri Utama
- **Portal Penumpang**: Carian laluan & jadual masa nyata, penapis jenis kereta api (ETS Platinum, ETS Gold, Intercity Express, Executive Shuttle), peta tempat duduk interaktif mengikut gerabak (Coach A First Class 1+2, Coach B Business 2+2, Coach C & D Economy 2+2), kod promo, pembayaran simulasi (FPX, Kad, TnG eWallet), E-Ticket digital dengan Kod QR & fungsi Cetak/PDF, semakan PNR pantas, dan pembatalan tiket dengan pulangan automatik 80%.
- **Papan Pelepasan Langsung (Live Departure Board)**: Paparan status semasa setiap perjalanan (`On Time`, `Boarding`, `Delayed`, `Departed`, `Cancelled`).
- **Admin Command Center**:
  - **Executive Overview**: KPI hasil bersih, jualan tiket, graf trend hasil harian, carta pecahan kelas kabin, dan laluan terlaris.
  - **Report Generator Studio**: Jana 3 jenis laporan profesional (*Sales & Revenue Report*, *Passenger Boarding Manifest*, *Route Performance & Occupancy*), eksport terus ke **CSV (Excel)** atau **Print / Save PDF**.
  - **Pengurusan Operasi**: Semakan & *Gate Check-In* penumpang, tambah/padam/kemaskini status jadual secara langsung, urus kereta api & stesen.
- **Pangkalan Data**:
  - `database/railpulse.db` — Pangkalan data SQLite sebenar (automatik sedia dengan data contoh).
  - `database/mysql_schema.sql` — Skema SQL serasi **MySQL / XAMPP (phpMyAdmin)** sekiranya ingin diimport ke XAMPP pada masa hadapan.
