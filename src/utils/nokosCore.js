// Inti toko Nokos: membuat order, refund, dan POLLER yang mengirim OTP otomatis ke chat user.
//
// Alur uang (semua sinkron, aman dari double-spend):
//   order dibuat  -> saldo user dipotong DULU -> panggil API
//   API gagal pasti -> saldo user dikembalikan saat itu juga
//   hasil belum pasti (timeout) -> saldo ditahan, request diulang dengan Idempotency-Key yang SAMA
//   OTP tidak masuk / batal / expired / gagal -> poller mengembalikan saldo user (satu kali saja)
//   OTP masuk -> final, tidak ada refund
const config = require('../config');
const db = require('./nokosDb');
const api = require('./nokosApi');
const ui = require('./nokosUi');
const receipt = require('./nokosReceipt');

const POLL_EVERY_MS = 5000;        // jarak polling per order (saran dokumen: 3-5 detik)
const TICK_MS = 2000;              // jarak pemeriksaan antrian
const RECOVER_EVERY_MS = 20000;    // ulang POST order yang hasilnya belum pasti
const RECOVER_GIVE_UP_MS = 10 * 60 * 1000;
const OTP_OPEN_MS = 10 * 60 * 1000; // setelah OTP masuk & masih bisa OTP lagi, nomor ditutup otomatis setelah ini

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const state = (global.__nokos = global.__nokos || { sock: null, timer: null, running: false });
if (!state.inflight) state.inflight = new Set(); // id order yang sedang dibuat (poller jangan ikut campur)
const send = (jid, content) => (state.sock ? ui.sendCard(state.sock, jid, content) : Promise.resolve());
const tell = (o, content) => send(o.chat, { quoted: undefined, ...content }).catch(() => { });
const alertOwner = (text) => (state.sock ? ui.notifyOwners(state.sock, text) : Promise.resolve());

function attach(sock) {
    state.sock = sock;
    try { require('./nokosDeposit').attach(sock); } catch (e) { console.error('[NOKOS] pemantau deposit gagal aktif:', e.message); }
    try { require('./nokosMaintenance').attach(sock); } catch (e) { console.error('[NOKOS] penjadwal maintenance gagal aktif:', e.message); }
}

/* ------------------------------ REFUND ------------------------------ */

/** Kembalikan saldo user untuk order ini. Hanya SEKALI per order. */
function refundOrder(o, why, { silent = false } = {}) {
    if (o.settled) return false;
    const u = db.findUser(o.userId);
    db.updateOrder(o, { settled: true, refunded: true, status: why === 'failed' && !o.apiOrderId ? 'failed' : 'refunded', endReason: why });
    if (u) db.credit(u, o.sellPrice, `Refund order #${o.id}`, 'refund');
    if (!silent) {
        tell(o, { text: ui.refundText(o, why), buttons: [ui.quick('🛒 Order Lagi', ui.cmd('nk beli')), ui.quick('💰 Saldo', ui.cmd('saldo'))] });
        if (state.sock) receipt.sendReceipt(ui.sendCard, state.sock, o.chat, receipt.orderFailSpec(o, why));
    }
    return true;
}

/* ------------------------------ BUAT ORDER ------------------------------ */

const USER_ERRORS = {
    out_of_stock: 'Stok server ini baru saja habis. Coba server atau negara lain.',
    rate_limited: 'Sistem sedang ramai. Coba lagi beberapa detik lagi.',
    not_found: 'Layanan / pilihan ini sudah tidak tersedia.',
    invalid_request: 'Pilihan tidak valid, silakan ulangi dari awal.',
};

const randId = () => Math.random().toString(36).slice(2, 8);

/**
 * info: { user, chat, mention, serviceSlug, serviceName, provider, serverLabel, cc, countryName, providerId, apiPrice }
 * return: { ok:true, order } | { ok:false, code, message, newApiPrice? }
 */
