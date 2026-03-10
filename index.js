/**
 * GodShield - Sovereign Edition
 * Version: 3.0.0
 * Status: Heavy-Duty Production
 */

require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    PermissionFlagsBits, 
    EmbedBuilder, 
    Collection, 
    Events, 
    ChannelType,
    ActivityType,
    AuditLogEvent,
    PermissionsBitField,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// --- 核心系統常量 ---
const SYSTEM_VERSION = "3.0.0-SOVEREIGN";
const BOOT_TIME = Date.now();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildWebhooks
    ]
});

/**
 * 高級防禦參數配置 (天花板等級)
 */
const CONFIG = {
    ANTIRAID: {
        JOIN_THRESHOLD: 5,        // 5秒內最大進場數
        JOIN_WINDOW: 5000,
        ACCOUNT_AGE_MIN: 24,      // 小於24小時帳號自動監控
        KICK_NEW_ACCOUNTS: true,  // 突發進場時是否自動踢出新帳號
        AUTO_VERIFICATION_LEVEL: 4 // 攻擊時自動提升至最高驗證
    },
    ANTISPAM: {
        MAX_MESSAGES: 4,
        WINDOW: 2000,
        DUPLICATE_LIMIT: 2,
        MAX_CHARS: 800,
        EMOJI_LIMIT: 15,
        MENTION_LIMIT: 5
    },
    ANTINUKE: {
        CHANNEL_DEL_LIMIT: 1,
        ROLE_DEL_LIMIT: 1,
        KICK_LIMIT: 2,
        BAN_LIMIT: 1,
        WINDOW: 10000
    },
    THEME: {
        CRITICAL: 0x8B0000,
        SUCCESS: 0x006400,
        INFO: 0x1A1A1A,
        WARNING: 0xFF8C00
    }
};

/**
 * 全域狀態追蹤器 (分片緩存)
 */
const STATE = {
    punished: new Set(),
    cooldowns: new Collection(),
    msgLogs: new Collection(),
    fingerprints: new Collection(),
    joinLog: [],
    
    // Nuke 追蹤
    nukeTracker: {
        channels: new Collection(),
        roles: new Collection(),
        bans: new Collection(),
        kicks: new Collection()
    },
    
    stats: {
        totalBans: 0,
        totalKicks: 0,
        totalCleaned: 0,
        threatsIntercepted: 0
    },

    // 備份存儲
    backup: {
        channels: new Collection(),
        roles: new Collection()
    }
};

// --- 核心工具函數 ---

/**
 * 格式化運行時間
 */
const getUptime = () => {
    const uptime = Date.now() - BOOT_TIME;
    const h = Math.floor(uptime / 3600000);
    const m = Math.floor((uptime % 3600000) / 60000);
    const s = Math.floor((uptime % 60000) / 1000);
    return `${h}小時 ${m}分 ${s}秒`;
};

/**
 * 極速處決引擎 (並行非阻塞)
 */
async function fastExecute(guild, targetId, reason, executorId = null, severity = 'HIGH') {
    if (STATE.punished.has(targetId)) return;
    STATE.punished.add(targetId);

    const targetUser = await client.users.fetch(targetId).catch(() => null);
    console.log(`[執行處決] 對象: ${targetId} | 原因: ${reason}`);

    const executionPool = [
        // 1. 永久封鎖
        guild.bans.create(targetId, { deleteMessageSeconds: 604800, reason: `[GodShield-SOVEREIGN] ${reason}` })
            .then(() => STATE.stats.totalBans++)
            .catch(() => {}),

        // 2. 針對引進者的連坐處分
        executorId && executorId !== guild.ownerId ? 
            guild.bans.create(executorId, { reason: `[Chain-Reaction] Inviter/Executor of malicious target: ${targetId}` })
            .catch(() => {}) : Promise.resolve()
    ];

    // 3. 全局日誌通知
    const logChannel = guild.channels.cache.find(c => c.name.includes('modlog') || c.name.includes('security'));
    if (logChannel) {
        const embed = new EmbedBuilder()
            .setColor(CONFIG.THEME.CRITICAL)
            .setAuthor({ name: "GodShield Security Enforcement", iconURL: client.user.displayAvatarURL() })
            .setTitle("系統已自動執行物理封鎖")
            .setDescription(`偵測到伺服器受到主動威脅，系統已依照最高防禦協議完成肅清。`)
            .addFields(
                { name: "處置對象", value: `${targetUser ? targetUser.tag : '未知'} (\`${targetId}\`)`, inline: true },
                { name: "威脅等級", value: `\`${severity}\``, inline: true },
                { name: "判定原因", value: `\`${reason}\``, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: `Version: ${SYSTEM_VERSION}` });

        executionPool.push(logChannel.send({ embeds: [embed] }).catch(() => {}));
    }

    STATE.stats.threatsIntercepted++;
    return Promise.all(executionPool);
}

