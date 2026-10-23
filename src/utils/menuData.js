// Data & pembuat teks menu. Kategori baru: tambah di CATEGORIES + 1 case di src/commands/menu.js
const config = require('../config');
const settings = require('./settings');
const { formatUptime } = require('./helper');
const { IMAGE_FEATURES, TEXT_FEATURES } = require('./aiImageList');
const { DOWNLOAD_COMMANDS } = require('./downloadList');
const { CANVAS_COMMANDS } = require('./canvasList');
const { AI_COMMANDS } = require('./aiList');
const { FUN_COMMANDS, FEATURES: FUN_FEATURES } = require('./funList');
const { GAME_COMMANDS } = require('./gameList');
const storeList = require('./storeList');
const limits = require('./limits');
const { GROUPS: API_GROUPS, FEATURES: API_FEATURES, groupCommands } = require('./apiList');

// Huruf biasa -> italic sans-serif (𝘈𝘣𝘤) seperti gaya menu
function italic(str) {
    return String(str).replace(/[A-Za-z]/g, (c) => {
        const code = c.charCodeAt(0);
        return String.fromCodePoint(code <= 90 ? 0x1D608 + (code - 65) : 0x1D622 + (code - 97));
    });
}

const p = () => config.prefix;
const style = () => (config.menuStyle === 'compact' ? 'compact' : 'full');

// Lebar maksimal satu baris daftar command saat mode compact.
const ROW_WIDTH = 34;

// Menu kategori API (info, komik, maker, search, stalker, tools): daftar diambil otomatis dari apiList.js
function apiCategory(group) {
    const g = API_GROUPS[group];
    return {
        id: group, title: g.title, cmd: g.cmd, desc: g.desc, compact: true,
        items: (st) => groupCommands(group).map(c => {
            if (st === 'compact') return p() + c;
            const need = API_FEATURES[c].params.filter(x => !x.optional && x.def === undefined && !x.self).map(x => `<${x.label}>`);
            return `${p()}${c}${need.length ? ' ' + need.join(' ') : ''}`;
        }),
    };
}

