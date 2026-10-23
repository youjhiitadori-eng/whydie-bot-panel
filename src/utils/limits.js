// Sistem limit pemakaian fitur. Disimpan di src/database/limits.json (ikut ter-backup otomatis).
//  - Warlok (user biasa): dapat limit gratis harian (config.dailyLimit, default 10), reset tiap hari (WIB).
//  - Limit tambahan (.addlimit dari owner) TIDAK ikut terhapus saat reset harian.
//  - Owner & Premium: Unlimited.
const fs = require('fs');
const path = require('path');

const config = require('../config');
const FILE = path.join(config.dbDir, 'limits.json');
const WIB = 7 * 60 * 60 * 1000;
let cache = null;

const digits = (v) => String(v || '').replace(/\D/g, '');
const dailyMax = () => Math.max(0, parseInt(config.dailyLimit, 10) || 10);
const today = () => new Date(Date.now() + WIB).toISOString().slice(0, 10);

function load() {
    if (cache) return cache;
    try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { cache = {}; }
    if (!cache.users || typeof cache.users !== 'object') cache.users = {};
    return cache;
}

function save() {
    try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        const tmp = FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
        fs.renameSync(tmp, FILE);
    } catch { /* abaikan */ }
}

// Ambil data user; limit harian otomatis diisi ulang kalau hari (WIB) sudah berganti.
function entry(id, create) {
    const key = digits(id);
    if (!key) return null;
    const db = load();
    let e = db.users[key];
    if (!e) {
        if (!create) return { key, used: 0, bonus: 0, day: today() };
        e = db.users[key] = { used: 0, bonus: 0, day: today() };
    }
    if (e.day !== today()) { e.day = today(); e.used = 0; }
    return Object.assign(e, { key });
}

/** { free, bonus, total } untuk user biasa */
function get(id) {
    const e = entry(id, false);
    if (!e) return { free: 0, bonus: 0, total: 0 };
    const free = Math.max(0, dailyMax() - (e.used || 0));
    const bonus = Math.max(0, e.bonus || 0);
    return { free, bonus, total: free + bonus };
}

/** Teks untuk INFO BOT: "Unlimited" untuk Owner/Premium, selain itu "8/10 (+25 tambahan)" */
function label(id, role) {
    if (role === 'Owner' || role === 'Premium') return 'Unlimited';
    const g = get(id);
    return `${g.free}/${dailyMax()}${g.bonus ? ` (+${g.bonus} tambahan)` : ''}`;
}

/** Tambah limit tambahan (permanen, tidak ikut reset harian). Mengembalikan data terbaru. */
function add(id, amount) {
    const n = Math.floor(Number(amount));
    if (!Number.isFinite(n) || n <= 0) return null;
    const e = entry(id, true);
    if (!e) return null;
    e.bonus = (e.bonus || 0) + n;
    save();
    return get(id);
}

/** Pakai 1 (atau n) limit: gratis harian dulu, baru limit tambahan. false kalau tidak cukup. Owner/Premium tidak dipotong. */
function use(id, role, n = 1) {
    if (role === 'Owner' || role === 'Premium') return true;
    const e = entry(id, true);
    if (!e) return false;
    const g = get(id);
    if (g.total < n) return false;
    const fromFree = Math.min(g.free, n);
    e.used = (e.used || 0) + fromFree;
    e.bonus = Math.max(0, (e.bonus || 0) - (n - fromFree));
    save();
    return true;
}

module.exports = { get, label, add, use, dailyMax };
