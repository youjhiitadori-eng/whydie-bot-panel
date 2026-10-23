// Ambil foto (kirim langsung dengan caption, atau reply ke foto) & teks reply
const P = require('pino');
const { downloadMediaMessage } = require('../../lib/baileys');

const logger = P({ level: 'silent' });

function unwrap(message) {
    let cur = message;
    for (let i = 0; i < 6 && cur; i++) {
        const next = cur.ephemeralMessage?.message || cur.viewOnceMessage?.message ||
            cur.viewOnceMessageV2?.message || cur.viewOnceMessageV2Extension?.message ||
            cur.documentWithCaptionMessage?.message;
        if (!next) break;
        cur = next;
    }
    return cur;
}

function getQuoted(m) {
    const message = unwrap(m.msg.message);
    const ctx = message?.extendedTextMessage?.contextInfo || message?.imageMessage?.contextInfo;
    const quoted = unwrap(ctx?.quotedMessage);
    return quoted ? { quoted, ctx } : null;
}

/** Buffer foto dari pesan sendiri atau pesan yang di-reply. null kalau tidak ada foto. */
async function getImageBuffer(m) {
    const { msg, Nayla } = m;
    const message = unwrap(msg.message);
    let target = null;

    if (message?.imageMessage) {
        target = { key: msg.key, message };
    } else {
        const q = getQuoted(m);
        if (q?.quoted?.imageMessage) {
            target = {
                key: { remoteJid: msg.key.remoteJid, id: q.ctx.stanzaId, participant: q.ctx.participant, fromMe: false },
                message: q.quoted,
            };
        }
    }
    if (!target) return null;
    return downloadMediaMessage(target, 'buffer', {}, { logger, reuploadRequest: Nayla.updateMediaMessage });
}

/** Teks dari pesan yang di-reply (untuk prompt) */
function getQuotedText(m) {
    const q = getQuoted(m)?.quoted;
    return q?.conversation || q?.extendedTextMessage?.text || q?.imageMessage?.caption || '';
}

module.exports = { getImageBuffer, getQuotedText };
