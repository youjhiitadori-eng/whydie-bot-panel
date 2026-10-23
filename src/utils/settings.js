// Pengaturan kecil yang disimpan ke src/database/settings.json
const fs = require('fs');
const path = require('path');

const config = require('../config');
const FILE = path.join(config.dbDir, 'settings.json');
let cache = null;
let loadedMtime = -1;

const mtimeOf = () => { try { return fs.statSync(FILE).mtimeMs; } catch { return 0; } };

// Baca ulang otomatis kalau file berubah (mis. diubah dari instance modul lain setelah hot-reload)
function load() {
    const m = mtimeOf();
    if (cache && m === loadedMtime) return cache;
    try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { cache = {}; }
    if (!cache.buttonOff || typeof cache.buttonOff !== 'object') cache.buttonOff = {};
    if (!cache.groups || typeof cache.groups !== 'object') cache.groups = {};
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
    } catch { /* abaikan */ }
}

/** true = menu pakai tombol (default) */
function isButtonOn(jid) { return !load().buttonOff[jid]; }

function setButton(jid, on) {
    const s = load();
    if (on) delete s.buttonOff[jid]; else s.buttonOff[jid] = true;
    save();
}

/** 'public' | 'self' (null = belum pernah diatur, pakai config.botMode) */
function getMode() { return load().mode || null; }

function setMode(mode) {
    load().mode = mode;
    global.botMode = mode;
    save();
}

/** Fitur per grup ('welcome' | 'goodbye'). Default: mati. */
function getGroupFlag(groupJid, key) { return !!load().groups[groupJid]?.[key]; }

function setGroupFlag(groupJid, key, on) {
    const s = load();
    if (!s.groups[groupJid]) s.groups[groupJid] = {};
    if (on) s.groups[groupJid][key] = true; else delete s.groups[groupJid][key];
    if (!Object.keys(s.groups[groupJid]).length) delete s.groups[groupJid];
    save();
}

/** Teks welcome/goodbye kustom per grup (null = pakai teks bawaan). */
function getGroupText(groupJid, key) { return load().groups[groupJid]?.texts?.[key] || null; }

function setGroupText(groupJid, key, text) {
    const s = load();
    if (!s.groups[groupJid]) s.groups[groupJid] = {};
    const g = s.groups[groupJid];
    if (text) {
        if (!g.texts) g.texts = {};
        g.texts[key] = text;
    } else if (g.texts) {
        delete g.texts[key];
        if (!Object.keys(g.texts).length) delete g.texts;
    }
    if (!Object.keys(g).length) delete s.groups[groupJid];
    save();
}

/** Pengaturan JPM per nomor bot (key = nomor bot). */
function getJpm(key) {
    const s = load();
    return { ...(s.jpm?.[key] || {}) };
}

function setJpm(key, patch) {
    const s = load();
    if (!s.jpm) s.jpm = {};
    s.jpm[key] = { ...(s.jpm[key] || {}), ...patch };
    for (const k of Object.keys(s.jpm[key])) if (s.jpm[key][k] === undefined) delete s.jpm[key][k];
    save();
    return { ...s.jpm[key] };
}

/** Auto lihat + react status WhatsApp. Default: nyala. */
function isAutoSW() { return load().autoSW !== false; }
function setAutoSW(on) { load().autoSW = !!on; save(); }

/** Mode jualan Nokos: menu hanya menampilkan toko. Default: mati. */
function isNokosMode() { return load().nokosMode === true; }
function setNokosMode(on) { load().nokosMode = !!on; save(); }

/** Kunci toko: di mode jualan, user biasa hanya bisa memakai command toko. Default: mati. */
function isNokosLock() { return load().nokosLock === true; }
function setNokosLock(on) { load().nokosLock = !!on; save(); }

/** Maintenance toko Nokos (manual / jadwal harian / catatan terakhir). Disimpan di settings.json -> bertahan saat restart. */
function getMaintenance() { return { ...(load().maintenance || {}) }; }
function setMaintenance(patch) {
    const s = load();
    s.maintenance = { ...(s.maintenance || {}), ...patch };
    for (const k of Object.keys(s.maintenance)) if (s.maintenance[k] === undefined) delete s.maintenance[k];
    save();
    return { ...s.maintenance };
}

module.exports = { getMaintenance, setMaintenance, isNokosMode, setNokosMode, isNokosLock, setNokosLock, getJpm, setJpm, isAutoSW, setAutoSW, isButtonOn, setButton, getMode, setMode, getGroupFlag, setGroupFlag, getGroupText, setGroupText };
