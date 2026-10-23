// Penjadwal Auto JPM: kirim ke semua grup terbuka, tunggu SELESAI semua, lalu ulangi setelah interval.
// Dipasang per koneksi lewat groupHandler.attach (dipanggil index.js). Pengaturan per nomor bot.
const settings = require('../utils/settings');
const core = require('../utils/jpmCore');

const TICK_MS = 30 * 1000;
const attached = new WeakSet();

async function tick(Nayla) {
    try {
        if (!Nayla.user) return;                       // belum tersambung
        const key = core.botKey(Nayla);
        const cfg = core.getConfig(key);
        if (!cfg.auto || core.isRunning(key)) return;
        if (Date.now() < (cfg.nextRun || 0)) return;

        const content = core.loadContent(key);
        if (!content) return;

        // Kalau bot restart di tengah jalan, jadwal berikutnya tetap aman (interval dari sekarang)
        settings.setJpm(key, { nextRun: Date.now() + cfg.intervalMs });
        const st = await core.runBroadcast(Nayla, { content, delayMs: cfg.delayMs, mode: 'auto' });
        if (st.error) return;

        // Interval dihitung dari SELESAI kirim ke semua grup
        const fresh = core.getConfig(key);
        settings.setJpm(key, { nextRun: Date.now() + fresh.intervalMs });

        const to = fresh.reportTo || `${[].concat(require('../config').superOwner)[0]}@s.whatsapp.net`;
        await Nayla.sendMessage(to, { text: core.formatReport(st, 'AUTO JPM SELESAI') + `\n\n🔁 Kirim lagi: ${core.fmtDuration(fresh.intervalMs)} lagi.` }).catch(() => { });
    } catch (e) {
        console.error('[JPM] error scheduler:', e.message);
    }
}

function attach(Nayla) {
    if (attached.has(Nayla)) return;
    attached.add(Nayla);
    const timer = setInterval(() => tick(Nayla), TICK_MS);
    timer.unref?.();
    Nayla.ev.on('connection.update', (u) => { if (u?.connection === 'close') clearInterval(timer); });
}

module.exports = { attach, tick };
