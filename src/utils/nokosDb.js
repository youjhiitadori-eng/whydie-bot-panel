// Penyimpanan toko Nokos: user (saldo), order, deposit -> src/database/nokos.json (ikut ter-backup otomatis).
// Semua operasi saldo SINKRON (tidak ada await di tengah cek+potong), jadi aman dari double-spend.
const fs = require('fs');
const path = require('path');
const config = require('../config');

const FILE = path.join(config.dbDir, 'nokos.json');
let cache = null;
let loadedMtime = -1;
const mtimeOf = () => { try { return fs.statSync(FILE).mtimeMs; } catch { return 0; } };

function load() {
    const m = mtimeOf();
    if (cache && m === loadedMtime) return cache;
    try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { cache = {}; }
    if (!cache.users || typeof cache.users !== 'object') cache.users = {};
    if (!cache.orders || typeof cache.orders !== 'object') cache.orders = {};
    if (!cache.deposits || typeof cache.deposits !== 'object') cache.deposits = {};
    if (!cache.seq || typeof cache.seq !== 'object') cache.seq = { order: 0, deposit: 0 };
    loadedMtime = m;
    return cache;
}

function save() {
    try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        const tmp = FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
        fs.renameSync(tmp, FILE);
        loadedMtime = mtimeOf();
    } catch (e) { console.error('[NOKOS-DB] gagal simpan:', e.message); }
}

const digits = (v) => String(v || '').replace(/\D/g, '');
const HISTORY_MAX = 30;

/* ------------------------------ USER ------------------------------ */

function findUser(...ids) {
    const want = ids.map(digits).filter(Boolean);
    if (!want.length) return null;
    const { users } = load();
    for (const u of Object.values(users)) if (u.ids.some(i => want.includes(i))) return u;
    return null;
}

/** Ambil user, buat kalau belum ada. ids = [nomor, lid, ...] */
function ensureUser(ids, name) {
    const list = [].concat(ids).map(digits).filter(Boolean);
    let u = findUser(...list);
    const db = load();
    if (!u) {
        const key = list[0];
        u = db.users[key] = { id: key, ids: [], name: name || '', balance: 0, spent: 0, deposited: 0, orders: 0, joinedAt: Date.now(), history: [] };
    }
    let changed = false;
    for (const i of list) if (!u.ids.includes(i)) { u.ids.push(i); changed = true; }
    if (name && u.name !== name) { u.name = name; changed = true; }
    if (changed) save();
    return u;
}

function pushHistory(u, type, amount, note) {
    u.history.push({ t: Date.now(), type, amount, note: note || '', balance: u.balance });
    if (u.history.length > HISTORY_MAX) u.history.splice(0, u.history.length - HISTORY_MAX);
}

function credit(u, amount, note, type = 'credit') {
    amount = Math.round(amount);
    if (!(amount > 0)) return false;
    u.balance += amount;
    pushHistory(u, type, amount, note);
    save();
    return true;
}

/** Potong saldo. false kalau tidak cukup. */
function debit(u, amount, note, type = 'debit') {
    amount = Math.round(amount);
    if (!(amount > 0) || u.balance < amount) return false;
    u.balance -= amount;
    pushHistory(u, type, -amount, note);
    save();
    return true;
}

function allUsers() { return Object.values(load().users); }

/* ------------------------------ ORDER ------------------------------ */

function createOrder(fields) {
    const db = load();
    const id = ++db.seq.order;
    const o = db.orders[id] = {
        id, createdAt: Date.now(), status: 'creating', apiOrderId: null, apiRef: null, phone: null,
        phoneSent: false, lastOtp: null, otp: null, settled: false, refunded: false, ...fields,
    };
    save();
    return o;
}

function updateOrder(o, patch) { Object.assign(o, patch); save(); return o; }
function getOrder(id) { return load().orders[id] || null; }
function allOrders() { return Object.values(load().orders); }

// Status lokal: creating | unconfirmed | waiting | otp_open | done | refunded | failed
const ACTIVE = new Set(['creating', 'unconfirmed', 'waiting', 'otp_open', 'cancelling']);
const isActive = (o) => ACTIVE.has(o.status);
function activeOrders() { return allOrders().filter(isActive); }
function userOrders(u, limit = 10) {
    return allOrders().filter(o => o.userId === u.id).sort((a, b) => b.id - a.id).slice(0, limit);
}
function userActiveCount(u) { return allOrders().filter(o => o.userId === u.id && isActive(o)).length; }

/* ------------------------------ DEPOSIT ------------------------------ */

function createDeposit(fields) {
    const db = load();
    const id = ++db.seq.deposit;
    const d = db.deposits[id] = { id, createdAt: Date.now(), status: 'pending', proofSent: false, ...fields };
    save();
    return d;
}
function getDeposit(id) { return load().deposits[id] || null; }
function updateDeposit(d, patch) { Object.assign(d, patch); save(); return d; }
function pendingDeposits() { return Object.values(load().deposits).filter(d => d.status === 'pending'); }
function userPendingDeposit(u) { return pendingDeposits().find(d => d.userId === u.id) || null; }
function allDeposits() { return Object.values(load().deposits); }

// Deposit otomatis (API Nokoskuy v2) punya apiId. Deposit manual lama tidak.
const isApiDeposit = (d) => !!d.apiId;
/** Deposit API yang masih menunggu pembayaran. Nokoskuy hanya mengizinkan SATU per akun. */
function activeApiDeposit() { return pendingDeposits().find(isApiDeposit) || null; }
/** Deposit API kedaluwarsa yang masih dalam masa toleransi telat bayar (masih dipantau). */
function graceDeposits(now = Date.now()) {
    return allDeposits().filter(d => isApiDeposit(d) && d.status === 'expired' && !d.settled && (d.graceUntil || 0) > now);
}

/* ------------------------------ STATISTIK ------------------------------ */

function stats() {
    const orders = allOrders();
    const done = orders.filter(o => o.status === 'done' || (o.otp && o.status === 'otp_open'));
    const deps = allDeposits().filter(d => d.status === 'approved');
    const startDay = new Date(); startDay.setHours(0, 0, 0, 0);
    const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
    return {
        users: allUsers().length,
        userBalance: sum(allUsers(), u => u.balance),
        activeOrders: orders.filter(isActive).length,
        pendingDeposits: pendingDeposits().length,
        autoDeposits: deps.filter(isApiDeposit).length,
        sold: done.length,
        revenue: sum(done, o => o.sellPrice),
        orderProfit: sum(done, o => o.profit),
        depositFee: sum(deps, d => d.fee),
        todaySold: done.filter(o => o.createdAt >= startDay.getTime()).length,
        todayProfit: sum(done.filter(o => o.createdAt >= startDay.getTime()), o => o.profit)
            + sum(deps.filter(d => (d.approvedAt || 0) >= startDay.getTime()), d => d.fee),
    };
}

module.exports = {
    findUser, ensureUser, credit, debit, allUsers,
    createOrder, updateOrder, getOrder, allOrders, activeOrders, isActive, userOrders, userActiveCount,
    createDeposit, getDeposit, updateDeposit, pendingDeposits, userPendingDeposit, allDeposits,
    isApiDeposit, activeApiDeposit, graceDeposits,
    stats,
};
