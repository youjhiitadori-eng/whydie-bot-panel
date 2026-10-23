// Welcome & Goodbye: kirim foto (profil member di dalam lingkaran + nama) + teks + tombol saluran
// saat ada member masuk (di-add, lewat link, ditarik owner, dll) atau keluar / dikeluarkan.
// Diaktifkan per grup lewat .welcome on/off dan .goodbye on/off (src/commands/group.js).
const config = require('../config');
const settings = require('../utils/settings');
const { sendInteractiveWithImage } = require('../utils/interactiveHelper');
const { buildCard } = require('../utils/welcomeImage');

const MAX_PER_EVENT = 5;          // maksimal member yang disapa dalam satu kejadian (anti-spam kalau ada mass add)
const DEDUPE_MS = 20 * 1000;      // kejadian yang sama dalam jeda ini diabaikan
const NAME_CACHE_MAX = 5000;
const USE_BUTTON = false;           // true = kirim pesan bertombol (kadang tidak terlihat di sebagian HP). false = foto + caption biasa, link saluran di caption
const AUTO_DELETE_MS = 60 * 1000;   // pesan welcome/goodbye dihapus (untuk semua orang) setelah 1 menit

const digits = (v) => String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '');
const isLid = (v) => String(v || '').endsWith('@lid');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/* ======================= TEKS ======================= */

const WELCOME_TEXT = (tag) => [
    `👋 WELCOME, @${tag}!`,
    '',
    'Selamat datang di grup kami! 🎉',
    '',
    'Kamu adalah bagian baru dari komunitas ini.',
    'Kenalan dulu yuk, jangan cuma jadi silent reader 😆',
    '',
    '📌 Jangan lupa:',
    '• Baca deskripsi grup',
    '• Patuhi peraturan yang berlaku',
    '• Saling menghargai sesama member',
    '',
    'Semoga betah dan enjoy di sini! 🤍',
].join('\n');

const GOODBYE_TEXT = (tag) => [
    '「 GOODBYE MEMBER 」',
    '',
    `See you again, @${tag}.`,
    'Thanks for being part of this group.',
    '',
    'Semoga sukses di mana pun kamu berada.',
].join('\n');

/**
 * Isi template teks kustom (.setwelcome / .setgoodbye).
 * Variabel: @user = mention member | @namagrup / @usergrup = nama grup
 */
function renderTemplate(template, { tag, groupName }) {
    return String(template).replace(/@(usergrup|namagrup|user)\b/gi, (_, v) =>
        v.toLowerCase() === 'user' ? `@${tag}` : (groupName || 'grup ini'));
}

async function getGroupName(Nayla, groupJid) {
    try {
        const meta = await withTimeout(Nayla.groupMetadata(groupJid), 8000);
        return meta?.subject || '';
    } catch { return ''; }
}

// Hapus pesan bot untuk semua orang setelah jeda tertentu
function scheduleDelete(Nayla, groupJid, sent) {
    const id = typeof sent === 'string' ? sent : sent?.key?.id;
    if (!id) return;
    const key = { remoteJid: groupJid, fromMe: true, id };
    setTimeout(() => {
        Nayla.sendMessage(groupJid, { delete: key }).catch(e => console.error('[GRUP] gagal hapus pesan:', e.message));
    }, AUTO_DELETE_MS).unref?.();
}

/* ======================= CACHE NAMA ======================= */
// WhatsApp tidak memberi nama member baru di event masuk/keluar, jadi nama diambil dari
// pesan / kontak yang pernah dilihat bot. Kalau belum ada, foto memakai nomor member.

const nameCache = new Map();

function rememberName(ids, name) {
    const n = String(name || '').trim();
    if (!n) return;
    for (const id of [].concat(ids)) {
        const d = digits(id);
        if (!d) continue;
        nameCache.delete(d);              // pindah ke urutan terbaru
        nameCache.set(d, n);
    }
    while (nameCache.size > NAME_CACHE_MAX) nameCache.delete(nameCache.keys().next().value);
}

/* ======================= IDENTITAS MEMBER ======================= */

// Peserta bisa berupa string JID atau objek { id, phoneNumber, lid, admin } (tergantung versi Baileys)
function parseParticipant(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
        return { id: raw, jid: isLid(raw) ? null : raw, lid: isLid(raw) ? raw : null };
    }
    const id = raw.id || raw.jid || raw.lid || null;
    if (!id) return null;
    let phone = raw.phoneNumber || raw.pn || raw.jid || (!isLid(id) ? id : null);
    if (phone && !String(phone).includes('@')) phone = digits(phone) + '@s.whatsapp.net';
    if (phone && isLid(phone)) phone = null;
    const lid = raw.lid || (isLid(id) ? id : null);
    return { id, jid: phone, lid };
}

async function resolvePhone(Nayla, member) {
    if (member.jid) return member.jid;
    if (!member.lid) return null;
    try {
        const pn = await withTimeout(Promise.resolve(Nayla.signalRepository?.lidMapping?.getPNForLID?.(member.lid)), 4000);
        if (pn && !isLid(pn)) return String(pn).includes('@') ? pn : digits(pn) + '@s.whatsapp.net';
    } catch { /* lanjut tanpa nomor */ }
    return null;
}

function isBotJid(Nayla, member) {
    const me = [Nayla.user?.id, Nayla.user?.lid, Nayla.user?.jid].map(digits).filter(Boolean);
    return [member.id, member.jid, member.lid].map(digits).filter(Boolean).some(d => me.includes(d));
}

