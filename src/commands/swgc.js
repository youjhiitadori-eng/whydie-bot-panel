// Status Grup (SW GC): .swgc <teks> (di grup ini) | .swgcall <teks> (ke semua grup, owner) | .autosw on/off (owner)
// Teks saja, foto saja, atau foto + teks: kirim/reply foto dengan caption command-nya.
const crypto = require('crypto');
const config = require('../config');
const settings = require('../utils/settings');
const U = require('../utils/groupUtil');
const { getImageBuffer, getQuotedText } = require('../utils/mediaHelper');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const DELAY_BETWEEN_GROUPS = 3000;   // jeda antar grup untuk swgcall (hindari spam / limit)
const bodyOf = (m) => String(m.command.raw || '').slice(config.prefix.length).replace(/^\S+\s*/, '').trim();

/** Kirim status grup ke satu grup. content: { text } atau { image: Buffer, caption } */
async function sendGroupStatus(Nayla, groupJid, content) {
    const { generateWAMessageContent, generateWAMessageFromContent, proto } = require('../../lib/baileys');
    const inside = await generateWAMessageContent(content, { upload: Nayla.waUploadToServer });
    const messageSecret = crypto.randomBytes(32);
    const msg = generateWAMessageFromContent(groupJid, proto.Message.fromObject({
        messageContextInfo: { messageSecret },
        groupStatusMessageV2: { message: { ...inside, messageContextInfo: { messageSecret } } },
    }), {});
    if (!msg.message?.groupStatusMessageV2) {
        throw new Error('versi Baileys belum mendukung status grup (groupStatusMessageV2)');
    }
    await Nayla.relayMessage(groupJid, msg.message, { messageId: msg.key.id });
}

async function buildContent(m) {
    const body = bodyOf(m) || (m.command.args.length ? '' : getQuotedText(m));
    const image = await getImageBuffer(m);
    if (image) return { image, caption: body || '' };
    if (body) return { text: body };
    return null;
}

const usage = (m, cmd) => m.reply({ text: `📸 *${cmd.toUpperCase()}*\n\n• Teks: *${config.prefix}${cmd} Halo semuanya*\n• Foto: kirim / reply foto dengan caption *${config.prefix}${cmd}*\n• Foto + teks: kirim / reply foto dengan caption *${config.prefix}${cmd} teksnya*` });

const handler = async (m) => {
    const name = m.command.name;
    const p = config.prefix;

    switch (name) {
        case 'swgc': {
            if (!m.isGroup) return m.reply({ text: '👥 Fitur ini hanya bisa dipakai di dalam grup. Untuk semua grup pakai *' + p + 'swgcall* (owner).' });
            if (!(m.isOwner || await U.isSenderAdmin(m.Nayla, m.sender, m.msg))) {
                return m.reply({ text: '🚫 Fitur ini khusus *Owner* atau *Admin grup*.' });
            }
            const content = await buildContent(m);
            if (!content) return usage(m, 'swgc');
            await m.react('⏳');
            try {
                await sendGroupStatus(m.Nayla, m.sender, content);
                await m.react('✅');
            } catch (e) {
                await m.react('❌');
                await m.reply({ text: `❌ Gagal kirim status grup: ${e.message}` });
            }
            return;
        }

        case 'swgcall': {
            if (!m.isOwner) return m.reply({ text: '❌ Command ini khusus owner.' });
            const content = await buildContent(m);
            if (!content) return usage(m, 'swgcall');

            let groups;
            try { groups = Object.keys(await m.Nayla.groupFetchAllParticipating()); }
            catch (e) { return m.reply({ text: `❌ Gagal mengambil daftar grup: ${e.message}` }); }
            if (!groups.length) return m.reply({ text: '❌ Bot belum ada di grup mana pun.' });

            await m.reply({ text: `⏳ Mengirim status ke *${groups.length}* grup...\nEstimasi ±${Math.ceil(groups.length * DELAY_BETWEEN_GROUPS / 60000)} menit.` });
            let ok = 0, fail = 0, lastErr = '';
            for (const jid of groups) {
                try { await sendGroupStatus(m.Nayla, jid, content); ok++; }
                catch (e) { fail++; lastErr = e.message; }
                await sleep(DELAY_BETWEEN_GROUPS);
            }
            return m.reply({ text: `✅ Selesai kirim status grup.\n\n• Berhasil: *${ok}* grup\n• Gagal: *${fail}* grup${fail && lastErr ? `\n• Error terakhir: ${lastErr}` : ''}` });
        }

        case 'autosw': {
            if (!m.isOwner) return m.reply({ text: '❌ Command ini khusus owner.' });
            const arg = (m.command.args[0] || '').toLowerCase();
            if (arg === 'on' || arg === 'off') {
                settings.setAutoSW(arg === 'on');
                return m.reply({ text: arg === 'on' ? '✅ *Auto Lihat SW* aktif. Bot otomatis melihat & me-react ❤️ ke status kontak.' : '☑️ *Auto Lihat SW* dimatikan.' });
            }
            return m.reply({ text: `👀 *Auto Lihat SW*\nStatus: *${settings.isAutoSW() ? 'ON ✅' : 'OFF ☑️'}*\n\n• *${p}autosw on* → aktifkan\n• *${p}autosw off* → matikan` });
        }
    }
};

module.exports = handler;