// --- 自動備份邏輯 ---

async function performServerBackup(guild) {
    console.log(`[系統] 正在為 ${guild.name} 執行影子備份...`);
    guild.channels.cache.forEach(channel => {
        STATE.backup.channels.set(channel.id, {
            name: channel.name,
            type: channel.type,
            parentId: channel.parentId,
            permissionOverwrites: channel.permissionOverwrites.cache
        });
    });
}

// --- 事件處理層 ---

/**
 * 1. 初始化
 */
client.once(Events.ClientReady, async (c) => {
    console.log(`========================================`);
    console.log(`  GODSHIELD SOVEREIGN V3.0 ONLINE      `);
    console.log(`  系統身分: ${c.user.tag}              `);
    console.log(`  當前時間: ${new Date().toLocaleString()} `);
    console.log(`========================================`);

    client.user.setActivity('Sovereign Protocol v3.0', { type: ActivityType.Competing });

    // 註冊全域斜線指令
    const commands = [
        { name: 'gs-stats', description: '顯示系統即時防禦數據' },
        { name: 'gs-backup', description: '手動建立伺服器影子備份' },
        { name: 'gs-lockdown', description: '啟動全伺服器緊急隔離模式' },
        { name: 'gs-unlock', description: '解除伺服器隔離模式' }
    ];

    try {
        await client.application.commands.set(commands);
        console.log(`[系統] 斜線指令同步完成。`);
    } catch (err) {
        console.error(`[錯誤] 指令同步失敗:`, err);
    }
});

/**
 * 2. 進場防禦 (Anti-Raid / Anti-Bot-Token)
 */
client.on(Events.GuildMemberAdd, async (member) => {
    const guild = member.guild;
    const now = Date.now();
    
    STATE.joinLog.push(now);
    STATE.joinLog = STATE.joinLog.filter(t => now - t < CONFIG.ANTIRAID.JOIN_WINDOW);

    // 檢測帳號年齡
    const age = (now - member.user.createdTimestamp) / 3600000;
    if (age < CONFIG.ANTIRAID.ACCOUNT_AGE_MIN) {
        if (STATE.joinLog.length > CONFIG.ANTIRAID.JOIN_THRESHOLD) {
            await member.ban({ reason: "GodShield: Sudden Raid Account Cleanup" }).catch(() => {});
            return;
        }
    }

    // 突發性大規模進場
    if (STATE.joinLog.length > CONFIG.ANTIRAID.JOIN_THRESHOLD) {
        await guild.setVerificationLevel(CONFIG.ANTIRAID.AUTO_VERIFICATION_LEVEL).catch(() => {});
        const sysChannel = guild.systemChannel || guild.channels.cache.find(c => c.name.includes('modlog'));
        if (sysChannel) {
            sysChannel.send("⚠️ **偵測到疑似 Raid 攻擊，系統已自動提升驗證等級並啟動限時防護。**");
        }
    }
});

