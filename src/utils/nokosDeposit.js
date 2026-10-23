// Deposit OTOMATIS lewat API Nokoskuy v2 (QRIS, sejak v2.1.0).
//
// Alur:
//   user pilih nominal  -> POST /deposits  (amount = nominal + fee toko)
//   Nokoskuy membalas payment.qris (isi QRIS) + checkout_url -> bot mengirim FOTO QR ke user
//   user bayar `total` lewat QRIS sebelum expires_at (total = amount + biaya admin + biaya QRIS gateway)
//   poller GET /deposits/{id} tiap beberapa detik -> status "berhasil" -> saldo user dikredit SEKALI -> user dikabari + struk
//   kedaluwarsa -> user dikabari; tetap dipantau selama masa toleransi (bayar telat bisa tetap dikreditkan)
//
// Aturan Nokoskuy yang dijaga di sini:
//   - Maksimal 3 deposit menunggu per akun  -> batas lokal (maxPending) + penanganan 409 deposit_pending
//   - Deposit dikredit sekali per deposit    -> flag `settled` diset SINKRON sebelum saldo user ditambah
//   - Batas pembuatan 8 per 10 menit         -> dijaga lewat batas lokal + penanganan 429
//
// Uang: user membayar `total` (nominal + fee toko + biaya gateway). Saldo user bertambah sebesar `nominal`.
// Fee toko (config.nokos.depositFee) = untung owner; biaya gateway dibayar user dan tidak masuk ke saldo.
const config = require('../config');
const db = require('./nokosDb');
const api = require('./nokosApi');
const ui = require('./nokosUi');
const receipt = require('./nokosReceipt');

const state = (global.__nokosDeposit = global.__nokosDeposit || { sock: null, timer: null, running: false, creating: 0, nextGraceAt: 0 });

const dp = () => (config.nokos && config.nokos.deposit) || {};
const POLL_MS = () => Math.max(3000, Number(dp().pollMs) || 4000);
const GRACE_POLL_MS = 60 * 1000;
const GRACE_MIN = () => Math.max(0, Number(dp().lateGraceMin ?? 360));
const MAX_PENDING = () => Math.max(1, Number(dp().maxPending) || 3);   // batas Nokoskuy: 3 deposit menunggu per akun
const MIN_FALLBACK = 2000;                            // dipakai kalau Nokoskuy tidak menyebut batas minimal
const recentCreates = [];                             // timestamp pembuatan deposit sukses

const send = (jid, content) => (state.sock ? ui.sendCard(state.sock, jid, content).catch(() => { }) : Promise.resolve());
const alertOwner = (text) => (state.sock ? ui.notifyOwners(state.sock, text) : Promise.resolve());
function attach(sock) { state.sock = sock; }

/* ------------------------------ INFO METODE ------------------------------ */

/**
 * Info deposit Nokoskuy saat ini.
 * return { ok:true, methods:[{id,type,label}], min, max, expiresIn, available } | { ok:false, error }
 * Sejak v2.1.0 satu-satunya metode adalah QRIS.
 */
async function info() {
    const r = await api.depositMethods();
    if (!r.ok) return { ok: false, error: r.error, status: r.status };
    const meta = r.meta || {};
    let methods = Array.isArray(r.data) ? r.data.filter(x => x && x.id) : [];
    const fixed = String(dp().method || '').trim();
    if (fixed) methods = methods.filter(x => x.id === fixed);
    return {
        ok: true, methods, available: meta.available !== false && methods.length > 0,
        min: Number(meta.min) || MIN_FALLBACK, max: Number(meta.max) || 1000000, expiresIn: Number(meta.expires_in_minutes) || 15,
    };
}

/**
 * Batas nominal yang boleh dipilih user.
 * Nokoskuy menilai amount = nominal + fee toko, jadi nominal minimal = (min Nokoskuy - fee toko), tapi tidak di bawah config.nokos.minDeposit.
 */
