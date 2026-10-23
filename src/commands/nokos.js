// NOKOS STORE - jualan nomor OTP virtual (API Nokoskuy), full tombol.
//
// PENTING: PluginLoader mendaftarkan SEMUA pola "case + nama + titik dua" di file ini sebagai command.
// Jadi switch di bawah hanya berisi nama command asli. Sub-aksi tombol (.nk s / .nk v / ...) memakai object ACTIONS.
const config = require('../config');
const settings = require('../utils/settings');
const db = require('../utils/nokosDb');
const api = require('../utils/nokosApi');
const core = require('../utils/nokosCore');
const deposit = require('../utils/nokosDeposit');
const ui = require('../utils/nokosUi');
const receipt = require('../utils/nokosReceipt');
const maintenance = require('../utils/nokosMaintenance');
const { qrisBuffer } = require('../utils/qrisImage');
const menuData = require('../utils/menuData');
const { getImage } = require('../utils/helper');
const fs = require('fs');
const path = require('path');

const { rp, cmd, quick, urlBtn, listBtn, copyBtn } = ui;
const nk = () => config.nokos || {};
const digits = (v) => String(v || '').replace(/\D/g, '');

const ADMIN_COMMANDS = new Set(['nokosmode', 'modejual', 'nokoslock', 'addsaldo', 'minsaldo', 'listdepo', 'nokosinfo', 'maintenance']);

// Saat maintenance: order baru & deposit baru ditutup. Order/deposit yang sudah berjalan (cancel, next, done, dcheck, dcancel, dqr) tetap bisa dipakai.
const MT_BLOCK_COMMANDS = new Set(['beli', 'cari', 'deposit']);
const MT_BLOCK_ACTIONS = new Set(['beli', 'cari', 's', 'v', 'c', 'o', 'buy', 'depo', 'd']);

/* ------------------------------ HELPER ------------------------------ */

const ownerNumber = () => digits([].concat(config.superOwner)[0]);
const botNumber = (m) => digits(String(m.Nayla?.user?.id || '').split(':')[0].split('@')[0]);

function lidOf(msg) {
    const c = [msg?.key?.participant, msg?.key?.remoteJid].find(v => v && String(v).endsWith('@lid'));
    return c ? digits(String(c).split('@')[0].split(':')[0]) : '';
}

function getUser(m) {
    return db.ensureUser([m.senderNumber, lidOf(m.msg)], m.pushname);
}

/** "10000" | "10.000" | "10k" | "10rb" -> 10000 */
function parseAmount(raw) {
    const s = String(raw || '').toLowerCase().replace(/rp|\s/g, '').replace(/\./g, '').replace(/,/g, '');
    const mt = s.match(/^(\d+)(k|rb|ribu)?$/);
    if (!mt) return null;
    return parseInt(mt[1], 10) * (mt[2] ? 1000 : 1);
}

const trunc = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
const page = (arr, n, size) => {
    const pages = Math.max(1, Math.ceil(arr.length / size));
    const cur = Math.min(Math.max(1, n || 1), pages);
    return { cur, pages, items: arr.slice((cur - 1) * size, cur * size) };
};

const card = (m, content) => ui.sendCard(m.Nayla, m.sender, content);
const buttonsWork = () => nk().buttons !== false;
// Kalau tombol dimatikan di config, semua kartu jadi teks biasa
const withButtons = (b) => (buttonsWork() ? b : []);

async function apiFail(m, r) {
    const code = r.error?.code;
    if (code === 'unauthorized' || code === 'no_api_key') {
        ui.notifyOwners(m.Nayla, `⚠️ *API key Nokoskuy bermasalah* (${code}). Cek src/config.js -> nokos.apiKey.`);
        return m.reply({ text: '⚠️ Toko sedang gangguan. Coba lagi nanti ya.' });
    }
    if (code === 'rate_limited') return m.reply({ text: '⏳ Sistem sedang ramai, coba lagi beberapa detik lagi.' });
    return m.reply({ text: '⚠️ Gagal mengambil data dari server. Coba lagi sebentar.' });
}

/* ------------------------------ MENU TOKO ------------------------------ */

async function sendStoreMenu(m) {
    const user = getUser(m);
    const mt = maintenance.status();
    const text = [
        `${menuData.italic('Halo')} 👋 @${String(m.mentionJid || m.sender).split('@')[0].split(':')[0]}`,
        '',
        ui.box(menuData.italic('NOKOS STORE'), [
            `${menuData.italic('Nama')} : ${m.pushname}`,
            `${menuData.italic('Saldo')} : *${rp(user.balance)}*`,
            `${menuData.italic('Sukses')} : ${user.orders} order`,
        ]),
        ...(mt.active ? ['', `🛠️ *Maintenance*${mt.reopenAt ? ` — buka lagi ${mt.reopenAt}` : ''}`] : []),
        '🛒 Nomor OTP WhatsApp, Telegram, dll.',
        '⚡ OTP masuk otomatis ke chat ini.',
        '',
        '> Tekan *Beli Nokos* untuk mulai, atau *MENU* untuk deposit, riwayat, dll.',
    ].join('\n');

    // Tombol sengaja dibuat sedikit: 1 aksi utama + 1 menu. Sisanya ada di dalam daftar MENU.
    const sections = [
        {
            title: 'Akun',
            rows: [
                { title: '➕ Deposit Saldo', description: 'Isi saldo lewat QRIS', id: cmd('nk depo') },
                { title: '👤 Saldo & Profil', description: 'Saldo, total belanja, mutasi', id: cmd('profil') },
                { title: '📜 Riwayat Order', description: 'Order & status terakhir', id: cmd('riwayat') },
            ],
        },
        {
            title: 'Bantuan',
            rows: [
                { title: '🔎 Cari Layanan', description: 'Cari app yang tidak ada di daftar', id: cmd('nk cari') },
                { title: '📜 Rules', description: 'Aturan sebelum order', id: cmd('rules') },
                { title: '💬 Hubungi Owner', description: 'Butuh bantuan?', id: cmd('nk owner') },
            ],
        },
    ];
    if (m.isOwner) {
        sections.push({
            title: 'Owner Only',
            highlight_label: 'Owner',
            rows: [
                { title: '📊 Panel Owner', description: 'Saldo API, untung, deposit pending', id: cmd('nokosinfo') },
                { title: '🛠️ Maintenance', description: 'Status & jadwal maintenance', id: cmd('maintenance') },
                { title: '🤖 Menu Bot Lengkap', description: 'Semua fitur bot', id: cmd('allmenu') },
            ],
        });
    }
    const buttons = [
        quick('🛒 Beli Nokos', cmd('nk beli')),
        listBtn('📋 MENU', sections),
    ];
    return card(m, { text, buttons: withButtons(buttons), image: getImage(), mentions: [m.mentionJid || m.sender] });
}

