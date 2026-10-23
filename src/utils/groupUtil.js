// Helper bersama untuk fitur grup (antilink, antitagsw, open/close, kick, tagall, hidetag)
const digits = (v) => String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '');

const metaCache = new Map(); // groupJid -> { t, meta }
const META_TTL = 20 * 1000;

async function getMeta(Nayla, groupJid, fresh = false) {
    const c = metaCache.get(groupJid);
    if (!fresh && c && Date.now() - c.t < META_TTL) return c.meta;
    try {
        const meta = await Nayla.groupMetadata(groupJid);
        metaCache.set(groupJid, { t: Date.now(), meta });
        if (metaCache.size > 300) metaCache.delete(metaCache.keys().next().value);
        return meta;
    } catch {
        return c?.meta || null;
    }
}

const idsOf = (p) => [p?.id, p?.lid, p?.jid, p?.phoneNumber, p?.pn].map(digits).filter(Boolean);
const isAdminP = (p) => p?.admin === 'admin' || p?.admin === 'superadmin';

function findParticipant(meta, jidOrNumber) {
    const d = digits(jidOrNumber);
    if (!d) return null;
    return (meta?.participants || []).find(p => idsOf(p).includes(d)) || null;
}

/** Cek apakah pengirim pesan (msg Baileys) adalah admin grup */
async function isSenderAdmin(Nayla, groupJid, msg) {
    const meta = await getMeta(Nayla, groupJid);
    if (!meta) return false;
    const key = msg?.key || {};
    const me = [key.participant, key.participantAlt, key.senderPn].map(digits).filter(Boolean);
    return (meta.participants || []).some(p => isAdminP(p) && idsOf(p).some(d => me.includes(d)));
}

/** Cek apakah bot sendiri admin grup */
async function isBotAdmin(Nayla, groupJid, fresh = false) {
    const meta = await getMeta(Nayla, groupJid, fresh);
    if (!meta) return false;
    const me = [Nayla.user?.id, Nayla.user?.lid, Nayla.user?.jid].map(digits).filter(Boolean);
    return (meta.participants || []).some(p => isAdminP(p) && idsOf(p).some(d => me.includes(d)));
}

function isBotParticipant(Nayla, p) {
    const me = [Nayla.user?.id, Nayla.user?.lid, Nayla.user?.jid].map(digits).filter(Boolean);
    return idsOf(p).some(d => me.includes(d));
}

/** Buka pembungkus pesan (ephemeral / view once / edited / dokumen+caption) */
function unwrap(message) {
    let m = message;
    for (let i = 0; i < 5 && m; i++) {
        const inner = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message
            || m.viewOnceMessageV2Extension?.message || m.documentWithCaptionMessage?.message
            || m.editedMessage?.message;
        if (!inner) break;
        m = inner;
    }
    return m || null;
}

/** Semua teks yang terlihat di pesan (isi, caption, dll) */
function getText(content) {
    if (!content) return '';
    return [
        content.conversation,
        content.extendedTextMessage?.text,
        content.imageMessage?.caption,
        content.videoMessage?.caption,
        content.documentMessage?.caption,
        content.buttonsResponseMessage?.selectedDisplayText,
    ].filter(Boolean).join('\n');
}

// http(s)://, www., link WhatsApp/Telegram, dan domain polos (bukan email)
const LINK_RE = /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/|t\.me\/)\S+|(?<![@\w.-])[a-z0-9][a-z0-9-]*\.(?:com|net|org|id|co\.id|my\.id|web\.id|me|io|xyz|info|link|gg|ly|app|dev|cc|tv|site|online|top|shop|store|biz|us|ai|to|fm|vip|club|live|pro)\b(?:\/\S*)?/i;
const hasLink = (text) => LINK_RE.test(String(text || ''));

/** Pesan "tag grup di status" (status mention) */
function isStatusMention(content) {
    if (!content) return false;
    if (Object.keys(content).some(k => /statusmention/i.test(k))) return true;
    const t = content.protocolMessage?.type;
    return t === 25 || t === 'STATUS_MENTION_MESSAGE';
}

/** contextInfo (mention & quoted) dari pesan apa pun */
function getContext(msg) {
    const c = unwrap(msg?.message) || {};
    for (const v of Object.values(c)) if (v && typeof v === 'object' && v.contextInfo) return v.contextInfo;
    return {};
}

module.exports = { digits, getMeta, idsOf, isAdminP, findParticipant, isSenderAdmin, isBotAdmin, isBotParticipant, unwrap, getText, hasLink, isStatusMention, getContext };
