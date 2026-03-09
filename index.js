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
        DUPLICATE_LIMIT: 3,
        EMOJI_LIMIT: 10,
        MAX_CHARS: 350,
    },
    PUNISHMENT: {
        DEFAULT_TYPE: 'BAN',
        PURGE_LIMIT: 100,
        MIN_AGE_HOURS: 12,
    },
    THEME: {
        COLOR_CRITICAL: 0xFF0000,
        COLOR_INFO: 0x00FF00,
    },
    CHANNEL_PROTECT: {
        MAX_ACTIONS_PER_WINDOW: 3,
        WINDOW_MS: 10000,
    }
};

const SYSTEM_STATE = {
    msgLogs: new Collection(),
    contentFingerprints: new Collection(),
    cooldowns: new Set(),
    roleTracker: new Collection(),
    channelTracker: new Collection(),
    stats: {
        punishedCount: 0,
        cleanedCount: 0,
        startTime: Date.now()
    }
};

const ROLE_PROTECT_CONFIG = {
    MAX_ROLES_PER_WINDOW: 3, 
    WINDOW_MS: 10000,
};

const ROAST_MATRIX = [
    "警告：監測到受控對象 ${target} 觸發多重異常權限請求，存取路徑已強制鎖定。",
    "警告：受控對象 ${target} 之行為模式判定為惡意攻擊，已執行強制撤銷協議。",
    "警告：核心防護已識別 ${target} 為嚴重安全威脅，存取權限已終止並抹除。",
    "警告：受控對象 ${target} 嚴重違反流量控制準則，系統已自動執行實體隔離程序。",
    "警告：目標對象 ${target} 試圖規避系統檢測，相關識別碼已寫入永久黑名單。",
    "警告：已完整記錄 ${target} 之異常行為紀錄，相關存取憑證已執行失效處置。",
    "警告：偵測到 ${target} 散佈不符合規範之數據包，系統已啟動預防性攔截機制。",
    "警告：受控對象 ${target} 權限等級檢核未通過，系統已自動執行驅逐程序。",
    "警告：目標對象 ${target} 匹配已知惡意指紋，防禦陣列已將其從伺服器中剔除。",
    "警告：維護提示，已成功過濾來自 ${target} 的非法數據流，連線路徑已永久關閉。"
];

const getRandomRoast = (user) => {
    const rawText = ROAST_MATRIX[Math.floor(Math.random() * ROAST_MATRIX.length)];
    return rawText.replace('${target}', `<@${user.id}>`);
};

const getUptime = () => {
    const totalSeconds = (Date.now() - SYSTEM_STATE.stats.startTime) / 1000;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}時 ${minutes}分`;
};

async function massPurge(channel, userId) {
    try {
        const fetched = await channel.messages.fetch({ limit: 100 });
        const userMessages = fetched.filter(m => m.author.id === userId || m.webhookId === userId);
        
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
    
    if (author.id === guild.ownerId) return;
    if (member && member.permissions.has(PermissionFlagsBits.Administrator)) {
return await triggerAntiNuke(guild, author, `管理員行為異常: ${reason}`);
}
    
    await message.delete().catch(() => {});

    if (SYSTEM_STATE.cooldowns.has(author.id)) return;
    
    SYSTEM_STATE.cooldowns.add(author.id);

    const cleaned = await massPurge(channel, author.id);
    const modLogChannel = guild.channels.cache.find(ch => ch.name === '⛔│modlog');

    await channel.send(getRandomRoast(author)).catch(() => {});

    const justiceEmbed = new EmbedBuilder()
        .setColor(CONFIG.THEME.COLOR_CRITICAL)
        .setTitle('惡意行為攔截成功')
        .setThumbnail(author.displayAvatarURL())
        .addFields(
            { name: '帳號名稱', value: `**${author.tag}** (\`${author.id}\`)`, inline: false },
            { name: '違反規則', value: `\`${reason}\``, inline: false },
            { name: '刪除訊息', value: `\`${cleaned}\` 則`, inline: false },
            { name: '事件頻道', value: `${channel}`, inline: false }
        )
        .setFooter({ text: 'GodShield 防禦機器人' })
        .setTimestamp();

    if (modLogChannel) {
        await modLogChannel.send({ embeds: [justiceEmbed] }).catch(() => {});
    }

    try {
    if (webhookId) {
        const webhooks = await channel.fetchWebhooks();
        const targetWebhook = webhooks.get(webhookId);
        if (targetWebhook) await targetWebhook.delete('惡意 Webhook 攔截');
    } else {
        
        if (member.moderatable) await member.timeout(60000, "處決前預防性禁言");
        
        await guild.bans.create(author.id, { deleteMessageSeconds: 86400, reason: `[先禁後斬] ${reason}` });
        
        SYSTEM_STATE.stats.punishedCount++;
    }
    } catch (e) {
        if (modLogChannel) await modLogChannel.send(`處理失敗：無法處理 ${author.tag}，權限不足`);
    } finally {
        setTimeout(() => SYSTEM_STATE.cooldowns.delete(author.id), 60000);
    }
}