function limits(inf) {
    const q = (n) => ui.depositQuote(n).total;
    const cfgMin = Number(config.nokos.minDeposit) || MIN_FALLBACK, cfgMax = Number(config.nokos.maxDeposit) || 1000000;
    let min = cfgMin;
    while (q(min) < inf.min && min < cfgMax) min += 100;        // naikkan sampai amount >= min Nokoskuy
    let max = cfgMax;
    while (max > min && q(max) > inf.max) max -= 100;           // turunkan sampai amount <= max Nokoskuy
    return { min, max };
}

/* ------------------------------ BUAT DEPOSIT ------------------------------ */

/**
 * Buat deposit otomatis.
 * ctx: { user, chat, name, nominal, methodId }
 * return:
 *   { ok:true, deposit, reused? }
 *   { ok:false, code, message }   code: busy | rate_limited | unavailable | offline | invalid_amount | invalid_method | error
 */
async function create(ctx) {
    const { user, nominal } = ctx;

    // Satu deposit aktif per user: tampilkan yang lama (jangan buat baru).
    const mine = db.userPendingDeposit(user);
    if (mine && db.isApiDeposit(mine)) return { ok: true, deposit: mine, reused: true };

    // Antrean: Nokoskuy mengizinkan maksimal 3 deposit menunggu per akun (termasuk yang dibuat owner di website).
    const waiting = db.pendingDeposits().filter(db.isApiDeposit);
    if (waiting.length + (Number(state.creating) || 0) >= MAX_PENDING()) {
        const soonest = waiting.map(d => d.expiresAt).filter(Boolean).sort()[0] || null;
        return { ok: false, code: 'busy', message: 'Antrean deposit sedang penuh.', waitUntil: soonest };
    }

    const now = Date.now();
    while (recentCreates.length && now - recentCreates[0] > 10 * 60 * 1000) recentCreates.shift();
    if (recentCreates.length >= 8) return { ok: false, code: 'rate_limited', message: 'Terlalu banyak deposit dibuat dalam waktu singkat.' };

    state.creating = (Number(state.creating) || 0) + 1;     // naik SINKRON sebelum await pertama (cegah melewati batas saat bersamaan)
    try {
        const q = ui.depositQuote(nominal);
        // amount = nominal + fee toko. Nokoskuy menambah biaya admin + biaya QRIS di atasnya (total yang dibayar user).
        const r = await api.createDeposit(q.total, ctx.methodId || undefined);
        if (!r.ok) return mapCreateError(r);

        const a = r.data || {};
        recentCreates.push(Date.now());
        const apiAmount = Number(a.amount) || q.total;
        const total = Number(a.total) || (apiAmount + (Number(a.fee) || 0));
        const dep = db.createDeposit({
            userId: user.id, chat: ctx.chat, name: ctx.name || user.name || '',
            nominal: q.nominal, fee: q.fee,                       // fee = untung toko
            total,                                                // yang dibayar user
            payFee: Math.max(0, total - q.nominal),               // semua biaya yang dilihat user (fee toko + admin + QRIS)
            credit: q.nominal,                                    // saldo yang masuk ke user
            // data Nokoskuy
            apiId: a.id, apiRef: a.ref || null, apiAmount, apiFee: Number(a.fee) || 0,
            method: a.method || { type: 'qris', label: 'QRIS' },
            payment: a.payment ? { qris: a.payment.qris || '', qris_is_image_url: !!a.payment.qris_is_image_url } : null,
            checkoutUrl: a.checkout_url || null,
            expiresAt: a.expires_at || null,
            nextPollAt: Date.now() + POLL_MS(),
        });
        return { ok: true, deposit: dep };
    } finally {
        state.creating = Math.max(0, (Number(state.creating) || 1) - 1);
    }
}

