require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    PermissionFlagsBits, 
    EmbedBuilder, 
    Collection, 
    Events, 
    ActivityType,
    AuditLogEvent,
    ChannelType
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
    // 頻率限制
    SPAM: {
        MAX_MESSAGES: 4,        // 5秒內最多5則
        WINDOW: 5000,           // 5秒區間
        DUPLICATE_LIMIT: 2,     // 連續3則相同內容即判定為機器人
        EMOJI_LIMIT: 8,        // 單則 Emoji 上限
    },
    PUNISHMENT: {
        DEFAULT_TYPE: 'BAN',    // 預設直接封鎖，不留情面
        PURGE_LIMIT: 100,       // 處決時往回清理 100 則訊息
        MIN_AGE_HOURS: 12,      // 帳號建立未滿 12 小時視為高風險
    },
    THEME: {
        COLOR_CRITICAL: 0xFF0000, // 處決紅
        COLOR_INFO: 0x00FF00,     // 系統綠
    }
};

const SYSTEM_STATE = {
    msgLogs: new Collection(),      // 用戶頻率記錄
    contentFingerprints: new Collection(), // 內容重複性記錄
    cooldowns: new Set(),           // 處理中冷卻，防止異步衝突
    lockdownActive: false,          // 戒嚴狀態
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
        const userMessages = fetched.filter(m => m.author.id === userId);
        
        if (userMessages.size > 0) {
            const deleted = await channel.bulkDelete(userMessages, true);
            SYSTEM_STATE.stats.cleanedCount += deleted.size;
            return deleted.size;
        }
    } catch (err) {
        console.error(`[清理失敗] 可能是權限不足或訊息超過14天: ${err.message}`);
    }
    return 0;
}

async function executeJustice(message, reason, type = CONFIG.PUNISHMENT.DEFAULT_TYPE) {
    const { author, member, channel, guild } = message;

    if (SYSTEM_STATE.cooldowns.has(author.id)) return;
    SYSTEM_STATE.cooldowns.add(author.id);

    await message.delete().catch(() => {});

    const cleaned = await massPurge(channel, author.id);

    const justiceEmbed = new EmbedBuilder()
        .setColor(CONFIG.THEME.COLOR_CRITICAL)
        .setTitle('🚫 【 系統裁決：永久驅逐與抹除 】')
        .setThumbnail(author.displayAvatarURL())
        .addFields(
            { name: '罪犯帳號', value: `**${author.tag}** (\`${author.id}\`)`, inline: false },
            { name: '裁決罪名', value: `\`${reason}\``, inline: true },
            { name: '清理成果', value: `\`${cleaned}\` 則垃圾訊息`, inline: true },
            { name: '執行官評價', value: `*"${getRandomRoast()}"*` }
        )
        .setFooter({ text: 'SPECTRA 防護核心 | 絕不留活口' })
        .setTimestamp();

    try {
        if (type === 'BAN') {
            await member.ban({ reason: `[ANTI-RAID] ${reason}` });
        } else {
            if (member.kickable) await member.kick(`[ANTI-RAID] ${reason}`);
        }
        
        SYSTEM_STATE.stats.punishedCount++;
        await channel.send({ content: `🚨 **偵測到違規自動化行為，正在處決...**`, embeds: [justiceEmbed] });
    } catch (e) {
        await channel.send(`❌ 無法完全處決 ${author.tag}，請檢查管理員權限順序。`);
    } finally {
        setTimeout(() => SYSTEM_STATE.cooldowns.delete(author.id), 10000);
    }
}

client.once(Events.ClientReady, (c) => {
    console.log(`
    ==================================================
    GodShield-Bot 加載完畢
    客戶端: ${c.user.tag}
    時間: ${new Date().toLocaleString()}
    模式: 暴力刪除 / 當眾羞辱 / 自動處決
    ==================================================
    `);
    
    client.user.setActivity('掃描垃圾機器人...', { type: ActivityType.Watching });
});

