// Tes kategori API (INFO/KOMIK/MAKER/SEARCH/STALKER/TOOLS): node tests/apitools.test.js
// Tanpa jaringan / WhatsApp: fetch & Nayla dipalsukan.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// mediaHelper butuh Baileys yang belum dimuat di tes -> diganti tiruan (foto kiriman user diatur lewat fake.media)
const fake = { media: null };
const mhPath = require.resolve('../src/utils/mediaHelper', { paths: [__dirname] });
require.cache[mhPath] = { id: mhPath, filename: mhPath, loaded: true, exports: { getImageBuffer: async () => fake.media, getQuotedText: () => '' } };

const sharp = require('sharp');
const config = require('../src/config');
const { FEATURES, GROUPS, COMMANDS } = require('../src/utils/apiList');
const handler = require('../src/commands/apitools');
const menuData = require('../src/utils/menuData');

const calls = [];
let reply = null;
global.fetch = async (url) => {
    calls.push(String(url));
    const r = reply(String(url));
    return new Response(r.body, { status: r.status || 200, headers: r.headers || { 'content-type': 'application/json' } });
};

function fakeM(name, fullArgs = '') {
    const sent = [];
    const reacts = [];
    return {
        sent, reacts,
        m: {
            command: { name, args: fullArgs.split(/\s+/).filter(Boolean), fullArgs },
            sender: '6281@s.whatsapp.net', msg: { key: { remoteJid: 'x', id: '1' }, message: {} }, pushname: 'Tester',
            react: async (e) => reacts.push(e),
            reply: async (c) => sent.push(c),
            Nayla: { sendMessage: async (_j, c) => { sent.push(c); return {}; }, profilePictureUrl: async () => 'https://pp.example/me.jpg' },
        },
    };
}
const png = () => sharp({ create: { width: 64, height: 64, channels: 4, background: '#f00' } }).png().toBuffer();
const j = (data) => ({ body: JSON.stringify({ status: true, data }) });

