// Auto backup folder database (sesi login + data bot) -> ./backup/*.tar.gz
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const chalk = require('chalk');
const config = require('../config');

const ROOT = path.join(__dirname, '..', '..');
const SOURCE = path.join(ROOT, 'src', 'database');

let timer = null;
let running = false;

function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function tarCreate(outFile) {
    return new Promise((resolve, reject) => {
        execFile('tar', ['-czf', outFile, '-C', path.join(ROOT, 'src'), 'database'], (err) => err ? reject(err) : resolve());
    });
}

async function copyFallback(outDir) {
    await fs.promises.cp(SOURCE, outDir, { recursive: true });
}

function prune(folder, keep) {
    const files = fs.readdirSync(folder)
        .filter(f => f.startsWith('backup-'))
        .map(f => ({ f, t: fs.statSync(path.join(folder, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
    for (const { f } of files.slice(keep)) {
        try { fs.rmSync(path.join(folder, f), { recursive: true, force: true }); } catch { }
    }
}

async function runBackup(sock) {
    const cfg = config.autoBackup || {};
    if (running || !fs.existsSync(SOURCE)) return null;
    running = true;
    try {
        const folder = path.resolve(ROOT, cfg.folder || './backup');
        fs.mkdirSync(folder, { recursive: true });
        const base = `backup-${stamp()}`;
        let result;
        try {
            result = path.join(folder, `${base}.tar.gz`);
            await tarCreate(result);
        } catch {
            result = path.join(folder, base);
            await copyFallback(result);
        }
        prune(folder, Math.max(1, cfg.keep || 5));
        console.log(chalk.hex('#ff69b4')(`[AUTO-BACKUP] Berhasil: ${path.basename(result)}`));

        if (cfg.sendToOwner && sock && result.endsWith('.tar.gz')) {
            const owner = String([].concat(config.superOwner)[0]).replace(/\D/g, '') + '@s.whatsapp.net';
            await sock.sendMessage(owner, {
                document: fs.readFileSync(result),
                mimetype: 'application/gzip',
                fileName: path.basename(result),
                caption: `Auto backup ${config.botName}`,
            }).catch(() => { });
        }
        return result;
    } catch (e) {
        console.log(chalk.red(`[AUTO-BACKUP] Gagal: ${e.message}`));
        return null;
    } finally {
        running = false;
    }
}

function start(sock) {
    const cfg = config.autoBackup || {};
    if (!cfg.enabled || timer) return;
    const ms = Math.max(0.1, cfg.intervalHours || 6) * 3600 * 1000;
    console.log(chalk.hex('#ff69b4')(`[AUTO-BACKUP] Aktif, tiap ${cfg.intervalHours || 6} jam, simpan ${cfg.keep || 5} backup`));
    if (cfg.runOnStart) runBackup(sock);
    timer = setInterval(() => runBackup(sock), ms);
    timer.unref?.();
}

module.exports = { start, runBackup };