async function placeOrder(info) {
    const { user, apiPrice } = info;
    const price = ui.sellPrice(apiPrice);

    if (user.balance < price.sell) return { ok: false, code: 'user_balance', message: 'Saldo kamu tidak cukup.', need: price.sell };
    if (db.userActiveCount(user) >= (ui.nk().maxActiveOrders || 3)) {
        return { ok: false, code: 'too_many', message: `Maksimal ${(ui.nk().maxActiveOrders || 3)} order aktif sekaligus. Selesaikan atau batalkan dulu.` };
    }

    // 1) potong saldo dulu (sinkron: tidak mungkin dipakai dua kali)
    const order = db.createOrder({
        userId: user.id, chat: info.chat, mention: info.mention || null,
        serviceSlug: info.serviceSlug, serviceName: info.serviceName,
        provider: info.provider, serverLabel: info.serverLabel || '',
        cc: info.cc, countryName: info.countryName, providerId: info.providerId,
        apiPrice: price.api, profit: price.profit, sellPrice: price.sell,
        idem: `nkbot-${Date.now().toString(36)}-${randId()}`,
    });
    db.debit(user, price.sell, `Order #${order.id} ${info.serviceName}`, 'order');

    // 2) panggil API (retry aman dengan Idempotency-Key yang sama)
    state.inflight.add(order.id);
    let r;
    try { r = await createWithRetry(order); } finally { state.inflight.delete(order.id); }

    if (r.ok) return { ok: true, order: db.getOrder(order.id) };
    if (r.ambiguous) return { ok: true, order: db.getOrder(order.id), pending: true };

    // gagal pasti -> uang kembali, order dianggap tidak pernah ada
    const e = r.error || {};
    refundOrder(db.getOrder(order.id), 'failed', { silent: true });

    if (e.code === 'price_changed') return { ok: false, code: 'price_changed', message: 'Harga baru saja berubah.', newApiPrice: Number(e.new_price) || null };
    if (e.code === 'insufficient_balance' || e.code === 'unauthorized' || e.code === 'no_api_key') {
        alertOwner(e.code === 'insufficient_balance'
            ? `⚠️ *Saldo Nokoskuy kamu habis!*\nSeorang user gagal order karena saldo di Nokoskuy kurang${e.balance != null ? ` (sisa ${ui.rp(e.balance)})` : ''}.\nSegera deposit di website Nokoskuy.`
            : `⚠️ *API key Nokoskuy bermasalah* (${e.code}). Cek src/config.js -> nokos.apiKey.`);
        return { ok: false, code: 'unavailable', message: 'Layanan sedang tidak tersedia, saldo kamu tidak terpotong. Coba lagi nanti.' };
    }
    return { ok: false, code: e.code || 'error', message: USER_ERRORS[e.code] || 'Server sedang gangguan, saldo kamu tidak terpotong. Coba lagi sebentar atau pilih server lain.' };
}

function applyApiOrder(order, d) {
    const unconfirmed = d.status === 'unconfirmed' || d.status === 'review' || d.status === 'creating';
    return db.updateOrder(order, {
        apiOrderId: d.id, apiRef: d.ref || null, phone: d.phone || order.phone || null,
        expiresAt: d.expires_at || order.expiresAt || null,
        status: d.active === false ? order.status : (unconfirmed ? 'unconfirmed' : 'waiting'),
        nextPollAt: Date.now() + POLL_EVERY_MS,
    });
}

async function createWithRetry(order) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        const res = await api.createOrder({
            service_id: order.serviceSlug, provider: order.provider, country_code: order.cc,
            provider_id: order.providerId, quoted_price: order.apiPrice,
        }, order.idem);

        if (res.ok) { applyApiOrder(order, res.data); return { ok: true }; }

        const e = res.error || {};
        const transient = e.network || e.code === 'internal_error' || res.status >= 500 && e.code !== 'order_failed' && !['server_unavailable', 'catalog_unavailable', 'service_disabled'].includes(e.code);
        if (!transient) return { ok: false, error: e };
        if (attempt < 3) await sleep(1500 * attempt);
    }
    // 3x tidak jelas: saldo DITAHAN, poller akan terus mengulang dengan key yang sama
    db.updateOrder(order, { status: 'unconfirmed', apiOrderId: null, nextPollAt: Date.now() + RECOVER_EVERY_MS });
    return { ambiguous: true };
}

/* ------------------------------ AKSI USER ------------------------------ */