/* ------------------------------ ALUR ORDER ------------------------------ */

async function allServices() {
    const r = await api.services();
    if (!r.ok) return { r };
    const pop = (nk().popular || []).map(s => String(s).toLowerCase());
    const rank = (s) => { const i = pop.indexOf(String(s.slug).toLowerCase()); return i === -1 ? 999 : i; };
    const list = (r.data || []).filter(s => s.stock > 0).sort((a, b) => rank(a) - rank(b) || b.stock - a.stock);
    return { list };
}

function serviceRows(items) {
    return items.map(s => ({
        title: trunc(s.name, 24),
        description: `mulai ${rp(ui.sellPrice(s.price_from).sell)} • stok ${s.stock}`,
        id: cmd(`nk s ${s.slug}`),
    }));
}

async function findService(slug) {
    const r = await api.services();
    if (!r.ok) return null;
    return (r.data || []).find(s => String(s.slug).toLowerCase() === String(slug).toLowerCase() || s.id === slug) || null;
}

function normalizeProviders(data) {
    const out = [];
    for (const it of Array.isArray(data) ? data : []) {
        const id = typeof it === 'string' ? it : (it.provider || it.id || it.key || it.value);
        if (!id) continue;
        const n = String(id).match(/(\d+)$/);
        out.push({ id, name: (typeof it === 'object' && (it.name || it.label)) || (n ? `Server ${n[1]}` : id) });
    }
    return out;
}

async function listProviders() {
    const r = await api.providers();
    const list = r.ok ? normalizeProviders(r.data) : [];
    return list.length ? list : [1, 2, 3].map(i => ({ id: `provider_${i}`, name: `Server ${i}` }));
}

