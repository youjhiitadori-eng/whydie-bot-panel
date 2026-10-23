const config = require('../config');
const { getImage, delay } = require('../utils/helper');
const settings = require('../utils/settings');
const data = require('../utils/menuData');

const bar = (pct) => {
    const n = Math.round(pct / 10);
    return '█'.repeat(n) + '▒'.repeat(10 - n) + pct + '%';
};

// Animasi loading: SATU pesan yang di-edit (10% -> 100%) + reaksi ⏳ lalu ✅
async function runLoading(m) {
    const { Nayla, sender, msg } = m;
    const head = `${data.italic('Wait iya kak')} 😚`;
    const steps = [10, 30, 50, 80, 100];
    try { await m.react('⏳'); } catch { }
    let sent;
    try {
        sent = await Nayla.sendMessage(sender, { text: `${head}\n${bar(steps[0])}` }, { quoted: msg });
    } catch { return; }
    for (const pct of steps.slice(1)) {
        await delay(600);
        try { await Nayla.sendMessage(sender, { text: `${head}\n${bar(pct)}`, edit: sent.key }); } catch { }
    }
    try { await m.react('✅'); } catch { }
}

// Catatan: loader membaca command dari tulisan "case" di file ini.
// Kategori baru = tambah di menuData.js (CATEGORIES) + tambah 1 case di bawah.
const handler = async (m) => {
    const { command, sender, mentionJid } = m;

    // MODE JUALAN (Nokos): menu hanya menampilkan toko. Owner tetap bisa buka menu bot lengkap lewat .allmenu / menu kategori.
    if (settings.isNokosMode() && (command.name === 'menu' || !m.isOwner)) {
        return require('./nokos').sendStoreMenu(m);
    }
    const tag = String(mentionJid || sender).split('@')[0].split(':')[0];
    // Di DM tombol native-flow sering tidak tampil di HP penerima -> default teks biasa (config.dmButtons)
    const buttonOn = settings.isButtonOn(sender) && (m.isGroup || config.dmButtons === true);
    const mention = { mentionedJid: [mentionJid || sender] };
    const ctx = { role: m.role, mode: global.botMode, number: m.senderNumber };

    // Tanpa tombol: foto + teks sebagai caption (kalau muat), kalau terlalu panjang teks biasa dengan foto kecil
    const sendPlain = async (text) => {
        const body = `${text}\n\n${config.footerTxt}`;
        const img = getImage();
        if (img && body.length <= 1000) {
            try {
                return await m.Nayla.sendMessage(sender, { image: img, caption: body, contextInfo: mention }, { quoted: m.msg });
            } catch { /* lanjut ke teks biasa */ }
        }
        return m.reply({ text: body, contextInfo: mention });
    };

    // Dengan tombol + foto. main=true -> gaya menu utama; selain itu quote pesan user, tanpa label "diteruskan".
    const sendWithButtons = async (text, buttons, main) => {
        try {
            return await m.sendInteractiveWithImage({
                text, footer: config.footerTxt, buttons, imageSource: getImage(),
                quoted: main ? m.fakeOrder : m.msg,
                contextInfo: main ? { ...mention, forwardingScore: 999, isForwarded: true } : { ...mention },
            });
        } catch (e) {
            console.error('[MENU] gagal kirim menu dengan tombol:', e.message);
            return sendPlain(text);
        }
    };

    // Menu kategori / all menu = satu pesan, foto + tombol PILIH MENU
    const sendMenu = (text) => buttonOn ? sendWithButtons(text, data.categoryButtons(), false) : sendPlain(text);

    switch (command.name) {
        case 'menu': {
            if (config.menuLoading !== false) await runLoading(m);
            const text = data.mainMenuText(tag, buttonOn, ctx);
            if (!buttonOn) return sendPlain(text);
            return sendWithButtons(text, data.mainButtons(), true);
        }

        case 'allmenu': {
            return sendMenu(data.allMenuText(tag, ctx));
        }

        // Daftar menu boleh dilihat semua orang; command di dalamnya dikunci owner (config.ownerOnlyCommands)
        case 'ownermenu': {
            return sendMenu(data.categoryText(data.CATEGORIES.find(c => c.id === 'owner'), ctx));
        }

        case 'downloadmenu': {
            return sendMenu(data.categoryText(data.CATEGORIES.find(c => c.id === 'download'), ctx));
        }

        case 'grupmenu':
        case 'groupmenu': {
            return sendMenu(data.categoryText(data.CATEGORIES.find(c => c.id === 'group'), ctx));
        }

        // 'setmenu' = nama lama, tetap dibalas supaya tombol lama tidak mati
        case 'setormenu':
        case 'setmenu': {
            return sendMenu(data.categoryText(data.CATEGORIES.find(c => c.id === 'jpm'), ctx));
        }

        case 'nokosmenu': {
            return sendMenu(data.categoryText(data.CATEGORIES.find(c => c.id === 'nokos'), ctx));
        }

        case 'storemenu': {
            return sendMenu(data.categoryText(data.CATEGORIES.find(c => c.id === 'store'), ctx));
        }

        case 'aimenu': {
            return sendMenu(data.categoryText(data.CATEGORIES.find(c => c.id === 'ai'), ctx));
        }

        case 'funmenu': {
            return sendMenu(data.categoryText(data.CATEGORIES.find(c => c.id === 'fun'), ctx));
        }

        case 'gamemenu': {
            return sendMenu(data.categoryText(data.CATEGORIES.find(c => c.id === 'game'), ctx));
        }

        case 'canvamenu':
        case 'canvasmenu': {
            return sendMenu(data.categoryText(data.CATEGORIES.find(c => c.id === 'canva'), ctx));
        }

        case 'donghivemenu':
        case 'dhmenu': {
            return sendMenu(data.categoryText(data.CATEGORIES.find(c => c.id === 'donghive'), ctx));
        }

        case 'infomenu': {
            return sendMenu(data.categoryText(data.CATEGORIES.find(c => c.id === 'info'), ctx));
        }

        case 'komikmenu': {
            return sendMenu(data.categoryText(data.CATEGORIES.find(c => c.id === 'komik'), ctx));
        }

        case 'makermenu': {
            return sendMenu(data.categoryText(data.CATEGORIES.find(c => c.id === 'maker'), ctx));
        }

        case 'searchmenu': {
            return sendMenu(data.categoryText(data.CATEGORIES.find(c => c.id === 'search'), ctx));
        }

        case 'stalkermenu': {
            return sendMenu(data.categoryText(data.CATEGORIES.find(c => c.id === 'stalker'), ctx));
        }

        // TOOLS MENU = kategori baru (fitur API). Menu kontrol owner tetap di .ownermenu
        case 'toolsmenu': {
            return sendMenu(data.categoryText(data.CATEGORIES.find(c => c.id === 'tools'), ctx));
        }

        case 'aiimagemenu': {
            return sendMenu(data.categoryText(data.CATEGORIES.find(c => c.id === 'aiimage'), ctx));
        }
    }
};

module.exports = handler;