async function cancelOrder(o) {
    if (!o.apiOrderId) return { ok: false, message: 'Order masih diverifikasi, coba lagi sebentar.' };
    if (o.status !== 'waiting') return { ok: false, message: 'Order ini tidak bisa dibatalkan.' };
    const r = await api.cancelOrder(o.apiOrderId);
    if (!r.ok) {
        const c = r.error?.code;
        const msg = c === 'otp_already_received' ? 'OTP sudah masuk, order tidak bisa dibatalkan.'
            : c === 'rate_limited' ? 'Terlalu cepat, coba lagi sebentar.'
            : 'Belum bisa dibatalkan sekarang (nomor belum dilepas). Coba lagi beberapa saat.';
        return { ok: false, message: msg };
    }
    // saldo user dikembalikan oleh poller begitu API memastikan status cancelled
    db.updateOrder(o, { status: 'cancelling', nextPollAt: 0 });
    return { ok: true };
}

async function nextOtp(o) {
    if (o.status !== 'otp_open') return { ok: false, message: 'Order ini tidak bisa meminta OTP lagi.' };
    const r = await api.requestOtp(o.apiOrderId);
    if (!r.ok) return { ok: false, message: 'Belum bisa minta OTP lagi untuk nomor ini.' };
    db.updateOrder(o, { status: 'waiting', closeAt: null, nextPollAt: Date.now() + POLL_EVERY_MS });
    return { ok: true };
}

async function finishOrder(o) {
    if (o.status !== 'otp_open') return { ok: false, message: 'Order sudah selesai.' };
    await api.finishOrder(o.apiOrderId);
    db.updateOrder(o, { status: 'done', closeAt: null });
    return { ok: true };
}

/* ------------------------------ POLLER ------------------------------ */

async function deliverOtp(o, d) {
    const canNext = !!d.can_request_next_otp;
    const first = !o.otpDelivered;
    db.updateOrder(o, {
        otp: d.otp, otpMessage: d.otp_message || null, lastOtp: d.otp, otpDelivered: true,
        status: canNext ? 'otp_open' : 'done', closeAt: canNext ? Date.now() + OTP_OPEN_MS : null, settled: true,
    });
    if (first) {
        const u = db.findUser(o.userId);
        if (u) { u.orders += 1; u.spent += o.sellPrice; db.updateOrder(o, {}); }
    }
    if (!canNext) { try { await api.finishOrder(o.apiOrderId); } catch { /* tidak kritis */ } }

    const fresh = db.getOrder(o.id);
    const buttons = [ui.copyBtn('📋 Salin Kode', d.otp)];
    if (canNext) buttons.push(ui.quick('🔁 OTP Lagi', ui.cmd(`nk next ${o.id}`)), ui.quick('✅ Selesai', ui.cmd(`nk done ${o.id}`)));
    else buttons.push(ui.quick('🛒 Order Lagi', ui.cmd('nk beli')));
    await tell(fresh, { text: ui.otpText(fresh, canNext), buttons });
}

