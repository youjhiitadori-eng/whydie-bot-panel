// Status game per chat: satu soal aktif per chat/grup. Jawaban = pesan biasa (tanpa prefix) yang sama dengan kunci jawaban.
const config = require('../config');

const TIME_MS = 60 * 1000;
const games = new Map(); // chatJid -> game

const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function distance(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 2;
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return dp[a.length][b.length];
}

// "Alpukat" -> "A _ _ _ k _ t" (huruf pertama tiap kata + tiap huruf ke-3)
function mask(answer) {
    return String(answer).split('').map((ch, i, arr) => {
        if (!/[A-Za-z0-9]/.test(ch)) return ch === ' ' ? '  ' : ch;
        const first = i === 0 || !/[A-Za-z0-9]/.test(arr[i - 1]);
        return first || i % 3 === 2 ? ch : '_';
    }).join(' ');
}

const has = (chat) => games.has(chat);
const get = (chat) => games.get(chat) || null;

function finish(chat) {
    const g = games.get(chat);
    if (g) { clearTimeout(g.timer); games.delete(chat); }
    return g;
}

const revealText = (g) => `✅ Jawaban: *${g.answers[0]}*${g.reveal ? `\n💬 ${g.reveal}` : ''}`;

/** Mulai game baru. info: { command, title, question, image, answers, clue, reveal, extra } */
async function start(Nayla, chat, msg, info) {
    const p = config.prefix;
    const caption = [
        `🎮 *${info.title.toUpperCase()}*`, '',
        info.question,
        ...(info.extra ? ['', info.extra] : []),
        '',
        `⏱️ Waktu ${TIME_MS / 1000} detik • Ketik jawabanmu langsung di chat`,
        `💡 ${p}hint  •  🏳️ ${p}nyerah`,
    ].join('\n');

    const g = { ...info, startedAt: Date.now(), hinted: 0 };
    games.set(chat, g);
    g.timer = setTimeout(async () => {
        if (games.get(chat) !== g) return;
        games.delete(chat);
        try { await Nayla.sendMessage(chat, { text: `⏰ *Waktu habis!*\n${revealText(g)}\n\nMain lagi: ${p}${g.command}` }, { quoted: msg }); } catch { /* abaikan */ }
    }, TIME_MS);
    g.timer.unref?.();

    try {
        if (info.image) {
            try { return await Nayla.sendMessage(chat, { image: { url: info.image }, caption }, { quoted: msg }); }
            catch { /* gambar gagal dimuat -> kirim teks */ }
        }
        return await Nayla.sendMessage(chat, { text: caption }, { quoted: msg });
    } catch (e) {
        finish(chat);
        throw e;
    }
}

/** Cek pesan biasa sebagai jawaban. true kalau benar (pesan sudah dibalas). */
async function tryAnswer(Nayla, chat, msg, text) {
    const g = games.get(chat);
    if (!g) return false;
    const guess = norm(text);
    if (!guess || guess.length > 80) return false;
    const keys = g.answers.map(norm).filter(Boolean);

    if (keys.includes(guess)) {
        finish(chat);
        const who = msg.key.participant || msg.key.remoteJid;
        const secs = ((Date.now() - g.startedAt) / 1000).toFixed(1);
        await Nayla.sendMessage(chat, {
            text: `🎉 *BENAR!* @${String(who).split('@')[0].split(':')[0]}\n${revealText(g)}\n⚡ Dijawab dalam ${secs} detik\n\nMain lagi: ${config.prefix}${g.command}`,
            contextInfo: { mentionedJid: [who] },
        }, { quoted: msg });
        return true;
    }
    // hampir benar -> cukup react, tidak membocorkan jawaban
    if (keys.some(k => k.length >= 5 && distance(k, guess) === 1)) {
        try { await Nayla.sendMessage(chat, { react: { text: '🤏', key: msg.key } }); } catch { /* abaikan */ }
    }
    return false;
}

function hint(chat) {
    const g = games.get(chat);
    if (!g) return null;
    g.hinted++;
    const lines = [];
    if (g.clue && g.hinted === 1) lines.push(`💡 ${g.clue}`);
    lines.push(`🔎 Petunjuk: \`${mask(g.answers[0])}\``, `📏 ${norm(g.answers[0]).length} huruf`);
    return lines.join('\n');
}

function giveUp(chat) {
    const g = finish(chat);
    return g ? `🏳️ Yah menyerah.\n${revealText(g)}\n\nMain lagi: ${config.prefix}${g.command}` : null;
}

module.exports = { start, tryAnswer, hint, giveUp, has, get, norm, mask, TIME_MS };
