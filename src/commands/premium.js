// Atur user Premium (khusus owner): .addprem, .delprem, .listprem
const config = require('../config');
const roles = require('../utils/roles');
const limits = require('../utils/limits');

const digits = (v) => String(v || '').replace(/\D/g, '');

// Target: @mention -> reply pesan -> nomor di argumen
function getTarget(m) {
    const ctx = m.msg.message?.extendedTextMessage?.contextInfo;
    const jid = ctx?.mentionedJid?.[0] || ctx?.participant || null;
    const argNum = m.command.args.map(digits).find(d => d.length >= 8);
    const raw = jid || (argNum ? argNum + '@s.whatsapp.net' : null);
    if (!raw) return null;
    const num = digits(String(raw).split('@')[0].split(':')[0]);
    if (String(raw).endsWith('@lid')) return { number: null, lid: num };
    return { number: num, lid: null };
}

function getDays(m) {
    const d = m.command.args.find(a => /^\d{1,4}$/.test(a));
    return d ? parseInt(d, 10) : null;
}

const handler = async (m) => {
    const p = config.prefix;
    if (!m.isOwner) return m.reply({ text: '❌ Command ini khusus owner.' });

    switch (m.command.name) {
        case 'addprem': {
            const t = getTarget(m);
            if (!t) return m.reply({ text: `Format: *${p}addprem 628xxx [hari]*\nAtau tag / reply orangnya.\nTanpa hari = permanen.` });
            if (t.number && !t.lid) {
                try {
                    const [r] = await m.Nayla.onWhatsApp(t.number);
                    if (r?.lid) t.lid = digits(String(r.lid).split('@')[0].split(':')[0]);
                } catch { /* tidak apa-apa, nomor tetap tersimpan */ }
            }
            const days = getDays(m);
            const entry = roles.add({ ...t, days });
            return m.reply({ text: `✅ *${entry.number || entry.lid}* sekarang *Premium* (${days ? days + ' hari' : 'permanen'}).` });
        }

        case 'delprem': {
            const t = getTarget(m);
            if (!t) return m.reply({ text: `Format: *${p}delprem 628xxx*\nAtau tag / reply orangnya.` });
            const ok = roles.remove(t.number) || roles.remove(t.lid);
            return m.reply({ text: ok ? `✅ Premium *${t.number || t.lid}* dicabut.` : '❌ Nomor itu bukan Premium.' });
        }

        case 'addlimit': {
            const t = getTarget(m);
            const amount = parseInt(m.command.args.find(a => /^\d{1,6}$/.test(a)), 10);
            if (!t || !amount) return m.reply({ text: `Format: *${p}addlimit 628xxx <jumlah>*\nAtau tag / reply orangnya: *${p}addlimit @tag 20*\nLimit tambahan tidak hilang saat reset harian.` });
            const id = t.number || t.lid;
            const g = limits.add(id, amount);
            if (!g) return m.reply({ text: '❌ Jumlah limit tidak valid.' });
            return m.reply({ text: `✅ Berhasil menambah *${amount} limit* ke *${id}*.\nSisa sekarang: *${g.free}/${limits.dailyMax()}* harian + *${g.bonus}* tambahan.` });
        }

        case 'listprem': {
            const list = roles.list();
            if (!list.length) return m.reply({ text: 'Belum ada user Premium.' });
            const lines = list.map((e, i) => {
                const left = roles.daysLeft(e);
                return `${i + 1}. ${e.number || e.lid} — ${left ? left + ' hari lagi' : 'permanen'}`;
            });
            return m.reply({ text: `👑 *Daftar Premium (${list.length})*\n${lines.join('\n')}` });
        }
    }
};

module.exports = handler;