(async () => {
    // 1. Semua command unik & tidak bentrok dengan file command lain
    const seen = {};
    for (const f of fs.readdirSync(path.join(__dirname, '..', 'src', 'commands'))) {
        const t = fs.readFileSync(path.join(__dirname, '..', 'src', 'commands', f), 'utf8');
        const names = [...t.matchAll(/case\s+['"]([^'"]+)['"]\s*:/g)].map(x => x[1]);
        if (f === 'apitools.js') names.push(...handler.commands);
        else if (!names.length) { try { names.push(...(require('../src/commands/' + f).commands || [])); } catch { /* butuh dependency lain */ } }
        for (const n of names) { assert(!seen[n] || seen[n] === f, `Command "${n}" dobel di ${seen[n]} dan ${f}`); seen[n] = f; }
    }
    assert.strictEqual(COMMANDS.length, handler.commands.length);

    // 2. Menu
    const wanted = { info: 9, komik: 6, maker: 12, search: 12, stalker: 10, tools: 18 };
    for (const [g, n] of Object.entries(wanted)) {
        const cat = menuData.CATEGORIES.find(c => c.id === g);
        assert(cat, `kategori ${g} tidak ada di menu`);
        assert.strictEqual(Object.keys(GROUPS[g].features).length, n, `jumlah fitur ${g}`);
        assert(menuData.categoryText(cat, {}).includes(cat.title));
    }
    assert(menuData.allMenuText('x', {}).includes('TOOLS MENU'));

    // 3. Teks: berita
    reply = () => j([{ title: 'Berita A', link: 'https://x.id/a', date: '2026-10-15' }, { title: 'Berita B', link: 'https://x.id/b' }]);
    let t = fakeM('cnn'); await handler(t.m);
    assert(calls.at(-1).includes('/info/cnn?'), calls.at(-1));
    assert(t.sent[0].text.includes('Berita A') && t.sent[0].text.includes('https://x.id/b'));
    assert.deepStrictEqual(t.reacts, ['⏳', '✅']);

    // 4. Parameter default & tetap
    t = fakeM('beritajakarta'); await handler(t.m);
    assert(calls.at(-1).includes('limit=10'), calls.at(-1));
    t = fakeM('gempa'); reply = async () => ({}); reply = () => ({ body: Buffer.from(JSON.stringify({ data: { magnitude: 5.1, wilayah: 'Laut' } })) });
    await handler(t.m);
    assert(calls.at(-1).includes('/info/bmkg-gempa?format=image'), calls.at(-1));
    assert(t.sent[0].text.includes('Magnitude'));

    // 5. Stalker: foto profil + teks jadi satu pesan gambar
    reply = () => j({ login: 'torvalds', name: 'Linus', followers: 250000, avatar_url: 'https://a.example/x.jpg' });
    t = fakeM('stalkgh', 'torvalds'); await handler(t.m);
    assert(calls.at(-1).includes('/stalker/stalk-gh?username=torvalds'));
    assert(t.sent[0].image?.url === 'https://a.example/x.jpg' && t.sent[0].caption.includes('Linus'));

    // 6. Dua isian dipisah spasi
    t = fakeM('stalkml', '12123123 3122'); await handler(t.m);
    assert(calls.at(-1).includes('id=12123123') && calls.at(-1).includes('server=3122'), calls.at(-1));

    // 7. Isian wajib kosong -> bantuan, tidak memanggil API
    const before = calls.length;
    t = fakeM('lyrics'); await handler(t.m);
    assert.strictEqual(calls.length, before);
    assert(t.sent[0].text.includes('Format:') && t.sent[0].text.includes('.lyrics'));
    t = fakeM('bypass', 'bukan-link'); await handler(t.m);
    assert(t.sent[0].text.includes('harus berupa link'));

    // 8. Stiker dari gambar PNG (dikonversi ke webp)
    const img = await png();
    reply = () => ({ body: img, headers: { 'content-type': 'image/png' } });
    t = fakeM('brat', 'haloo | putih'); await handler(t.m);
    assert(calls.at(-1).includes('text=haloo') && calls.at(-1).includes('theme=putih'), calls.at(-1));
    assert(Buffer.isBuffer(t.sent[0].sticker) && t.sent[0].sticker.slice(8, 12).toString() === 'WEBP');
    t = fakeM('brat', 'teks | dengan garis'); await handler(t.m);
    assert(calls.at(-1).includes('theme=dengan'), calls.at(-1));
    t = fakeM('attp', 'a | b'); await handler(t.m);           // isian tunggal: "|" ikut jadi teks
    assert(decodeURIComponent(calls.at(-1)).includes('text=a | b'), calls.at(-1));

    // 9. emojimix (rapat & dipisah)
    t = fakeM('emojimix', '😎😍'); await handler(t.m);
    assert(decodeURIComponent(calls.at(-1)).includes('emoji1=😎') && decodeURIComponent(calls.at(-1)).includes('emoji2=😍'), calls.at(-1));

    // 10. qc: nama = pushname, foto profil otomatis
    reply = () => ({ body: img, headers: { 'content-type': 'image/png' } });
    t = fakeM('qc', 'Halo semua'); await handler(t.m);
    const u = decodeURIComponent(calls.at(-1));
    assert(u.includes('name=Tester') && u.includes('avatar=https://pp.example/me.jpg') && u.includes('color=yellow'), u);

    // 11. Audio & file
    reply = () => ({ body: Buffer.from('ID3xxxx'), headers: { 'content-type': 'audio/mpeg' } });
    t = fakeM('tts', 'halo | miku'); await handler(t.m);
    assert(t.sent.at(-1).audio && calls.at(-1).includes('model=miku'));
    reply = () => ({ body: Buffer.from('PK'), headers: { 'content-type': 'application/zip' } });
    t = fakeM('webtozip', 'https://welper.web.id'); await handler(t.m);
    assert(t.sent.at(-1).document && t.sent.at(-1).fileName === 'webtozip.zip');

    // 12. JSON berisi link media (qrcode) & banyak gambar (pinterest)
    reply = () => j({ url: 'https://cdn.example/qr.png' });
    t = fakeM('qrcode', 'halo'); await handler(t.m);
    assert(t.sent.at(-1).image?.url === 'https://cdn.example/qr.png');
    reply = () => j(['https://i.pinimg.com/1.jpg', 'https://i.pinimg.com/2.jpg', 'https://i.pinimg.com/3.jpg']);
    t = fakeM('pinterest', 'kucing'); await handler(t.m);
    assert.strictEqual(t.sent.filter(x => x.image).length, 3);

    // 13. Error API
    reply = () => ({ status: 500, body: JSON.stringify({ status: false, message: 'Server rusak' }) });
    t = fakeM('npm', 'axios'); await handler(t.m);
    assert(t.sent.at(-1).text.includes('Server rusak') && t.reacts.at(-1) === '❌');

    // 14. Parameter gambar: tanpa foto & tanpa link -> bantuan; dengan link -> dikirim ke API
    reply = () => j({ text: 'hasil ocr' });
    t = fakeM('ocr'); await handler(t.m);
    assert(t.sent[0].text.includes('Format:'), 'tanpa foto & link -> bantuan');
    t = fakeM('ocr', 'https://img.example/a.png'); await handler(t.m);
    assert(calls.at(-1).includes('/tools/ocr?url=https%3A%2F%2Fimg.example%2Fa.png'), calls.at(-1));
    assert(t.sent.at(-1).text.includes('hasil ocr'));

    console.log(`OK: ${COMMANDS.length} command, ${Object.keys(GROUPS).length} kategori`);
})().catch(e => { console.error(e); process.exit(1); });