const ACTIONS = {
    // .nk beli [halaman] -> daftar layanan
    async beli(m, user, args) {
        const { list, r } = await allServices();
        if (!list) return apiFail(m, r);
        if (!list.length) return m.reply({ text: '😔 Semua layanan sedang kosong. Coba lagi nanti.' });
        const pg = page(list, parseInt(args[0], 10) || 1, nk().pageSize || 9);
        const rows = serviceRows(pg.items);
        if (pg.cur > 1) rows.push({ title: '⬅️ Halaman sebelumnya', description: `Halaman ${pg.cur - 1}/${pg.pages}`, id: cmd(`nk beli ${pg.cur - 1}`) });
        if (pg.cur < pg.pages) rows.push({ title: '➡️ Halaman berikutnya', description: `Halaman ${pg.cur + 1}/${pg.pages}`, id: cmd(`nk beli ${pg.cur + 1}`) });
        const text = [
            ui.box(menuData.italic('PILIH LAYANAN'), [`Halaman ${pg.cur}/${pg.pages}`, `Saldo kamu : ${rp(user.balance)}`]),
            '',
            '> Pilih aplikasi yang mau dibuatkan nomor.',
            `> Ga ketemu? ketik ${cmd('cari')} <nama app>`,
        ].join('\n');
        return card(m, { text, buttons: withButtons([listBtn('PILIH LAYANAN', [{ title: `Layanan (${pg.cur}/${pg.pages})`, rows }])]) });
    },

    // .nk cari -> petunjuk cari
    async cari(m) {
        return m.reply({ text: `🔎 Ketik: *${cmd('cari')} <nama layanan>*\nContoh: *${cmd('cari')} whatsapp*` });
    },

    // .nk s <slug> -> pilih server
    async s(m, user, [slug]) {
        if (!slug) return;
        const svc = await findService(slug);
        if (!svc) return m.reply({ text: '❌ Layanan tidak ditemukan.' });
        const servers = await listProviders();
        if (servers.length === 1) return ACTIONS.v(m, user, [svc.slug, servers[0].id]);
        const text = [
            ui.box(menuData.italic('PILIH SERVER'), [`Layanan : ${svc.name}`, `Saldo   : ${rp(user.balance)}`]),
            '',
            '> Tiap server beda stok, harga & kecepatan OTP.',
            '> Kosong di satu server? Coba server lain.',
        ].join('\n');
        const buttons = servers.slice(0, 3).map(sv => quick(sv.name, cmd(`nk v ${svc.slug} ${sv.id}`)));
        buttons.push(quick('⬅️ Layanan lain', cmd('nk beli')));
        return card(m, { text, buttons: withButtons(buttons) });
    },

    // .nk v <slug> <provider> [halaman] -> pilih negara
    async v(m, user, [slug, prov, pgArg]) {
        if (!slug || !prov) return;
        const svc = await findService(slug);
        const r = await api.countries(slug, prov);
        if (!r.ok) return apiFail(m, r);
        const list = (r.data || []).filter(c => c.stock > 0).sort((a, b) => (b.country_code === 'ID') - (a.country_code === 'ID') || b.stock - a.stock);
        if (!list.length) {
            return card(m, {
                text: `😔 Stok *${svc?.name || slug}* di server ini kosong.\n\n> Coba server lain.`,
                buttons: withButtons([quick('🔁 Pilih Server Lain', cmd(`nk s ${slug}`)), quick('⬅️ Layanan lain', cmd('nk beli'))]),
            });
        }
        if (list.length === 1) return ACTIONS.c(m, user, [slug, prov, list[0].country_code]);
        const pg = page(list, parseInt(pgArg, 10) || 1, nk().pageSize || 9);
        const rows = pg.items.map(c => ({
            title: trunc(c.name, 24), description: `${rp(ui.sellPrice(c.price).sell)} • stok ${c.stock}`,
            id: cmd(`nk c ${slug} ${prov} ${c.country_code}`),
        }));
        if (pg.cur > 1) rows.push({ title: '⬅️ Halaman sebelumnya', description: `Halaman ${pg.cur - 1}/${pg.pages}`, id: cmd(`nk v ${slug} ${prov} ${pg.cur - 1}`) });
        if (pg.cur < pg.pages) rows.push({ title: '➡️ Halaman berikutnya', description: `Halaman ${pg.cur + 1}/${pg.pages}`, id: cmd(`nk v ${slug} ${prov} ${pg.cur + 1}`) });
        const text = ui.box(menuData.italic('PILIH NEGARA'), [`Layanan : ${svc?.name || slug}`, `Halaman : ${pg.cur}/${pg.pages}`]) + '\n\n> Harga sudah final (tanpa biaya lain).';
        return card(m, { text, buttons: withButtons([listBtn('PILIH NEGARA', [{ title: 'Negara tersedia', rows }])]) });
    },

    // .nk c <slug> <provider> <cc> -> pilih opsi server + harga
    async c(m, user, [slug, prov, cc]) {
        if (!slug || !prov || !cc) return;
        const r = await api.offers(slug, prov, cc);
        if (!r.ok) return apiFail(m, r);
        const offers = (r.data || []).filter(o => o.stock > 0).sort((a, b) => (b.recommended - a.recommended) || a.price - b.price);
        if (!offers.length) {
            return card(m, {
                text: '😔 Stok untuk pilihan ini baru saja habis.\n\n> Coba negara atau server lain.',
                buttons: withButtons([quick('🔁 Server Lain', cmd(`nk s ${slug}`)), quick('🌏 Negara Lain', cmd(`nk v ${slug} ${prov}`))]),
            });
        }
        if (offers.length === 1) return ACTIONS.o(m, user, [slug, prov, cc, offers[0].provider_id, String(offers[0].price)]);
        const rows = offers.slice(0, 10).map(o => ({
            title: trunc(`${o.server_label || o.provider_id}${o.recommended ? ' ⭐' : ''}`, 24),
            description: `${rp(ui.sellPrice(o.price).sell)} • stok ${o.stock}${o.recommended ? ' • stabil' : ''}`,
            id: cmd(`nk o ${slug} ${prov} ${cc} ${o.provider_id} ${o.price}`),
        }));
        const text = ui.box(menuData.italic('PILIH OPSI'), [`Layanan : ${slug}`, `Negara  : ${cc}`]) + '\n\n> ⭐ = pilihan paling stabil saat ini.';
        return card(m, { text, buttons: withButtons([listBtn('PILIH OPSI', [{ title: 'Opsi tersedia', rows }])]) });
    },

    // .nk o <slug> <prov> <cc> <providerId> <apiPrice> -> konfirmasi
    async o(m, user, [slug, prov, cc, pid, apiPrice]) {
        const price = parseInt(apiPrice, 10);
        if (!slug || !prov || !cc || !pid || !(price > 0)) return;
        const svc = await findService(slug);
        const pr = ui.sellPrice(price);
        const enough = user.balance >= pr.sell;
        const text = [
            ui.box(menuData.italic('KONFIRMASI ORDER'), [
                `Layanan : ${svc?.name || slug}`,
                `Negara  : ${cc}`,
                `Harga   : *${rp(pr.sell)}*`,
                `Saldo   : ${rp(user.balance)}${enough ? '' : ' ❌ kurang'}`,
            ]),
            '',
            '> Saldo dipotong saat order dibuat.',
            '> OTP tidak masuk = saldo kembali otomatis.',
        ].join('\n');
        const buttons = enough
            ? [quick('✅ Beli Sekarang', cmd(`nk buy ${slug} ${prov} ${cc} ${pid} ${price}`)), quick('❌ Batal', cmd('nokos'))]
            : [quick(`➕ Deposit (kurang ${rp(pr.sell - user.balance)})`, cmd('nk depo')), quick('❌ Batal', cmd('nokos'))];
        return card(m, { text, buttons: withButtons(buttons) });
    },

    // .nk buy ... -> eksekusi order
    async buy(m, user, [slug, prov, cc, pid, apiPrice]) {
        const price = parseInt(apiPrice, 10);
        if (!slug || !prov || !cc || !pid || !(price > 0)) return;
        const svc = await findService(slug);
        try { await m.react('⏳'); } catch { /* abaikan */ }
        const res = await core.placeOrder({
            user, chat: m.sender, mention: m.mentionJid,
            serviceSlug: svc?.slug || slug, serviceName: svc?.name || slug,
            provider: prov, cc, countryName: cc, providerId: pid, apiPrice: price,
        });

        if (!res.ok) {
            if (res.code === 'price_changed' && res.newApiPrice) {
                const np = ui.sellPrice(res.newApiPrice);
                return card(m, {
                    text: `💱 Harga baru saja berubah menjadi *${rp(np.sell)}*.\nSaldo kamu belum terpotong.`,
                    buttons: withButtons([quick('✅ Lanjut Beli', cmd(`nk buy ${slug} ${prov} ${cc} ${pid} ${res.newApiPrice}`)), quick('❌ Batal', cmd('nokos'))]),
                });
            }
            if (res.code === 'user_balance') {
                await card(m, { text: `💸 Saldo tidak cukup. Butuh *${rp(res.need)}*, saldo kamu *${rp(user.balance)}*.`, buttons: withButtons([quick('➕ Deposit', cmd('nk depo'))]) });
                return receipt.sendReceipt(ui.sendCard, m.Nayla, m.sender, receipt.errorSpec('ORDER GAGAL', 'Saldo tidak cukup', [['Layanan', svc?.name || slug], ['Butuh', rp(res.need)], ['Saldo', rp(user.balance)]]));
            }
            await m.reply({ text: `❌ ${res.message}` });
            return receipt.sendReceipt(ui.sendCard, m.Nayla, m.sender, receipt.errorSpec('ORDER GAGAL', res.message, [['Layanan', svc?.name || slug]]));
        }

        const o = res.order;
        if (res.pending) {
            return m.reply({ text: `⏳ *Order #${o.id} sedang diverifikasi.*\nSaldo ${rp(o.sellPrice)} ditahan sementara. Jangan order ulang, nomor & OTP akan dikirim otomatis ke sini begitu siap. Kalau gagal, saldo kembali.` });
        }
        const buttons = [];
        if (o.phone) buttons.push(copyBtn('📋 Salin Nomor', o.phone));
        buttons.push(quick('❌ Batalkan', cmd(`nk cancel ${o.id}`)));
        if (o.phone) db.updateOrder(o, { phoneSent: true });
        await card(m, { text: ui.orderCreatedText(o), buttons: withButtons(buttons) });
        if (o.phone) receipt.sendReceipt(ui.sendCard, m.Nayla, m.sender, receipt.orderSuccessSpec(o));
        return;
    },

    // .nk cancel <id>
    async cancel(m, user, [id]) {
        const o = db.getOrder(parseInt(id, 10));
        if (!o || o.userId !== user.id) return m.reply({ text: '❌ Order tidak ditemukan.' });
        const r = await core.cancelOrder(o);
        if (!r.ok) return m.reply({ text: `⚠️ ${r.message}` });
        return m.reply({ text: `🔄 Pembatalan order #${o.id} diproses.\nSaldo ${rp(o.sellPrice)} kembali otomatis begitu nomor dipastikan dilepas (biasanya beberapa detik).` });
    },

    // .nk next <id> -> minta OTP berikutnya di nomor yang sama
    async next(m, user, [id]) {
        const o = db.getOrder(parseInt(id, 10));
        if (!o || o.userId !== user.id) return m.reply({ text: '❌ Order tidak ditemukan.' });
        const r = await core.nextOtp(o);
        return m.reply({ text: r.ok ? '🔁 Siap menerima OTP berikutnya di nomor yang sama. Minta kode lagi di aplikasi, OTP otomatis dikirim ke sini.' : `⚠️ ${r.message}` });
    },

    // .nk done <id> -> tutup nomor
    async done(m, user, [id]) {
        const o = db.getOrder(parseInt(id, 10));
        if (!o || o.userId !== user.id) return m.reply({ text: '❌ Order tidak ditemukan.' });
        const r = await core.finishOrder(o);
        return m.reply({ text: r.ok ? `✅ Order #${o.id} selesai. Terima kasih!` : `ℹ️ ${r.message}` });
    },

    // .nk owner -> kontak owner
    async owner(m) {
        return card(m, { text: `💬 Butuh bantuan? Chat owner dan sertakan kode order / deposit kamu.`, buttons: withButtons([urlBtn('Chat Owner', `https://wa.me/${ownerNumber()}`)]) });
    },

    // .nk depo -> menu nominal deposit
    async depo(m, user) {
        const inf = await deposit.info();
        if (!inf.ok || !inf.available) {
            return card(m, { text: '⚠️ Deposit sedang tidak tersedia. Coba lagi beberapa menit lagi.', buttons: withButtons([urlBtn('Hubungi Owner', `https://wa.me/${ownerNumber()}`)]) });
        }
        const { min, max } = deposit.limits(inf);
        const text = [
            ui.box(menuData.italic('DEPOSIT SALDO'), [
                `Saldo kamu : ${rp(user.balance)}`,
                `Minimal    : ${rp(min)}`,
                `Maksimal   : ${rp(max)}`,
                'Metode     : QRIS (semua e-wallet & m-banking)',
                `Berlaku    : ${inf.expiresIn} menit`,
            ]),
            '',
            '> Pilih nominal di bawah, atau ketik sendiri:',
            `> ${cmd('deposit')} 25000`,
            '> Biaya layanan tampil di tagihan sebelum kamu bayar.',
        ].join('\n');
        const presets = (Array.isArray(nk().depositPresets) ? nk().depositPresets : [5000, 10000, 20000]).filter(n => n >= min && n <= max).slice(0, 3);
        const buttons = presets.map(n => quick(rp(n), cmd(`nk d ${n}`)));
        return card(m, { text, buttons: withButtons(buttons) });
    },

    // .nk dqr <id> -> kirim ulang tagihan + QR
    async dqr(m, user, [id]) {
        const d = id ? db.getDeposit(parseInt(id, 10)) : db.userPendingDeposit(user);
        if (!d || d.userId !== user.id || d.status !== 'pending' || !db.isApiDeposit(d)) return checkDeposit(m, user);
        return apiDepositCard(m, d);
    },

    // .nk d <nominal> [metode] -> buat deposit
    async d(m, user, [raw, methodId]) { return createDeposit(m, user, raw, methodId); },

    // .nk dcancel <id> -> batalkan deposit sendiri
    async dcancel(m, user, [id]) {
        const d = db.getDeposit(parseInt(id, 10));
        if (!d || d.userId !== user.id || d.status !== 'pending') return m.reply({ text: '❌ Deposit tidak ditemukan / sudah diproses.' });
        const r = await deposit.cancel(d);
        return m.reply({ text: r.ok ? `✅ Deposit #${d.id} dibatalkan.${db.isApiDeposit(d) ? '\n⚠️ Jangan transfer lagi ke tagihan ini.' : ''}` : `⚠️ ${r.message}` });
    },

    // .nk dcheck <id> -> cek status deposit sekarang
    async dcheck(m, user, [id]) {
        const d = id ? db.getDeposit(parseInt(id, 10)) : db.userPendingDeposit(user);
        if (!d || d.userId !== user.id) return checkDeposit(m, user);
        if (db.isApiDeposit(d) && !d.settled && (d.status === 'pending' || d.status === 'expired')) await deposit.pollOne(d, { force: true });
        return checkDeposit(m, user);
    },
};

