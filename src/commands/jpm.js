// SETOR MENU — JPM (kirim pesan ke semua grup terbuka). Khusus owner.
// .jpm <teks>            kirim manual (teks / foto / foto+teks, bisa reply)
// .setjpm <teks>         simpan isi Auto JPM (teks / foto / foto+teks)
// .setjedajpm <ms>       jeda antar grup (1000 = 1 detik)
// .setwaktujpm <1jam>    jarak Auto JPM (mulai hitung setelah SEMUA grup selesai)
// .autojpm on/off | .statusjpm | .stopjpm
const config = require('../config');
const settings = require('../utils/settings');
const core = require('../utils/jpmCore');
const { getImageBuffer, getQuotedText } = require('../utils/mediaHelper');

const bodyOf = (m) => String(m.command.raw || '').slice(config.prefix.length).replace(/^\S+\s*/, '').trim();

// Isi pesan dari: teks command, foto di pesan itu, atau reply (foto / teks / foto+teks)
async function readContent(m) {
    const body = bodyOf(m) || (m.command.args.length ? '' : getQuotedText(m));
    const image = await getImageBuffer(m);
    return (body || image) ? { text: body, image } : null;
}

const preview = (t) => (t.length > 120 ? t.slice(0, 120) + '…' : t) || '_(tanpa teks)_';
const p = config.prefix;

