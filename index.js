require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    PermissionFlagsBits, 
    EmbedBuilder, 
    Collection, 
    Events, 
    ActivityType 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
    ]
});

const CONFIG = {
    SPAM: {
        MAX_MESSAGES: 3,
        WINDOW: 2000,
        DUPLICATE_LIMIT: 2,
        EMOJI_LIMIT: 8,
    },
    PUNISHMENT: {
        DEFAULT_TYPE: 'BAN',
        PURGE_LIMIT: 100,
        MIN_AGE_HOURS: 12,
    },
    THEME: {
        COLOR_CRITICAL: 0xFF0000,
        COLOR_INFO: 0x00FF00,
    }
};

const SYSTEM_STATE = {
    msgLogs: new Collection(),
    contentFingerprints: new Collection(),
    cooldowns: new Set(),
    lockdownActive: false,
    stats: {
        punishedCount: 0,
        cleanedCount: 0,
        startTime: Date.now()
    }
};

const ROAST_MATRIX = [
    "偵測到低端自動化代碼。這種洗版頻率，你的伺服器是跑在烤麵包機上面嗎？",
    "處決程序已完成。垃圾就該待在回收桶，而不是我的頻道裡。",
    "你的創作者顯然在編寫邏輯時睡著了。已執行物理抹除。",
    "這種無腦 Spam 甚至連讓我 CPU 升溫 1 度都辦不到，太令我失望了。",
    "偵測到非人類智慧（且智商極低）。已將該二進位廢料踢出伺服器。",
    "已執行『清道夫協議』。你的訊息痕跡已被全數焚毀，沒人會記得你來過。",
    "像你這種免洗機器人，連被當成垃圾郵件過濾器的資格都沒有。",
    "再見了，這位試圖用 Ctrl+V 挑戰系統的弱智。你的表現：0 分。",
    "已檢測到污染源。正在進行深度除汙作業... 成功移除一名廢物。",
    "你的洗版速度很快，但我封鎖你的速度更快。這就是實力差距。"
];

const getRandomRoast = () => ROAST_MATRIX[Math.floor(Math.random() * ROAST_MATRIX.length)];

const getUptime = () => {
    const totalSeconds = (Date.now() - SYSTEM_STATE.stats.startTime) / 1000;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}時 ${minutes}分`;
};

async function massPurge(channel, userId) {
    try {
        const fetched = await channel.messages.fetch({ limit: CONFIG.PUNISHMENT.PURGE_LIMIT });
        const userMessages = fetched.filter(m => m.author.id === userId || (m.webhookId && m.webhookId === userId));
        if (userMessages.size > 0) {
            const deleted = await channel.bulkDelete(userMessages, true);
            SYSTEM_STATE.stats.cleanedCount += deleted.size;
            return deleted.size;
        }
    } catch (err) {
        console.error(`[清理失敗] ${err.message}`);
    }
    return 0;
}

async function executeJustice(message, reason, type = CONFIG.PUNISHMENT.DEFAULT_TYPE) {
    const { author, member, channel, guild, webhookId } = message;

    // 1. 無論是否在冷卻，只要進來就先刪掉當下這條違規訊息
    await message.delete().catch(() => {});

    if (author.id === guild.ownerId) return;

    // 2. 檢查冷卻 (這決定要不要發嘲諷文字和面板)
    if (SYSTEM_STATE.cooldowns.has(author.id)) return;
    SYSTEM_STATE.cooldowns.add(author.id);

    // 3. 執行大量清理 (找出過去 100 則內的違規訊息)
    const cleaned = await massPurge(channel, author.id);

    const modLogChannel = guild.channels.cache.find(ch => ch.name === '⛔│modlog');

    // 4. 現場嘲諷與後台面板
    await channel.send(`*"${getRandomRoast()}"*`).catch(() => {});

    const justiceEmbed = new EmbedBuilder()
        .setColor(CONFIG.THEME.COLOR_CRITICAL)
        .setTitle('🚫 【 系統裁決：永久驅逐與抹除 】')
        .setThumbnail(author.displayAvatarURL())
        .addFields(
            { name: '罪犯帳號', value: `**${author.tag}** (\`${author.id}\`)`, inline: false },
            { name: '裁決罪名', value: `\`${reason}\``, inline: true },
            { name: '清理成果', value: `\`${cleaned}\` 則垃圾訊息`, inline: true },
            { name: '現場頻道', value: `${channel}`, inline: true }
        )
        .setFooter({ text: 'GodShield 防護核心 | 錄影存證中' })
        .setTimestamp();

    if (modLogChannel) {
        await modLogChannel.send({ embeds: [justiceEmbed] }).catch(() => {});
    }

    // 5. 處罰程序
    try {
        if (webhookId) {
            const webhooks = await channel.fetchWebhooks();
            const targetWebhook = webhooks.get(webhookId);
            if (targetWebhook) await targetWebhook.delete('惡意 Webhook 攔截');
        } else {
            if (type === 'BAN') {
                await member.ban({ deleteMessageSeconds: 86400, reason: `[ANTI-RAID] ${reason}` });
            } else if (member.kickable) {
                await member.kick(`[ANTI-RAID] ${reason}`);
            }
            SYSTEM_STATE.stats.punishedCount++;
        }
    } catch (e) {
        if (modLogChannel) await modLogChannel.send(`❌ 處決失敗：無法處理 ${author.tag}，請檢查階級。`);
    } finally {
        setTimeout(() => SYSTEM_STATE.cooldowns.delete(author.id), 10000);
    }
}