/* ------------------------------ CARI / DEPOSIT / PROFIL ------------------------------ */

async function searchServices(m, user, q) {
    const r = await api.services(q);
    if (!r.ok) return apiFail(m, r);
    const list = (r.data || []).filter(s => s.stock > 0);
    if (!list.length) return m.reply({ text: `🔎 Layanan "${q}" tidak ditemukan / stok kosong.` });
    const shown = list.slice(0, 10);
    const text = ui.box(menuData.italic('HASIL CARI'), [`Kata kunci : ${q}`, `Ditemukan  : ${list.length} layanan`]) + (list.length > shown.length ? '\n\n> Terlalu banyak, persempit kata kuncinya.' : '');
    return card(m, { text, buttons: withButtons([listBtn('PILIH LAYANAN', [{ title: 'Hasil pencarian', rows: serviceRows(shown) }])]) });
}

const hmWib = (iso) => ui.hhmm(iso);

/** Tagihan deposit otomatis: FOTO kode QRIS + rincian + tombol. */
async function apiDepositCard(m, d, { reused = false } = {}) {
    const image = await qrisBuffer(d.payment);
    const fee = d.payFee != null ? d.payFee : Math.max(0, d.total - d.credit);
    const text = [
        ui.box(menuData.italic(`DEPOSIT #${d.id}`), [
            `Saldo masuk : ${rp(d.credit)}`,
            `Biaya       : ${rp(fee)}`,
            `*Total bayar : ${rp(d.total)}*`,
            `Batas bayar : ${hmWib(d.expiresAt)}`,
        ]),
        '',
        image
            ? '📱 *Scan QR di atas* pakai e-wallet / m-banking apa pun yang mendukung QRIS.'
            : `⚠️ QR belum bisa ditampilkan.${d.checkoutUrl ? ' Tekan *Buka Halaman Bayar* untuk membayar.' : ' Tekan *Tampilkan QR* untuk mencoba lagi.'}`,
        `> Bayar tepat *${rp(d.total)}*. Saldo masuk otomatis setelah pembayaran terbaca.`,
        reused ? `> (Kamu masih punya deposit #${d.id} yang belum dibayar)` : '',
    ].filter(l => l !== '').join('\n');
    const buttons = [
        ...(d.checkoutUrl ? [urlBtn('🔗 Buka Halaman Bayar', d.checkoutUrl)] : [quick('📷 Tampilkan QR', cmd(`nk dqr ${d.id}`))]),
        quick('🔄 Cek Status', cmd(`nk dcheck ${d.id}`)),
        quick('❌ Batalkan', cmd(`nk dcancel ${d.id}`)),
    ];
    return card(m, { text, buttons: withButtons(buttons), image: image || undefined });
}

