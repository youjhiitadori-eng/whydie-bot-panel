// Grup Admin: .antilink | .antitagsw | .open | .close | .kick | .tagall | .hidetag
// Hanya bisa dipakai di grup, oleh Owner bot atau Admin grup. Bot harus jadi admin untuk
// open/close/kick dan untuk menghapus pesan (antilink / antitagsw).
const config = require('../config');
const settings = require('../utils/settings');
const U = require('../utils/groupUtil');

// antiswgc = nama utama, antitagsw = alias (keduanya memakai pengaturan yang sama)
const FLAG_LABEL = { antilink: 'Anti Link', antilink2: 'Anti Link 2', antitagsw: 'Anti SW GC' };
const FLAG_ALIAS = { antiswgc: 'antitagsw' };
const OWNER_NUMS = () => [].concat(config.superOwner, config.coOwner || []).map(U.digits).filter(Boolean);
const NEED_BOT_ADMIN = '❌ Gagal. Jadikan bot *admin grup* dulu, lalu coba lagi.';

// Teks setelah nama command (baris baru tetap utuh)
const bodyOf = (m) => String(m.command.raw || '').slice(config.prefix.length).replace(/^\S+\s*/, '').trim();

async function sendMention(m, text, ids, quoted = true) {
    return m.Nayla.sendMessage(m.sender, { text, mentions: ids }, quoted ? { quoted: m.msg } : {});
}

// Cari target kick: tag > reply > nomor
function pickTarget(m, meta) {
    const ctx = U.getContext(m.msg);
    const cands = [];
    if (ctx.mentionedJid?.length) cands.push(...ctx.mentionedJid);
    else if (ctx.quotedMessage && ctx.participant) cands.push(ctx.participant);
    else {
        const num = bodyOf(m).replace(/\D/g, '');
        if (num.length >= 8) cands.push(num);
    }
    const found = [];
    for (const c of cands) {
        const p = U.findParticipant(meta, c);
        if (p && !found.includes(p)) found.push(p);
    }
    return { requested: cands.length, found };
}

