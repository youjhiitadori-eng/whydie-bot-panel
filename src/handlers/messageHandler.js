const fs = require('fs');
const config = require('../config');

const settings = require('../utils/settings');
const roles = require('../utils/roles');
if (global.botMode === undefined) global.botMode = settings.getMode() || config.botMode;
const plugins = require('../utils/PluginLoader');
const chalk = require('chalk');
const readline = require('readline');
const { getContentType } = require('../../lib/baileys');
const { sendButtons, sendListMessage, sendInteractiveMessage, sendButtonWithImage, sendInteractiveWithImage } = require('../utils/interactiveHelper');
const { fakeOrder } = require('../utils/fquoted');
const { withAd } = require('../utils/adReply');
const { guard } = require('./groupGuard');
const { onStatus } = require('./statusHandler');
const { STORE_COMMANDS } = require('../utils/nokosUi');
const storeList = require('../utils/storeList');
const gameState = require('../utils/gameState');

const superOwnerLidCache = new Set();
const coOwnerLidCache = new Set();

const COOLDOWN_MS = 5000;
const COOLDOWN_EXEMPT = new Set(['menu', 'allmenu', 'ownermenu', 'toolsmenu', 'downloadmenu', 'grupmenu', 'groupmenu', 'aiimagemenu', 'setormenu', 'setmenu', 'storemenu', 'aimenu', 'funmenu', 'gamemenu', 'hint', 'petunjuk', 'nyerah', 'skip', 'canvamenu', 'canvasmenu', 'infomenu', 'komikmenu', 'makermenu', 'searchmenu', 'stalkermenu', 'donghivemenu', 'dhmenu', 'onbutton', 'offbutton', 'ping',
    // toko Nokos: navigasi tombol tidak boleh kena cooldown
    'nokosmenu', 'nokos', 'nk', 'beli', 'cari', 'saldo', 'profil', 'deposit', 'cekdepo', 'riwayat', 'rules']);
const cooldownMap = new Map();


setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of cooldownMap) {
        if (now - timestamp > COOLDOWN_MS) cooldownMap.delete(key);
    }
}, 5 * 60 * 1000);

async function resolveOwnerLids(Nayla) {
    const resolveList = [
        { numbers: [].concat(config.superOwner), cache: superOwnerLidCache, label: 'SUPER' },
        { numbers: [].concat(config.coOwner || []), cache: coOwnerLidCache, label: 'CO' },
    ];
    for (const { numbers, cache, label } of resolveList) {
        for (const nomor of numbers.map(n => n.replace(/\D/g, ''))) {
            try {
                const [result] = await Nayla.onWhatsApp(nomor);
                if (result?.exists && result?.lid) {
                    const lidNum = result.lid.replace(/\D/g, '').replace(/@.+$/, '').split(':')[0];
                    cache.add(lidNum);
                    console.log(chalk.cyan(`[${label}-OWNER-LID] ${nomor} -> ${lidNum}@lid`));
                }
            } catch (e) {
                console.log(chalk.yellow(`[${label}-OWNER-LID] Gagal resolve ${nomor}: ${e.message}`));
            }
        }
    }
}

// Buka pembungkus pesan (chat dengan pesan sementara / view once / dokumen+caption).
// Tanpa ini, pesan dari chat disappearing dianggap kosong dan bot diam saja.
function unwrapMessage(message) {
    let m = message;
    for (let i = 0; i < 5 && m; i++) {
        const inner = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message
            || m.viewOnceMessageV2Extension?.message || m.documentWithCaptionMessage?.message;
        if (!inner) break;
        m = inner;
    }
    return m || null;
}

function extractMessageText(rawMessage) {
    const message = unwrapMessage(rawMessage);
    if (!message) return null;
    const type = getContentType(message);
    switch (type) {
        case 'conversation': return message.conversation;
        case 'extendedTextMessage': return message.extendedTextMessage?.text;
        case 'imageMessage': return message.imageMessage?.caption;
        case 'videoMessage': return message.videoMessage?.caption;
        case 'buttonsResponseMessage': return message.buttonsResponseMessage?.selectedButtonId;
        case 'listResponseMessage': return message.listResponseMessage?.singleSelectReply?.selectedRowId;
        case 'templateButtonReplyMessage': return message.templateButtonReplyMessage?.selectedId;
        case 'interactiveResponseMessage': {
            const paramsJson = message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
            if (paramsJson) {
                try {
                    const parsed = JSON.parse(paramsJson);
                    return parsed.id;
                } catch {
                    return null;
                }
            }
            return null;
        }
        default: return null;
    }
}

function isGroup(jid) { return jid.endsWith('@g.us'); }
function isFromMe(msg) { return msg.key.fromMe; }