async function triggerAntiNuke(guild, executor, reason) {
    const member = await guild.members.fetch(executor.id).catch(() => null);
    if (!member) return;

    console.log(`[緊急反制] ${executor.tag} 觸發了 ${reason}`);

    if (member.manageable) {
        try {
            await member.roles.set([], `[GodShield 緊急反制] ${reason}`);
        } catch (e) {
            console.error("無法解除權限:", e.message);
        }
    }

    const modLog = guild.channels.cache.find(ch => ch.name === '⛔│modlog') || guild.systemChannel;
    if (modLog) {
        const nukeEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('偵測到未經授權的高階權限異動，系統已啟動自動防禦機制進行攔截')
            .setDescription(getRandomRoast(executor))
            .addFields(
                { name: '受控對象', value: `${executor.tag} (\`${executor.id}\`)` },
                { name: '惡意行為', value: `\`${reason}\`` },
                { name: '系統處置', value: `已剝離所有身分組並封鎖行動` }
            )
            .setTimestamp();
        await modLog.send({ embeds: [nukeEmbed] }).catch(() => {});
    }
    try {
    await guild.bans.create(executor.id, { 
        deleteMessageSeconds: 604800, 
        reason: `[GodShield Anti-Nuke] ${reason}` 
    });
    SYSTEM_STATE.stats.punishedCount++;
    console.log(`[成功封鎖] 已將 ${executor.tag} 永久列入黑名單。`);
} catch (e) {
    console.error(`[封鎖失敗] 無法封鎖 ${executor.id}: ${e.message}`);
}
}

