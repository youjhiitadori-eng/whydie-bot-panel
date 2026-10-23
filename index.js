/*
Nayla AI
Powered By Welper ID
*/
// @hanzofc/baileys (Baileys 7) = ESM-only -> dimuat lewat shim di lib/baileys.js
const { loadBaileys } = require('./lib/baileys');
let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, delay, Browsers;
const P = require('pino');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

const chalk = require('chalk');
const figlet = require('figlet');
const Spinnies = require('spinnies');

const config = require('./src/config.js');
const pairing = require('./src/utils/pairing');
let plugins; // di-require setelah Baileys termuat
const logger = P({ level: 'silent' });

const _origConsoleLog = console.log;
console.log = function (...args) {
    const str = args[0];
    if (str && typeof str === 'string' && str.startsWith('Closing session')) return;
    if (str && typeof str === 'object' && str?._chains !== undefined) return;
    _origConsoleLog.apply(console, args);
};
const spinnies = new Spinnies({
    color: "magenta",
    succeedColor: "green",
    spinner: {
        interval: 120,
        frames: [
            "M", "Me", "Men", "Menu", "Menun", "Menung", "Menungg", "Menunggu ",
            "Menunggu P", "Menunggu Pes", "Menunggu Pesa", "Menunggu Pesan",
            "Menunggu Pesan.", "Menunggu Pesan..", "Menunggu Pesan...",
            "Menunggu Pesan..", "Menunggu Pesan.", "Menunggu Pesan",
            "Menunggu Pesa", "Menunggu Pes", "Menunggu Pe", "Menunggu P",
            "Menunggu", "Menungg", "Menung", "Menun", "Menu", "Men", "Me", "M"
        ]
    }
});

function question(query) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans); }));
}

const PINK = chalk.hex('#ff69b4');

function printBanner() {
    console.clear();
    console.log(
        PINK(
            figlet.textSync(config.botName, {
                font: "Standard",
                horizontalLayout: "default",
                verticalLayout: "default",
                width: 80,
                whitespaceBreak: false,
            })
        )
    );
    console.log(PINK("================================================="));
    console.log(PINK(` • Bot   : ${config.botName}`));
    console.log(PINK(` • Owner : ${config.ownerName}`));
    console.log(PINK("================================================="));
    console.log(chalk.yellow("INFO:"), chalk.green("Jika code pairing tidak muncul tekan enter 1-2x lagi\n"));
}


let phoneNumber = null;
let isFirstConnect = true;