async function pollOne(o) {
    const now = Date.now();
    if (state.inflight.has(o.id)) return;

    // order yang POST-nya belum jelas: ulangi dengan Idempotency-Key yang sama (aman, tidak potong dua kali)
    if (!o.apiOrderId) {
        if (now - o.createdAt > RECOVER_GIVE_UP_MS) {
            if (!o.alerted) {
                db.updateOrder(o, { alerted: true });
                alertOwner(`⚠️ *Order #${o.id} belum jelas hasilnya* (>10 menit).\nUser: ${o.userId}\nLayanan: ${o.serviceName}\nSaldo user ditahan ${ui.rp(o.sellPrice)}. Cek manual di Nokoskuy (key: ${o.idem}).`);
            }
            db.updateOrder(o, { nextPollAt: now + 5 * 60 * 1000 });
            return;
        }
        const r = await createWithRetry(o);
        if (r.ok) {
            const f = db.getOrder(o.id);
            tell(f, { text: ui.orderCreatedText(f), buttons: f.phone ? [ui.copyBtn('📋 Salin Nomor', f.phone), ui.quick('❌ Batalkan', ui.cmd(`nk cancel ${f.id}`))] : [] });
            if (f.phone) db.updateOrder(f, { phoneSent: true });
            if (f.phone && state.sock) receipt.sendReceipt(ui.sendCard, state.sock, f.chat, receipt.orderSuccessSpec(f));
        } else if (!r.ambiguous) {
            refundOrder(db.getOrder(o.id), 'failed');
        }
        return;
    }

    // nomor ditutup otomatis kalau user tidak menekan Selesai
    if (o.status === 'otp_open') {
        if (o.closeAt && now >= o.closeAt) await finishOrder(o);
        else db.updateOrder(o, { nextPollAt: now + 30000 });
        return;
    }

    const r = await api.getOrder(o.apiOrderId);
    if (!r.ok) {
        const wait = r.error?.code === 'rate_limited' ? Math.max(r.retryAfter, 5) * 1000 : POLL_EVERY_MS;
        const patch = { nextPollAt: now + wait };
        if (r.error?.code === 'not_found') {
            patch.notFound = (o.notFound || 0) + 1;
            if (patch.notFound === 5) alertOwner(`⚠️ Order #${o.id} (API ${o.apiRef || o.apiOrderId}) tidak ditemukan di Nokoskuy. Cek manual.`);
        }
        db.updateOrder(o, patch);
        return;
    }

    const d = r.data;
    const patch = { nextPollAt: now + POLL_EVERY_MS };
    if (d.phone && !o.phone) patch.phone = d.phone;
    if (d.expires_at) patch.expiresAt = d.expires_at;
    if (d.status === 'unconfirmed' || d.status === 'review') patch.status = 'unconfirmed';
    else if (o.status === 'unconfirmed' || o.status === 'creating') patch.status = d.active ? 'waiting' : o.status;
    db.updateOrder(o, patch);
    const cur = db.getOrder(o.id);

    // nomor baru siap -> kabari user
    if (cur.phone && !cur.phoneSent) {
        db.updateOrder(cur, { phoneSent: true });
        await tell(cur, { text: ui.orderCreatedText(cur), buttons: [ui.copyBtn('📋 Salin Nomor', cur.phone), ui.quick('❌ Batalkan', ui.cmd(`nk cancel ${cur.id}`))] });
    }

    // OTP baru
    if (d.otp && d.otp !== cur.lastOtp) { await deliverOtp(cur, d); return; }

    // order berakhir
    if (d.active === false) {
        if (cur.otpDelivered) { db.updateOrder(cur, { status: 'done' }); return; }   // OTP sudah pernah dikirim
        if (['cancelled', 'expired', 'failed'].includes(d.status)) { refundOrder(cur, d.status); return; }
        if (d.refunded) { refundOrder(cur, 'failed'); return; }
    }

    // masih menunggu padahal lewat batas waktu: kabari owner sekali
    if (cur.expiresAt && !cur.alerted && now > new Date(cur.expiresAt).getTime() + 3 * 60 * 1000 && d.active) {
        db.updateOrder(cur, { alerted: true });
        alertOwner(`⚠️ Order #${cur.id} masih aktif >3 menit setelah batas waktu (${cur.serviceName}). Pantau / cek manual di Nokoskuy.`);
    }
}

async function tick() {
    if (state.running || !state.sock) return;
    state.running = true;
    try {
        const now = Date.now();
        const due = db.activeOrders().filter(o => !o.nextPollAt || o.nextPollAt <= now).sort((a, b) => a.id - b.id).slice(0, 20);
        for (const o of due) {
            try { await pollOne(o); } catch (e) { console.error(`[NOKOS-POLL] order #${o.id}:`, e.message); db.updateOrder(o, { nextPollAt: Date.now() + POLL_EVERY_MS }); }
            await sleep(250);
        }
    } finally { state.running = false; }
}

// Guard hot-reload: kalau modul ini dimuat ulang, timer lama dimatikan supaya tidak dobel.
if (state.timer) clearInterval(state.timer);
state.timer = setInterval(() => { tick().catch(() => { }); }, TICK_MS);
if (state.timer.unref) state.timer.unref();

module.exports = { attach, placeOrder, cancelOrder, nextOtp, finishOrder, refundOrder, tick };