/**
 * 3. 權限異動防禦 (Anti-Nuke / Anti-Self-Bot)
 */
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    const guild = newMember.guild;
    const adminPerm = PermissionFlagsBits.Administrator;

    if (!oldMember.permissions.has(adminPerm) && newMember.permissions.has(adminPerm)) {
        const audit = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberRoleUpdate }).catch(() => null);
        const entry = audit?.entries.first();
        if (!entry || entry.executor.id === client.user.id || entry.executor.id === guild.ownerId) return;

        await fastExecute(guild, newMember.id, "非法取得管理員權限", entry.executor.id, 'CRITICAL');
        
        // 自動撤銷該權限
        if (newMember.manageable) {
            await newMember.roles.set([], "GodShield: Role Stripping").catch(() => {});
        }
    }
});

/**
 * 4. 訊息與 Webhook 過濾 (Anti-Spam / Anti-Phishing)
 */
client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || message.author.id === client.user.id) return;
    if (message.author.id === message.guild.ownerId) return;

    const { author, content, guild, webhookId, channel } = message;
    const now = Date.now();

    // A. 關鍵字與危險 Link 掃描
    const phishingPatterns = [
        /discord\.gg\//i, /bit\.ly/i, /t\.me/i, /gift/i, /nitro/i, /oauth2\/authorize/i,
        /free/i, /steam/i, /airdrop/i
    ];

    if ((webhookId || author.bot) && phishingPatterns.some(p => p.test(content))) {
        await message.delete().catch(() => {});
        return fastExecute(guild, author.id, "惡意 Webhook/機器人連結散佈", null, 'HIGH');
    }

    // B. 洗版行為分析
    if (!STATE.msgLogs.has(author.id)) STATE.msgLogs.set(author.id, []);
    const userLogs = STATE.msgLogs.get(author.id);
    userLogs.push(now);

    const recent = userLogs.filter(t => now - t < CONFIG.ANTISPAM.WINDOW);
    STATE.msgLogs.set(author.id, recent);

    if (recent.length > CONFIG.ANTISPAM.MAX_MESSAGES) {
        await message.delete().catch(() => {});
        return fastExecute(guild, author.id, "爆發性訊息攻擊", null, 'MEDIUM');
    }

    // C. 內容指紋比對
    if (!STATE.fingerprints.has(author.id)) STATE.fingerprints.set(author.id, { last: "", count: 0 });
    const fp = STATE.fingerprints.get(author.id);
    if (content === fp.last && content.length > 5) {
        fp.count++;
    } else {
        fp.last = content;
        fp.count = 1;
    }

    if (fp.count > CONFIG.ANTISPAM.DUPLICATE_LIMIT) {
        return fastExecute(guild, author.id, "重複性垃圾訊息", null, 'MEDIUM');
    }
});

/**
 * 5. 頻道防護邏輯 (Anti-Nuke Deep Scan)
 */
client.on(Events.ChannelDelete, async (channel) => {
    const guild = channel.guild;
    const audit = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete }).catch(() => null);
    const entry = audit?.entries.first();
    if (!entry || entry.executor.id === client.user.id || entry.executor.id === guild.ownerId) return;

    const execId = entry.executor.id;
    const count = (STATE.nukeTracker.channels.get(execId) || 0) + 1;
    STATE.nukeTracker.channels.set(execId, count);

    if (count >= CONFIG.ANTINUKE.CHANNEL_DEL_LIMIT) {
        await fastExecute(guild, execId, "大規模刪除頻道 (Nuke)", null, 'CRITICAL');
        
        // 嘗試恢復 (僅限文字頻道簡單恢復)
        if (channel.type === ChannelType.GuildText) {
            await guild.channels.create({
                name: channel.name,
                type: ChannelType.GuildText,
                parent: channel.parentId,
                reason: "GodShield: Channel Recovery Post-Nuke"
            }).catch(() => {});
        }
    }
    
    setTimeout(() => STATE.nukeTracker.channels.delete(execId), CONFIG.ANTINUKE.WINDOW);
});

/**
 * 6. 身分組防護邏輯
 */