const CATEGORIES = [
    {
        id: 'owner', title: 'OWNER MENU', cmd: 'ownermenu', desc: 'Owner Only: fitur kontrol bot',
        ownerOnly: true,
        items: () => ['ping', 'runtime', 'owner', 'onbutton', 'offbutton', 'self', 'public', 'addprem', 'delprem', 'listprem', 'addlimit <no> <jml>', 'swgcall <teks>', 'autosw on/off',
            // Toko Nokos (admin): SELALU tampil di Owner Menu, tidak tergantung mode jualan
            'nokosinfo', 'nokosmode on/off', 'nokoslock on/off', 'addsaldo <no> <jml>', 'minsaldo <no> <jml>', 'listdepo', 'maintenance',
            'backup',
        ].map(c => p() + c),
    },
    {
        id: 'nokos', title: 'NOKOS STORE', cmd: 'nokosmenu', desc: 'Beli nomor OTP, saldo & deposit',
        items: () => ['nokos', 'beli', 'cari <app>', 'saldo', 'deposit <nominal>', 'cekdepo', 'riwayat', 'rules'].map(c => p() + c),
    },
    {
        // Fitur khusus owner, TERPISAH dari Nokos: command buatan sendiri (.addlist) ikut tampil di bawah daftar command
        id: 'store', title: 'STORE MENU', cmd: 'storemenu', desc: 'Owner Only: bikin command & list sendiri',
        ownerOnly: true,
        items: () => [
            'addlist <nama> <teks>', 'editlist <nama> <teks>', 'dellist <nama>', 'liststore',
            ...storeList.list().slice(0, 40).map(i => i.name),
        ].map(c => p() + c),
    },
    {
        id: 'aiimage', title: 'AI IMAGE MENU', cmd: 'aiimagemenu', desc: 'Edit & buat gambar pakai AI',
        compact: true,
        items: (st) => st === 'compact'
            ? IMAGE_FEATURES.map(c => p() + c)
            : [...IMAGE_FEATURES.map(c => p() + c), ...TEXT_FEATURES.map(c => `${p()}${c} <prompt>`)],
    },
    {
        id: 'download', title: 'DOWNLOAD MENU', cmd: 'downloadmenu', desc: 'Download video, musik & file',
        compact: true,
        items: () => DOWNLOAD_COMMANDS.map(c => p() + c),
    },
    {
        id: 'ai', title: 'AI MENU', cmd: 'aimenu', desc: 'Chat dengan berbagai AI (GPT, Gemini, dll)',
        compact: true,
        items: (st) => AI_COMMANDS.map(c => st === 'compact' ? p() + c : `${p()}${c} <teks>`),
    },
    {
        id: 'fun', title: 'FUN MENU', cmd: 'funmenu', desc: 'Cek khodam, pantun, quotes & hiburan',
        compact: true,
        items: (st) => FUN_COMMANDS.map(c => {
            const f = FUN_FEATURES[c];
            return st === 'compact' || !f.param ? p() + c : `${p()}${c} ${f.choices ? '<cewe/cowo>' : '<nama>'}`;
        }),
    },
    {
        id: 'game', title: 'GAME MENU', cmd: 'gamemenu', desc: 'Tebak-tebakan seru, jawab di chat',
        compact: true,
        items: () => [...GAME_COMMANDS, 'hint', 'nyerah'].map(c => p() + c),
    },
    {
        id: 'canva', title: 'CANVA MENU', cmd: 'canvamenu', desc: 'Bikin gambar fake chat, kartu & quotes',
        compact: true,
        items: () => CANVAS_COMMANDS.map(c => p() + c),
    },
    {
        id: 'donghive', title: 'DONGHIVE', cmd: 'donghivemenu', desc: 'Katalog, detail & episode donghua',
        items: () => [`${p()}donghive [halaman]`, `${p()}dhseries <no / link>`, `${p()}dhepisode <no / link> [stream]`],
    },
    apiCategory('info'),
    apiCategory('komik'),
    apiCategory('maker'),
    apiCategory('search'),
    apiCategory('stalker'),
    apiCategory('tools'),
    {
        id: 'jpm', title: 'SETOR MENU', cmd: 'setormenu', desc: 'Owner Only: JPM & auto JPM',
        ownerOnly: true,
        items: () => [`${p()}jpm <teks / foto>`, `${p()}setjpm <teks / foto>`, `${p()}setjedajpm <ms>`, `${p()}setwaktujpm <1jam>`, `${p()}autojpm on/off`, `${p()}statusjpm`, `${p()}stopjpm`],
    },
    {
        id: 'group', title: 'GRUP MENU', cmd: 'grupmenu', desc: 'Welcome, goodbye & admin grup',
        items: () => [`${p()}welcome on/off`, `${p()}goodbye on/off`, `${p()}setwelcome <teks>`, `${p()}setgoodbye <teks>`, `${p()}antilink on/off`, `${p()}antilink2 on/off`, `${p()}antiswgc on/off`, `${p()}open`, `${p()}close`, `${p()}kick @tag / reply`, `${p()}tagall <pesan>`, `${p()}hidetag <pesan>`, `${p()}swgc <teks / foto>`],
    },
];

/** ctx: { role: 'Owner'|'Premium'|'Warlok', mode: 'public'|'self', blank: true|false } */
function infoBox(ctx = {}) {
    const mode = (ctx.mode || global.botMode || config.botMode) === 'self' ? 'Self' : 'Public';
    const role = ctx.role || 'Warlok';
    return [
        `┏━━━━━━⏤͟͟͞͞ ${italic('INFO BOT')}━━━┅┉┄𖡅`,
        ...(ctx.blank ? [''] : []),
        `┃ ❏ ${italic('Owner')} : ${config.ownerName}`,
        `┃ ❏ ${italic('Name bot')} : ${config.botName}`,
        `┃ ❏ ${italic('Runtime')} : ${formatUptime(process.uptime())}`,
        `┃ ❏ ${italic('Status')} : ${italic(mode)}`,
        `┃ ❏ ${italic('Roles')} : ${italic(role)}`,
        `┃ ❏ ${italic('Limit')} : ${ctx.limit || limits.label(ctx.number, role)}`,
        `┃ ❏ ${italic('Website')} : ${config.website}`,
        `┃ ➥${italic('This Bot is premium or for sale')}`,
        '╰──━━━━━━━━━━━━━━━┅┉┄𖤛',
    ].join('\n');
}