client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || message.author.bot) return;

    const { author, content, channel, member } = message;
    const now = Date.now();

    if (message.mentions.everyone) {
        return executeJustice(message, "試圖非法廣播 (@everyone)", 'BAN');
    }

    if (!SYSTEM_STATE.contentFingerprints.has(author.id)) {
        SYSTEM_STATE.contentFingerprints.set(author.id, { lastContent: '', count: 0 });
    }
    const fingerprint = SYSTEM_STATE.contentFingerprints.get(author.id);
    
    if (content === fingerprint.lastContent && content.length > 3) {
        fingerprint.count++;
    } else {
        fingerprint.lastContent = content;
        fingerprint.count = 1;
    }

    if (fingerprint.count >= CONFIG.SPAM.DUPLICATE_LIMIT) {
        return executeJustice(message, "極高內容重複性 (機器人特徵)", 'BAN');
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
        return executeJustice(message, "爆發性高頻洗版 (Burst Spam)", 'BAN');
    }

    const emojiRegex = /<a?:.+?:\d+>|[\u{1f300}-\u{1f5ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{1f700}-\u{1f77f}\u{1f780}-\u{1f7ff}\u{1f900}-\u{1f9ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}]/gu;
    const emojiMatch = content.match(emojiRegex);
    if (emojiMatch && emojiMatch.length > CONFIG.SPAM.EMOJI_LIMIT) {
        await message.delete().catch(() => {});
        return channel.send(`🤡 ${author}，別再刷表情符號了。這種行為真的很低端。`);
    }

    if (content.startsWith('!spectra')) {
        const args = content.split(' ');
        const cmd = args[1];

        if (cmd === 'stats') {
            const statsEmbed = new EmbedBuilder()
                .setTitle('📊 SPECTRA 系統運行狀況')
                .setColor(CONFIG.THEME.COLOR_INFO)
                .addFields(
                    { name: '運作時間', value: `\`${getUptime()}\``, inline: true },
                    { name: '已處決罪犯', value: `\`${SYSTEM_STATE.stats.punishedCount}\` 人`, inline: true },
                    { name: '已抹除垃圾', value: `\`${SYSTEM_STATE.stats.cleanedCount}\` 則訊息`, inline: true },
                    { name: '當前監控中', value: `\`${SYSTEM_STATE.msgLogs.size}\` 用戶`, inline: true },
                    { name: '戒嚴模式', value: SYSTEM_STATE.lockdownActive ? '🔴 啟動中' : '🟢 正常', inline: true }
                )
                .setTimestamp();
            return channel.send({ embeds: [statsEmbed] });
        }

        if (cmd === 'lockdown') {
            if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) return;
            SYSTEM_STATE.lockdownActive = !SYSTEM_STATE.lockdownActive;
            return channel.send(`🚧 **伺服器戒嚴模式已${SYSTEM_STATE.lockdownActive ? '開啟' : '關閉'}**。`);
        }
    }
});

client.on(Events.GuildMemberAdd, async (member) => {
    const accountAge = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60);
    
    if (SYSTEM_STATE.lockdownActive) {
        try {
            await member.send("伺服器目前處於戒嚴狀態，暫不接受新成員。").catch(() => {});
            await member.kick("戒嚴模式攔截");
        } catch (e) {}
        return;
    }

    if (accountAge < CONFIG.PUNISHMENT.MIN_AGE_HOURS) {
        console.log(`[攔截] 免洗帳號: ${member.user.tag}`);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[⚠️ 未處理的錯誤]', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[🚨 致命錯誤]', err);
});

client.login(process.env.TOKEN);

setInterval(() => {
    const now = Date.now();
    SYSTEM_STATE.msgLogs.sweep((logs) => logs.every(t => now - t > 3600000));
    SYSTEM_STATE.contentFingerprints.sweep(() => true); 
    console.log(`[系統優化] 記憶體緩存已清理。`);
}, 3600000);
