// Inti JPM (kirim pesan massal ke grup) — dibuat aman: berurutan, ada jeda + jitter, jeda tambahan tiap batch,
// retry saat kena limit, berhenti otomatis kalau gagal beruntun, tidak pernah dobel jalan, bisa di-stop.
const fs = require('fs');
const path = require('path');
const settings = require('./settings');

const DB_DIR = path.join(require('../config').dbDir, 'jpm');

const MIN_DELAY = 1000;                  // 1 detik
const MAX_DELAY = 10 * 60 * 1000;        // 10 menit
const DEFAULT_DELAY = 5000;              // 5 detik
const SAFE_DELAY = 3000;                 // di bawah ini diberi peringatan rawan banned
const MIN_INTERVAL = 5 * 60 * 1000;      // auto JPM minimal 5 menit
const MAX_INTERVAL = 7 * 24 * 3600 * 1000;
const DEFAULT_INTERVAL = 60 * 60 * 1000; // 1 jam
const BATCH_SIZE = 20;                   // tiap 20 grup istirahat sebentar
const MAX_CONSECUTIVE_FAIL = 5;          // gagal beruntun segini -> berhenti otomatis
const LIMIT_WAIT = 30 * 1000;            // tunggu saat kena limit / koneksi putus, lalu coba lagi 1x

const digits = (v) => String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '');
const botKey = (Nayla) => digits(Nayla?.user?.id) || 'main';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const states = new Map(); // botKey -> status run saat ini / terakhir

/* ---------- format ---------- */

function fmtDuration(ms) {
    let s = Math.max(0, Math.round(ms / 1000));
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60); s %= 60;
    const parts = [];
    if (d) parts.push(`${d} hari`);
    if (h) parts.push(`${h} jam`);
    if (m) parts.push(`${m} menit`);
    if (s || !parts.length) parts.push(`${s} detik`);
    return parts.join(' ');
}

/** "1jam", "30m", "90 menit", "1jam30menit", "2h" -> ms. null kalau tidak valid. */
function parseDuration(input) {
    const str = String(input || '').toLowerCase().replace(/\s+/g, '');
    if (!str) return null;
    const re = /(\d+(?:[.,]\d+)?)(hari|jam|menit|detik|mnt|min|d|h|j|m|s)/g;
    const unit = { hari: 864e5, d: 864e5, jam: 36e5, h: 36e5, j: 36e5, menit: 6e4, mnt: 6e4, min: 6e4, m: 6e4, detik: 1e3, s: 1e3 };
    let total = 0, used = 0, mt;
    while ((mt = re.exec(str))) { total += parseFloat(mt[1].replace(',', '.')) * unit[mt[2]]; used += mt[0].length; }
    return used === str.length && total > 0 ? Math.round(total) : null;
}

/* ---------- konten (teks / foto / foto+teks) tersimpan ---------- */

const imagePath = (key) => path.join(DB_DIR, `${key}.jpg`);

function saveContent(key, { text, image }) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    if (image) fs.writeFileSync(imagePath(key), image);
    else { try { fs.unlinkSync(imagePath(key)); } catch { /* tidak ada */ } }
    settings.setJpm(key, { text: text || '', hasImage: !!image });
}

function loadContent(key) {
    const cfg = settings.getJpm(key);
    let image = null;
    if (cfg.hasImage) { try { image = fs.readFileSync(imagePath(key)); } catch { image = null; } }
    const text = cfg.text || '';
    return (text || image) ? { text, image } : null;
}

function clearContent(key) {
    try { fs.unlinkSync(imagePath(key)); } catch { /* tidak ada */ }
    settings.setJpm(key, { text: undefined, hasImage: false });
}

function getConfig(key) {
    const c = settings.getJpm(key);
    return {
        ...c,
        delayMs: c.delayMs || DEFAULT_DELAY,
        intervalMs: c.intervalMs || DEFAULT_INTERVAL,
        auto: !!c.auto,
    };
}

/* ---------- grup tujuan ---------- */

/** Grup TERBUKA saja (semua member boleh kirim). Grup khusus-admin & pengumuman komunitas dilewati. */
async function listTargetGroups(Nayla) {
    const all = await Nayla.groupFetchAllParticipating();
    const open = [], names = {};
    let closed = 0;
    for (const [key, g] of Object.entries(all || {})) {
        const jid = g?.id || key;
        if (g?.announce || g?.isCommunityAnnounce) { closed++; continue; }
        open.push(jid);
        names[jid] = g?.subject || jid;
    }
    return { open, closed, names };
}

/* ---------- pengirim ---------- */

// Foto di-upload SEKALI (grup pertama lewat sendMessage biasa), grup berikutnya memakai ulang
// media yang sama lewat relay -> jauh lebih ringan. Kalau gagal, otomatis kembali ke sendMessage biasa.
function makeSender(Nayla, content) {
    let reusable = null;
    return async (jid) => {
        if (!content.image) return Nayla.sendMessage(jid, { text: content.text });

        if (reusable) {
            try {
                const { generateWAMessageFromContent } = require('../../lib/baileys');
                const msg = generateWAMessageFromContent(jid, { imageMessage: { ...reusable } }, { userJid: Nayla.user?.id });
                await Nayla.relayMessage(jid, msg.message, { messageId: msg.key.id });
                return;
            } catch { reusable = null; /* jatuh ke cara biasa */ }
        }
        const sent = await Nayla.sendMessage(jid, { image: content.image, caption: content.text || '' });
        const im = sent?.message?.imageMessage;
        if (im && im.mediaKey && (im.url || im.directPath)) reusable = im;
        return sent;
    };
}