function getSenderNumber(sender, msg) {
    const candidates = [
        msg?.key?.senderPn,
        msg?.key?.participantAlt,
        msg?.key?.remoteJidAlt,
        msg?.key?.participant,
        msg?.key?.remoteJid,
        sender,
    ];
    const raw = candidates.find(v => v && !v.endsWith('@lid')) || candidates.find(v => v) || '';
    return raw.replace(/\D/g, '').replace(/@.+$/, '').split(':')[0];
}

function isSuperOwner(sender, msg) {
    const superOwners = [].concat(config.superOwner).map(n => n.replace(/\D/g, ''));
    const senderNumber = getSenderNumber(sender, msg);
    const fromMe = msg?.key?.fromMe || false;
    return superOwners.some(n => n === senderNumber) || superOwnerLidCache.has(senderNumber) || fromMe;
}

function isCoOwner(sender, msg) {
    const coOwners = [].concat(config.coOwner || []).map(n => n.replace(/\D/g, ''));
    const senderNumber = getSenderNumber(sender, msg);
    return coOwners.some(n => n === senderNumber) || coOwnerLidCache.has(senderNumber);
}

function isOwner(sender, msg) {
    return isSuperOwner(sender, msg) || isCoOwner(sender, msg);
}

// Dibalas walau tanpa prefix, tapi hanya kalau SELURUH pesan = kata ini ("bot" / "sc"). Dengan prefix (.bot) tetap jalan.
const EXACT_NO_PREFIX = new Set(['bot', 'sc']);

function parseCommand(text) {
    const { prefix } = config;

    const bare = text.trim().toLowerCase();
    if (EXACT_NO_PREFIX.has(bare) && plugins.has(bare)) {
        return { name: bare, args: [], fullArgs: '', raw: text, hasPrefix: false };
    }

    if (text.startsWith(prefix)) {
        const args = text.slice(prefix.length).trim().split(/ +/);
        const name = args.shift().toLowerCase();
        return { name, args, fullArgs: args.join(' '), raw: text, hasPrefix: true };
    }

    const words = text.trim().split(/ +/);
    const name = words[0].toLowerCase();
    if ((config.noPrefixCommands || []).includes(name) && plugins.has(name)) {
        const args = words.slice(1);
        return { name, args, fullArgs: args.join(' '), raw: text, hasPrefix: false };
    }

    return null;
}

