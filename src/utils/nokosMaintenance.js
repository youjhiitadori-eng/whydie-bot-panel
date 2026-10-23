// MAINTENANCE toko Nokos: jalan OTOMATIS sekali sehari pada jam yang ditentukan (default 12.00 WIB).
//
// Saat jadwal tiba:
//   1. Toko ditutup singkat untuk order baru & deposit baru (default 5 menit). Order & deposit yang SUDAH
//      berjalan tetap diproses normal (OTP tetap masuk, deposit tetap dikredit, refund tetap jalan).
//   2. Cache API dibuang, lalu harga & stok semua layanan diambil ulang dari Nokoskuy (update harga + update stok).
//   3. Dibandingkan dengan data maintenance sebelumnya -> daftar harga naik/turun, layanan baru, stok habis/kembali.
//   4. Cek saldo API Nokoskuy (peringatan kalau tipis), order nyangkut, dan deposit yang masih menunggu.
//   5. Laporan ringkas dikirim ke semua owner.
//
// Owner juga bisa mengatur lewat WhatsApp: .maintenance on|off|now|auto on|auto off|jam 12:00|durasi 5|status
// Pengaturan dari WhatsApp disimpan di settings.json dan menimpa nilai default di config.nokos.maintenance.
const fs = require('fs');
const path = require('path');
const config = require('../config');
const settings = require('./settings');
const db = require('./nokosDb');
const api = require('./nokosApi');
const ui = require('./nokosUi');

const state = (global.__nokosMt = global.__nokosMt || { sock: null, timer: null, running: false });

const WIB_MS = 7 * 60 * 60 * 1000;                      // WIB = UTC+7 (tanpa DST)
const DEFAULTS = { enabled: true, time: '12:00', windowMin: 5, lowBalance: 20000, stuckMin: 60 };

/** Pengaturan aktif: default -> config.js -> override dari WhatsApp (settings.json). */
function cfg() {
    const base = { ...DEFAULTS, ...((config.nokos && config.nokos.maintenance) || {}) };
    const o = settings.getMaintenance();
    for (const k of ['enabled', 'time', 'windowMin']) if (o[k] !== undefined) base[k] = o[k];
    return base;
}

/* ------------------------------ WAKTU (WIB) ------------------------------ */

function wibNow(now = Date.now()) {
    const d = new Date(now + WIB_MS);
    return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/** "12:00" | "12.00" | "1200" -> menit sejak 00:00, null kalau tidak valid */
function parseTime(s) {
    const m = String(s || '').trim().match(/^(\d{1,2})[:.]?(\d{2})$/);
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    return h < 24 && mi < 60 ? h * 60 + mi : null;
}
const fmtMin = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function schedule(now = Date.now()) {
    const c = cfg();
    const start = parseTime(c.time) ?? parseTime(DEFAULTS.time);
    const end = start + Math.max(1, Number(c.windowMin) || DEFAULTS.windowMin);
    const w = wibNow(now);
    return { ...w, start, end, c };
}

/** Sekarang berada di dalam jendela maintenance? (aman untuk jendela yang melewati pukul 00.00) */
const inWin = (s) => s.c.enabled && ((s.min - s.start + 1440) % 1440) < (s.end - s.start);

/* ------------------------------ STATUS ------------------------------ */

/**
 * Status maintenance sekarang.
 * return { active, reason: 'manual'|'running'|'scheduled'|null, reopenAt: 'HH:MM WIB'|null, time, windowMin, enabled }
 */
function status(now = Date.now()) {
    const s = schedule(now);
    const manual = settings.getMaintenance().manual === true;
    const inWindow = inWin(s);
    let reason = null;
    if (manual) reason = 'manual';
    else if (state.running) reason = 'running';
    else if (inWindow) reason = 'scheduled';
    return {
        active: !!reason, reason,
        reopenAt: reason === 'scheduled' ? `${fmtMin(s.end)} WIB` : null,
        time: fmtMin(s.start), windowMin: s.end - s.start, enabled: !!s.c.enabled,
    };
}

/** Teks untuk user saat toko ditutup. */
function closedText(st = status()) {
    const when = st.reopenAt ? `Toko buka lagi sekitar *${st.reopenAt}*.` : 'Toko akan dibuka kembali setelah maintenance selesai.';
    return [
        '🛠️ *Maintenance sedang berlangsung*',
        '',
        'Kami sedang memperbarui harga & stok layanan.',
        when,
        '',
        '> Order & deposit yang sudah berjalan tetap diproses otomatis.',
        '> Saldo kamu aman.',
    ].join('\n');
}

/* ------------------------------ SNAPSHOT HARGA / STOK ------------------------------ */

const snapFile = () => path.join(config.dbDir, 'nokos-snapshot.json');

function readSnap() {
    try { return JSON.parse(fs.readFileSync(snapFile(), 'utf8')); } catch { return null; }
}
function writeSnap(services) {
    try {
        fs.mkdirSync(path.dirname(snapFile()), { recursive: true });
        const tmp = snapFile() + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify({ at: Date.now(), services }));
        fs.renameSync(tmp, snapFile());
    } catch (e) { console.error('[NOKOS-MT] gagal simpan snapshot:', e.message); }
}

