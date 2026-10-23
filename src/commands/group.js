// Grup Menu: .welcome on/off | .goodbye on/off  (+ "test" untuk melihat hasilnya)
// .setwelcome <teks> | .setgoodbye <teks>  (variabel: @user, @namagrup)
// Hanya bisa dipakai di grup, oleh Owner bot atau Admin grup.
const settings = require('../utils/settings');
const config = require('../config');
const { sendCard, parseParticipant } = require('../handlers/groupHandler');

const LABEL = { welcome: 'Welcome', goodbye: 'Goodbye' };
const digits = (v) => String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '');

// Cek admin grup: cocokkan semua bentuk ID (nomor / lid) pengirim dengan daftar peserta
async function isAdminOfGroup(m) {
    try {
        const meta = await m.Nayla.groupMetadata(m.sender);
        const key = m.msg?.key || {};
        const me = [key.participant, key.participantAlt, key.senderPn, m.senderNumber, m.mentionJid].map(digits).filter(Boolean);
        return (meta.participants || []).some(p => {
            if (p.admin !== 'admin' && p.admin !== 'superadmin') return false;
            return [p.id, p.lid, p.jid, p.phoneNumber].map(digits).filter(Boolean).some(d => me.includes(d));
        });
    } catch {
        return false;
    }
}

const handler = async (m) => {
    const isSet = m.command.name.startsWith('set');
    const kind = isSet ? m.command.name.slice(3) : m.command.name;
    if (!LABEL[kind]) return;
    const p = config.prefix;
    const label = LABEL[kind];

    if (!m.isGroup) return m.reply({ text: '👥 Fitur ini hanya bisa dipakai di dalam grup.' });
    if (!(m.isOwner || await isAdminOfGroup(m))) {
        return m.reply({ text: '🚫 Fitur ini khusus *Owner* atau *Admin grup*.' });
    }

    if (isSet) {
        // Ambil teks mentah setelah nama command (baris baru & spasi tetap utuh)
        const body = String(m.command.raw || '').slice(p.length).replace(/^\S+\s*/, '').trim();
        const lower = body.toLowerCase();

        if (lower === 'reset' || lower === 'default') {
            settings.setGroupText(m.sender, kind, null);
            return m.reply({ text: `♻️ Teks *${label}* dikembalikan ke bawaan.` });
        }
        if (!body) {
            const cur = settings.getGroupText(m.sender, kind);
            return m.reply({ text: `✏️ *Set ${label}*\n\nCara pakai:\n*${p}set${kind} <teks>*\n\nVariabel:\n• *@user* → mention member\n• *@namagrup* → nama grup\n\nContoh:\n${p}set${kind} Haloo @user ${kind === 'welcome' ? 'welcome to' : 'sampai jumpa dari'} @namagrup\n\nKetik *${p}set${kind} reset* untuk kembali ke teks bawaan.\n\nTeks sekarang: ${cur ? `\n${cur}` : '_bawaan_'}` });
        }
        settings.setGroupText(m.sender, kind, body);
        return m.reply({ text: `✅ Teks *${label}* disimpan.\nPesan ${kind} otomatis terhapus setelah 1 menit.\n\nCek hasilnya dengan *${p}${kind} test*` });
    }

    const arg = (m.command.args[0] || '').toLowerCase();

    if (arg === 'on' || arg === 'off') {
        const on = arg === 'on';
        settings.setGroupFlag(m.sender, kind, on);
        return m.reply({ text: `${on ? '✅' : '☑️'} *${label}* ${on ? 'diaktifkan' : 'dimatikan'} untuk grup ini.${on ? `\n\nTes tampilannya dengan *${p}${kind} test*` : ''}` });
    }

    if (arg === 'test') {
        await m.react('⏳');
        try {
            const jid = m.msg?.key?.participant || m.mentionJid || m.sender;
            const member = parseParticipant(jid);
            const name = m.pushname && m.pushname !== 'Kak' ? m.pushname : '';
            await sendCard(m.Nayla, m.sender, kind, member, { name });
            await m.react('✅');
        } catch (e) {
            await m.react('❌');
            await m.reply({ text: `❌ Gagal membuat tampilan ${label}: ${e.message}` });
        }
        return;
    }

    const status = settings.getGroupFlag(m.sender, kind) ? 'ON ✅' : 'OFF ☑️';
    return m.reply({ text: `👥 *${label} Member*\nStatus grup ini: *${status}*\n\n• *${p}${kind} on* → aktifkan\n• *${p}${kind} off* → matikan\n• *${p}${kind} test* → lihat contoh tampilan` });
};

// Dipakai PluginLoader (file ini sengaja tanpa "case")
handler.commands = ['welcome', 'goodbye', 'setwelcome', 'setgoodbye'];

module.exports = handler;