client.once(Events.ClientReady, (c) => {
    console.log(`GodShield-Bot 在線: ${c.user.tag}`);
    client.user.setActivity('掃描垃圾機器人...', { type: ActivityType.Watching });
});

client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || message.author.id === client.user.id) return;

    const { author, content, channel, member, webhookId } = message;
    const now = Date.now();

    const criticalLinks = ['discord.com/oauth2/authorize', '新增應用程式', 'oauth2/authorize', 'bit.ly', 't.me'];
    if (criticalLinks.some(link => content.toLowerCase().includes(link))) {
        return executeJustice(message, "散佈惡意授權連結或跳轉網址", 'BAN');
    }

    if (message.mentions.everyone && author.id !== message.guild.ownerId) {
        return executeJustice(message, "試圖非法廣播 (@everyone)", 'BAN');
    }

    if (!SYSTEM_STATE.contentFingerprints.has(author.id)) {
        SYSTEM_STATE.contentFingerprints.set(author.id, { lastContent: '', count: 0 });
    }
    const fingerprint = SYSTEM_STATE.contentFingerprints.get(author.id);
    if (content === fingerprint.lastContent && content.length > 2) {
        fingerprint.count++;
    } else {
        fingerprint.lastContent = content;
        fingerprint.count = 1;
    }

    if (fingerprint.count >= CONFIG.SPAM.DUPLICATE_LIMIT) {
        return executeJustice(message, "機器人內容指紋重複", 'BAN');
    }

    if (!SYSTEM_STATE.msgLogs.has(author.id)) {
        SYSTEM_STATE.msgLogs.set(author.id, []);
    }
    const logs = SYSTEM_STATE.msgLogs.get(author.id);
    logs.push(now);
    const recentLogs = logs.filter(t => now - t < CONFIG.SPAM.WINDOW);
    SYSTEM_STATE.msgLogs.set(author.id, recentLogs);

    if (recentLogs.length >= CONFIG.SPAM.MAX_MESSAGES) {
        SYSTEM_STATE.msgLogs.delete(author.id);
        return executeJustice(message, "爆發性洗版偵測", 'BAN');
    }

    if (content.startsWith('!GodShield')) {
        const args = content.split(' ');
        const cmd = args[1];
        if (cmd === 'stats') {
            const statsEmbed = new EmbedBuilder()
                .setTitle('GodShield 系統狀態')
                .setColor(CONFIG.THEME.COLOR_INFO)
                .addFields(
                    { name: '已處決罪犯', value: `\`${SYSTEM_STATE.stats.punishedCount}\` 人`, inline: true },
                    { name: '已抹除垃圾', value: `\`${SYSTEM_STATE.stats.cleanedCount}\` 則`, inline: true },
                    { name: '戒嚴模式', value: SYSTEM_STATE.lockdownActive ? '🔴 啟動' : '🟢 正常', inline: true }
                );
            return channel.send({ embeds: [statsEmbed] });
        }
        if (cmd === 'lockdown' && member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            SYSTEM_STATE.lockdownActive = !SYSTEM_STATE.lockdownActive;
            return channel.send(`**伺服器戒嚴模式已${SYSTEM_STATE.lockdownActive ? '開啟' : '關閉'}**。`);
        }
    }
});

client.on(Events.GuildMemberAdd, async (member) => {
    if (SYSTEM_STATE.lockdownActive) {
        await member.kick("戒嚴模式").catch(() => {});
        return;
    }
    const accountAge = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60);
    if (accountAge < CONFIG.PUNISHMENT.MIN_AGE_HOURS) {
        const channel = member.guild.systemChannel || member.guild.channels.cache.find(c => c.type === ChannelType.GuildText);
        if (channel) channel.send(`**高風險帳號警告**: ${member.user.tag} (建立不足12小時)`);
    }
});

process.on('unhandledRejection', (reason) => console.error(reason));
process.on('uncaughtException', (err) => console.error(err));

client.login(process.env.TOKEN);

setInterval(() => {
    SYSTEM_STATE.msgLogs.clear();
    SYSTEM_STATE.contentFingerprints.clear();
    console.log(`[優化] 防禦緩存已重置。`);
}, 600000);