/** Bandingkan layanan sekarang vs snapshot lama (harga dalam harga JUAL, bukan modal). */
function diffServices(prev, list) {
    const now = {};
    for (const s of list) now[s.slug] = { n: s.name, p: Number(s.price_from) || 0, s: Number(s.stock) || 0 };
    const out = { total: list.length, up: [], down: [], added: [], soldOut: [], restocked: [], first: !prev, snapshot: now };
    if (!prev) return out;
    const old = prev.services || {};
    for (const [slug, cur] of Object.entries(now)) {
        const was = old[slug];
        if (!was) { out.added.push(cur.n); continue; }
        if (cur.p !== was.p) {
            const a = ui.sellPrice(was.p).sell, b = ui.sellPrice(cur.p).sell;
            (b > a ? out.up : out.down).push({ name: cur.n, from: a, to: b });
        }
        if (was.s > 0 && cur.s === 0) out.soldOut.push(cur.n);
        if (was.s === 0 && cur.s > 0) out.restocked.push(cur.n);
    }
    return out;
}

/* ------------------------------ JOB ------------------------------ */

const top = (arr, n) => arr.slice(0, n);
const ownersTell = (text) => (state.sock ? ui.notifyOwners(state.sock, text) : Promise.resolve());

/**
 * Jalankan maintenance sekarang. Tidak pernah throw.
 * opts.manual = true -> dipicu owner (.maintenance now), tidak menandai "sudah jalan hari ini".
 * return { ok, report, text }
 */