/** Deposit user, otomatis via API Nokoskuy v2 (satu-satunya metode). */
async function createDeposit(m, user, raw, methodId) {
    const n = parseAmount(raw);
    if (!n) return ACTIONS.depo(m, user);

    const inf = await deposit.info();
    if (!inf.ok || !inf.available) return m.reply({ text: '⚠️ Deposit sedang tidak tersedia. Coba lagi beberapa menit lagi.' });

    const { min, max } = deposit.limits(inf);
    if (n < min) return m.reply({ text: `❌ Minimal deposit ${rp(min)}.` });
    if (n > max) return m.reply({ text: `❌ Maksimal deposit ${rp(max)} per transaksi.` });

    // satu deposit aktif per user -> tampilkan yang sudah ada
    const mine = db.userPendingDeposit(user);
    if (mine && db.isApiDeposit(mine)) return apiDepositCard(m, mine, { reused: true });

    // pilih metode (kalau lebih dari satu & belum dipilih)
    let method = inf.methods.find(x => x.id === methodId);
    if (!method && inf.methods.length === 1) method = inf.methods[0];
    if (!method) {
        const q = ui.depositQuote(n);
        return card(m, {
            text: ui.box(menuData.italic('PILIH METODE'), [`Nominal : ${rp(n)}`, `Total   : ± ${rp(q.total)} + biaya gateway`]) + '\n\n> Pilih metode pembayaran.',
            buttons: withButtons([...inf.methods.slice(0, 3).map(x => quick(x.label || x.id, cmd(`nk d ${n} ${x.id}`))), quick('❌ Batal', cmd('nokos'))]),
        });
    }

    try { await m.react('⏳'); } catch { /* abaikan */ }
    const r = await deposit.create({ user, chat: m.sender, name: m.pushname, nominal: n, methodId: method.id });
    if (r.ok) return apiDepositCard(m, r.deposit, { reused: !!r.reused });

    if (r.code === 'busy') {
        return card(m, {
            text: `⏳ *Antrean deposit sedang penuh.*\nAda pembayaran lain yang sedang menunggu${r.waitUntil ? ` (selesai paling lambat ${hmWib(r.waitUntil)})` : ''}.\n\n> Coba lagi sebentar ya, biasanya hanya beberapa menit.`,
            buttons: withButtons([quick('🔁 Coba Lagi', cmd(`nk d ${n} ${method.id}`))]),
        });
    }
    if (r.code === 'offline') return m.reply({ text: '⚠️ Deposit sedang offline sementara. Coba lagi beberapa menit lagi.' });
    if (r.code === 'invalid_amount' || r.code === 'invalid_method') return m.reply({ text: `❌ ${r.message}` });
    return m.reply({ text: `⚠️ ${r.message}` });
}

