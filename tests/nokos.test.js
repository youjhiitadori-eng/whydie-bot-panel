const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nk-'));

/* ---------- mock Nokoskuy API ---------- */
const S = { creates: {}, idem: {}, orders: {}, nextId: 100, mode: 'ok', failNext: 0, cancelled: [], finished: [], priceBump: 0, log: [],
    waPrice: 3500, waStock: 100, balAmt: 500000, deposits: {}, depMin: 2000, nextDep: 1, depMode: 'ok', depAvailable: true, depBusy: false, depCreates: 0, depCancelled: [] };
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'x-request-id': 'req_test' }); res.end(JSON.stringify(body)); };
const server = http.createServer((req, res) => {
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
        const u = new URL(req.url, 'http://x');
        const p = u.pathname.replace('/api/v2', '');
        S.log.push(req.method + ' ' + p);
        if (req.headers.authorization !== 'Bearer nks_test') return json(res, 401, { success: false, error: { code: 'unauthorized', message: 'x' } });
        let mt0;
        if (p === '/deposit/methods') return json(res, 200, { success: true, data: S.depAvailable ? [{ id: 'qris', type: 'qris', label: 'QRIS' }] : [], meta: { available: S.depAvailable, min: S.depMin, max: 1000000, fee_admin: 100 } });
        if (req.method === 'POST' && p === '/deposits') {
            const b = JSON.parse(body || '{}');
            S.depCreates++;
            if (S.depMode === 'offline') return json(res, 503, { success: false, error: { code: 'deposit_offline', message: 'x' } });
            if (S.depBusy || Object.values(S.deposits).filter(d => d.status === 'menunggu').length >= 3) return json(res, 409, { success: false, error: { code: 'deposit_pending', message: 'x', deposit_id: 1 } });
            if (b.amount < S.depMin || b.amount > 1000000) return json(res, 422, { success: false, error: { code: 'invalid_amount', message: 'Nominal di luar batas' } });
            S.lastDepBody = b;
            const id = S.nextDep++;
            const d = { id, ref: 'NK' + String(id).padStart(6, '0') + 'T', status: 'menunggu', status_label: 'Menunggu pembayaran', amount: b.amount, fee: 450, total: b.amount + 450, credit: b.amount, method: { type: 'qris', label: 'QRIS' }, payment: { qris: '00020101021226670016COM.NOBUBANK.WWW01189360050300000879140214' + id + '5204599953033605802ID5910TOKO TEST6007BANDUNG6304ABCD', qris_is_image_url: false }, checkout_url: 'https://example.test/checkout?topup=' + id, expires_at: new Date(Date.now() + 900000).toISOString(), paid_at: null };
            S.deposits[id] = d;
            return json(res, 201, { success: true, data: d, meta: { balance: 0 } });
        }
        if ((mt0 = p.match(/^\/deposits\/(\d+)$/))) {
            const d = S.deposits[mt0[1]];
            if (!d) return json(res, 404, { success: false, error: { code: 'not_found', message: 'x' } });
            if (req.method === 'GET') return json(res, 200, { success: true, data: d });
            if (req.method === 'DELETE') {
                if (d.status !== 'menunggu') return json(res, 409, { success: false, error: { code: 'cannot_cancel', message: 'x' } });
                d.status = 'dibatalkan'; S.depCancelled.push(d.id); return json(res, 200, { success: true, data: d });
            }
        }
        if (p === '/balance') return json(res, 200, { success: true, data: { balance: S.balAmt, active: S.balAmt - 50000, pending: 50000, pending_schedule: [], currency: 'IDR' } });
        if (p === '/providers') return json(res, 200, { success: true, data: [{ provider: 'provider_1', name: 'Server 1' }, { provider: 'provider_2', name: 'Server 2' }] });
        if (p === '/services') return json(res, 200, { success: true, data: [
            { id: 'svc_1', slug: 'whatsapp', name: 'WhatsApp', stock: S.waStock, price_from: S.waPrice },
            { id: 'svc_2', slug: 'telegram', name: 'Telegram', stock: 50, price_from: 2000 },
            { id: 'svc_3', slug: 'zzz', name: 'Empty', stock: 0, price_from: 100 },
        ] });
        if (/\/services\/.+\/countries/.test(p)) return json(res, 200, { success: true, data: [{ country_code: 'ID', name: 'Indonesia', stock: 10, price: 3500 }, { country_code: 'US', name: 'USA', stock: 5, price: 4000 }] });
        if (/\/services\/.+\/offers/.test(p)) return json(res, 200, { success: true, data: [
            { provider_id: 'p1_a', server_label: 'Server A', stock: 10, recommended: true, price: 3500 + S.priceBump },
            { provider_id: 'p1_b', server_label: 'Server B', stock: 0, recommended: false, price: 3200 },
        ] });
        if (req.method === 'POST' && p === '/orders') {
            const b = JSON.parse(body || '{}');
            const key = req.headers['idempotency-key'];
            S.creates[key] = (S.creates[key] || 0) + 1;
            if (S.mode === 'flaky' && S.creates[key] <= 2) { res.destroy(); return; }          // koneksi putus
            if (S.mode === 'always_down') { res.destroy(); return; }
            if (S.idem[key]) return json(res, 200, { success: true, data: S.idem[key], meta: { idempotent_replay: true } });
            if (S.mode === 'api_empty') return json(res, 402, { success: false, error: { code: 'insufficient_balance', message: 'x', balance: 10 } });
            if (S.mode === 'order_failed') return json(res, 503, { success: false, error: { code: 'order_failed', message: 'x', refunded: true } });
            if (b.quoted_price !== 3500 + S.priceBump) return json(res, 409, { success: false, error: { code: 'price_changed', message: 'x', new_price: 3500 + S.priceBump } });
            const id = S.nextId++;
            const o = { id, ref: 'NK' + id, status: 'awaiting_otp', active: true, phone: '62812000' + id, otp: null, otp_message: null, can_cancel: true, can_request_next_otp: false, refunded: false, expires_at: new Date(Date.now() + 1200000).toISOString() };
            S.orders[id] = o; S.idem[key] = o;
            return json(res, 201, { success: true, data: o, meta: {} });
        }
        let mt;
        if ((mt = p.match(/^\/orders\/(\d+)$/))) {
            const o = S.orders[mt[1]];
            if (!o) return json(res, 404, { success: false, error: { code: 'not_found', message: 'x' } });
            if (req.method === 'GET') return json(res, 200, { success: true, data: o });
            if (req.method === 'DELETE') { S.cancelled.push(o.id); Object.assign(o, { status: 'cancelled', active: false, refunded: true }); return json(res, 200, { success: true, data: o }); }
        }
        if ((mt = p.match(/^\/orders\/(\d+)\/finish$/))) { S.finished.push(+mt[1]); return json(res, 200, { success: true, data: {} }); }
        if ((mt = p.match(/^\/orders\/(\d+)\/request-otp$/))) { Object.assign(S.orders[mt[1]], { status: 'awaiting_otp', active: true }); return json(res, 200, { success: true, data: {} }); }
        json(res, 404, { success: false, error: { code: 'not_found', message: 'x' } });
    });
});

