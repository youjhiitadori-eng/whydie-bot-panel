const config = require('../config');
const { formatUptime } = require('../utils/helper');
const settings = require('../utils/settings');

const handler = async (m) => {
    const { command, sender, msg } = m;
    const p = config.prefix;

    switch (command.name) {
        case 'ping': {
            const ts = Number(msg.messageTimestamp?.low ?? msg.messageTimestamp) || 0;
            const ms = ts ? Math.max(0, Date.now() - ts * 1000) : 0;
            return m.reply({ text: `🏓 *Pong!*\n⚡ Respon: ${ms} ms\n⏱️ Runtime: ${formatUptime(process.uptime())}` });
        }

        case 'runtime': {
            return m.reply({ text: `⏱️ *Runtime ${config.botName}*\n${formatUptime(process.uptime())}` });
        }

        case 'owner': {
            const nums = [].concat(config.superOwner).map(n => String(n).replace(/\D/g, ''));
            const list = nums.map(n => `• wa.me/${n}`).join('\n');
            return m.reply({ text: `👑 *Owner ${config.botName}*\n${config.ownerName}\n${list}\n\n🌐 ${config.website}` });
        }

        case 'onbutton': {
            settings.setButton(sender, true);
            return m.reply({ text: `✅ Button menu *aktif* di chat ini.\nKetik ${p}menu untuk melihat.` });
        }

        case 'offbutton': {
            settings.setButton(sender, false);
            return m.reply({ text: `✅ Button menu *dimatikan* di chat ini.\nKetik ${p}allmenu untuk semua menu, atau ${p}onbutton untuk menyalakan lagi.` });
        }

        case 'self': {
            if (!m.isOwner) return m.reply({ text: '❌ Command ini khusus owner.' });
            settings.setMode('self');
            return m.reply({ text: '🔒 Mode *Self*: bot hanya merespon owner.' });
        }

        case 'public': {
            if (!m.isOwner) return m.reply({ text: '❌ Command ini khusus owner.' });
            settings.setMode('public');
            return m.reply({ text: '🌐 Mode *Public*: bot merespon semua orang.' });
        }

    }
};

module.exports = handler;