const handler = async (m) => {
    const name = m.command.name;
    const p = config.prefix;

    if (!m.isGroup) return m.reply({ text: '👥 Fitur ini hanya bisa dipakai di dalam grup.' });
    if (!(m.isOwner || await U.isSenderAdmin(m.Nayla, m.sender, m.msg))) {
        return m.reply({ text: '🚫 Fitur ini khusus *Owner* atau *Admin grup*.' });
    }

    switch (name) {
        case 'antilink':
        case 'antilink2':
        case 'antiswgc':
        case 'antitagsw': {
            const flag = FLAG_ALIAS[name] || name;
            const label = FLAG_LABEL[flag];
            const arg = (m.command.args[0] || '').toLowerCase();
            if (arg === 'on' || arg === 'off') {
                const on = arg === 'on';
                settings.setGroupFlag(m.sender, flag, on);
                let extra = '';
                if (on) {
                    extra = flag === 'antilink'
                        ? '\n\nMember yang kirim link otomatis dihapus. Admin grup & owner bebas.'
                        : flag === 'antilink2'
                            ? '\n\nMember yang kirim link dihapus pesannya *lalu dikeluarkan dari grup*. Admin grup & owner bebas.'
                            : '\n\nMember yang tag grup ini di status (SW GC) otomatis dihapus. Admin grup & owner bebas.';
                    if (!(await U.isBotAdmin(m.Nayla, m.sender, true))) extra += '\n\n⚠️ Bot belum jadi *admin grup*, jadi belum bisa menghapus pesan. Jadikan bot admin dulu.';
                }
                return m.reply({ text: `${on ? '✅' : '☑️'} *${label}* ${on ? 'diaktifkan' : 'dimatikan'} untuk grup ini.${extra}` });
            }
            const status = settings.getGroupFlag(m.sender, flag) ? 'ON ✅' : 'OFF ☑️';
            return m.reply({ text: `🛡️ *${label}*\nStatus grup ini: *${status}*\n\n• *${p}${name} on* → aktifkan\n• *${p}${name} off* → matikan` });
        }

        case 'open':
        case 'close': {
            const opening = name === 'open';
            if (!(await U.isBotAdmin(m.Nayla, m.sender, true))) return m.reply({ text: NEED_BOT_ADMIN });
            try {
                await m.Nayla.groupSettingUpdate(m.sender, opening ? 'not_announcement' : 'announcement');
                return m.reply({ text: opening
                    ? '✅ Sukses! Grup dibuka, semua member bisa kirim pesan.'
                    : '🔒 Sukses! Grup ditutup, hanya admin yang bisa kirim pesan.' });
            } catch (e) {
                return m.reply({ text: `❌ Gagal ${opening ? 'membuka' : 'menutup'} grup: ${e.message}` });
            }
        }

        case 'kick': {
            if (!(await U.isBotAdmin(m.Nayla, m.sender, true))) return m.reply({ text: NEED_BOT_ADMIN });
            const meta = await U.getMeta(m.Nayla, m.sender, true);
            if (!meta) return m.reply({ text: '❌ Gagal mengambil data grup.' });
            const { requested, found } = pickTarget(m, meta);
            if (!requested) return m.reply({ text: `👢 Reply pesan member atau tag orangnya.\nContoh: *${p}kick @member*` });
            if (!found.length) return m.reply({ text: '❌ Member itu tidak ada di grup ini.' });

            const owners = OWNER_NUMS();
            const ok = [], skipped = [];
            for (const t of found) {
                const ids = U.idsOf(t);
                if (U.isAdminP(t) || U.isBotParticipant(m.Nayla, t) || ids.some(d => owners.includes(d))) { skipped.push(t); continue; }
                try {
                    const res = await m.Nayla.groupParticipantsUpdate(m.sender, [t.id], 'remove');
                    const st = String(res?.[0]?.status ?? '200');
                    (st === '200' ? ok : skipped).push(t);
                } catch { skipped.push(t); }
            }
            const tag = (t) => `@${U.digits(t.id)}`;
            let text = '';
            if (ok.length) text += `✅ Sukses mengeluarkan ${ok.map(tag).join(', ')}.`;
            if (skipped.length) text += `${text ? '\n' : ''}❌ Tidak bisa mengeluarkan ${skipped.map(tag).join(', ')} (admin / owner / bot).`;
            return sendMention(m, text, [...ok, ...skipped].map(t => t.id));
        }

        case 'tagall': {
            const meta = await U.getMeta(m.Nayla, m.sender, true);
            if (!meta) return m.reply({ text: '❌ Gagal mengambil data grup.' });
            const members = meta.participants || [];
            const msgText = bodyOf(m);
            const text = [
                `📢 *TAG ALL*`,
                msgText ? `\n💬 ${msgText}` : '',
                `\n👥 Total: ${members.length} member\n`,
                ...members.map(x => `• @${U.digits(x.id)}`),
            ].join('\n');
            return sendMention(m, text, members.map(x => x.id));
        }

        case 'hidetag':
        case 'ht': {
            const meta = await U.getMeta(m.Nayla, m.sender, true);
            if (!meta) return m.reply({ text: '❌ Gagal mengambil data grup.' });
            const ctx = U.getContext(m.msg);
            const quoted = U.getText(ctx.quotedMessage);
            const text = bodyOf(m) || quoted;
            if (!text) return m.reply({ text: `👻 Tulis pesannya atau reply pesan.\nContoh: *${p}hidetag Besok kumpul jam 8*\n\nSemua member dapat notifikasi, tapi tidak ada daftar tag yang kelihatan.` });
            return sendMention(m, text, (meta.participants || []).map(x => x.id), false);
        }
    }
};

module.exports = handler;