const handler = async (m) => {
    if (!m.isOwner) return m.reply({ text: '❌ Command ini khusus owner.' });
    const name = m.command.name;
    const key = core.botKey(m.Nayla);
    const cfg = core.getConfig(key);

    switch (name) {
        case 'jpm': {
            if (core.isRunning(key)) return m.reply({ text: `⏳ JPM masih berjalan. Cek *${p}statusjpm* atau hentikan dengan *${p}stopjpm*.` });
            const content = await readContent(m);
            if (!content) {
                return m.reply({ text: `📣 *JPM*\n\nKirim pesan ke semua grup terbuka.\n\n• Teks: *${p}jpm Halo semuanya*\n• Foto: kirim / reply foto dengan caption *${p}jpm*\n• Foto + teks: kirim / reply foto dengan caption *${p}jpm teksnya*\n• Reply teks / foto yang sudah ada juga bisa\n\nJeda sekarang: *${cfg.delayMs} ms* (ubah: *${p}setjedajpm*)` });
            }
            let total = 0, closed = 0;
            try { const g = await core.listTargetGroups(m.Nayla); total = g.open.length; closed = g.closed; }
            catch (e) { return m.reply({ text: `❌ Gagal mengambil daftar grup: ${e.message}` }); }
            if (!total) return m.reply({ text: '❌ Tidak ada grup terbuka untuk dikirimi.' });

            await m.reply({ text: `🚀 *JPM dimulai*\n\n👥 Grup terbuka: *${total}* (tertutup dilewati: ${closed})\n⏱️ Jeda: *${core.fmtDuration(cfg.delayMs)}*\n⌛ Estimasi: ±${core.fmtDuration(total * cfg.delayMs * 1.05)}\n\nLaporan dikirim di sini setelah selesai. Hentikan: *${p}stopjpm*` });
            // jalan di latar belakang supaya bot tetap responsif
            core.runBroadcast(m.Nayla, { content, delayMs: cfg.delayMs, mode: 'manual' })
                .then(st => m.Nayla.sendMessage(m.sender, { text: st.error ? `❌ ${st.error}` : core.formatReport(st) }))
                .catch(e => console.error('[JPM] gagal kirim laporan:', e.message));
            return;
        }

        case 'setjpm': {
            const arg = (m.command.args[0] || '').toLowerCase();
            if (arg === 'reset' && m.command.args.length === 1) {
                core.clearContent(key);
                settings.setJpm(key, { auto: false });
                return m.reply({ text: '♻️ Isi Auto JPM dihapus & Auto JPM dimatikan.' });
            }
            const content = await readContent(m);
            if (!content) {
                const cur = core.loadContent(key);
                return m.reply({ text: `✏️ *SET JPM* (isi Auto JPM)\n\n• Teks: *${p}setjpm Promo hari ini!*\n• Foto: kirim / reply foto dengan caption *${p}setjpm*\n• Foto + teks: kirim / reply foto dengan caption *${p}setjpm teksnya*\n• *${p}setjpm reset* → hapus\n\nIsi sekarang: ${cur ? `\n${cur.image ? '🖼️ foto + ' : ''}${preview(cur.text)}` : '_belum ada_'}` });
            }
            core.saveContent(key, content);
            return m.reply({ text: `✅ Isi Auto JPM disimpan (${content.image ? 'foto' : 'teks'}${content.image && content.text ? ' + teks' : ''}).\n\n${content.image ? '🖼️ ' : ''}${preview(content.text)}\n\nNyalakan dengan *${p}autojpm on*` });
        }

        case 'setjedajpm': {
            const raw = (m.command.args[0] || '').toLowerCase();
            if (!raw) return m.reply({ text: `⏱️ *SET JEDA JPM*\n\nJeda antar pengiriman ke tiap grup (dalam milidetik).\n• 1000 = 1 detik\n• 5000 = 5 detik\n• 30000 = 30 detik\n\nContoh: *${p}setjedajpm 5000*\nJeda sekarang: *${cfg.delayMs} ms* (${core.fmtDuration(cfg.delayMs)})\n\nMinimal ${core.MIN_DELAY} ms. Di bawah ${core.SAFE_DELAY} ms rawan kena limit / banned.` });
            const ms = /^\d+$/.test(raw) ? Number(raw) : core.parseDuration(raw);
            if (!ms || ms < core.MIN_DELAY || ms > core.MAX_DELAY) {
                return m.reply({ text: `❌ Jeda harus antara ${core.MIN_DELAY} ms (1 detik) sampai ${core.MAX_DELAY} ms (10 menit).` });
            }
            settings.setJpm(key, { delayMs: ms });
            return m.reply({ text: `✅ Jeda JPM diset *${ms} ms* (${core.fmtDuration(ms)}).${ms < core.SAFE_DELAY ? '\n\n⚠️ Jeda sependek ini rawan kena limit / banned kalau grupnya banyak. Disarankan ≥ 3000.' : ''}` });
        }

        case 'setwaktujpm': {
            const raw = m.command.args.join('');
            if (!raw) return m.reply({ text: `🔁 *SET WAKTU AUTO JPM*\n\nJarak antar putaran Auto JPM. Dihitung setelah SEMUA grup selesai dikirimi.\n\nContoh: *${p}setwaktujpm 1jam*, *${p}setwaktujpm 30menit*, *${p}setwaktujpm 2jam30menit*\nSekarang: *${core.fmtDuration(cfg.intervalMs)}*\n\nMinimal ${core.fmtDuration(core.MIN_INTERVAL)}.` });
            const ms = core.parseDuration(raw);
            if (!ms || ms < core.MIN_INTERVAL || ms > core.MAX_INTERVAL) {
                return m.reply({ text: `❌ Waktu tidak valid. Pakai format seperti *1jam*, *30menit*, *2jam30menit* (minimal ${core.fmtDuration(core.MIN_INTERVAL)}, maksimal 7 hari).` });
            }
            const patch = { intervalMs: ms };
            if (cfg.nextRun && cfg.nextRun > Date.now() + ms) patch.nextRun = Date.now() + ms;
            settings.setJpm(key, patch);
            return m.reply({ text: `✅ Auto JPM akan mengirim setiap *${core.fmtDuration(ms)}* (dihitung setelah semua grup selesai).` });
        }

        case 'autojpm': {
            const arg = (m.command.args[0] || '').toLowerCase();
            if (arg === 'on') {
                if (!core.loadContent(key)) return m.reply({ text: `❌ Isi Auto JPM belum diset. Pakai *${p}setjpm <teks / foto>* dulu.` });
                settings.setJpm(key, { auto: true, nextRun: Date.now(), reportTo: m.sender });
                return m.reply({ text: `✅ *Auto JPM aktif*\n\n• Mulai sekarang ke semua grup terbuka\n• Jeda antar grup: *${core.fmtDuration(cfg.delayMs)}*\n• Setelah semua selesai, kirim lagi *${core.fmtDuration(cfg.intervalMs)}* kemudian, begitu seterusnya\n• Laporan dikirim ke chat ini\n\nMatikan: *${p}autojpm off*` });
            }
            if (arg === 'off') {
                settings.setJpm(key, { auto: false });
                return m.reply({ text: `☑️ *Auto JPM* dimatikan.${core.isRunning(key) ? `\nPutaran yang sedang jalan belum berhenti — pakai *${p}stopjpm*.` : ''}` });
            }
            return m.reply({ text: `🔁 *Auto JPM*\nStatus: *${cfg.auto ? 'ON ✅' : 'OFF ☑️'}*\n\n• *${p}autojpm on* → aktifkan\n• *${p}autojpm off* → matikan` });
        }

        case 'statusjpm': {
            const st = core.getState(key);
            const content = core.loadContent(key);
            const lines = [
                '📊 *STATUS JPM*', '',
                `🔁 Auto JPM: *${cfg.auto ? 'ON ✅' : 'OFF ☑️'}*`,
                `🗒️ Isi: ${content ? `${content.image ? '🖼️ foto + ' : ''}${preview(content.text)}` : '_belum diset_'}`,
                `⏱️ Jeda antar grup: *${cfg.delayMs} ms* (${core.fmtDuration(cfg.delayMs)})`,
                `🕒 Jarak auto: *${core.fmtDuration(cfg.intervalMs)}*`,
            ];
            if (cfg.auto && !core.isRunning(key)) lines.push(`⏭️ Putaran berikutnya: ${cfg.nextRun > Date.now() ? `${core.fmtDuration(cfg.nextRun - Date.now())} lagi` : 'sebentar lagi'}`);
            if (st?.running) lines.push('', `🚀 *Sedang jalan* (${st.mode}): ${st.done || 0}/${st.total} grup — ✅ ${st.sent} | ❌ ${st.failed}`);
            if (cfg.last) {
                const l = cfg.last;
                lines.push('', `📦 *Putaran terakhir* (${l.mode}, ${core.fmtDuration(Date.now() - l.at)} lalu)`, `✅ ${l.sent}/${l.total} terkirim | ❌ ${l.failed} gagal | 🔒 ${l.closed} tertutup | ⏱️ ${core.fmtDuration(l.durationMs)}${l.aborted ? `\n⚠️ ${l.aborted}` : ''}`);
            }
            return m.reply({ text: lines.join('\n') });
        }

        case 'stopjpm': {
            return m.reply({ text: core.requestStop(key) ? '🛑 JPM dihentikan. Laporan akan dikirim sebentar lagi.' : 'ℹ️ Tidak ada JPM yang sedang berjalan.' });
        }
    }
};

module.exports = handler;
