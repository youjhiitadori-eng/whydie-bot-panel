// Tes .backup: node tests/backup.test.js  (WhatsApp dipalsukan; zip dibuat sungguhan di folder bot lalu dibersihkan)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const handler = require('../src/commands/backupsc');

const WORK = path.join(__dirname, '..', 'backup', '_tmp');

function fakeM(failFirstSends) {
    const out = { sent: [], reacts: [], replies: [], tmpDuringSend: [] };
    let fails = failFirstSends;
    return {
        out,
        m: {
            isOwner: true, isGroup: false, sender: '6281@s.whatsapp.net', senderNumber: '6281', command: { name: 'backup', args: ['fix'], fullArgs: 'fix' },
            react: async (e) => out.reacts.push(e),
            reply: async (c) => out.replies.push(c.text),
            Nayla: {
                sendMessage: async (jid, c) => {
                    out.tmpDuringSend.push(process.env.TMPDIR);
                    assert(c.document?.url && fs.existsSync(c.document.url), 'file zip harus ada & dikirim lewat path (stream)');
                    if (fails-- > 0) throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });
                    out.sent.push({ jid, name: c.fileName, size: fs.statSync(c.document.url).size });
                    return {};
                },
            },
        },
    };
}

(async () => {
    assert(handler.commands.includes('backup') && handler.commands.includes('bakucp'));
    assert(require('../src/config').ownerOnlyCommands.includes('backup'));

    // normal
    let t = fakeM(0); await handler(t.m);
    assert.strictEqual(t.out.sent.length, 1, JSON.stringify(t.out.replies));
    assert(t.out.sent[0].size > 1000 && t.out.sent[0].name.endsWith('.zip'));
    assert.strictEqual(path.resolve(t.out.tmpDuringSend[0]), path.resolve(WORK), 'file sementara WhatsApp harus di folder bot');
    assert.deepStrictEqual(t.out.reacts, ['⏳', '✅']);
    assert.deepStrictEqual(fs.readdirSync(WORK), [], 'zip harus dibersihkan');

    // ENOSPC sekali -> otomatis bersihkan & coba lagi -> berhasil
    t = fakeM(1); await handler(t.m);
    assert.strictEqual(t.out.sent.length, 1);
    assert.strictEqual(t.out.reacts.at(-1), '✅');

    // ENOSPC terus -> pesan jelas, tidak ada file tersisa
    t = fakeM(5); await handler(t.m);
    assert.strictEqual(t.out.sent.length, 0);
    assert(/Disk server penuh/.test(t.out.replies[0]), t.out.replies[0]);
    assert.deepStrictEqual(fs.readdirSync(WORK), []);

    // bukan owner
    t = fakeM(0); t.m.isOwner = false; await handler(t.m);
    assert(/khusus Owner/.test(t.out.replies[0]));
    console.log('OK: backup');
})().catch(e => { console.error(e); process.exit(1); });