async function sendProfile(m, user) {
    const lastHist = user.history.slice(-5).reverse()
        .map(h => `${h.amount > 0 ? '＋' : '－'}${rp(Math.abs(h.amount))} · ${trunc(h.note || h.type, 26)}`);
    const text = [
        ui.box(menuData.italic('PROFIL'), [
            `Nama      : ${m.pushname}`,
            `Nomor     : ${user.id}`,
            `Role      : ${m.role}`,
            `Saldo     : *${rp(user.balance)}*`,
            `Deposit   : ${rp(user.deposited)}`,
            `Belanja   : ${rp(user.spent)}`,
            `Order OK  : ${user.orders}`,
            `Gabung    : ${new Date(user.joinedAt).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
        ]),
        ...(lastHist.length ? ['', '🧾 *Mutasi terakhir*', ...lastHist] : []),
    ].join('\n');
    return card(m, { text, buttons: withButtons([quick('🛒 Beli Nokos', cmd('nk beli')), quick('➕ Deposit', cmd('nk depo'))]) });
}

const STATUS = {
    creating: '⏳ diproses', unconfirmed: '⏳ verifikasi', waiting: '📲 menunggu OTP', cancelling: '🔄 membatalkan',
    otp_open: '✅ OTP masuk', done: '✅ selesai', refunded: '↩️ refund', failed: '❌ gagal',
};

async function sendHistory(m, user) {
    const list = db.userOrders(user, 8);
    if (!list.length) return card(m, { text: '📜 Belum ada order.', buttons: withButtons([quick('🛒 Order Nomor', cmd('nk beli'))]) });
    const lines = list.map(o => `*#${o.id}* ${trunc(o.serviceName, 14)} · ${rp(o.sellPrice)}\n   ${STATUS[o.status] || o.status}${o.phone ? ' · ' + o.phone : ''}`);
    const active = list.find(o => o.status === 'waiting');
    return card(m, {
        text: ui.box(menuData.italic('RIWAYAT ORDER'), [`${list.length} order terakhir`]) + '\n\n' + lines.join('\n'),
        buttons: withButtons([...(active ? [quick(`❌ Batalkan #${active.id}`, cmd(`nk cancel ${active.id}`))] : []), quick('🛒 Order Lagi', cmd('nk beli'))]),
    });
}

/** .cekdepo -> status deposit user + saldo sekarang */
async function checkDeposit(m, user) {
    const d = db.userPendingDeposit(user);
    if (d && db.isApiDeposit(d)) {
        return card(m, {
            text: ui.box(menuData.italic(`DEPOSIT #${d.id}`), [
                'Status : ⏳ menunggu pembayaran',
                `Total bayar : ${rp(d.total)}`,
                `Batas : ${hmWib(d.expiresAt)}`,
            ]) + `\n\n> Saldo kamu sekarang: *${rp(user.balance)}*\n> Saldo masuk otomatis begitu pembayaran terbaca.`,
            buttons: withButtons([quick('📷 Tampilkan QR', cmd(`nk dqr ${d.id}`)), quick('🔄 Cek Lagi', cmd(`nk dcheck ${d.id}`)), quick('❌ Batalkan', cmd(`nk dcancel ${d.id}`))]),
        });
    }
    // deposit API yang baru kedaluwarsa tapi masih dipantau (telat bayar)
    const grace = db.graceDeposits().find(x => x.userId === user.id);
    if (grace) {
        return card(m, {
            text: `⌛ Deposit #${grace.id} sudah kedaluwarsa, tapi pembayaran yang masuk masih dicek otomatis (kalau kamu sudah membayar).\nSaldo kamu sekarang: *${rp(user.balance)}*`,
            buttons: withButtons([quick('🔄 Cek Lagi', cmd(`nk dcheck ${grace.id}`)), quick('➕ Deposit Baru', cmd('nk depo'))]),
        });
    }
    return card(m, {
        text: `✅ Tidak ada deposit yang menunggu.\nSaldo kamu sekarang: *${rp(user.balance)}*`,
        buttons: withButtons([quick('➕ Deposit', cmd('nk depo')), quick('🛒 Beli Nokos', cmd('nk beli'))]),
    });
}

/* ------------------------------ OWNER ------------------------------ */

/** Resolve nomor owner-input -> user (dibuat kalau belum ada) */
async function resolveUser(m, raw) {
    let n = digits(raw);
    if (n.startsWith('0')) n = '62' + n.slice(1);
    if (n.length < 8) return null;
    let u = db.findUser(n);
    if (u) return u;
    let lid = '';
    try {
        const [r] = await m.Nayla.onWhatsApp(n);
        if (r?.lid) lid = digits(String(r.lid).split('@')[0].split(':')[0]);
    } catch { /* tidak apa-apa */ }
    return db.ensureUser([n, lid], '');
}

/** Ringkas status maintenance untuk panel owner. */
function mtLine() {
    const st = maintenance.status();
    if (st.active) return st.reason === 'manual' ? '🔴 SEDANG (manual)' : st.reason === 'running' ? '🟡 sedang berjalan' : `🔴 SEDANG (buka ${st.reopenAt})`;
    return st.enabled ? `🟢 normal · jadwal ${st.time} WIB` : '⚪ jadwal harian mati';
}

/** .maintenance [on|off|now|auto on|auto off|jam HH:MM|durasi N|status] */
async function maintenanceCmd(m, args) {
    const a = String(args[0] || '').toLowerCase();
    const prefix = cmd('maintenance');
    const show = async () => {
        const st = maintenance.status();
        const last = settings.getMaintenance();
        const lastRun = last.lastRun ? new Date(last.lastRun).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', ':') + ' WIB' : 'belum pernah';
        const text = [
            ui.box(menuData.italic('MAINTENANCE'), [
                `Status   : ${st.active ? (st.reason === 'manual' ? '🔴 DITUTUP (manual)' : st.reason === 'running' ? '🟡 sedang berjalan' : '🔴 DITUTUP (jadwal)') : '🟢 toko buka'}`,
                `Jadwal   : ${st.enabled ? `setiap hari ${st.time} WIB` : 'mati'}`,
                `Durasi   : ${st.windowMin} menit`,
                `Terakhir : ${lastRun}`,
            ]),
            '',
            'Isi maintenance: update harga & stok semua layanan, cek saldo API, cek order nyangkut, laporan ke owner.',
            '',
            `> ${prefix} now · jalankan sekarang`,
            `> ${prefix} on / off · tutup / buka toko manual`,
            `> ${prefix} auto on / off · jadwal harian`,
            `> ${prefix} jam 12:00 · ${prefix} durasi 5`,
        ].join('\n');
        const buttons = [
            quick('▶️ Jalankan Sekarang', cmd('maintenance now')),
            quick(settings.getMaintenance().manual ? '🟢 Buka Toko' : '🔴 Tutup Toko', cmd(`maintenance ${settings.getMaintenance().manual ? 'off' : 'on'}`)),
        ];
        return card(m, { text, buttons: withButtons(buttons) });
    };

    if (!a || a === 'status') return show();
    if (a === 'on') { settings.setMaintenance({ manual: true }); return m.reply({ text: `🔴 *Toko ditutup (maintenance manual).*\nUser tidak bisa order/deposit baru. Buka lagi: *${prefix} off*` }); }
    if (a === 'off') { settings.setMaintenance({ manual: false }); return m.reply({ text: '🟢 *Toko dibuka kembali.*' }); }
    if (a === 'now') {
        await m.reply({ text: '🛠️ Maintenance dijalankan… toko ditutup sebentar untuk order baru.' });
        const r = await maintenance.run({ manual: true });
        return r.ok ? undefined : m.reply({ text: `⚠️ ${r.text}` });     // laporan sukses sudah dikirim ke owner oleh job
    }
    if (a === 'auto') {
        const v = String(args[1] || '').toLowerCase();
        if (v !== 'on' && v !== 'off') return m.reply({ text: `Format: *${prefix} auto on* / *off*` });
        settings.setMaintenance({ enabled: v === 'on' });
        return m.reply({ text: v === 'on' ? `✅ Jadwal harian aktif: setiap hari *${maintenance.status().time} WIB*.` : '⚪ Jadwal harian dimatikan.' });
    }
    if (a === 'jam') {
        const min = maintenance.parseTime(args[1]);
        if (min === null) return m.reply({ text: `Format: *${prefix} jam 12:00*` });
        settings.setMaintenance({ time: maintenance.fmtMin(min) });
        return m.reply({ text: `✅ Maintenance harian diatur jam *${maintenance.fmtMin(min)} WIB*.` });
    }
    if (a === 'durasi') {
        const n = parseInt(args[1], 10);
        if (!(n >= 1 && n <= 120)) return m.reply({ text: `Format: *${prefix} durasi 5* (menit, 1-120)` });
        settings.setMaintenance({ windowMin: n });
        return m.reply({ text: `✅ Toko ditutup selama *${n} menit* saat maintenance.` });
    }
    return show();
}

async function ownerPanel(m) {
    const st = db.stats();
    const bal = await api.balance();
    const mode = settings.isNokosMode();
    const text = [
        ui.box(menuData.italic('PANEL OWNER'), [
            `Mode jualan : ${mode ? '🟢 AKTIF' : '🔴 MATI'}  (lock ${settings.isNokosLock() ? 'on' : 'off'})`,
            `Saldo API   : ${bal.ok ? rp(bal.data.balance) : '⚠️ ' + (bal.error?.code || 'gagal')}`,
            ...(bal.ok && bal.data.active != null ? [`  ├ aktif    : ${rp(bal.data.active)} (bisa ditarik)`, `  └ tertunda : ${rp(bal.data.pending)}${bal.data.pending ? ' (tetap bisa dipakai beli)' : ''}`] : []),
            'Deposit user: ⚡ otomatis (QRIS)',
            `Maintenance : ${mtLine()}`,
            `Untung/order: ${rp(nk().profit?.flat || 0)}${nk().profit?.percent ? ' + ' + nk().profit.percent + '%' : ''}`,
            `Fee deposit : ${rp(nk().depositFee?.flat || 0)}${nk().depositFee?.percent ? ' + ' + nk().depositFee.percent + '%' : ''}`,
        ]),
        ui.box(menuData.italic('STATISTIK'), [
            `User        : ${st.users}`,
            `Saldo user  : ${rp(st.userBalance)}`,
            `Order aktif : ${st.activeOrders}`,
            `Deposit pending: ${st.pendingDeposits}`,
            `Terjual     : ${st.sold} (${rp(st.revenue)})`,
            `Untung order: ${rp(st.orderProfit)}`,
            `Untung depo : ${rp(st.depositFee)}${st.autoDeposits ? ` (${st.autoDeposits} otomatis)` : ''}`,
            `*Hari ini   : ${st.todaySold} order · ${rp(st.todayProfit)}*`,
        ]),
        '',
        '> Saldo user = kewajibanmu. Pastikan saldo API Nokoskuy cukup untuk melayani order.',
    ].join('\n');
    const buttons = [quick(mode ? '🔴 Matikan Mode Jual' : '🟢 Aktifkan Mode Jual', cmd(`nokosmode ${mode ? 'off' : 'on'}`)), quick('🛠️ Maintenance', cmd('maintenance'))];
    return card(m, { text, buttons: withButtons(buttons) });
}

/* ------------------------------ HANDLER ------------------------------ */

const handler = async (m) => {
    const name = m.command.name;
    const on = settings.isNokosMode();

    if (ADMIN_COMMANDS.has(name)) {
        if (!m.isOwner) return m.reply({ text: '❌ Command ini khusus owner.' });
    } else {
        // Mode jualan mati = fitur toko "tidak ada" (user biasa tidak mendapat balasan apa pun)
        if (!on) {
            if (m.isOwner) return m.reply({ text: `ℹ️ Mode jualan sedang *mati*. Nyalakan dengan *${cmd('nokosmode')} on*.` });
            return;
        }
        if (m.isGroup && !m.isOwner) {
            const bn = botNumber(m);
            return card(m, {
                text: '🔒 Demi keamanan OTP & saldo, order hanya lewat *chat pribadi* ke bot ya.',
                buttons: bn ? withButtons([urlBtn('Chat Bot', `https://wa.me/${bn}?text=${encodeURIComponent('menu')}`)]) : [],
            });
        }
    }

    const user = ADMIN_COMMANDS.has(name) ? null : getUser(m);
    const args = m.command.args;

    // Maintenance: tutup order baru & deposit baru untuk user biasa. Owner tetap bebas; order/deposit berjalan tidak terganggu.
    if (!ADMIN_COMMANDS.has(name) && !m.isOwner) {
        const mt = maintenance.status();
        const act = name === 'nk' ? String(args[0] || '').toLowerCase() : '';
        if (mt.active && (MT_BLOCK_COMMANDS.has(name) || (name === 'nk' && MT_BLOCK_ACTIONS.has(act)))) {
            return card(m, { text: maintenance.closedText(mt), buttons: withButtons([quick('💰 Cek Saldo', cmd('saldo'))]) });
        }
    }

    switch (name) {
        case 'nokos':
            return sendStoreMenu(m);

        case 'nk': {
            const act = ACTIONS[String(args[0] || '').toLowerCase()];
            if (!act || typeof act !== 'function') return sendStoreMenu(m);
            return act(m, user, args.slice(1));
        }

        case 'beli':
            return args.length ? searchServices(m, user, args.join(' ')) : ACTIONS.beli(m, user, []);

        case 'cari':
            return args.length ? searchServices(m, user, args.join(' ')) : ACTIONS.cari(m);

        case 'saldo':
        case 'profil':
            return sendProfile(m, user);

        case 'riwayat':
            return sendHistory(m, user);

        case 'rules':
            return card(m, {
                text: ui.box(menuData.italic('RULES NOKOS'), ['Baca sebelum order']) + '\n\n' + (nk().rules || '-'),
                buttons: withButtons([quick('🛒 Order Nomor', cmd('nk beli')), quick('⬅️ Menu', cmd('nokos'))]),
            });

        case 'deposit':
            return args.length ? createDeposit(m, user, args[0]) : ACTIONS.depo(m, user);

        case 'cekdepo':
            return checkDeposit(m, user);

        /* -------- OWNER -------- */
        case 'nokosmode':
        case 'modejual': {
            const a = String(args[0] || '').toLowerCase();
            if (a === 'on' || a === 'off') {
                settings.setNokosMode(a === 'on');
                if (a === 'on' && !api.hasKey()) await m.reply({ text: '⚠️ API key Nokoskuy masih kosong. Isi di src/config.js -> nokos.apiKey (atau env NKS_KEY).' });
                return m.reply({ text: a === 'on'
                    ? `🟢 *Mode jualan AKTIF*\n*${cmd('menu')}* sekarang hanya menampilkan Nokos Store${settings.isNokosLock() ? ' (fitur lain dikunci untuk user biasa)' : ''}.\nMatikan: *${cmd('nokosmode')} off*`
                    : `🔴 *Mode jualan MATI*\nBot kembali normal, fitur toko disembunyikan. Order yang sedang berjalan tetap diproses sampai selesai.` });
            }
            return m.reply({ text: `Mode jualan: *${on ? 'AKTIF 🟢' : 'MATI 🔴'}*\nGunakan: *${cmd('nokosmode')} on* / *off*` });
        }

        case 'nokoslock': {
            const a = String(args[0] || '').toLowerCase();
            if (a === 'on' || a === 'off') {
                settings.setNokosLock(a === 'on');
                return m.reply({ text: a === 'on'
                    ? '🔒 *Kunci toko ON*: saat mode jualan aktif, user biasa HANYA bisa memakai fitur toko. Owner tetap bebas.'
                    : '🔓 *Kunci toko OFF*: menu hanya menampilkan toko, tapi command lain tetap bisa diketik.' });
            }
            return m.reply({ text: `Kunci toko: *${settings.isNokosLock() ? 'ON' : 'OFF'}*\nGunakan: *${cmd('nokoslock')} on* / *off*` });
        }

        case 'addsaldo':
        case 'minsaldo': {
            const amount = parseAmount(args[1]);
            if (!args[0] || !amount) return m.reply({ text: `Format: *${cmd(name)} 628xxx 5000*` });
            const u = await resolveUser(m, args[0]);
            if (!u) return m.reply({ text: '❌ Nomor tidak valid.' });
            if (name === 'addsaldo') db.credit(u, amount, 'Tambah saldo oleh owner', 'admin');
            else if (!db.debit(u, amount, 'Kurang saldo oleh owner', 'admin')) return m.reply({ text: `❌ Saldo user cuma ${rp(u.balance)}.` });
            return m.reply({ text: `✅ Saldo *${u.name || u.id}* sekarang *${rp(u.balance)}* (${name === 'addsaldo' ? '+' : '-'}${rp(amount)})` });
        }

        case 'listdepo': {
            const list = db.pendingDeposits();
            if (!list.length) return m.reply({ text: '✅ Tidak ada deposit pending.' });
            const lines = list.map(d => `*#${d.id}* ${d.name || d.userId} · transfer ${rp(d.total)} · batas ${hmWib(d.expiresAt)}`);
            return m.reply({ text: `💳 *Deposit pending (${list.length})*\n${lines.join('\n')}\n\n⚡ Otomatis: saldo masuk sendiri begitu pembayaran terbaca.` });
        }

        case 'nokosinfo':
            return ownerPanel(m);

        case 'maintenance':
            return maintenanceCmd(m, args);
    }
};

module.exports = handler;
module.exports.sendStoreMenu = sendStoreMenu; // dipakai menu.js saat mode jualan aktif