client.on(Events.GuildRoleDelete, async (role) => {
    const guild = role.guild;
    const audit = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleDelete }).catch(() => null);
    const entry = audit?.entries.first();
    if (!entry || entry.executor.id === client.user.id || entry.executor.id === guild.ownerId) return;

    const execId = entry.executor.id;
    await fastExecute(guild, execId, "大規模刪除身分組 (Nuke)", null, 'CRITICAL');
});

/**
 * 7. 伺服器更新防護 (防止修改名稱、頭像、Vanity URL)
 */
client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
    const audit = await newGuild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.GuildUpdate }).catch(() => null);
    const entry = audit?.entries.first();
    if (!entry || entry.executor.id === client.user.id || entry.executor.id === newGuild.ownerId) return;

    if (oldGuild.name !== newGuild.name || oldGuild.vanityURLCode !== newGuild.vanityURLCode) {
        await fastExecute(newGuild, entry.executor.id, "未經授權修改伺服器核心配置", null, 'CRITICAL');
        // 還原名稱
        await newGuild.setName(oldGuild.name).catch(() => {});
    }
});

/**
 * 8. 互動指令處理
 */
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, guild, member } = interaction;

    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "無權限執行上帝指令。", ephemeral: true });
    }

    if (commandName === 'gs-stats') {
        const embed = new EmbedBuilder()
            .setTitle("GodShield 系統運行報告")
            .setColor(CONFIG.THEME.SUCCESS)
            .setThumbnail(client.user.displayAvatarURL())
            .addFields(
                { name: "封鎖總數", value: `\`${STATE.stats.totalBans}\``, inline: true },
                { name: "威脅攔截", value: `\`${STATE.stats.threatsIntercepted}\``, inline: true },
                { name: "運行時間", value: `\`${getUptime()}\``, inline: true },
                { name: "核心版本", value: `\`${SYSTEM_VERSION}\``, inline: true },
                { name: "系統狀態", value: "✅ 高度安全", inline: true }
            )
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'gs-backup') {
        await interaction.deferReply({ ephemeral: true });
        await performServerBackup(guild);
        await interaction.editReply("伺服器影子備份已完成。");
    }

    if (commandName === 'gs-lockdown') {
        await interaction.deferReply();
        const channels = guild.channels.cache;
        for (const [id, channel] of channels) {
            if (channel.manageable && channel.type === ChannelType.GuildText) {
                await channel.permissionOverwrites.edit(guild.roles.everyone, {
                    SendMessages: false,
                    AddReactions: false
                }).catch(() => {});
            }
        }
        await interaction.editReply("🚫 **伺服器已進入全域隔離模式，所有非管理員頻道已禁言。**");
    }

    if (commandName === 'gs-unlock') {
        await interaction.deferReply();
        const channels = guild.channels.cache;
        for (const [id, channel] of channels) {
            if (channel.manageable && channel.type === ChannelType.GuildText) {
                await channel.permissionOverwrites.edit(guild.roles.everyone, {
                    SendMessages: null
                }).catch(() => {});
            }
        }
        await interaction.editReply("🔓 **伺服器已解除隔離。**");
    }
});

// --- 系統自動優化任務 ---

// 每 10 分鐘清理一次內存緩存
setInterval(() => {
    STATE.msgLogs.clear();
    STATE.fingerprints.clear();
    STATE.punished.clear(); // 讓已封鎖的 ID 釋放內存
    console.log(`[優化] 已執行內存回收與狀態重置。`);
}, 600000);

// 每 1 小時自動備份伺服器狀態
setInterval(() => {
    client.guilds.cache.forEach(guild => performServerBackup(guild));
}, 3600000);

// --- 錯誤防禦層 ---

process.on('unhandledRejection', (reason) => {
    console.error('[崩潰防禦] 捕捉到未處理的 Promise 拒絕:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[崩潰防禦] 捕捉到未處理的異常:', err);
});

// --- 啟動 ---

client.login(process.env.TOKEN);