function mapCreateError(r) {
    const e = r.error || {};
    if (e.code === 'deposit_pending') return { ok: false, code: 'busy', message: 'Antrean deposit sedang penuh.' };
    if (e.code === 'rate_limited') return { ok: false, code: 'rate_limited', message: 'Sistem sedang ramai.' };
    if (e.code === 'deposit_unavailable' || e.code === 'deposit_offline' || e.code === 'gateway_error') return { ok: false, code: 'offline', message: 'Deposit otomatis sedang tidak tersedia.' };
    if (e.code === 'invalid_amount' || e.code === 'invalid_method' || e.code === 'invalid_request') return { ok: false, code: e.code, message: e.message || 'Nominal / metode tidak valid.' };
    if (e.code === 'unauthorized' || e.code === 'no_api_key') {
        alertOwner(`⚠️ *API key Nokoskuy bermasalah* (${e.code}). Deposit otomatis tidak bisa dibuat. Buat key baru di halaman Developer Nokoskuy, lalu isi di src/config.js -> nokos.apiKey (atau env NKS_KEY).`);
        return { ok: false, code: 'unavailable', message: 'Deposit sedang gangguan.' };
    }
    return { ok: false, code: 'error', message: 'Gagal membuat deposit. Coba lagi sebentar.' };
}

/* ------------------------------ BATAL ------------------------------ */

/** Batalkan deposit milik user. Jangan dibatalkan kalau sudah membayar (Nokoskuy menolak kalau sudah dibayar). */
async function cancel(d) {
    if (d.status !== 'pending') return { ok: false, message: 'Deposit sudah diproses.' };
    if (!db.isApiDeposit(d)) { db.updateDeposit(d, { status: 'cancelled' }); return { ok: true }; }

    const r = await api.cancelDeposit(d.apiId);
    if (r.ok) { db.updateDeposit(d, { status: 'cancelled', settled: true }); return { ok: true }; }

    const c = r.error?.code;
    if (c === 'cannot_cancel') {
        // sudah dibayar / kedaluwarsa -> sinkronkan status sekarang juga
        await pollOne(d, { force: true });
        return { ok: false, message: db.getDeposit(d.id).status === 'approved' ? 'Deposit ini sudah dibayar, saldo sudah masuk.' : 'Deposit ini tidak bisa dibatalkan.' };
    }
    if (c === 'not_found') { db.updateDeposit(d, { status: 'cancelled', settled: true }); return { ok: true }; }
    return { ok: false, message: 'Belum bisa dibatalkan sekarang. Coba lagi sebentar.' };
}

/* ------------------------------ SELESAI / KREDIT ------------------------------ */

/** Kredit saldo user SEKALI per deposit. Flag diset sinkron sebelum saldo bertambah. */
function settle(d, apiData, { late = false } = {}) {
    if (d.settled) return false;
    const u = db.findUser(d.userId);
    db.updateDeposit(d, { settled: true, status: 'approved', approvedAt: Date.now(), paidAt: apiData?.paid_at || null, withdrawableAt: apiData?.withdrawable_at || null, late: !!late });
    if (!u) {
        alertOwner(`⚠️ Deposit #${d.id} (${d.apiRef || d.apiId}) sudah dibayar tapi user ${d.userId} tidak ditemukan. Kredit manual ${ui.rp(d.credit)} dengan .addsaldo.`);
        return true;
    }
    db.credit(u, d.credit, `Deposit #${d.id}`, 'deposit');
    u.deposited += d.credit;
    db.updateDeposit(d, {});
    send(d.chat, {
        text: `✅ *Deposit #${d.id} berhasil!*${late ? '\n(pembayaran terlambat terdeteksi)' : ''}\nSaldo +${ui.rp(d.credit)}\nSaldo sekarang: *${ui.rp(u.balance)}*`,
        buttons: config.nokos.buttons === false ? [] : [ui.quick('🛒 Beli Nokos', ui.cmd('nk beli'))],
    });
    if (state.sock) receipt.sendReceipt(ui.sendCard, state.sock, d.chat, receipt.depositSuccessSpec(d, u.balance));
    return true;
}

/* ------------------------------ POLLER ------------------------------ */

/**
 * Cek satu deposit ke Nokoskuy dan terapkan statusnya.
 * Status Nokoskuy: menunggu | berhasil | kedaluwarsa | dibatalkan
 */
