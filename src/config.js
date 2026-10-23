module.exports = {
    // Nama owner (GANTI JADI NAMA LO)
    ownerName: 'Whydie',

    // Nama bot
    botName: 'Whydie Bot',

    footerTxt: 'Powered by Whydie',

    // Prefix command (contoh: ! . /)
    prefix: '.',

    // Limit gratis per hari untuk user biasa (Warlok). Owner & Premium = Unlimited. Reset tiap hari (WIB).
    dailyLimit: 10,

    // Command yang boleh dipanggil TANPA prefix (ketik "menu" saja). Yang lain wajib pakai prefix.
    noPrefixCommands: ['menu', 'allmenu'],

    // Alamat API Download (lihat src/utils/downloadList.js)
    downloadApi: 'https://apiii-xrina.my.id/download',

    // Command buatan owner (.addlist): true = bisa diketik TANPA prefix juga (contoh: "promo"), false = wajib pakai prefix (".promo")
    storeNoPrefix: true,

    // Command OWNER ONLY (nama tanpa prefix). Menunya boleh dilihat semua orang, tapi yang bisa memakai cuma owner.
    ownerOnlyCommands: [
        'ping', 'runtime', 'owner', 'onbutton', 'offbutton',
        'self', 'public', 'addprem', 'delprem', 'listprem', 'addlimit',
        // Backup source code (dikirim ke chat pribadi owner)
        'backup', 'bakucp', 'backupsc', 'bakusc',
        // Nokos (toko nomor OTP) - admin
        'nokosmode', 'modejual', 'nokoslock', 'addsaldo', 'minsaldo', 'listdepo', 'nokosinfo', 'maintenance',
        // Store List (command buatan sendiri)
        'addlist', 'editlist', 'dellist', 'liststore',
    ],

    // Command yang hanya boleh dipakai Premium / Owner. Isi nama command tanpa prefix, contoh: ['tozombie', 'hd']
    premiumCommands: [],

    // Tampilan menu kategori & all menu: 'full' (INFO BOT + daftar lengkap, bisa kena "Baca selengkapnya")
    // atau 'compact' (daftar dipadatkan supaya muat tanpa terpotong)
    menuStyle: 'full',

    // Tombol (PILIH MENU) di chat PRIBADI/DM. false = menu dikirim sebagai foto + teks biasa (pasti terbaca di semua HP/nomor).
    // Di grup tombol tetap aktif (kecuali .offbutton). Ubah ke true kalau tombol di DM sudah terbukti muncul.
    dmButtons: false,

    // Animasi loading (bar persen + reaksi ⏳/✅) sebelum menu utama muncul
    menuLoading: true,

    // Info yang tampil di menu
    website: 'www.whydie.web.id', // Ganti kalau lo punya web
    channelUrl: 'https://whatsapp.com/channel/0029Vb8taJECcW4nkyv0oB3p',

    // Super Owner — GANTI DENGAN NOMOR WA LO (Awali pakai 62, tanpa + atau 0)
    superOwner: '6288354997831', 

    // Co-Owner — bisa lebih dari satu, akses owner biasa
    coOwner: [
        // '6289999999999',
    ],

    // Mode bot: 'public' → semua orang | 'self' → hanya owner
    botMode: 'public',

    // Otomatis centang biru pesan yang masuk
    autoRead: true,

    // Tampilkan indikator "mengetik..." saat membalas
    autoTyping: true,

    // Folder penyimpanan sesi login
    authFolder: './src/database/session',

    // Format: '120363xxxxxxxxx@newsletter'  — kosongkan jika tidak dipakai
    channelId: '120363185570235320@newsletter',

    // ===================== NOKOS (TOKO NOMOR OTP VIRTUAL) =====================
    nokos: {
        // API key dari Nokoskuy. Nanti isi ini di Railway Variables dengan nama NKS_KEY.
        apiKey: process.env.NKS_KEY || '',
        baseUrl: 'https://welper.web.id/nokoskuy/api/v2',

        profit: { flat: 1000, percent: 0 },
        depositFee: { flat: 200, percent: 0 },
        minDeposit: 2000,
        maxDeposit: 1000000,
        depositPresets: [5000, 10000, 20000],

        deposit: {
            method: '',
            pollMs: 4000,
            lateGraceMin: 360,
            maxPending: 3,
        },

        maintenance: {
            enabled: true,
            time: '12:00',
            windowMin: 5,
            lowBalance: 20000,
            stuckMin: 60,
        },

        popular: ['whatsapp', 'telegram', 'instagram', 'facebook', 'tiktok', 'google', 'shopee', 'gojek', 'grab', 'dana'],

        maxActiveOrders: 3,
        pageSize: 9,
        buttons: true,

        rules: [
            '1. Saldo dipotong saat order dibuat.',
            '2. OTP masuk = pembelian sukses, TIDAK bisa direfund (termasuk kalau akun tujuan terblokir / ditolak aplikasi).',
            '3. OTP tidak masuk sampai waktu habis, order dibatalkan, atau gagal = saldo kembali otomatis.',
            '4. Salah pilih layanan / salah input nomor di aplikasi tujuan = tanggung jawab pembeli.',
            '5. Dilarang untuk penipuan, pembobolan akun orang lain, spam, atau aktivitas melanggar hukum.',
            '6. Saldo toko tidak bisa ditarik / diuangkan kembali.',
            '7. Komplain maksimal 24 jam setelah kejadian, sertakan kode order.',
        ].join('\n'),
    },
};

/* =========================================================
   SUPPORT WEBSITE RENTAL (Welper)
   Biarkan saja bagian ini. Kalau lo nanti mau ngembangin 
   sistem rental otomatis, kode ini bakal berguna.
   ========================================================= */
(function applyManagedConfig() {
    const fs = require('fs');
    const path = require('path');
    const cfg = module.exports;

    const ROOT = path.resolve(__dirname, '..');
    const MANAGED_FILE = path.resolve(ROOT, '..', 'config', 'bot.json');
    const digits = (v) => String(v == null ? '' : v).replace(/\D/g, '');
    const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

    let managed = null;
    try {
        if (fs.existsSync(MANAGED_FILE)) {
            const raw = JSON.parse(fs.readFileSync(MANAGED_FILE, 'utf8'));
            if (raw && typeof raw === 'object') managed = raw;
        }
    } catch { managed = null; }

    cfg.managed = !!managed;
    cfg.botNumber = '';
    cfg.dbDir = path.join(ROOT, 'src', 'database');
    cfg.pairingFile = '';

    if (!managed) return;

    const dataDir = path.resolve(ROOT, String(managed.dataDir || '../data'));
    cfg.dataDir = dataDir;
    cfg.dbDir = path.join(dataDir, 'database');
    cfg.authFolder = path.join(dataDir, 'session');
    cfg.pairingFile = path.join(dataDir, 'pairing.json');

    const botName = clean(managed.botName, 40);
    const ownerName = clean(managed.ownerName, 40);
    if (botName) cfg.botName = botName;
    if (ownerName) cfg.ownerName = ownerName;

    cfg.botNumber = digits(managed.botNumber);

    const owners = (Array.isArray(managed.ownerNumbers) ? managed.ownerNumbers : []).map(digits).filter(Boolean);
    const superOwner = owners[0] || cfg.botNumber || '';
    cfg.superOwner = superOwner;
    cfg.coOwner = owners.slice(1);
})();