async function startBot(authFolder = config.authFolder) {
    const isMain = true;
    if (isFirstConnect && isMain) {
        printBanner();
        isFirstConnect = false;
    }

    const { state, saveCreds } = await useMultiFileAuthState(authFolder);

    let version;
    try {
        ({ version } = await fetchLatestBaileysVersion());
    } catch {
        version = [2, 3000, 1015901307];
    }

    const Nayla = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: state,
        browser: Browsers?.macOS?.('Chrome') || ['Mac OS', 'Chrome', '14.4.1'],
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 120000,
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 5,
    });

    const instanceKey = path.basename(authFolder);

    Nayla.ev.on('creds.update', saveCreds);

    const messageHandler = require('./src/handlers/messageHandler');
    Nayla.ev.on('messages.upsert', (m) => {
        Promise.resolve(messageHandler(Nayla, m, isMain)).catch((e) => console.error(chalk.red('[HANDLER-ERROR]:'), e?.message || e));
    });

    // Welcome & Goodbye member grup (aktif per grup lewat .welcome / .goodbye)
    require('./src/handlers/groupHandler').attach(Nayla);

    let pairingReady = null;
    let pairingReadyResolve = null;

    if (!Nayla.authState.creds.registered && isMain) {
        pairingReady = new Promise(resolve => { pairingReadyResolve = resolve; });
    }

    Nayla.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (connection === 'connecting' && pairingReadyResolve) {
            setTimeout(() => {
                if (pairingReadyResolve) {
                    const fn = pairingReadyResolve;
                    pairingReadyResolve = null;
                    fn();
                }
            }, 5000);
        }

        if (connection === 'close') {
            if (isMain) {
                try { spinnies.remove("waiting"); } catch (e) { }
            }

            // Tidak pakai `instanceof Boom` (beda versi @hapi/boom antara bot & Baileys 7)
            const statusCode = lastDisconnect?.error?.output?.statusCode ?? null;

            if (statusCode === DisconnectReason.loggedOut) {
                console.log(chalk.red(`\n[!] Sesi ${instanceKey} keluar/logged out.`));
                if (isMain && config.managed) {
                    // Mode website: perangkat sudah dikeluarkan dari WhatsApp -> sesi tidak berguna lagi. Hapus supaya bisa pairing ulang.
                    try { fs.rmSync(authFolder, { recursive: true, force: true }); } catch (e) { }
                    pairing.error('Perangkat dikeluarkan dari WhatsApp. Tekan "Reset & pairing ulang" di website untuk memasang lagi.', config.botNumber);
                }
                if (isMain) process.exit(0);
                try { fs.rmSync(authFolder, { recursive: true, force: true }); } catch (e) { }
                return;
            }

            const isNormalRestart = statusCode === 515 || statusCode === 408;

            if (isMain && !Nayla.authState.creds.registered) {
                console.log(chalk.red(`\n[!] Koneksi terputus (${statusCode}) saat proses pairing belum selesai.`));
                console.log(chalk.yellow('[!] Silakan jalankan ulang "npm start" secara manual dan coba pairing lagi.'));
                pairing.expired(phoneNumber || config.botNumber);
                process.exit(1);
            }

            if (!isNormalRestart && isMain) {
                console.log(chalk.yellow(`[!] Koneksi utama terputus (${statusCode}), mencoba menghubungkan kembali...`));
            }

            await delay(3000);
            startBot(authFolder);

        } else if (connection === 'open') {
            const name = Nayla.user?.name || Nayla.user?.id?.split(':')[0] || 'Unknown';

            if (isMain) {
                pairing.connected(String(Nayla.user?.id || '').split(':')[0].split('@')[0] || config.botNumber);
                console.log(chalk.green(`\nSTATUS: Bot Utama Berhasil Terhubung!`));
                console.log(chalk.white(` • ID/No   : ${name}`));
                console.log(chalk.white(` • Prefix  : ${config.prefix}`));
                console.log(chalk.white(` • Commands: ${plugins.commandList().length} fitur aktif`));
                
                try { spinnies.remove("waiting"); } catch (e) { }
                spinnies.add("waiting", { text: "." });

                messageHandler.resolveOwnerLids(Nayla).catch(() => { });

                // Toko Nokos: poller OTP otomatis memakai koneksi ini (aman walau mode jualan mati)
                try { require('./src/utils/nokosCore').attach(Nayla); } catch (e) { console.log(chalk.yellow('[NOKOS] poller gagal aktif: ' + e.message)); }

                if (config.channelId) {
                    try {
                        await Nayla.newsletterFollow(config.channelId);
                    } catch (e) { }
                }
            }
        }
    });

    // Sudah terpasang: buang sisa kode pairing lama supaya website tidak menampilkan kode basi.
    if (Nayla.authState.creds.registered) pairing.clear();

    if (!Nayla.authState.creds.registered) {
        if (isMain) {
            if (!phoneNumber && config.managed) {
                // Mode website: nomor bot datang dari ../config/bot.json, tidak ada terminal untuk diisi.
                phoneNumber = config.botNumber;
                if (!phoneNumber.match(/^\d{10,15}$/)) {
                    pairing.error('Nomor bot belum diatur / tidak valid. Perbaiki nomor bot di website lalu minta kode pairing.', phoneNumber);
                    console.log(chalk.red('❌ Nomor bot dari website tidak valid. Aplikasi dihentikan.'));
                    process.exit(1);
                }
                pairing.starting(phoneNumber);
            }
            if (!phoneNumber) {
                console.log(chalk.cyan('=== WHATSAPP BOT PAIRING ==='));
                console.log(chalk.white('Format nomor gunakan kode negara, contoh: 6212345xxxxx\n'));

                const input = await question(chalk.green('📱 Masukkan Nomor WhatsApp: '));
                phoneNumber = input.replace(/\D/g, '');

                if (!phoneNumber.match(/^\d{10,15}$/)) {
                    console.log(chalk.red('❌ Nomor tidak valid! Aplikasi dihentikan.'));
                    process.exit(1);
                }
            }

            console.log(chalk.gray('⏳ Menunggu koneksi ke server WhatsApp...'));
            await pairingReady;

            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const pairingCode = await Nayla.requestPairingCode(phoneNumber);
                    const formattedCode = pairingCode.match(/.{1,4}/g)?.join('-') || pairingCode;
                    pairing.code(phoneNumber, formattedCode, attempt);
                    console.log(chalk.magenta(`\n[➔] PAIRING CODE ANDA: `) + chalk.white.bold(formattedCode));
                    console.log(chalk.gray('Silakan masukkan kode di atas pada menu: Linked Devices -> Link with phone number\n'));
                    break;
                } catch (err) {
                    console.log(chalk.yellow(`[!] Percobaan ${attempt}/3 gagal: ${err.message}`));
                    if (attempt >= 3) {
                        console.log(chalk.red('❌ Gagal generate pairing code setelah 3 percobaan.'));
                        pairing.error(`Gagal meminta kode pairing: ${err.message}`, phoneNumber);
                        process.exit(1);
                    }
                    await delay(5000);
                }
            }
        }
    }

    return Nayla;
}

process.on('uncaughtException', (err) => console.error(chalk.red('[Error Uncaught]:'), err.message));
process.on('unhandledRejection', (reason) => console.error(chalk.red('[Error Rejection]:'), reason));

async function main() {
    const baileys = await loadBaileys();
    makeWASocket = baileys.default || baileys.makeWASocket;
    ({ useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, delay, Browsers } = baileys);

    plugins = require('./src/utils/PluginLoader');
    plugins.init();

    await startBot();
}

main().catch((err) => {
    console.error(chalk.red('[Fatal Error]:'), err);
    process.exit(1);
});