async function pollOne(d, { force = false } = {}) {
    const now = Date.now();
    const r = await api.getDeposit(d.apiId);

    if (!r.ok) {
        const c = r.error?.code;
        const wait = c === 'rate_limited' ? Math.max(r.retryAfter || 0, 5) * 1000 : POLL_MS();
        if (c === 'not_found') {
            const n = (d.notFound || 0) + 1;
            db.updateDeposit(d, { notFound: n, nextPollAt: now + wait });
            if (n === 5) alertOwner(`⚠️ Deposit #${d.id} (${d.apiRef || d.apiId}) tidak ditemukan di Nokoskuy. Cek manual.`);
        } else if (c === 'unauthorized') {
            db.updateDeposit(d, { nextPollAt: now + 60000 });
            if (!d.alertedAuth) { db.updateDeposit(d, { alertedAuth: true }); alertOwner('⚠️ *API key Nokoskuy bermasalah* saat memantau deposit. Pembayaran user belum bisa dikonfirmasi otomatis. Cek nokos.apiKey.'); }
        } else {
            db.updateDeposit(d, { nextPollAt: now + wait });
        }
        return;
    }

    const a = r.data || {};
    if (a.status === 'berhasil') { settle(d, a, { late: d.status === 'expired' }); return; }

    if (a.status === 'dibatalkan') {
        if (d.status !== 'cancelled') db.updateDeposit(d, { status: 'cancelled', settled: true });
        return;
    }

    if (a.status === 'kedaluwarsa') {
        if (d.status === 'pending') {
            db.updateDeposit(d, {
                status: 'expired', expiredAt: now, graceUntil: now + GRACE_MIN() * 60 * 1000, nextPollAt: now + GRACE_POLL_MS,
            });
            send(d.chat, {
                text: `⌛ *Deposit #${d.id} kedaluwarsa.*\n\nKalau kamu *sudah* membayar, tunggu sebentar: pembayaran yang masuk setelah ini tetap dicek otomatis.\nKalau belum, buat deposit baru.`,
                buttons: config.nokos.buttons === false ? [] : [ui.quick('➕ Deposit Lagi', ui.cmd('nk depo'))],
            });
        } else {
            db.updateDeposit(d, { nextPollAt: now + GRACE_POLL_MS });
        }
        return;
    }

    // masih menunggu. Nokoskuy belum menandai kedaluwarsa tapi waktunya lewat -> jangan tebak, tunggu statusnya.
    db.updateDeposit(d, { nextPollAt: now + POLL_MS() });
}

async function tick() {
    if (state.running || !state.sock) return;
    state.running = true;
    try {
        const now = Date.now();
        const waiting = db.pendingDeposits().filter(db.isApiDeposit);
        const grace = db.graceDeposits(now);
        for (const d of [...waiting, ...grace]) {
            if (d.nextPollAt && d.nextPollAt > now) continue;
            try { await pollOne(d); } catch (e) { console.error(`[NOKOS-DEPO] #${d.id}:`, e.message); db.updateDeposit(d, { nextPollAt: Date.now() + POLL_MS() }); }
        }
        // masa toleransi habis -> berhenti memantau
        // sisa deposit manual versi lama (tanpa data Nokoskuy) tidak bisa diproses lagi -> tutup
        for (const d of db.pendingDeposits().filter(x => !db.isApiDeposit(x))) db.updateDeposit(d, { status: 'cancelled', settled: true, reason: 'metode manual dihapus' });
        for (const d of db.allDeposits()) {
            if (db.isApiDeposit(d) && d.status === 'expired' && !d.settled && (d.graceUntil || 0) <= now) db.updateDeposit(d, { settled: true, status: 'closed' });
        }
    } finally { state.running = false; }
}

if (state.timer) clearInterval(state.timer);          // guard hot-reload
state.timer = setInterval(() => { tick().catch(() => { }); }, 2000);
if (state.timer.unref) state.timer.unref();

module.exports = { attach, info, limits, create, cancel, pollOne, settle, tick };