async function handleMessages(Nayla, m, isMain = true) {
    for (const msg of m.messages) {
        if (!msg.message) continue;

        // Status WhatsApp: auto lihat + react love (tidak diproses sebagai command)
        if (msg.key?.remoteJid === 'status@broadcast') {
            onStatus(Nayla, msg, m.type);
            continue;
        }

        const fromMe = isFromMe(msg);
        const sender = msg.key.remoteJid;

        const checkOwner = isOwner(sender, msg);
        const checkSuperOwner = isSuperOwner(sender, msg);
        const checkCoOwner = isCoOwner(sender, msg);
        const senderNum = getSenderNumber(sender, msg);
        const role = roles.getRole({ isOwner: checkOwner, senderNumber: senderNum });

        if (!fromMe && global.botMode === 'self' && !checkOwner) continue;

        // Anti Link / Anti Tag SW (hanya grup yang mengaktifkan; admin & owner dibebaskan)
        if (await guard(Nayla, msg, { isOwner: checkOwner, type: m.type })) continue;

        const text = extractMessageText(msg.message);
        if (!text) continue;

        if (!fromMe) {
            readline.clearLine(process.stdout, 0);
            readline.cursorTo(process.stdout, 0);

            console.log(
                chalk.blue(`[INBOUND] `) +
                chalk.cyan(sender) +
                chalk.white(`: ${text}`)
            );
        }

        if (config.autoRead) { try { await Nayla.readMessages([msg.key]); } catch { /* jangan gagalkan command */ } }
        if (config.autoTyping && !isGroup(sender)) { try { await Nayla.sendPresenceUpdate('composing', sender); } catch { } }

        const command = parseCommand(text);

        // GAME: pesan biasa (bukan command) dicek sebagai jawaban kalau ada soal aktif di chat ini
        if (!command && !fromMe && gameState.has(sender)) {
            try { if (await gameState.tryAnswer(Nayla, sender, msg, text)) continue; }
            catch (err) { console.error(chalk.red(`[GAME-ERROR] `) + chalk.red(err.message)); }
        }

        // Command buatan owner (.addlist): diketik dengan prefix, atau tanpa prefix (config.storeNoPrefix) kalau seluruh pesan = namanya.
        // Command bawaan bot selalu menang. Pesan yang dikirim bot sendiri diabaikan (cegah loop).
        let storeName = null;
        if (!storeList.isOwnMessage(msg.key.id)) {
            if (command) { if (!plugins.has(command.name)) storeName = storeList.lookup(command.name); }
            else if (config.storeNoPrefix !== false) storeName = storeList.lookup(text, true);
        }

        if (storeName) {
            // Isi entri = info toko, jadi tetap boleh dilihat user biasa walau kunci toko aktif. Cooldown berlaku untuk non-owner.
            const key = `${sender}:store:${storeName}`;
            if (checkOwner || Date.now() - (cooldownMap.get(key) || 0) >= COOLDOWN_MS) {
                cooldownMap.set(key, Date.now());
                console.log(chalk.green(`[STORE] `) + chalk.yellow(storeName));
                try { await storeList.sendEntry(Nayla, sender, msg, storeName); }
                catch (err) { console.error(chalk.red(`[STORE-ERROR] `) + chalk.yellow(`[${storeName}]: `) + chalk.red(err.message)); }
            }
        } else if (command) {
            // Kunci toko: saat mode jualan + lock aktif, user biasa di chat pribadi hanya boleh memakai fitur toko (diam saja untuk yang lain)
            if (!checkOwner && !isGroup(sender) && settings.isNokosMode() && settings.isNokosLock() && !STORE_COMMANDS.has(command.name)) continue;

            const handler = plugins.get(command.name);

            if (handler) {
                // Command khusus owner: user lain tidak bisa pakai sama sekali
                if ((config.ownerOnlyCommands || []).includes(command.name) && !checkOwner) {
                    await Nayla.sendMessage(sender, withAd({ text: '🚫 Fitur ini *khusus Owner*.' }), { quoted: msg });
                    continue;
                }

                if ((config.premiumCommands || []).includes(command.name) && role === 'Warlok') {
                    await Nayla.sendMessage(sender, withAd({ text: `🔒 Command *${command.name}* khusus *Premium*.\nHubungi owner (${config.ownerName}) untuk upgrade.` }), { quoted: msg });
                    continue;
                }

                if (!checkSuperOwner && !checkOwner && !COOLDOWN_EXEMPT.has(command.name)) {
                    const cooldownKey = `${sender}:${command.name}`;
                    const lastUsed = cooldownMap.get(cooldownKey) || 0;
                    const remaining = COOLDOWN_MS - (Date.now() - lastUsed);

                    if (remaining > 0) {
                        await Nayla.sendMessage(sender, withAd({
                            text: `⏳ Sabar dulu! Tunggu *${(remaining / 1000).toFixed(1)} detik* lagi sebelum pakai command ini.`
                        }), { quoted: msg });
                        continue;
                    }

                    cooldownMap.set(cooldownKey, Date.now());
                }

                const cmdArgs = command.args.length ? ' ' + command.args.join(' ') : '';

                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);

                console.log(
                    chalk.green(`[EXECUTE] `) +
                    chalk.yellow(`${command.name}${cmdArgs}`)
                );

                try {
                    await handler({
                        Nayla, msg, sender,
                        senderNumber: getSenderNumber(sender, msg),
                        pushname: msg.pushName || 'Kak',
                        mentionJid: msg.key.participant || sender,
                        role, isPremium: role !== 'Warlok',
                        isGroup: isGroup(sender),
                        isOwner: checkOwner,
                        isSuperOwner: checkSuperOwner,
                        isCoOwner: checkCoOwner,
                        command, text,
                        fakeOrder,
                        isMain,
                        reply: (content) => Nayla.sendMessage(sender, withAd(content), { quoted: msg }),
                        replyFake: (content) => Nayla.sendMessage(sender, content, { quoted: fakeOrder }),
                        send: (content) => Nayla.sendMessage(sender, content),
                        sendButtons: (content) => sendButtons(Nayla, sender, content),
                        sendList: (content) => sendListMessage(Nayla, sender, content),
                        sendInteractive: (content) => sendInteractiveMessage(Nayla, sender, content),
                        sendButtonWithImage: (content) => sendButtonWithImage(Nayla, sender, content),
                        sendInteractiveWithImage: (content) => sendInteractiveWithImage(Nayla, sender, content),
                        react: (emoji) => Nayla.sendMessage(sender, { react: { text: emoji, key: msg.key } }),
                    });
                } catch (err) {
                    readline.clearLine(process.stdout, 0);
                    readline.cursorTo(process.stdout, 0);

                    console.error(
                        chalk.red(`[RUN-ERROR] `) +
                        chalk.yellow(`[${command.name}]: `) +
                        chalk.red(err.message)
                    );
                    await Nayla.sendMessage(sender, withAd({ text: '❌ Terjadi kesalahan saat menjalankan perintah.' }), { quoted: msg });
                }
            } else {
                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);

                console.log(
                    chalk.magenta(`[NOT-FOUND] `) +
                    chalk.white(`Command `) +
                    chalk.yellow(`*${command.name}*`) +
                    chalk.white(` tidak terdaftar.`)
                );
                await Nayla.sendMessage(sender, withAd({ text: `❓ Command *${command.name}* tidak ditemukan.` }), { quoted: msg });
            }
        }

        if (config.autoTyping && !isGroup(sender)) { try { await Nayla.sendPresenceUpdate('paused', sender); } catch { } }
    }
}

module.exports = handleMessages;
module.exports.resolveOwnerLids = resolveOwnerLids;