async function fetchAvatar(Nayla, member) {
    const candidates = [member.jid, member.id, member.lid].filter((v, i, a) => v && a.indexOf(v) === i);
    for (const jid of candidates) {
        try {
            const url = await withTimeout(Nayla.profilePictureUrl(jid, 'image'), 8000);
            if (!url) continue;
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (!res.ok) continue;
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length) return buf;
        } catch { /* tidak punya foto / disembunyikan -> coba berikutnya */ }
    }
    return null;
}

/* ======================= KIRIM ======================= */

/**
 * Kirim kartu welcome / goodbye untuk satu member.
 * Lapisan fallback: foto + tombol saluran -> foto + link saluran di caption -> teks saja.
 * member: hasil parseParticipant | opsi: { name } untuk memaksa nama (dipakai .welcome test)
 */
async function sendCardRaw(Nayla, groupJid, kind, member, opts = {}) {
    const phoneJid = await resolvePhone(Nayla, member);
    const number = digits(phoneJid);
    const name = opts.name || nameCache.get(number) || nameCache.get(digits(member.lid)) || nameCache.get(digits(member.id)) || '';

    const tag = digits(member.id);
    const custom = settings.getGroupText(groupJid, kind);
    const text = custom
        ? renderTemplate(custom, { tag, groupName: await getGroupName(Nayla, groupJid) })
        : (kind === 'welcome' ? WELCOME_TEXT : GOODBYE_TEXT)(tag);
    const mentions = [member.id];
    const channelLabel = `Saluran ${config.ownerName}`;

    let card = null;
    try {
        const avatar = await fetchAvatar(Nayla, { ...member, jid: phoneJid || member.jid });
        card = await buildCard(kind, { avatar, name, number });
    } catch (e) {
        console.error(`[GRUP] gagal membuat foto ${kind}:`, e.message);
    }

    if (card) {
        if (USE_BUTTON) try {
            return await sendInteractiveWithImage(Nayla, groupJid, {
                text,
                footer: config.footerTxt,
                imageSource: card,
                buttons: [{
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({ display_text: channelLabel, url: config.channelUrl }),
                }],
                contextInfo: { mentionedJid: mentions },
                strict: true,
            });
        } catch (e) {
            console.error(`[GRUP] gagal kirim ${kind} dengan tombol, kirim foto biasa:`, e.message);
        }
        try {
            return await Nayla.sendMessage(groupJid, {
                image: card,
                caption: `${text}\n\n📢 ${channelLabel}: ${config.channelUrl}`,
                mentions,
            });
        } catch (e) {
            console.error(`[GRUP] gagal kirim foto ${kind}:`, e.message);
        }
    }
    return Nayla.sendMessage(groupJid, { text: `${text}\n\n📢 ${channelLabel}: ${config.channelUrl}`, mentions });
}

async function sendCard(Nayla, groupJid, kind, member, opts = {}) {
    const sent = await sendCardRaw(Nayla, groupJid, kind, member, opts);
    scheduleDelete(Nayla, groupJid, sent);
    return sent;
}

/* ======================= EVENT ======================= */

const recent = new Map();

function seenRecently(key) {
    const now = Date.now();
    for (const [k, t] of recent) if (now - t > DEDUPE_MS) recent.delete(k);
    if (recent.has(key)) return true;
    recent.set(key, now);
    return false;
}

async function onParticipantsUpdate(Nayla, ev) {
    const groupJid = ev?.id;
    if (!groupJid || !String(groupJid).endsWith('@g.us')) return;

    const kind = ev.action === 'add' ? 'welcome' : ev.action === 'remove' ? 'goodbye' : null;
    if (!kind || !settings.getGroupFlag(groupJid, kind)) return;

    const members = (ev.participants || []).map(parseParticipant).filter(Boolean);
    let sent = 0;
    for (const member of members) {
        if (sent >= MAX_PER_EVENT) break;
        if (isBotJid(Nayla, member)) continue;
        if (seenRecently(`${groupJid}:${kind}:${digits(member.id)}`)) continue;
        try {
            await sendCard(Nayla, groupJid, kind, member);
            sent++;
        } catch (e) {
            console.error(`[GRUP] gagal mengirim ${kind}:`, e.message);
        }
        if (sent < MAX_PER_EVENT) await sleep(800);
    }
}

/** Pasang semua listener ke socket (dipanggil dari index.js untuk tiap koneksi). */
function attach(Nayla) {
    Nayla.ev.on('group-participants.update', (ev) => {
        onParticipantsUpdate(Nayla, ev).catch(e => console.error('[GRUP] error event:', e.message));
    });

    // Kumpulkan nama (pushName) supaya foto bisa menampilkan nama, bukan hanya nomor
    Nayla.ev.on('messages.upsert', ({ messages }) => {
        for (const msg of messages || []) {
            if (!msg?.pushName || msg.key?.fromMe) continue;
            rememberName([msg.key.participant, msg.key.participantAlt, msg.key.senderPn, msg.key.remoteJid], msg.pushName);
        }
    });
    const onContacts = (list) => {
        for (const c of list || []) rememberName([c.id, c.lid, c.phoneNumber, c.jid], c.notify || c.verifiedName || c.name);
    };
    Nayla.ev.on('contacts.upsert', onContacts);
    Nayla.ev.on('contacts.update', onContacts);

    // Penjadwal Auto JPM (aktif hanya kalau owner menyalakan .autojpm on)
    require('./jpmScheduler').attach(Nayla);
}

module.exports = { renderTemplate, attach, onParticipantsUpdate, sendCard, parseParticipant, rememberName, WELCOME_TEXT, GOODBYE_TEXT };