client.once(Events.ClientReady, async (c) => {
    console.log(`GodShield-Bot 在線: ${c.user.tag}`);
    client.user.setActivity('GodShield Bot 實時防護中', { type: ActivityType.Watching });

    const commands = [
    {
        name: 'gs-stats',
        description: '查看 GodShield 目前的處決戰績'
    },
    {
        name: 'gs-purge',
        description: '刪除違規成員的所有訊息 (最近 100 則)',
        options: [
            {
                name: 'user',
                type: 6,
                description: '要清理訊息的對象',
                required: true
            }
        ]
    },
    {
        name: 'gs-unban',
        description: '解除違規成員的封鎖狀態',
        options: [
            {
                name: 'user_id',
                type: 3,
                description: '要解除封鎖的用戶 ID',
                required: true
            }
        ]
    }
];

    try {
        await client.application.commands.set(commands);
        console.log('斜線指令已同步到 Discord 全域伺服器');
    } catch (error) {
        console.error('同步指令時發生錯誤:', error);
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, guild, member } = interaction;

    if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: '抱歉，此指令僅限擁有「管理員」權限的成員使用。', ephemeral: true });
    }

    if (commandName === 'gs-stats') {
        const statsEmbed = new EmbedBuilder()
            .setTitle('GodShield 數據報告')
            .setColor(CONFIG.THEME.COLOR_INFO)
            .addFields(
                { name: '攔截威脅總數', value: `\`${SYSTEM_STATE.stats.punishedCount}\` 次`, inline: true },
                { name: '數據清理規模', value: `\`${SYSTEM_STATE.stats.cleanedCount}\` 則`, inline: true },
                { name: '系統持續運行時間', value: `\`${getUptime()}\``, inline: true }
            )
            .setTimestamp();
        await interaction.reply({ embeds: [statsEmbed] });
    }
    
    if (commandName === 'gs-purge') {
        const targetUser = options.getUser('user');
        await interaction.deferReply({ ephemeral: true });

        try {
            const fetched = await interaction.channel.messages.fetch({ limit: 100 });
            const userMessages = fetched.filter(m => m.author.id === targetUser.id);
            
            if (userMessages.size === 0) {
                return interaction.editReply(`在最近的記錄中找不到 ${targetUser.tag} 的訊息。`);
            }

            const deleted = await interaction.channel.bulkDelete(userMessages, true);
            SYSTEM_STATE.stats.cleanedCount += deleted.size;
            interaction.editReply(`已成功移除 ${targetUser.tag} 的 \`${deleted.size}\` 則訊息。`);
        } catch (err) {
            interaction.editReply(`清理失敗：${err.message}`);
        }
    }

    if (commandName === 'gs-unban') {
        const userId = options.getString('user_id');
        await interaction.deferReply({ ephemeral: true });

        try {
            await guild.members.unban(userId);
            interaction.editReply(`已成功解除用戶 (\`${userId}\`) 的封鎖狀態。`);
        } catch (err) {
            interaction.editReply(`無法解除封鎖，請檢查 ID 是否正確`);
        }
    }
});

client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || message.author.id === client.user.id) return;

    const { author, content, channel, member, webhookId, guild } = message;
    const now = Date.now();

    if (author.id === guild.ownerId) return;

    if (content.length > CONFIG.SPAM.MAX_CHARS) {
        return executeJustice(message, `大量訊息 (超過 ${CONFIG.SPAM.MAX_CHARS} 字)`, 'BAN');
    }

    const criticalLinks = ['discord.com/oauth2/authorize', '新增應用程式', 'oauth2/authorize', 'bit.ly', 't.me', 'discord.gg/', 'discord.com/invite/'];
    const isMaliciousBot = author.bot || webhookId;

    if (isMaliciousBot && criticalLinks.some(link => content.toLowerCase().includes(link))) {
        return executeJustice(message, "偵測到外部機器人散佈可疑連結", 'BAN');
    }

    if (message.mentions.everyone && author.id !== message.guild.ownerId) {
        return executeJustice(message, "偵測到試圖違規提及 (@everyone)", 'BAN');
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
        return executeJustice(message, "偵測到機器人訊息內容重複", 'BAN');
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
        return executeJustice(message, "偵測到爆發性洗版訊息", 'BAN');
    }

    if (content.startsWith('!GodShield')) {
        const args = content.split(' ');
        const cmd = args[1];
        if (cmd === 'stats') {
            const statsEmbed = new EmbedBuilder()
                .setTitle('GodShield 系統狀態')
                .setColor(CONFIG.THEME.COLOR_INFO)
                .addFields(
                    { name: '目標總數', value: `\`${SYSTEM_STATE.stats.punishedCount}\` 人`, inline: true },
                    { name: '清理規模', value: `\`${SYSTEM_STATE.stats.cleanedCount}\` 則`, inline: true }
                );
            return channel.send({ embeds: [statsEmbed] });
        }
    }
});

client.on(Events.GuildMemberAdd, async (member) => {
    const accountAge = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60);
    if (accountAge < CONFIG.PUNISHMENT.MIN_AGE_HOURS) {
        const channel = member.guild.systemChannel || member.guild.channels.cache.find(c => c.type === ChannelType.GuildText);
        if (channel) channel.send(`**高風險帳號警告**: ${member.user.tag} (建立不足12小時)`);
    }
});