/* ---------- eksekusi ---------- */

const isRunning = (key) => !!states.get(key)?.running;
const getState = (key) => states.get(key) || null;
const requestStop = (key) => { const st = states.get(key); if (st?.running) { st.abort = true; return true; } return false; };

async function waitAbortable(ms, st) {
    const end = Date.now() + ms;
    while (!st.abort && Date.now() < end) await sleep(Math.min(1000, end - Date.now()));
}

/**
 * Jalankan JPM ke semua grup terbuka. Mengembalikan ringkasan (tidak pernah throw).
 * opts: { content, delayMs, mode: 'manual' | 'auto' }
 */
async function runBroadcast(Nayla, { content, delayMs = DEFAULT_DELAY, mode = 'manual' }) {
    const key = botKey(Nayla);
    if (isRunning(key)) return { error: 'JPM sedang berjalan.' };

    const st = { running: true, abort: false, mode, startedAt: Date.now(), delayMs, total: 0, sent: 0, failed: 0, closed: 0, errors: [], aborted: '' };
    states.set(key, st);
    try {
        const { open, closed, names } = await listTargetGroups(Nayla);
        st.total = open.length;
        st.closed = closed;
        const send = makeSender(Nayla, content);
        let streak = 0;

        for (let i = 0; i < open.length && !st.abort; i++) {
            const jid = open[i];
            let ok = false, reason = '';
            for (let attempt = 0; attempt < 2 && !ok; attempt++) {
                try { await send(jid); ok = true; }
                catch (e) {
                    reason = String(e?.message || e).slice(0, 80);
                    if (attempt === 0 && /rate|overlimit|429|too.?many|closed|not.?open|timed?.?out|connection/i.test(reason)) {
                        await waitAbortable(LIMIT_WAIT, st);   // tunggu lalu coba sekali lagi
                        if (st.abort) break;
                        continue;
                    }
                    break;
                }
            }
            st.done = i + 1;
            if (ok) { st.sent++; streak = 0; }
            else {
                st.failed++; streak++;
                if (st.errors.length < 8) st.errors.push({ name: names[jid] || jid, reason });
                if (streak >= MAX_CONSECUTIVE_FAIL) { st.aborted = `${MAX_CONSECUTIVE_FAIL} gagal beruntun (koneksi / limit WhatsApp)`; break; }
            }
            if (i < open.length - 1 && !st.abort) {
                const jitter = Math.round(delayMs * (0.9 + Math.random() * 0.3));   // 90%-120% biar tidak kaku
                await waitAbortable(jitter, st);
                if ((i + 1) % BATCH_SIZE === 0) await waitAbortable(Math.max(10000, delayMs * 3), st);  // istirahat tiap batch
            }
        }
        if (st.abort && !st.aborted) st.aborted = 'dihentikan manual';
    } catch (e) {
        st.aborted = `error: ${e.message}`;
    }
    st.running = false;
    st.finishedAt = Date.now();
    settings.setJpm(key, { last: { at: st.finishedAt, mode, total: st.total, sent: st.sent, failed: st.failed, closed: st.closed, durationMs: st.finishedAt - st.startedAt, aborted: st.aborted } });
    return st;
}

function formatReport(st, title = 'JPM SELESAI') {
    const lines = [
        `📣 *${title}* (${st.mode === 'auto' ? 'auto' : 'manual'})`,
        '',
        `👥 Grup terbuka: *${st.total}*  |  🔒 Dilewati (tertutup): *${st.closed}*`,
        `✅ Terkirim: *${st.sent}*`,
        `❌ Gagal: *${st.failed}*`,
        `⏱️ Durasi: ${fmtDuration((st.finishedAt || Date.now()) - st.startedAt)}  |  Jeda: ${fmtDuration(st.delayMs)}`,
    ];
    if (st.aborted) lines.push(`⚠️ Berhenti: ${st.aborted}${st.total ? ` (sampai grup ke-${st.done || 0}/${st.total})` : ''}`);
    if (st.errors?.length) {
        lines.push('', '*Yang gagal:*');
        for (const e of st.errors) lines.push(`• ${e.name} — ${e.reason || 'error'}`);
        if (st.failed > st.errors.length) lines.push(`• …dan ${st.failed - st.errors.length} lainnya`);
    }
    return lines.join('\n');
}

module.exports = {
    MIN_DELAY, MAX_DELAY, DEFAULT_DELAY, SAFE_DELAY, MIN_INTERVAL, MAX_INTERVAL, DEFAULT_INTERVAL,
    digits, botKey, fmtDuration, parseDuration, saveContent, loadContent, clearContent, getConfig,
    listTargetGroups, runBroadcast, formatReport, isRunning, getState, requestStop,
};