async function run({ manual = false } = {}) {
    if (state.running) return { ok: false, text: 'Maintenance sedang berjalan.' };
    state.running = true;
    const t0 = Date.now();
    const lines = [];
    try {
        if (!manual) settings.setMaintenance({ lastRunDate: wibNow().date });
        const c = cfg();

        // 1) buang cache lalu ambil data baru (harga & stok)
        api.clearCache();
        const [svc, prov] = await Promise.all([api.services(), api.providers()]);
        if (svc.ok) {
            const d = diffServices(readSnap(), svc.data || []);
            writeSnap(d.snapshot);
            lines.push(`📦 *${d.total}* layanan diperbarui (harga & stok terbaru).`);
            if (d.first) lines.push('ℹ️ Ini pembaruan pertama, belum ada pembanding.');
            else {
                if (d.up.length) lines.push(`📈 Harga naik (${d.up.length}): ` + top(d.up, 5).map(x => `${x.name} ${ui.rp(x.from)}→${ui.rp(x.to)}`).join(', ') + (d.up.length > 5 ? ' …' : ''));
                if (d.down.length) lines.push(`📉 Harga turun (${d.down.length}): ` + top(d.down, 5).map(x => `${x.name} ${ui.rp(x.from)}→${ui.rp(x.to)}`).join(', ') + (d.down.length > 5 ? ' …' : ''));
                if (d.added.length) lines.push(`🆕 Layanan baru (${d.added.length}): ${top(d.added, 8).join(', ')}${d.added.length > 8 ? ' …' : ''}`);
                if (d.soldOut.length) lines.push(`⛔ Stok habis (${d.soldOut.length}): ${top(d.soldOut, 8).join(', ')}${d.soldOut.length > 8 ? ' …' : ''}`);
                if (d.restocked.length) lines.push(`✅ Stok kembali (${d.restocked.length}): ${top(d.restocked, 8).join(', ')}${d.restocked.length > 8 ? ' …' : ''}`);
                if (!d.up.length && !d.down.length && !d.added.length && !d.soldOut.length && !d.restocked.length) lines.push('➖ Tidak ada perubahan harga / stok.');
            }
        } else {
            lines.push(`⚠️ Gagal mengambil katalog (${svc.error?.code || 'error'}). Harga & stok belum diperbarui.`);
        }
        lines.push(prov.ok ? '🖥️ Daftar server diperbarui.' : '⚠️ Daftar server gagal diperbarui.');

        // 2) saldo API Nokoskuy
        const bal = await api.balance();
        if (bal.ok) {
            const b = Number(bal.data?.balance) || 0;
            lines.push(`💰 Saldo API: *${ui.rp(b)}*${b < c.lowBalance ? `\n🚨 *Saldo API tipis* (< ${ui.rp(c.lowBalance)}). Segera isi supaya order user tidak gagal.` : ''}`);
        } else {
            lines.push(`⚠️ Saldo API tidak bisa dicek (${bal.error?.code || 'error'}).`);
        }

        // 3) order nyangkut & deposit menunggu
        const stuck = db.activeOrders().filter(o => Date.now() - o.createdAt > c.stuckMin * 60 * 1000);
        lines.push(`🧾 Order aktif: ${db.activeOrders().length}${stuck.length ? ` (⚠️ ${stuck.length} sudah lebih dari ${c.stuckMin} menit: ${top(stuck, 5).map(o => '#' + o.id).join(', ')})` : ''}`);
        lines.push(`💳 Deposit menunggu: ${db.pendingDeposits().length}`);

        const took = Math.max(1, Math.round((Date.now() - t0) / 1000));
        const text = ['🛠️ *LAPORAN MAINTENANCE*', manual ? '(dijalankan manual)' : '(jadwal harian)', '', ...lines, '', `⏱️ Selesai dalam ${took} detik.`].join('\n');
        settings.setMaintenance({ lastRun: Date.now(), lastReport: lines.join('\n').slice(0, 1500) });
        ownersTell(text);
        return { ok: true, text };
    } catch (e) {
        console.error('[NOKOS-MT] gagal:', e);
        ownersTell(`⚠️ Maintenance gagal dijalankan: ${e.message}`);
        return { ok: false, text: `Maintenance gagal: ${e.message}` };
    } finally {
        state.running = false;
    }
}

/* ------------------------------ PENJADWAL ------------------------------ */

/** Dipanggil tiap beberapa detik: kalau masuk jendela jadwal & hari ini belum jalan -> jalankan. */
async function tick() {
    if (state.running) return;
    const s = schedule();
    if (!s.c.enabled) return;
    if (!inWin(s)) return;                                               // di luar jendela: tidak jalan (hanya jam yang ditentukan)
    if (settings.getMaintenance().lastRunDate === s.date) return;        // hari ini sudah
    await run({ manual: false });
}

function attach(sock) { state.sock = sock; }

if (state.timer) clearInterval(state.timer);                              // guard hot-reload
state.timer = setInterval(() => { tick().catch(() => { }); }, 15 * 1000);
if (state.timer.unref) state.timer.unref();

module.exports = { attach, status, closedText, run, tick, cfg, parseTime, fmtMin, diffServices, wibNow };