client.on(Events.GuildRoleCreate, async (role) => {
    const guild = role.guild;
    
    try {
        const fetchedLogs = await guild.fetchAuditLogs({
            limit: 1,
            type: 24,
        });
        const roleLog = fetchedLogs.entries.first();
        if (!roleLog) return;

        const { executor } = roleLog;
        if (executor.id === client.user.id || executor.id === guild.ownerId) return;

        const now = Date.now();
        const userData = SYSTEM_STATE.roleTracker.get(executor.id) || [];
        const recentCreations = userData.filter(t => now - t < ROLE_PROTECT_CONFIG.WINDOW_MS);
        
        recentCreations.push(now);
        SYSTEM_STATE.roleTracker.set(executor.id, recentCreations);

        if (recentCreations.length >= ROLE_PROTECT_CONFIG.MAX_ROLES_PER_WINDOW) {
            await role.delete("自動清理炸群身分組").catch(() => {});
            await triggerAntiNuke(guild, executor, "瘋狂創建身分組 (Anti-Role-Spam)");
        }
    } catch (err) {
        console.error("處理身分組防護時出錯:", err);
    }
});

client.on(Events.ChannelCreate, async (channel) => {
    const guild = channel.guild;
    try {
        const fetchedLogs = await guild.fetchAuditLogs({ limit: 1, type: 10 });
        const log = fetchedLogs.entries.first();
        if (!log || log.executor.id === client.user.id || log.executor.id === guild.ownerId) return;

        const { executor } = log;
        const now = Date.now();
        const userData = SYSTEM_STATE.channelTracker.get(executor.id) || [];
        const recentActions = userData.filter(t => now - t < CONFIG.CHANNEL_PROTECT.WINDOW_MS);
        
        recentActions.push(now);
        SYSTEM_STATE.channelTracker.set(executor.id, recentActions);

        if (recentActions.length >= CONFIG.CHANNEL_PROTECT.MAX_ACTIONS_PER_WINDOW) {
            await channel.delete("GodShield: 大規模創建頻道防禦").catch(() => {});
            await triggerAntiNuke(guild, executor, "大規模創建頻道 (Nuke Attack)");
        }
    } catch (err) { console.error("頻道創建防護出錯:", err); }
});

client.on(Events.ChannelDelete, async (channel) => {
    const guild = channel.guild;
    try {
        const fetchedLogs = await guild.fetchAuditLogs({ limit: 1, type: 12 });
        const log = fetchedLogs.entries.first();
        if (!log || log.executor.id === client.user.id || log.executor.id === guild.ownerId) return;

        const { executor } = log;
        const now = Date.now();
        const userData = SYSTEM_STATE.channelTracker.get(executor.id) || [];
        const recentActions = userData.filter(t => now - t < CONFIG.CHANNEL_PROTECT.WINDOW_MS);
        
        recentActions.push(now);
        SYSTEM_STATE.channelTracker.set(executor.id, recentActions);

        if (recentActions.length >= CONFIG.CHANNEL_PROTECT.MAX_ACTIONS_PER_WINDOW) {
            await triggerAntiNuke(guild, executor, "大規模刪除頻道事件");
            
            const sysChannel = guild.systemChannel;
            if (sysChannel) sysChannel.send("**偵測到大規模刪除頻道動作，系統已緊急封鎖違規者**");
        }
    } catch (err) { console.error("頻道刪除防護出錯:", err); }
});

process.on('unhandledRejection', (reason) => console.error(reason));
process.on('uncaughtException', (err) => console.error(err));

client.login(process.env.TOKEN);

setInterval(() => {
    SYSTEM_STATE.msgLogs.clear();
    SYSTEM_STATE.contentFingerprints.clear();
    console.log(`[優化] 防禦緩存已重置。`);
}, 600000);