function boxLines(title, rows) {
    return [`┏━━━━━━⏤͟͟͞͞ ${title}━━━┅┉┄`, ...rows, '╰──━━━━━━━━━━━━━━━┅┉┄𖤛'];
}

// Gabungkan command jadi baris padat: ┃ ❏ .a · .b · .c
function packRows(items) {
    const rows = [];
    let cur = '';
    for (const it of items) {
        if (!cur) { cur = it; continue; }
        if ((cur + ' · ' + it).length <= ROW_WIDTH) cur += ' · ' + it;
        else { rows.push(cur); cur = it; }
    }
    if (cur) rows.push(cur);
    return rows.map(r => `┃ ❏ ${r}`);
}

// Kotak kategori + catatan (tanpa INFO BOT)
function categoryBody(cat, st, pack) {
    const items = cat.items(st);
    const rows = pack ? packRows(items) : items.map(i => `┃ ❏ ${i}`);
    const lines = boxLines(cat.title, rows);
    return lines.join('\n');
}

function greeting(tag) {
    return `${italic('Ola')} 👋 @${tag}`;
}

function mainMenuText(tag, buttonOn, ctx = {}) {
    const note = buttonOn
        ? [
            '> ➥ Silahkan pilih menu di bawah ini',
            `> Tanpa button? ketik ${p()}offbutton lalu ${p()}allmenu`,
        ]
        : [
            `> ➥ Ketik ${p()}allmenu atau pilih kategori:`,
            `> ${CATEGORIES.map(c => p() + c.cmd).join(' ')}`,
        ];
    return [greeting(tag), '', infoBox({ ...ctx, blank: false }), ...note].join('\n');
}

/** Menu satu kategori = SATU pesan. */
function categoryText(cat, ctx = {}) {
    const st = style();
    if (st === 'full') return [infoBox({ ...ctx, blank: true }), categoryBody(cat, st, false)].join('\n');
    return categoryBody(cat, st, !!cat.compact);
}

/** All menu = SATU pesan. */
function allMenuText(tag, ctx = {}) {
    const st = style();
    if (st === 'full') {
        return [greeting(tag), '', infoBox({ ...ctx, blank: true }), ...CATEGORIES.map(c => categoryBody(c, st, false))].join('\n');
    }
    return greeting(tag) + '\n\n' + CATEGORIES.map(c => categoryBody(c, st, true)).join('\n');
}

// Tombol native flow. OWNER MENU tampil untuk semua orang dengan label "Owner Only" (yang bisa memakai cuma owner).
function selectButton() {
    return {
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
            title: 'PILIH MENU',
            sections: [
                {
                    title: 'Menu Lengkap',
                    highlight_label: 'Rekomendasi',
                    rows: [{
                        title: 'ALL MENU',
                        description: 'Semua fitur sekaligus',
                        highlight_label: 'Rekomendasi', id: p() + 'allmenu',
                    }],
                },
                {
                    title: 'Kategori',
                    rows: CATEGORIES.filter(c => !c.ownerOnly)
                        .map(c => ({ title: c.title, description: c.desc, id: p() + c.cmd })),
                },
                {
                    title: 'Owner Only Control',
                    highlight_label: 'Owner Only',
                    rows: CATEGORIES.filter(c => c.ownerOnly).map(c => ({
                        title: c.title, description: c.desc,
                        highlight_label: 'Owner Only', id: p() + c.cmd,
                    })),
                },
            ],
        }),
    };
}

function mainButtons() {
    return [
        selectButton(),
        { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Channel Welper ID', url: config.channelUrl }) },
    ];
}
function categoryButtons() {
    return [selectButton()];
}

module.exports = {
    italic, CATEGORIES, mainMenuText, categoryText, allMenuText, mainButtons, categoryButtons,
};
