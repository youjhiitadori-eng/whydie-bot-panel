# Nayla AI (by Welper ID)

Bot WhatsApp berbasis Node.js dan [`@hanzofc/baileys`](https://www.npmjs.com/package/@hanzofc/baileys).
Menu kategori (Owner, Download, AI, Fun, Game, Canva, Donghive, Grup, AI Image) dengan tombol, bisa dimatikan per chat dengan `.offbutton`.

## Jalankan
```
npm install
npm start
```
Masukkan nomor WhatsApp, lalu input pairing code di Linked Devices -> Link with phone number.

## Struktur
```
index.js                  # koneksi & pairing
lib/baileys.js            # loader ESM untuk @hanzofc/baileys
src/config.js             # prefix, owner, nama bot
src/commands/menu.js      # command .menu (tambah file baru di sini untuk command lain)
src/handlers/messageHandler.js
src/utils/                # PluginLoader, helper, interactiveHelper, fquoted
```
Ubah prefix, nama bot, dan nomor owner di `src/config.js`.

## Fitur
- `.menu` `.allmenu` `.ownermenu` (owner only) `.grupmenu` `.setormenu` `.downloadmenu` `.aiimagemenu` `.onbutton` `.offbutton`
- Owner Menu (menu bisa dilihat semua, tapi command-nya Owner Only): `.ping` `.runtime` `.owner` `.onbutton` `.offbutton` `.self` `.public` `.addprem` `.delprem` `.listprem`. Daftarnya diatur di `ownerOnlyCommands` pada `src/config.js`.
- Download: `.ytmp4` `.ytmp3` `.play` `.play2` (player + lirik) `.tiktok` `.twitterdl` `.instagram` `.igmp3` `.facebook` `.capcut` `.snackvideo` `.bilibili` `.pindl` `.mediafire` `.terabox` `.gdrive` `.aio` `.aio2`. Tambah fitur baru: 1 baris di `src/utils/downloadList.js`
- Grup (Owner / Admin grup, di dalam grup): `.welcome on/off/test` `.goodbye on/off/test`. Foto template ada di `src/media/welcome.png` & `goodbye.png`
- AI Image: kirim/reply foto + `.tozombie`, `.toghibli`, `.hd`, dst. Prompt: `.flux <prompt>`, `.text2img <prompt>`
- Tambah fitur AI Image baru: tambah nama di `src/utils/aiImageList.js`

## AI Menu 🤖 (`.aimenu`)
Chat dengan banyak AI lewat API `apiii-xrina.my.id/ai`. Pakai: `.gpt <pertanyaan>` atau reply pesan lalu ketik `.gpt`.
`.gpt` `.gemini` `.claude` `.qwen` `.blackbox` `.deepai` `.algolia` `.asyntai` `.overchat` `.notegpt` `.notrack` `.clara` `.ethan` `.guru` `.honcho` `.maya` `.naxa` `.nova` + karakter Unlimited AI: `.rinai` `.zetaai` `.frierenai`.
- `.aicostum <karakter / aturan> | <pertanyaan>` -> AI dengan karakter buatan sendiri.
- Tambah AI baru: 1 baris di `src/utils/aiList.js`.

## Fun Menu 😎 (`.funmenu`)
`.artinama <nama>` `.cekcantik` `.cekganteng` `.cekiq` `.cekkhodam <nama>` `.ceksifat <nama>` `.longteks` `.pantun` `.pap <cewe/cowo>` `.quotesbijak` `.quotesbucin` `.quotesgalau` `.quotesgombal` `.quotesmotivasi`.
Kalau nama tidak diisi, dipakai nama WhatsApp pengirim. Tambah fitur: 1 entri di `src/utils/funList.js`.

## Game Menu 🎮 (`.gamemenu`)
`.asahotak` `.caklontong` `.kataacak` `.susunkata` `.tebakbendera` `.tebakbuah` `.tebakepep` `.tebakgambar` `.tebakhewan` `.tebakkalimat` `.tebakkata` `.tebakkimia` `.tebaktebakan`.
- Satu soal aktif per chat/grup, waktu 60 detik. Jawab dengan **mengetik langsung** di chat (tanpa prefix); siapa cepat dia dapat, pemenangnya di-tag.
- `.hint` (petunjuk huruf), `.nyerah` (lihat jawaban). Jawaban hampir benar dibalas reaksi 🤏.
- Tambah game: 1 entri di `src/utils/gameList.js` (fungsi `build` menentukan soal, gambar, jawaban). Logika ada di `src/utils/gameState.js`.

## Canva Menu 🎨 (`.canvamenu`)
Bikin gambar (fake chat, fake saldo, kartu musik, quotes, dll) lewat `apiii-xrina.my.id/canvas`. Isian dipisah tanda `|`, contoh: `.iqc Halo kak | 12.00`, `.fakeml Welper | Mythic`.
- Parameter foto: kirim/reply foto, tempel link gambar, atau kosongkan = foto profil WhatsApp kamu.
- Ketik command tanpa isi untuk melihat format & contohnya.
- Fitur: `callandro` `callios` `codesnap` `fakech` `fakeff2` `fakeffduo` `fakegc` `fakegopay` `fakeml` `fakeovo` `faketele` `ffgirl` `igstory` `iqc` `iqcpink` `iqcpinkv2` `meledak` `memepolisi` `musiccard` `nokia` `quotes` `ttqc` `windows`.
- Tambah fitur baru: 1 entri di `src/utils/canvasList.js`.

## Donghive 🐉 (`.donghivemenu`)
- `.donghive [halaman]` katalog -> `.dhseries <nomor / link>` detail + daftar episode -> `.dhepisode <nomor / link> [stream]` link episode.
- Hasil katalog/episode diingat per chat selama 30 menit, jadi cukup ketik nomornya.

## Backup SC (Owner only)
`.bakucp` (alias `.backupsc`, `.bakusc`) membuat zip source code bot langsung lewat Node.js (tanpa program zip/tar) dan mengirimnya ke **chat pribadi owner**. Tidak ikut: `node_modules`, `.git`, `backup/`, dan sesi login (`src/database/session`). File berisi `config.js` (termasuk API key), jangan dibagikan.

## Role & mode
- Role: **Owner** (superOwner/coOwner), **Premium** (`.addprem 628xxx [hari]`, `.delprem`, `.listprem`), **Warlok** (user biasa).
- Jadikan command khusus Premium: isi `premiumCommands` di `src/config.js`, contoh `['hd', 'tozombie']`.
- Mode: `.self` (hanya owner) / `.public` (semua orang). Tersimpan walau bot restart.
- Tampilan menu: `menuStyle: 'full'` atau `'compact'` di `src/config.js`.


## Store List (command buatan sendiri) 📝
Owner bisa bikin command baru berisi teks, lalu siapa pun tinggal mengetik nama command-nya. Selalu dikirim dengan foto menu. Ada di kategori sendiri: **STORE MENU** (`.storemenu`), terpisah dari Nokos. Command yang dibuat ikut tampil di menu itu.

**Owner only**: `.addlist <nama> <teks>` `.editlist <nama> <teks baru>` `.dellist <nama>` `.liststore`
- Teks boleh beberapa baris, atau reply pesan lalu ketik `.addlist <nama>`.
- Nama: huruf kecil, angka, `_` atau `-` (maks 30). Tidak boleh sama dengan command bawaan bot.
- Dipakai dengan `.promo` atau cukup `promo` (seluruh pesan = nama). Matikan versi tanpa prefix: `storeNoPrefix: false` di `src/config.js`.
- Data tersimpan di `src/database/storelist.json` (ikut auto backup). Tes: `node tests/storelist.test.js`.

## Nokos Store (jualan nomor OTP) 🛒
Jualan nomor OTP virtual lewat API [Nokoskuy v2](https://welper.web.id/nokoskuy), full tombol. OTP masuk otomatis ke chat pembeli, **deposit user juga otomatis**.

**Setup**
1. Buat API key di halaman Developer Nokoskuy (tombol *Buat API key*, tampil sekali). Simpan di env `NKS_KEY` (disarankan) atau `nokos.apiKey` di `src/config.js`. Jangan di-upload ke repo publik; kalau bocor, klik *Ganti API key* (key lama langsung mati).
2. Atur untung di `src/config.js`:
   - `profit: { flat: 1000, percent: 0 }` -> harga jual = harga API + 1000
   - `depositFee: { flat: 200, percent: 0 }` -> toko mengirim amount = nominal + 200 ke Nokoskuy; user membayar total (amount + biaya admin/QRIS Nokoskuy), saldo user +nominal (fee toko = untung owner)
   - `minDeposit: 2000` / `maxDeposit`; `depositPresets` (tombol nominal cepat, maks 3); `deposit: { pollMs, lateGraceMin, maxPending }`. Minimal otomatis naik kalau `meta.min` dari Nokoskuy lebih besar dari nominal + fee (pastikan minimal di sisi Nokoskuy juga sudah Rp2.000)
   - `maintenance: { enabled, time: '12:00', windowMin: 5, lowBalance, stuckMin }`
3. Di WhatsApp (owner): `.nokosmode on` untuk menyalakan, `.nokosmode off` untuk mematikan.
4. Pastikan saldo Nokoskuy akunmu cukup untuk melayani order (deposit user otomatis masuk ke saldo ini).

**Mode jualan**
- ON  : `.menu` hanya menampilkan Nokos Store. Owner tetap bisa buka menu lengkap lewat `.allmenu`.
- OFF : bot normal, semua fitur toko hilang. Order yang sedang jalan tetap diselesaikan.
- `.nokoslock on` : saat mode ON, user biasa di chat pribadi hanya bisa memakai fitur toko.

**User**: `.nokos` (menu) `.beli` `.cari <app>` `.saldo` `.deposit <nominal>` `.cekdepo` `.riwayat` `.rules`
**Owner**: `.nokosmode on/off` `.nokoslock on/off` `.nokosinfo` (panel: saldo API aktif/tertunda, untung) `.listdepo` `.addsaldo <no> <jml>` `.minsaldo <no> <jml>` `.maintenance`

**Menu toko**: hanya 2 tombol, **Beli Nokos** dan **MENU** (isi MENU: Deposit, Saldo & Profil, Riwayat, Cari Layanan, Rules, Hubungi Owner; owner juga dapat Panel Owner & Maintenance).

**Deposit otomatis (API v2.1, QRIS)**
1. User `.deposit 20000` (atau tombol nominal) -> bot membuat tagihan lewat `POST /deposits` dan mengirim **foto kode QR QRIS** + rincian (saldo masuk, biaya, total bayar, batas waktu) + tombol *Buka Halaman Bayar* (`checkout_url`).
2. User scan QR dengan e-wallet / m-banking apa pun. Bot memantau `GET /deposits/{id}`; begitu `berhasil`, saldo user masuk **sekali saja**, user dikabari + struk.
3. Kedaluwarsa: user dikabari, tetap dipantau `lateGraceMin` menit (bayar telat tetap dikreditkan).
4. Nokoskuy mengizinkan **maksimal 3 deposit menunggu per akun** (`deposit.maxPending`); lebih dari itu user diminta menunggu sebentar.
5. Deposit manual (bukti transfer + `.accdepo`) sudah dihapus. Kalau deposit Nokoskuy sedang offline, user diminta coba lagi nanti.

**Catatan penting**
- Saldo user dipotong dulu saat order dibuat; gagal / batal / expired = refund otomatis (sekali saja). OTP masuk = final.
- Semua request ke API lewat pembatas laju internal (100/menit, batas server 120) dan menghormati `Retry-After`.
- Order hanya lewat chat pribadi (OTP & saldo tidak ditampilkan di grup).
**Maintenance harian (default jam 12.00 WIB)**
- Sekali sehari pada jam yang diatur, toko ditutup singkat untuk order & deposit BARU (default 5 menit). Order/deposit yang sudah berjalan tidak terganggu.
- Isinya: update harga & stok semua layanan (cache dibuang, data diambil ulang), deteksi harga naik/turun, layanan baru, stok habis/kembali, cek saldo API (peringatan kalau tipis), cek order nyangkut, lalu laporan dikirim ke owner.
- Kontrol owner: `.maintenance` (status) · `.maintenance now` (jalankan sekarang) · `.maintenance on/off` (tutup/buka toko manual) · `.maintenance auto on/off` · `.maintenance jam 12:00` · `.maintenance durasi 5`.

- Data toko: `src/database/nokos.json` (ikut ter-backup). Data pembanding maintenance: `nokos-snapshot.json` di folder yang sama.
- Tes otomatis dengan mock API v2: `node tests/nokos.test.js`