/* ---------- fake WhatsApp ---------- */
const sent = [];
const sock = {
    user: { id: '6280000000000:1@s.whatsapp.net' },
    sendMessage: async (jid, content) => { sent.push({ jid, text: content.text || content.caption, plain: true }); return {}; },
    onWhatsApp: async (n) => [{ exists: true, lid: '999' + n + '@lid' }],
};
const stubPath = path.join(ROOT, 'src/utils/interactiveHelper.js');
const stub = new Module(stubPath); stub.loaded = true;
stub.exports = {
    sendInteractiveMessage: async (_n, jid, c) => { sent.push({ jid, text: c.text, buttons: c.buttons }); },
    sendInteractiveWithImage: async (_n, jid, c) => { sent.push({ jid, text: c.text, buttons: c.buttons, image: true, imageBuf: c.imageSource }); },
};
require.cache[stubPath] = stub;

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ✔', msg); } else { fail++; console.log('  ✘ FAIL:', msg); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const lastTo = (jid) => [...sent].reverse().find(x => x.jid === jid && !/STRUK/.test(x.text || '')); // struk dicek terpisah
const strukTo = (jid) => [...sent].reverse().find(x => x.jid === jid && /STRUK/.test(x.text || ''));
const btnIds = (x) => (x?.buttons || []).map(b => { const j = JSON.parse(b.buttonParamsJson); return j.id || j.display_text; });

