// Penjaga grup: Anti Link (.antilink), Anti Link 2 = hapus + kick (.antilink2), Anti SW GC (.antiswgc)
// Pesan member biasa yang melanggar langsung dihapus. Admin grup & owner dibebaskan.
// Bot harus jadi admin grup supaya bisa menghapus pesan orang lain.
const settings = require('../utils/settings');
const U = require('../utils/groupUtil');

const MAX_AGE_S = 120; // abaikan pesan lama (mis. riwayat saat bot baru tersambung)

/**
 * @returns {Promise<boolean>} true kalau pesan sudah dihapus (tidak perlu diproses lagi)
 */
async function guard(Nayla, msg, { isOwner = false, type = 'notify' } = {}) {
    try {
        const groupJid = msg?.key?.remoteJid;
        if (!groupJid || !groupJid.endsWith('@g.us') || msg.key.fromMe || isOwner) return false;
        if (type !== 'notify') return false;

        const ts = Number(msg.messageTimestamp?.low ?? msg.messageTimestamp) || 0;
        if (ts && Date.now() / 1000 - ts > MAX_AGE_S) return false;

        const kickLink = settings.getGroupFlag(groupJid, 'antilink2');   // hapus + kick
        const wantLink = settings.getGroupFlag(groupJid, 'antilink') || kickLink;
        const wantSw = settings.getGroupFlag(groupJid, 'antitagsw');
        if (!wantLink && !wantSw) return false;

        const content = U.unwrap(msg.message);
        let reason = null;
        if (wantSw && U.isStatusMention(content)) reason = 'sw';
        else if (wantLink && U.hasLink(U.getText(content))) reason = 'link';
        if (!reason) return false;

        if (await U.isSenderAdmin(Nayla, groupJid, msg)) return false;   // admin grup bebas
        if (!(await U.isBotAdmin(Nayla, groupJid))) return false;        // bot bukan admin -> tidak bisa hapus

        await Nayla.sendMessage(groupJid, { delete: msg.key });

        const who = msg.key.participant || msg.key.participantAlt;
        let kicked = false;
        if (reason === 'link' && kickLink && who) {
            try {
                const meta = await U.getMeta(Nayla, groupJid);
                const target = U.findParticipant(meta, who) || U.findParticipant(meta, msg.key.participantAlt);
                const res = await Nayla.groupParticipantsUpdate(groupJid, [target?.id || who], 'remove');
                kicked = String(res?.[0]?.status ?? '200') === '200';
            } catch (e) { console.error('[GUARD] gagal kick:', e.message); }
        }

        if (who) {
            const tag = `@${U.digits(who)}`;
            const text = reason === 'sw'
                ? `⚠️ Hei ${tag}, jangan tag grup ini di status ya!`
                : kicked
                    ? `🚫 ${tag} dikeluarkan karena kirim link. Jangan kirim link di sini ya!`
                    : `⚠️ Hei ${tag}, jangan di sini ya kirim link!`;
            await Nayla.sendMessage(groupJid, { text, mentions: [who] });
        }
        return true;
    } catch (e) {
        console.error('[GUARD] error:', e.message);
        return false;
    }
}

module.exports = { guard };
