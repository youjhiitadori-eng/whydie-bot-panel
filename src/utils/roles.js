// Role pengguna: Owner / Premium / Warlok (orang biasa).
// Data premium disimpan di src/database/premium.json (ikut ter-backup otomatis).
const fs = require('fs');
const path = require('path');

const config = require('../config');
const FILE = path.join(config.dbDir, 'premium.json');
const DAY = 24 * 60 * 60 * 1000;
let cache = null;

function load() {
    if (cache) return cache;
    try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { cache = {}; }
    if (!Array.isArray(cache.list)) cache.list = [];
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

const digits = (v) => String(v || '').replace(/\D/g, '');

function purgeExpired() {
    const db = load();
    const before = db.list.length;
    db.list = db.list.filter(e => !e.expires || e.expires > Date.now());
    if (db.list.length !== before) save();
}

function findEntry(id) {
    const d = digits(id);
    if (!d) return null;
    purgeExpired();
    return load().list.find(e => (e.number && e.number === d) || (e.lid && e.lid === d)) || null;
}

function isPremium(senderNumber) { return !!findEntry(senderNumber); }

/** 'Owner' | 'Premium' | 'Warlok' */
function getRole({ isOwner, senderNumber }) {
    if (isOwner) return 'Owner';
    return isPremium(senderNumber) ? 'Premium' : 'Warlok';
}

/** Tambah / perpanjang premium. days kosong = permanen. */
function add({ number, lid, days }) {
    const db = load();
    number = digits(number) || null;
    lid = digits(lid) || null;
    const expires = days ? Date.now() + days * DAY : null;
    let entry = db.list.find(e => (number && e.number === number) || (lid && e.lid === lid));
    if (entry) {
        entry.number = entry.number || number;
        entry.lid = entry.lid || lid;
        entry.expires = expires;
    } else {
        entry = { number, lid, expires, addedAt: Date.now() };
        db.list.push(entry);
    }
    save();
    return entry;
}

function remove(id) {
    const d = digits(id);
    const db = load();
    const before = db.list.length;
    db.list = db.list.filter(e => e.number !== d && e.lid !== d);
    save();
    return before !== db.list.length;
}

function list() { purgeExpired(); return load().list.slice(); }

function daysLeft(entry) {
    return entry.expires ? Math.max(1, Math.ceil((entry.expires - Date.now()) / DAY)) : null;
}

module.exports = { getRole, isPremium, add, remove, list, daysLeft };