(async () => {
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;

    const config = require(ROOT + '/src/config');
    config.dbDir = tmp;
    config.nokos.baseUrl = `http://127.0.0.1:${port}/api/v2`;
    config.nokos.apiKey = 'nks_test';
    config.superOwner = '6281111111111'; config.coOwner = [];

    const settings = require(ROOT + '/src/utils/settings');
    const db = require(ROOT + '/src/utils/nokosDb');
    const core = require(ROOT + '/src/utils/nokosCore');
    const depo = require(ROOT + '/src/utils/nokosDeposit');
    const ui = require(ROOT + '/src/utils/nokosUi');
    const handler = require(ROOT + '/src/commands/nokos');
    core.attach(sock);

    const mk = (num, name, cmdName, args = [], extra = {}) => ({
        Nayla: sock, sender: num + '@s.whatsapp.net', senderNumber: num, pushname: name, mentionJid: num + '@s.whatsapp.net',
        role: 'Warlok', isOwner: false, isGroup: false, command: { name: cmdName, args }, msg: { key: { remoteJid: num + '@s.whatsapp.net' }, message: {} },
        reply: async (c) => { sent.push({ jid: num + '@s.whatsapp.net', text: c.text, reply: true }); },
        react: async () => { }, ...extra,
    });
    const run = (m) => handler(m);
    const pump = async () => {
        for (const o of db.activeOrders()) if (!o.apiOrderId || o.status !== 'otp_open') db.updateOrder(o, { nextPollAt: 0 });
        for (let i = 0; i < 20 && global.__nokos.running; i++) await sleep(50);
        await core.tick();
    };

    const A = '6285000000001', AJ = A + '@s.whatsapp.net';

    console.log('\n[1] Mode MATI -> fitur tidak ada');
    sent.length = 0;
    await run(mk(A, 'Andi', 'nokos'));
    ok(sent.length === 0, 'user biasa tidak dapat balasan apa pun');
    const owner = mk('6281111111111', 'Owner', 'nokos', [], { isOwner: true });
    await run(owner);
    ok(/mati/i.test(lastTo('6281111111111@s.whatsapp.net').text), 'owner dapat petunjuk menyalakan');

    console.log('\n[2] Owner nyalakan mode jualan');
    await run(mk('6281111111111', 'Owner', 'nokosmode', ['on'], { isOwner: true }));
    ok(settings.isNokosMode() === true, 'mode tersimpan ON');
    await run(mk(A, 'Andi', 'nokos'));
    let m1 = lastTo(AJ);
    ok(m1 && m1.buttons && m1.buttons.length === 2, 'menu toko ringkas: cuma 2 tombol (Beli Nokos + MENU)');
    ok(btnIds(m1).includes('.nk beli'), 'ada tombol Beli Nokos');
    const listJson = JSON.parse(m1.buttons[1].buttonParamsJson);
    const listIds = listJson.sections.flatMap(x => x.rows.map(r => r.id));
    ok(listJson.title.includes('MENU') && ['.nk depo', '.profil', '.riwayat', '.nk cari', '.rules', '.nk owner'].every(i => listIds.includes(i)), 'deposit, saldo, riwayat, cari, rules, owner ada di dalam daftar MENU');
    const ownerMenuBtns = JSON.stringify(listJson);
    ok(!/Panel Owner/.test(ownerMenuBtns), 'user biasa tidak melihat Panel Owner');

    console.log('\n[3] Perintah deposit manual sudah dihapus; saldo awal lewat addsaldo owner');
    await run(mk(A, 'Andi', 'bukti', ['1']));
    await run(mk('6281111111111', 'Owner', 'accdepo', ['1'], { isOwner: true }));
    ok(db.allDeposits().length === 0, 'bukti / accdepo tidak membuat atau memproses deposit apa pun');
    await run(mk('6281111111111', 'Owner', 'addsaldo', [A, '10000'], { isOwner: true }));
    let u = db.findUser(A);
    ok(u.balance === 10000, 'saldo awal 10.000 dari owner');

    console.log('\n[4] Alur beli lewat tombol sampai OTP otomatis');
    await run(mk(A, 'Andi', 'nk', ['beli']));
    const list = lastTo(AJ);
    ok(/whatsapp/.test(JSON.stringify(list.buttons)) && !/Empty/.test(JSON.stringify(list.buttons)), 'daftar layanan: WhatsApp ada, stok kosong disembunyikan');
    ok(/Rp4\.500/.test(list.buttons[0].buttonParamsJson), 'harga tampil = 3500 + untung 1000');
    await run(mk(A, 'Andi', 'nk', ['s', 'whatsapp']));
    ok(btnIds(lastTo(AJ)).includes('.nk v whatsapp provider_2'), 'pilih server 1/2');
    await run(mk(A, 'Andi', 'nk', ['v', 'whatsapp', 'provider_1']));
    ok(/Indonesia/.test(lastTo(AJ).buttons[0].buttonParamsJson), 'daftar negara');
    await run(mk(A, 'Andi', 'nk', ['c', 'whatsapp', 'provider_1', 'ID']));
    const conf = lastTo(AJ);
    ok(btnIds(conf).includes('.nk buy whatsapp provider_1 ID p1_a 3500'), 'satu opsi stok -> langsung konfirmasi, tombol Beli membawa harga quoted');
    await run(mk(A, 'Andi', 'nk', ['buy', 'whatsapp', 'provider_1', 'ID', 'p1_a', '3500']));
    const created = lastTo(AJ);
    ok(/62812000100/.test(created.text), 'nomor tampil');
    u = db.findUser(A);
    ok(u.balance === 10000 - 4500, 'saldo terpotong 4.500 (bukan 3.500)');
    ok(btnIds(created).some(i => i === '.nk cancel 1'), 'ada tombol batalkan');
    ok(JSON.stringify(created.buttons).includes('cta_copy'), 'ada tombol salin nomor');

    // OTP masuk di sisi supplier -> poller kirim otomatis
    S.orders[100].otp = '123456'; S.orders[100].status = 'completed'; S.orders[100].active = false;
    sent.length = 0;
    await pump();
    const otp = lastTo(AJ);
    ok(otp && /123456/.test(otp.text), 'OTP otomatis terkirim ke chat user');
    ok(S.finished.includes(100), 'nomor di-finish ke API');
    ok(db.getOrder(1).status === 'done' && db.findUser(A).orders === 1, 'status done, order sukses +1');
    ok(db.findUser(A).balance === 5500, 'tidak ada refund setelah OTP masuk');
    sent.length = 0; await pump();
    ok(sent.length === 0, 'tidak kirim OTP dobel');
    const st = db.stats();
    ok(st.orderProfit === 1000 && st.sold === 1, 'untung order tercatat Rp1.000');

    console.log('\n[5] Saldo kurang & harga berubah');
    await run(mk(A, 'Andi', 'nk', ['o', 'whatsapp', 'provider_1', 'ID', 'p1_a', '3500']));
    ok(btnIds(lastTo(AJ)).includes('.nk buy whatsapp provider_1 ID p1_a 3500'), 'saldo 5.500 >= 4.500 -> tombol Beli muncul');
    const lowU = db.findUser(A); const keep = lowU.balance; lowU.balance = 1000;
    await run(mk(A, 'Andi', 'nk', ['o', 'whatsapp', 'provider_1', 'ID', 'p1_a', '3500']));
    ok(btnIds(lastTo(AJ)).some(i => /nk depo/.test(i)) && /kurang/.test(JSON.stringify(lastTo(AJ).buttons)), 'saldo kurang -> tombol Deposit, bukan Beli');
    const sc = db.allOrders().length; await run(mk(A, 'Andi', 'nk', ['buy', 'whatsapp', 'provider_1', 'ID', 'p1_a', '3500']));
    ok(db.allOrders().length === sc, 'buy dengan saldo kurang tidak membuat order');
    lowU.balance = keep;
    S.priceBump = 500;
    const before = db.findUser(A).balance;
    await run(mk(A, 'Andi', 'nk', ['buy', 'whatsapp', 'provider_1', 'ID', 'p1_a', '3500']));
    const pc = lastTo(AJ);
    ok(/5\.000/.test(pc.text) && /belum terpotong/.test(pc.text), 'price_changed -> minta konfirmasi harga baru Rp5.000');
    ok(db.findUser(A).balance === before, 'saldo tidak berubah');
    ok(btnIds(pc).includes('.nk buy whatsapp provider_1 ID p1_a 4000'), 'tombol lanjut memakai harga baru');
    S.priceBump = 0;

    console.log('\n[6] Gagal pasti (order_failed) & saldo API habis -> refund + owner dikabari');
    S.mode = 'order_failed';
    await run(mk(A, 'Andi', 'nk', ['buy', 'whatsapp', 'provider_1', 'ID', 'p1_a', '3500']));
    ok(db.findUser(A).balance === before, 'saldo user utuh setelah gagal');
    S.mode = 'api_empty'; sent.length = 0;
    await run(mk(A, 'Andi', 'nk', ['buy', 'whatsapp', 'provider_1', 'ID', 'p1_a', '3500']));
    ok(db.findUser(A).balance === before, 'saldo user utuh (API empty)');
    await sleep(50);
    ok(sent.some(x => x.jid === '6281111111111@s.whatsapp.net' && /Saldo Nokoskuy kamu habis/.test(x.text)), 'owner dapat alert saldo Nokoskuy habis');
    ok(!sent.some(x => /insufficient|Nokoskuy/.test(x.text || '') && x.jid === AJ), 'user tidak melihat detail pemasok');
    S.mode = 'ok';

    console.log('\n[7] Koneksi putus saat POST -> retry Idempotency-Key sama, tidak dobel potong');
    S.mode = 'flaky';
    const balBefore = db.findUser(A).balance;
    await run(mk(A, 'Andi', 'nk', ['buy', 'whatsapp', 'provider_1', 'ID', 'p1_a', '3500']));
    const o2 = db.getOrder(db.allOrders().slice(-1)[0].id);
    const keys = Object.keys(S.creates);
    ok(S.creates[o2.idem] === 3, 'POST diulang 3x dengan key yang sama');
    ok(Object.keys(S.idem).length === 2 && o2.apiOrderId, 'supplier hanya membuat 1 order untuk key itu');
    ok(db.findUser(A).balance === balBefore - 4500, 'saldo dipotong sekali saja');
    S.mode = 'ok';

    console.log('\n[8] Batal -> refund sekali saja');
    const bal8 = db.findUser(A).balance;
    sent.length = 0;
    await run(mk(A, 'Andi', 'nk', ['cancel', String(o2.id)]));
    ok(S.cancelled.includes(o2.apiOrderId), 'DELETE dikirim ke API');
    await pump();
    ok(db.findUser(A).balance === bal8 + 4500, 'saldo kembali 4.500');
    ok(/SALDO KEMBALI/.test(lastTo(AJ).text), 'user dikabari refund');
    await new Promise(r => setTimeout(r, 500)); // struk foto dibuat async
    ok(sent.some(x => x.jid === AJ && /STRUK/.test(x.text || '') && /REFUND|GAGAL/.test(x.text || '')), 'user dapat struk refund');
    await pump(); await pump();
    ok(db.findUser(A).balance === bal8 + 4500, 'tidak ada refund kedua');

    console.log('\n[9] Expired tanpa OTP -> refund otomatis');
    await run(mk('6285000000002', 'Budi', 'nokos'));
    const B = db.findUser('6285000000002'); db.credit(B, 20000, 'seed', 'admin');
    await run(mk('6285000000002', 'Budi', 'nk', ['buy', 'whatsapp', 'provider_1', 'ID', 'p1_a', '3500']));
    ok(B.balance === 15500, 'Budi dipotong');
    const ob = db.allOrders().slice(-1)[0];
    Object.assign(S.orders[ob.apiOrderId], { status: 'expired', active: false });
    await pump();
    ok(B.balance === 20000, 'Budi di-refund penuh saat expired');

    console.log('\n[10] Race: 2 order bersamaan, saldo cuma cukup untuk 1');
    const C = '6285000000003'; await run(mk(C, 'Cici', 'nokos'));
    db.credit(db.findUser(C), 5000, 'seed', 'admin');
    const n0 = db.allOrders().length;
    await Promise.all([1, 2].map(() => run(mk(C, 'Cici', 'nk', ['buy', 'whatsapp', 'provider_1', 'ID', 'p1_a', '3500']))));
    ok(db.allOrders().length - n0 === 1, 'hanya 1 order yang lolos');
    ok(db.findUser(C).balance === 500, 'saldo Cici 500 (tidak minus)');

    console.log('\n[11] Batas order aktif per user & ownership');
    const D = '6285000000004'; await run(mk(D, 'Dedi', 'nokos'));
    db.credit(db.findUser(D), 100000, 'seed', 'admin');
    for (let i = 0; i < 4; i++) await run(mk(D, 'Dedi', 'nk', ['buy', 'whatsapp', 'provider_1', 'ID', 'p1_a', '3500']));
    ok(db.userActiveCount(db.findUser(D)) === 3, 'maksimal 3 order aktif');
    sent.length = 0;
    const dOrder = db.userOrders(db.findUser(D), 1)[0];
    await run(mk(A, 'Andi', 'nk', ['cancel', String(dOrder.id)]));
    ok(/tidak ditemukan/.test(lastTo(AJ).text), 'user lain tidak bisa batalkan order orang');

    console.log('\n[12] Grup: order dialihkan ke chat pribadi');
    sent.length = 0;
    await run(mk(A, 'Andi', 'nk', ['beli'], { isGroup: true, sender: '1203@g.us' }));
    ok(/chat pribadi/.test(lastTo('1203@g.us').text), 'diarahkan ke DM');

    console.log('\n[13] addsaldo / minsaldo owner (resolusi LID)');
    const ownerM = (c, a) => mk('6281111111111', 'Owner', c, a, { isOwner: true });
    await run(ownerM('addsaldo', ['085000000009', '2.500']));
    const E = db.findUser('6285000000009');
    ok(E && E.balance === 2500 && E.ids.includes('9996285000000009'), 'user baru dibuat (08->62), alias LID tersimpan');
    await run(ownerM('minsaldo', ['6285000000009', '9999']));
    ok(E.balance === 2500, 'minsaldo melebihi saldo ditolak');

    console.log('\n[14] Panel owner');
    sent.length = 0;
    await run(ownerM('nokosinfo', []));
    const panel = lastTo('6281111111111@s.whatsapp.net');
    ok(/500\.000/.test(panel.text) && /Hari ini/.test(panel.text), 'panel: saldo API + untung hari ini');

    console.log('\n[16] Deposit OTOMATIS (API v2): pilih metode -> tagihan -> bayar -> saldo masuk sendiri');
    const pumpDepo = async () => { for (const d of db.allDeposits()) if (db.isApiDeposit(d)) db.updateDeposit(d, { nextPollAt: 0 }); await depo.tick(); };
    const F = '6285000000010', FJ = F + '@s.whatsapp.net';
    await run(mk(F, 'Fani', 'nokos'));
    sent.length = 0;
    config.nokos.deposit.maxPending = 1;      // uji mekanisme antrean dengan batas 1 dulu (batas 3 diuji di [21])
    await run(mk(F, 'Fani', 'deposit', ['1999']));
    ok(/Minimal deposit Rp2\.000/.test(lastTo(FJ).text), 'minimal deposit Rp2.000: Rp1.999 ditolak');
    await run(mk(F, 'Fani', 'deposit', ['20k']));
    const inv = [...sent].reverse().find(x => x.jid === FJ && x.image);
    ok(S.depCreates === 1, 'metode QRIS dipilih otomatis (tanpa menu pilih metode)');
    ok(S.lastDepBody.amount === 20200 && (S.lastDepBody.method === undefined || S.lastDepBody.method === 'qris'), 'API menerima amount = nominal + fee toko (20.000 + 200), method hanya qris');
    ok(inv && /20\.650/.test(inv.text) && /Saldo masuk : Rp20\.000/.test(inv.text) && /Biaya       : Rp650/.test(inv.text), 'tagihan: total bayar Rp20.650, saldo masuk Rp20.000, biaya Rp650');
    ok(inv && Buffer.isBuffer(inv.imageBuf) && inv.imageBuf.slice(0, 4).toString('hex') === '89504e47', 'tagihan menyertakan FOTO kode QR (PNG)');
    ok(/Scan QR/.test(inv.text) && !/Transfer|kode unik|Nomor :/.test(inv.text), 'teks tagihan gaya QRIS (tanpa nomor tujuan / kode unik)');
    ok(JSON.stringify(inv.buttons).includes('https://example.test/checkout?topup=1') && btnIds(inv).includes('.nk dcheck 1') && btnIds(inv).includes('.nk dcancel 1') && inv.buttons.length === 3, 'tombol: Buka Halaman Bayar, Cek Status, Batalkan (3 tombol)');
    const dF = db.userPendingDeposit(db.findUser(F));
    ok(dF && dF.apiId === 1 && dF.credit === 20000 && dF.fee === 200 && dF.total === 20650 && dF.payFee === 650, 'deposit tercatat: credit 20.000, untung toko 200, total 20.650');
    S.mode = 'ok';

    // pemakaian ulang: deposit kedua user yang sama -> tampilkan yang lama
    await run(mk(F, 'Fani', 'nk', ['d', '30000', 'qris']));
    ok(S.depCreates === 1 && /masih punya deposit/.test(lastTo(FJ).text), 'user yang sama tidak membuat deposit kedua');

    // antrean global: user lain saat ada deposit menunggu
    const G = '6285000000011', GJ = G + '@s.whatsapp.net';
    await run(mk(G, 'Gani', 'nokos'));
    await run(mk(G, 'Gani', 'nk', ['d', '10000', 'qris']));
    ok(/Antrean deposit/.test(lastTo(GJ).text) && S.depCreates === 1, 'user lain diminta menunggu (1 deposit aktif per akun Nokoskuy)');

    // belum dibayar -> saldo tetap
    await pumpDepo();
    ok(db.findUser(F).balance === 0 && db.getDeposit(dF.id).status === 'pending', 'belum dibayar: saldo tidak berubah');

    // dibayar -> saldo masuk otomatis, sekali saja
    S.deposits[1].status = 'berhasil'; S.deposits[1].paid_at = new Date().toISOString();
    sent.length = 0;
    await pumpDepo();
    ok(db.findUser(F).balance === 20000, 'saldo user +20.000 otomatis');
    ok(/Deposit #\d+ berhasil/.test(lastTo(FJ).text), 'user dikabari');
    await new Promise(r => setTimeout(r, 400));
    ok(strukTo(FJ) && /DEPOSIT/.test(strukTo(FJ).text) && /QRIS/.test(strukTo(FJ).text), 'user dapat struk deposit (metode QRIS)');
    await pumpDepo(); await pumpDepo();
    ok(db.findUser(F).balance === 20000, 'polling berulang tidak mengkredit dobel');
    ok(db.stats().autoDeposits === 1 && db.stats().depositFee === 200, 'statistik: deposit otomatis tercatat, untung fee 200 masuk');

    console.log('\n[17] Batalkan deposit otomatis -> antrean bebas lagi');
    await run(mk(G, 'Gani', 'nk', ['d', '10000', 'qris']));
    const dG = db.userPendingDeposit(db.findUser(G));
    ok(dG && dG.apiId === 2, 'Gani sekarang bisa membuat deposit');
    await run(mk(G, 'Gani', 'nk', ['dcancel', String(dG.id)]));
    ok(S.depCancelled.includes(2) && db.getDeposit(dG.id).status === 'cancelled', 'DELETE ke API & status cancelled');
    await pumpDepo();
    ok(db.findUser(G).balance === 0, 'tidak ada saldo masuk setelah batal');

    console.log('\n[18] Kedaluwarsa lalu telat bayar -> tetap dikreditkan sekali');
    await run(mk(G, 'Gani', 'nk', ['d', '10000', 'qris']));
    const dG2 = db.userPendingDeposit(db.findUser(G));
    S.deposits[dG2.apiId].status = 'kedaluwarsa';
    sent.length = 0;
    await pumpDepo();
    ok(db.getDeposit(dG2.id).status === 'expired' && /kedaluwarsa/.test(lastTo(GJ).text), 'status expired & user dikabari');
    ok(db.graceDeposits().some(x => x.id === dG2.id), 'masih dipantau selama masa toleransi');
    S.deposits[dG2.apiId].status = 'berhasil';
    await pumpDepo();
    ok(db.findUser(G).balance === 10000 && db.getDeposit(dG2.id).late === true, 'transfer telat tetap dikreditkan (10.000)');
    await pumpDepo(); await pumpDepo();
    ok(db.findUser(G).balance === 10000, 'tidak ada kredit dobel');

    console.log('\n[19] Deposit Nokoskuy offline / tidak tersedia -> user diberi tahu, tidak ada deposit dibuat');
    const H = '6285000000012', HJ = H + '@s.whatsapp.net';
    await run(mk(H, 'Hana', 'nokos'));
    const api2 = require(ROOT + '/src/utils/nokosApi');
    S.depMode = 'offline';
    await run(mk(H, 'Hana', 'nk', ['d', '10000', 'qris']));
    ok(!db.userPendingDeposit(db.findUser(H)) && /offline|tidak tersedia/.test(lastTo(HJ).text), 'offline: tidak ada deposit, user diberi tahu');
    S.depMode = 'ok'; S.depAvailable = false; api2.clearCache();
    await run(mk(H, 'Hana', 'nk', ['d', '10000', 'qris']));
    ok(!db.userPendingDeposit(db.findUser(H)) && /tidak tersedia/.test(lastTo(HJ).text), 'metode kosong: tidak ada deposit, user diberi tahu');
    S.depAvailable = true; api2.clearCache();

    console.log('\n[20] Sisa deposit manual lama ditutup; listdepo & panel owner');
    db.createDeposit({ userId: db.findUser(H).id, chat: HJ, nominal: 10000, fee: 200, total: 10200 });
    await run(mk(H, 'Hana', 'nk', ['d', '10000', 'qris']));
    const dH3 = db.userPendingDeposit(db.findUser(H));
    await depo.tick();
    ok(db.allDeposits().filter(d => !db.isApiDeposit(d) && d.status === 'pending').length === 0, 'deposit manual lama otomatis dibatalkan');
    await run(ownerM('listdepo', []));
    ok(/⚡/.test(lastTo('6281111111111@s.whatsapp.net').text), 'listdepo menampilkan deposit otomatis');
    await run(mk(H, 'Hana', 'nk', ['dcancel', String(dH3.id)]));
    await run(ownerM('nokosinfo', []));
    const panel2 = lastTo('6281111111111@s.whatsapp.net');
    ok(/450\.000/.test(panel2.text) && /50\.000/.test(panel2.text) && /otomatis/.test(panel2.text), 'panel: saldo aktif & tertunda + deposit otomatis');


    console.log('\n[21] Deposit minimal Rp2.000, antrean 3 deposit, QR dari data lain');
    for (const d of db.pendingDeposits()) db.updateDeposit(d, { status: 'cancelled', settled: true });   // bersihkan sisa deposit dari tes sebelumnya
    for (const d of Object.values(S.deposits)) if (d.status === 'menunggu') d.status = 'dibatalkan';
    config.nokos.deposit.maxPending = 3;
    const mkU = (i) => ({ n: '62850000010' + i, j: '62850000010' + i + '@s.whatsapp.net' });
    const [U1, U2, U3, U4] = [1, 2, 3, 4].map(mkU);
    for (const u of [U1, U2, U3, U4]) await run(mk(u.n, 'U' + u.n.slice(-1), 'nokos'));
    await run(mk(U1.n, 'U1', 'deposit', ['2000']));
    const minInv = [...sent].reverse().find(x => x.jid === U1.j && x.image);
    ok(minInv && S.lastDepBody.amount === 2200 && /Saldo masuk : Rp2\.000/.test(minInv.text), 'deposit Rp2.000 diterima (amount ke API = 2.200 dengan fee toko 200)');
    await run(mk(U2.n, 'U2', 'deposit', ['5000']));
    await run(mk(U3.n, 'U3', 'deposit', ['5000']));
    ok(db.pendingDeposits().filter(db.isApiDeposit).length === 3, '3 user bisa punya deposit menunggu bersamaan (batas Nokoskuy 3)');
    await run(mk(U4.n, 'U4', 'deposit', ['5000']));
    ok(/Antrean deposit/.test(lastTo(U4.j).text), 'user ke-4 diminta menunggu');
    await run(mk(U1.n, 'U1', 'nk', ['dcancel', String(db.userPendingDeposit(db.findUser(U1.n)).id)]));
    await run(mk(U4.n, 'U4', 'deposit', ['5000']));
    ok(db.userPendingDeposit(db.findUser(U4.n)), 'setelah satu dibatalkan, user ke-4 bisa deposit');
    for (const u of [U2, U3, U4]) { const d = db.userPendingDeposit(db.findUser(u.n)); await run(mk(u.n, 'x', 'nk', ['dcancel', String(d.id)])); }
    config.nokos.deposit.maxPending = 3;

    const { qrisBuffer } = require(ROOT + '/src/utils/qrisImage');
    const png = await qrisBuffer({ qris: '000201010212TEST', qris_is_image_url: false });
    ok(png && png.slice(0, 4).toString('hex') === '89504e47' && png.length > 500, 'teks QRIS -> gambar PNG QR');
    const dataUri = 'data:image/png;base64,' + png.toString('base64');
    const viaData = await qrisBuffer({ qris: dataUri });
    ok(viaData && viaData.equals(png), 'QRIS berbentuk data:image juga didukung');
    ok((await qrisBuffer({ qris: '' })) === null && (await qrisBuffer(null)) === null, 'data QRIS kosong -> null (tidak crash)');

    console.log('\n[22] Maintenance harian: jadwal, penutupan sementara, update harga & stok, laporan owner');
    const mt = require(ROOT + '/src/utils/nokosMaintenance');
    const OWN = '6281111111111@s.whatsapp.net';
    const nowMin = mt.wibNow().min;
    config.nokos.maintenance.time = mt.fmtMin(nowMin);              // jadwal = menit ini -> kita ada di dalam jendela
    config.nokos.maintenance.windowMin = 5;
    settings.setMaintenance({ manual: false, lastRunDate: undefined, enabled: undefined, time: undefined, windowMin: undefined });
    let mst = mt.status();
    ok(mst.active && mst.reason === 'scheduled' && /WIB/.test(mst.reopenAt), 'di dalam jendela jadwal: toko dinyatakan maintenance');
    sent.length = 0;
    await run(mk(A, 'Andi', 'beli'));
    ok(/Maintenance/i.test(lastTo(AJ).text), 'user ditolak order baru saat maintenance (dengan pesan jelas)');
    await run(mk(A, 'Andi', 'nk', ['depo']));
    ok(/Maintenance/i.test(lastTo(AJ).text), 'deposit baru juga ditutup saat maintenance');
    await run(mk(A, 'Andi', 'saldo'));
    ok(/Gabung/.test(lastTo(AJ).text) && !/Maintenance sedang berlangsung/.test(lastTo(AJ).text), 'cek saldo/profil tetap bisa saat maintenance');
    await run(mk(A, 'Andi', 'nokos'));
    ok(/Maintenance/.test(lastTo(AJ).text), 'menu toko menampilkan info maintenance');
    sent.length = 0;
    await run(ownerM('beli', []));
    ok(!/Maintenance sedang berlangsung/.test(lastTo(OWN).text || ''), 'owner tidak ikut ditutup');

    // job jadwal: jalan sekali, lapor ke owner, simpan snapshot
    sent.length = 0;
    S.waPrice = 3500;
    await mt.tick();
    ok(settings.getMaintenance().lastRunDate === mt.wibNow().date, 'job terjadwal jalan & ditandai sudah jalan hari ini');
    let rep1 = sent.find(x => x.jid === OWN && /LAPORAN MAINTENANCE/.test(x.text || ''));
    ok(rep1 && /layanan diperbarui/.test(rep1.text) && /Saldo API/.test(rep1.text), 'owner menerima laporan (layanan diperbarui + saldo API)');
    ok(fs.existsSync(path.join(tmp, 'nokos-snapshot.json')), 'snapshot harga & stok tersimpan');
    const nRep = sent.filter(x => /LAPORAN MAINTENANCE/.test(x.text || '')).length;
    await mt.tick();
    ok(sent.filter(x => /LAPORAN MAINTENANCE/.test(x.text || '')).length === nRep, 'tick berikutnya di hari yang sama tidak menjalankan ulang');

    // deteksi perubahan harga & stok, peringatan saldo tipis
    S.waPrice = 5000; S.waStock = 0; S.balAmt = 5000;
    sent.length = 0;
    const rr = await mt.run({ manual: true });
    ok(rr.ok && /Harga naik/.test(rr.text) && /WhatsApp/.test(rr.text) && /Rp4\.500/.test(rr.text) && /Rp6\.000/.test(rr.text), 'harga naik terdeteksi (harga JUAL 4.500 -> 6.000, bukan harga modal)');
    ok(/Stok habis/.test(rr.text) && /Saldo API tipis/.test(rr.text), 'stok habis & saldo API tipis dilaporkan');
    S.waPrice = 3500; S.waStock = 100; S.balAmt = 500000;
    const rr2 = await mt.run({ manual: true });
    ok(/Harga turun/.test(rr2.text) && /Stok kembali/.test(rr2.text), 'harga turun & stok kembali terdeteksi');

    // di luar jam: tidak jalan, toko buka
    config.nokos.maintenance.time = mt.fmtMin((nowMin + 6 * 60) % 1440);
    settings.setMaintenance({ lastRunDate: undefined });
    mst = mt.status();
    ok(!mst.active, 'di luar jam maintenance: toko buka');
    sent.length = 0;
    await mt.tick();
    ok(!sent.some(x => /LAPORAN MAINTENANCE/.test(x.text || '')) && !settings.getMaintenance().lastRunDate, 'di luar jam: job tidak jalan sama sekali');
    await run(mk(A, 'Andi', 'beli'));
    ok(/Halaman \d/.test(lastTo(AJ).text) && !/Maintenance sedang berlangsung/.test(lastTo(AJ).text), 'toko normal lagi: user bisa mulai beli');

    // jendela yang melewati tengah malam
    ok(mt.status(Date.UTC(2026, 9, 15, 17, 2)).reason === null, 'cek jam 00:02 WIB dengan jadwal 12:00: tidak maintenance');
    config.nokos.maintenance.time = '23:58';
    ok(mt.status(Date.UTC(2026, 9, 15, 17, 1)).active, 'jadwal 23:58 durasi 5: 00:01 WIB masih dalam jendela (melewati tengah malam)');
    config.nokos.maintenance.time = '12:00';

    // perintah owner
    await run(ownerM('maintenance', ['on']));
    ok(mt.status().active && mt.status().reason === 'manual', '.maintenance on -> toko ditutup manual');
    sent.length = 0;
    await run(mk(A, 'Andi', 'cari', ['whatsapp']));
    ok(/Maintenance/i.test(lastTo(AJ).text), 'saat ditutup manual user tidak bisa mencari/order');
    await run(ownerM('maintenance', ['off']));
    ok(!mt.status().active, '.maintenance off -> toko dibuka lagi');
    await run(ownerM('maintenance', ['jam', '13:30']));
    ok(mt.status().time === '13:30', '.maintenance jam 13:30 mengubah jadwal');
    await run(ownerM('maintenance', ['jam', '99:99']));
    ok(/Format/.test(lastTo(OWN).text) && mt.status().time === '13:30', 'jam tidak valid ditolak');
    await run(ownerM('maintenance', ['durasi', '10']));
    ok(mt.status().windowMin === 10, '.maintenance durasi 10');
    await run(ownerM('maintenance', ['auto', 'off']));
    ok(mt.status().enabled === false, '.maintenance auto off mematikan jadwal harian');
    await run(ownerM('maintenance', []));
    ok(/Jadwal/.test(lastTo(OWN).text) && lastTo(OWN).buttons.length === 2, '.maintenance menampilkan status (2 tombol)');
    await run(mk(A, 'Andi', 'maintenance', ['on']));
    ok(/khusus owner/.test(lastTo(AJ).text), 'user biasa tidak boleh memakai .maintenance');
    settings.setMaintenance({ manual: false, enabled: undefined, time: undefined, windowMin: undefined });

    console.log('\n[15] Mode dimatikan lagi');
    await run(ownerM('nokosmode', ['off']));
    sent.length = 0;
    await run(mk(A, 'Andi', 'nk', ['beli']));
    ok(sent.length === 0, 'fitur toko hilang lagi untuk user');

    console.log(`\n=== ${pass} lulus, ${fail} gagal ===`);
    server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
