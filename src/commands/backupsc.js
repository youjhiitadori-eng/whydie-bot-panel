// .backup  (OWNER ONLY) -> backup source code bot (zip) dikirim ke chat pribadi owner dengan nomor bot ini.
//   Nama lama (.bakucp .backupsc .bakusc) dan ".backup fix" tetap jalan.
// Zip dibuat langsung oleh Node.js (tanpa program zip/tar), jadi jalan di panel/VPS/Windows mana pun.
// Tidak ikut: node_modules, .git, folder backup, dan SESI LOGIN (src/database/session) demi keamanan.
//
// Perbaikan "ENOSPC: no space left on device":
//   - zip & file sementara WhatsApp ditaruh di folder bot (backup/_tmp), BUKAN di /tmp sistem yang sering penuh
//   - file dikirim lewat stream (tidak dimuat utuh ke RAM)
//   - file sisa backup lama dibersihkan otomatis; kalau disk masih sempit, backup otomatis lama ikut dihapus
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { formatBytes } = require('../utils/helper');
const { zipDir } = require('../utils/zipDir');

const ROOT = path.join(__dirname, '..', '..');
const WORK = path.join(ROOT, 'backup', '_tmp');
const SKIP_DIRS = new Set(['node_modules', '.git', 'backup']);
const SKIP_PATHS = new Set(['src/database/session']);

function skip(rel, isDir) {
    const base = rel.split('/').pop();
    if (isDir) return SKIP_DIRS.has(base) || SKIP_PATHS.has(rel);
    return /\.(log|tmp)$/i.test(base);
}

const stamp = () => {
    const d = new Date(Date.now() + 7 * 3600 * 1000); // WIB
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
};

const isNoSpace = (e) => e?.code === 'ENOSPC' || /ENOSPC|no space left/i.test(String(e?.message || e));

/** Sisa ruang disk (byte) di folder tertentu. null kalau tidak bisa dicek. */
function freeBytes(dir) {
    try { const s = fs.statfsSync(dir); return Number(s.bavail) * Number(s.bsize); } catch { return null; }
}

/** Ukuran total file yang akan dimasukkan ke zip (perkiraan, sebelum kompres). */
function sourceSize(dir, rel = '') {
    let total = 0;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
    for (const e of entries) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) { if (!skip(r, true)) total += sourceSize(path.join(dir, e.name), r); }
        else if (e.isFile() && !skip(r, false)) { try { total += fs.statSync(path.join(dir, e.name)).size; } catch { /* lewati */ } }
    }
    return total;
}

/** Hapus sisa zip/enkripsi lama. hard=true -> hapus juga backup otomatis lama di ./backup (sisakan 1 terbaru). */
function cleanup(hard) {
    let freed = 0;
    const rm = (p) => { try { freed += fs.statSync(p).size; fs.rmSync(p, { recursive: true, force: true }); } catch { /* abaikan */ } };
    try { for (const f of fs.readdirSync(WORK)) rm(path.join(WORK, f)); } catch { /* folder belum ada */ }
    if (hard) {
        try {
            const dir = path.join(ROOT, 'backup');
            const olds = fs.readdirSync(dir).filter(f => f.startsWith('backup-'))
                .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t).slice(1);
            for (const { f } of olds) rm(path.join(dir, f));
        } catch { /* abaikan */ }
    }
    return freed;
}

function ensureWork() {
    try { fs.mkdirSync(WORK, { recursive: true }); fs.accessSync(WORK, fs.constants.W_OK); return WORK; } catch { /* pakai cadangan */ }
    for (const dir of [path.join(ROOT, 'src', 'database'), ROOT]) {
        try { fs.accessSync(dir, fs.constants.W_OK); return dir; } catch { /* coba berikutnya */ }
    }
    return ROOT;
}

// Baileys menulis file enkripsi sementara ke os.tmpdir(); arahkan ke folder kerja kita selama proses kirim.
async function withTmpDir(dir, fn) {
    const keys = ['TMPDIR', 'TMP', 'TEMP'];
    const old = Object.fromEntries(keys.map(k => [k, process.env[k]]));
    for (const k of keys) process.env[k] = dir;
    try { return await fn(); }
    finally { for (const k of keys) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }
}

const handler = async (m) => {
    if (!m.isOwner) return m.reply({ text: '🚫 Fitur ini *khusus Owner*.' });

    // Selalu ke chat pribadi owner (kalau dipanggil dari grup, tetap dikirim ke DM)
    const target = m.isGroup ? `${m.senderNumber}@s.whatsapp.net` : m.sender;

    await m.react('⏳');
    cleanup(false);
    const dir = ensureWork();
    const name = `${String(config.botName || 'bot').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-sc-${stamp()}.zip`;
    const file = path.join(dir, name);
    let step = 'membuat zip';

    const build = () => {
        const { files } = zipDir(ROOT, file, { skip });
        return { files, size: fs.statSync(file).size };
    };
    const send = (info) => withTmpDir(dir, () => m.Nayla.sendMessage(target, {
        document: { url: file },
        mimetype: 'application/zip',
        fileName: name,
        caption: `📦 *Backup SC ${config.botName}*\n📁 ${info.files} file • 💾 ${formatBytes(info.size)}\n🕒 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB\n\n⚠️ Berisi config & data toko. Jangan dibagikan ke orang lain.\n_Tanpa node_modules & sesi login._`,
    }));

    try {
        // Cek ruang disk dulu: zip + salinan enkripsi WhatsApp butuh sekitar 3x ukuran file
        const need = Math.ceil(sourceSize(ROOT) * 0.6) * 3 + 5 * 1024 * 1024;
        let free = freeBytes(dir);
        if (free !== null && free < need) { cleanup(true); free = freeBytes(dir); }
        if (free !== null && free < need) {
            throw new Error(`Disk server penuh. Sisa ${formatBytes(free)}, butuh sekitar ${formatBytes(need)}. Hapus file yang tidak terpakai (folder backup, log, cache) atau tambah storage panel.`);
        }

        let info;
        try { info = build(); }
        catch (e) { if (!isNoSpace(e)) throw e; cleanup(true); info = build(); }

        step = 'mengirim file';
        try { await send(info); }
        catch (e) {
            if (!isNoSpace(e)) throw e;
            cleanup(true);              // disk penuh saat kirim -> bersihkan, bangun ulang, coba sekali lagi
            step = 'membuat zip';
            info = build();
            step = 'mengirim file';
            await send(info);
        }

        if (m.isGroup) await m.reply({ text: '✅ Backup SC sudah dikirim ke *chat pribadi* kamu.' });
        await m.react('✅');
    } catch (e) {
        console.error(`[BACKUP] gagal saat ${step}:`, e);
        await m.react('❌');
        const msg = isNoSpace(e)
            ? 'Disk server penuh (ENOSPC). Hapus file yang tidak terpakai atau tambah storage panel, lalu coba lagi.'
            : String(e?.message || e).slice(0, 200);
        await m.reply({ text: `❌ Backup gagal saat *${step}*.\nPenyebab: ${msg}${m.isGroup && step === 'mengirim file' && !isNoSpace(e) ? '\n\nCatatan: chat pribadimu dengan bot harus sudah pernah dibuka (kirim "halo" ke bot dulu).' : ''}` });
    } finally {
        fs.promises.unlink(file).catch(() => { });
        cleanup(false);
    }
};

// 'backup' = nama utama (".backup fix" juga jalan). Nama lama tetap ada supaya tidak ada yang mati.
handler.commands = ['backup', 'bakucp', 'backupsc', 'bakusc'];

module.exports = handler;
