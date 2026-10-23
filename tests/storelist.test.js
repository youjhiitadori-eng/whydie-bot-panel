// Tes Store List: node tests/storelist.test.js  (tanpa jaringan / WhatsApp, pakai Nayla palsu)
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const config = require('../src/config');
config.dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-'));   // database sementara
const store = require('../src/utils/storeList');
const handler = require('../src/commands/storelist');
const menuData = require('../src/utils/menuData');

const sent = [];
let idc = 0;
const Nayla = { sendMessage: async (jid, content, opts) => { const res = { key: { id: 'ID' + (++idc) } }; sent.push({ jid, content, opts, res }); return res; } };
const mk = (text, isOwner = true) => {
    const p = config.prefix;
    const args = text.startsWith(p) ? text.slice(p.length).trim().split(/ +/) : [];
    return { Nayla, sender: 'u@s.whatsapp.net', msg: { message: {} }, isOwner, text, command: { name: (args.shift() || '').toLowerCase(), args } };
};
const last = () => sent[sent.length - 1];
const run = async (text, owner) => { await handler(mk(text, owner)); return last(); };

(async () => {
    // tambah + semua balasan pakai foto
    let r = await run('.addlist promo Diskon 50%\nsampai Minggu');
    assert(Buffer.isBuffer(r.content.image), 'balasan addlist harus ada foto');
    assert(/ditambahkan/.test(r.content.caption));
    assert.strictEqual(store.get('promo').text, 'Diskon 50%\nsampai Minggu', 'baris baru harus utuh');

    // duplikat, nama jelek, nama bentrok command bawaan
    assert(/sudah ada/.test((await run('.addlist promo x')).content.caption));
    assert(/hanya boleh/.test((await run('.addlist Pro$mo x')).content.caption));
    assert(/command bawaan/.test((await run('.addlist menu x')).content.caption));
    assert(/command bawaan/.test((await run('.addlist addlist x')).content.caption));
    assert(!/(Pro\$mo)/.test(JSON.stringify(store.list())));

    // prefix di nama dibuang, huruf besar jadi kecil
    await run('.addlist .Harga Paket A 10k');
    assert(store.has('harga'));

    // lookup: dengan prefix & tanpa prefix (harus satu kata utuh)
    assert.strictEqual(store.lookup('promo'), 'promo');
    assert.strictEqual(store.lookup('PROMO', true), 'promo');
    assert.strictEqual(store.lookup('promo dong', true), null);
    assert.strictEqual(store.lookup('.promo', true), null);
    assert.strictEqual(store.lookup('nggakada', true), null);

    // kirim entri = foto + teks
    await store.sendEntry(Nayla, 'u@s.whatsapp.net', null, 'promo');
    assert(Buffer.isBuffer(last().content.image) && last().content.caption === 'Diskon 50%\nsampai Minggu');
    assert(store.isOwnMessage(last().res.key.id), 'pesan bot sendiri harus dikenali (anti loop)');

    // edit
    assert(/diperbarui/.test((await run('.editlist promo Diskon 70%')).content.caption));
    assert.strictEqual(store.get('promo').text, 'Diskon 70%');
    assert(/tidak ada/.test((await run('.editlist ghaib x')).content.caption));

    // reply pesan sebagai isi
    const m = mk('.addlist dariquote');
    m.msg = { message: { extendedTextMessage: { text: '.addlist dariquote', contextInfo: { quotedMessage: { conversation: 'isi dari pesan yg di-reply' } } } } };
    await handler(m);
    assert.strictEqual(store.get('dariquote').text, 'isi dari pesan yg di-reply');

    // teks panjang: foto + sisa teks, tidak ada yang hilang
    const long = ('baris panjang '.repeat(20) + '\n').repeat(8);
    sent.length = 0;
    await store.sendPhoto(Nayla, 'u@s.whatsapp.net', long.trim(), null);
    assert.strictEqual(sent.length, 2);
    assert(sent[0].content.caption.length <= 1000);
    assert.strictEqual((sent[0].content.caption + ' ' + sent[1].content.text).replace(/\s+/g, ' '), long.trim().replace(/\s+/g, ' '));

    // list
    const l = await run('.liststore');
    assert(Buffer.isBuffer(l.content.image) && /\.promo/.test(l.content.caption) && /\.harga/.test(l.content.caption));

    // hapus
    assert(/dihapus/.test((await run('.dellist promo')).content.caption));
    assert(!store.has('promo'));
    assert(/tidak ditemukan/.test((await run('.dellist promo')).content.caption));

    // bukan owner: handler diam (+ command dikunci di config)
    sent.length = 0;
    await run('.addlist hack x', false);
    assert.strictEqual(sent.length, 0); assert(!store.has('hack'));
    for (const c of ['addlist', 'editlist', 'dellist', 'liststore']) assert(config.ownerOnlyCommands.includes(c), c + ' harus owner only');

    // menu kategori Store memuat command barunya
    const cat = menuData.CATEGORIES.find(c => c.id === 'store');
    const txt = menuData.categoryText(cat, { role: 'Owner' });
    for (const c of ['addlist', 'editlist', 'dellist', 'liststore']) assert(txt.includes(config.prefix + c), 'STORE MENU harus memuat ' + c);

    // command buatan ikut tampil di STORE MENU (dan hilang lagi kalau dihapus)
    await run('.addlist harga Paket A 10k');
    const cat2 = menuData.CATEGORIES.find(c => c.id === 'store');
    const t2 = menuData.categoryText(cat2, { role: 'Warlok' });
    assert(t2.includes(config.prefix + 'harga') && t2.includes(config.prefix + 'dariquote'), 'command buatan harus tampil di STORE MENU');
    await run('.dellist harga');
    assert(!menuData.categoryText(cat2, {}).includes(config.prefix + 'harga '), 'command yang dihapus harus hilang dari menu');

    // persisten ke file
    assert(fs.existsSync(path.join(config.dbDir, 'storelist.json')));
    console.log('storelist: semua tes lulus');
})().catch(e => { console.error('GAGAL:', e.message); process.exit(1); });
