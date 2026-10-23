// Command buatan owner (.addlist / .editlist / .dellist) -> disimpan di <dbDir>/storelist.json
// Setiap command = nama + teks. Dikirim SELALU dengan foto menu (src/media/logo.png).
const fs = require('fs');
const path = require('path');

const config = require('../config');
const { getImage } = require('./helper');

const FILE = path.join(config.dbDir, 'storelist.json');
const NAME_RE = /^[a-z0-9_-]{1,30}$/;
const MAX_ITEMS = 200;
const MAX_TEXT = 4000;
const CAPTION_MAX = 1000; // sama dengan batas caption menu (menu.js)

let cache = null;
let loadedMtime = -1;

const mtimeOf = () => { try { return fs.statSync(FILE).mtimeMs; } catch { return 0; } };

function load() {
    const m = mtimeOf();
    if (cache && m === loadedMtime) return cache;
    try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { cache = {}; }
    if (!cache.items || typeof cache.items !== 'object') cache.items = {};
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
        return true;
    } catch { return false; }
}

/* ------------------------------ NAMA ------------------------------ */

/** ".Promo" -> "promo" (prefix dibuang, huruf kecil) */
function normName(raw) {
    let n = String(raw || '').trim().toLowerCase();
    if (config.prefix && n.startsWith(config.prefix)) n = n.slice(config.prefix.length);
    return n;
}

const isValidName = (n) => NAME_RE.test(n);

// Nama command bawaan bot (dibaca dari tulisan "case" di src/commands/*.js, sama seperti PluginLoader).
function reservedNames() {
    const set = new Set([...(config.noPrefixCommands || []), 'bot', 'sc']);
    const dir = path.join(__dirname, '..', 'commands');
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.js')); } catch { /* abaikan */ }
    for (const f of files) {
        let src = '';
        try { src = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
        const re = /case\s+['"]([^'"]+)['"]\s*:/g;
        let mt;
        while ((mt = re.exec(src)) !== null) set.add(mt[1].toLowerCase());
    }
    return set;
}

const isReserved = (name) => reservedNames().has(name);

/* ------------------------------ DATA ------------------------------ */

const has = (name) => Object.prototype.hasOwnProperty.call(load().items, name);
const get = (name) => (has(name) ? load().items[name] : null);

/** [{ name, text, createdAt, updatedAt }] urut abjad */
function list() {
    const items = load().items;
    return Object.keys(items).sort().map(name => ({ name, ...items[name] }));
}

/** 'ok' | 'invalid' | 'reserved' | 'exists' | 'full' | 'toolong' | 'error' */
function add(name, text) {
    if (!isValidName(name)) return 'invalid';
    if (isReserved(name)) return 'reserved';
    if (has(name)) return 'exists';
    if (text.length > MAX_TEXT) return 'toolong';
    const db = load();
    if (Object.keys(db.items).length >= MAX_ITEMS) return 'full';
    const now = Date.now();
    db.items[name] = { text, createdAt: now, updatedAt: now };
    return save() ? 'ok' : 'error';
}

/** 'ok' | 'notfound' | 'toolong' | 'error' */
function edit(name, text) {
    if (!has(name)) return 'notfound';
    if (text.length > MAX_TEXT) return 'toolong';
    const db = load();
    db.items[name].text = text;
    db.items[name].updatedAt = Date.now();
    return save() ? 'ok' : 'error';
}

/** true kalau ada yang dihapus */
function remove(name) {
    if (!has(name)) return false;
    delete load().items[name];
    return save();
}

/**
 * Cari entri dari teks yang diketik user.
 *  - key = nama dari command berprefix (.promo -> "promo")
 *  - noPrefix = true: key adalah SELURUH pesan; harus satu kata saja
 * Mengembalikan nama entri atau null.
 */
function lookup(key, noPrefix = false) {
    let k = String(key || '').trim().toLowerCase();
    if (!k || /\s/.test(k)) return null;
    if (noPrefix && config.prefix && k.startsWith(config.prefix)) return null;
    k = normName(k);
    return has(k) ? k : null;
}

/* ------------------------------ KIRIM ------------------------------ */

// ID pesan yang dikirim bot sendiri: supaya echo-nya tidak dianggap command (cegah loop tanpa prefix).
const sentIds = new Set();
function track(res) {
    const id = res?.key?.id;
    if (!id) return;
    sentIds.add(id);
    if (sentIds.size > 500) sentIds.delete(sentIds.values().next().value);
}
const isOwnMessage = (id) => !!id && sentIds.has(id);

// Potong teks panjang di batas baris / spasi terdekat
function splitAt(text, max) {
    if (text.length <= max) return [text, ''];
    let cut = text.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = text.lastIndexOf(' ', max);
    if (cut < max * 0.5) cut = max;
    return [text.slice(0, cut).trimEnd(), text.slice(cut).trimStart()];
}

/** Kirim teks + foto menu. Teks > 1000 huruf: foto dengan caption awal, sisanya menyusul. Gagal foto -> teks biasa. */
async function sendPhoto(Nayla, jid, text, quoted) {
    const opts = quoted ? { quoted } : undefined;
    const img = getImage();
    if (img) {
        const [head, rest] = splitAt(text, CAPTION_MAX);
        try {
            const res = await Nayla.sendMessage(jid, { image: img, caption: head }, opts);
            track(res);
            if (rest) track(await Nayla.sendMessage(jid, { text: rest }));
            return res;
        } catch { /* lanjut ke teks biasa */ }
    }
    const res = await Nayla.sendMessage(jid, { text }, opts);
    track(res);
    return res;
}

/** Kirim isi entri `name` (foto + teks). */
async function sendEntry(Nayla, jid, quoted, name) {
    const item = get(name);
    if (!item) return null;
    return sendPhoto(Nayla, jid, item.text, quoted);
}

module.exports = {
    NAME_RE, MAX_ITEMS, MAX_TEXT,
    normName, isValidName, isReserved,
    has, get, list, add, edit, remove, lookup,
    sendPhoto, sendEntry, isOwnMessage,
};
