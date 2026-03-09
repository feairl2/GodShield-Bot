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
    AuditLogEvent
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
    "靠北，${ownerId} 你看這個 ${target} 啦，毛都沒長齊想來亂？我直接讓他下地獄了",
    "幹，${target} 這腦殘也敢來炸群？我已經把他骨灰揚了，老大免煩惱",
    "${ownerId}，剛剛有個不長眼的 ${target} 在那邊衝三小，我順手把他 Ban 了！",
    "那個 ${target} 以為自己很勇喔？還不是被我秒砍，滾去黑名單吃屎吧",
    "老大，剛清理了一個叫 ${target} 的垃圾，這雜碎真的欠宰",
    "這年頭炸群的都這麼廢？${target} 滾回去練啦，別來煩我老大 ${ownerId}",
    "抓到一個耍猴戲的 ${target}，我直接送他全家封鎖大禮包，下去領便當啦",
    "嘿 ${ownerId}，有個小丑 ${target} 在這演戲，我直接讓他謝幕下台，幹",
    "沒事，${target} 只是個死路人，我已經把他宰了，老大你繼續休息",
    "笑死人，${target} 這種智障操作也敢拿出來？我直接送他回老家",
    "${ownerId}，這個 ${target} 剛才在那邊亂噴訊息，我已經送他去投胎了",
    "抓到一隻炸群狗 ${target}，已經打斷腿丟出去了，${ownerId} 沒事了",
    "那個 ${target} 真的很有種，敢在老大面前耍花招，現在他徹底消失了，垃圾",
    "原本想說點什麼，但 ${target} 表現太爛，直接 Ban 掉比較快，老大你看這廢物",
    "提醒一下 ${ownerId}，剛才 ${target} 來亂，現在他連門都摸不到，笑死",
    "發現 ${target} 腦袋有洞，為了群組乾淨，我已經把他物理超渡了。",
    "老大 ${ownerId}，這隻 ${target} 剛才在踩線，現在他知道死字怎麼寫了",
    "幹！${target} 剛在那邊發廢話洗三小？我已將他掃地出門，這波夠硬吧？",
    "這隻 ${target} 剛在那邊跳，我直接一巴掌把他拍到封鎖名單底部",
    "老大，剛幫你處理掉一個叫 ${target} 的智障，這效率你滿意吧？",
    "那個 ${target} 真的欠處理，我已經幫他安排好永久封鎖，老大不用謝",
    "笑死我了，${target} 以為我沒在看？封鎖名單加一，滾啦幹！",
    "${ownerId}，剛剛有個憨子 ${target} 想搞事，我讓他去外面吹西北風了",
    "處理掉一個垃圾 ${target}，這伺服器空氣都變清新了，對吧老大？",
    "老大，${target} 的權限被我徹底拔掉了，他現在只能在外面哭爹喊娘",
    "那個 ${target} 是不是以為自己很行？結果被我一秒 Ban，白癡一個",
    "${ownerId}，有個智障 ${target} 踩到雷，現在已經是具屍體了",
    "這年頭還有人用這麼破的手段？${target} 你回去練練再回來啦，操",
    "老大，解決掉一個想搞事的 ${target}，現在太平了",
    "剛抓到 ${target} 在這亂，我直接把他踢出群組了"
];

const getRandomRoast = async (user, guild) => {
    let targetId = user.id;
    const ownerId = guild.ownerId;

    if (user.bot) {
        try {
            const auditLogs = await guild.fetchAuditLogs({ limit: 5 });

            const entry = auditLogs.entries.find(e => 
                (e.type === AuditLogEvent.BotAdd && e.target.id === user.id) || 
                (e.type === AuditLogEvent.WebhookCreate)
            );

            if (entry) {
                targetId = entry.executor.id;
            }
        } catch (e) {
            console.error("日誌翻不動:", e.message);
        }
    }

    const rawText = ROAST_MATRIX[Math.floor(Math.random() * ROAST_MATRIX.length)];
    return rawText
        .replace('${target}', `<@${targetId}>`)
        .replace('${ownerId}', `<@${ownerId}>`);
};

const getUptime = () => {
    const totalSeconds = (Date.now() - SYSTEM_STATE.stats.startTime) / 1000;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}時 ${minutes}分`;
};

async function massPurge(channel, userId) {
    let totalDeleted = 0;
    let attempts = 0;
    const MAX_ATTEMPTS = 50;
    const DELAY_MS = 1000;

    const performDelete = async () => {
        try {
            const fetched = await channel.messages.fetch({ limit: 100 });
            const userMessages = fetched.filter(m => m.author.id === userId || m.webhookId === userId);
            
            if (userMessages.size > 0) {
                const deleted = await channel.bulkDelete(userMessages, true);
                totalDeleted += deleted.size;
                SYSTEM_STATE.stats.cleanedCount += deleted.size;
                console.log(`[第 ${attempts + 1} 次清理] 刪除了 ${deleted.size} 則訊息`);
                return deleted.size;
            }
        } catch (err) {
            if (!err.message.includes("14 days old")) {
                console.error(`[清理異常] ${err.message}`);
            }
        }
        return 0;
    };

    const intervalId = setInterval(async () => {
        attempts++;
        await performDelete();

        if (attempts >= MAX_ATTEMPTS) {
            clearInterval(intervalId);
            console.log(`[清理完成] 總計掃描 ${MAX_ATTEMPTS} 次，清除 ${totalDeleted} 則。`);
        }
    }, DELAY_MS);

    await performDelete();

    return totalDeleted;
}

async function executeJustice(message, reason, type = CONFIG.PUNISHMENT.DEFAULT_TYPE) {
    const { author, member, channel, guild, webhookId } = message;

    if (author.id === guild.ownerId) return;
    if (SYSTEM_STATE.cooldowns.has(author.id)) return;
    SYSTEM_STATE.cooldowns.add(author.id);

    console.log(`[正義執行] 觸發對象: ${author.tag} (${author.id}), 原因: ${reason}`);

    let cleanedCount = 0;
    let isBanned = false;
    let executorId = null;

    try {
        const roast = await getRandomRoast(author, guild);
        await channel.send(roast).catch(() => {});
        await message.delete().catch(() => {});
    } catch (e) {
        console.error("[階段一錯誤]", e.message);
    }

    try {
        cleanedCount = await massPurge(channel, author.id);
    } catch (e) {
        console.error("[階段二錯誤] 清理失敗:", e.message);
    }

    try {
        if (webhookId) {
            const webhooks = await channel.fetchWebhooks().catch(() => new Collection());
            const targetWebhook = webhooks.get(webhookId);
            if (targetWebhook) {
                await targetWebhook.delete('GodShield: 惡意 Webhook 來源').catch(() => {});
            }
        }

        const auditLogs = await guild.fetchAuditLogs({ limit: 5 }).catch(() => null);
        if (auditLogs) {
            const entry = auditLogs.entries.find(e => 
                (e.type === AuditLogEvent.BotAdd && e.target.id === author.id) || 
                (e.type === AuditLogEvent.WebhookCreate)
            );
            if (entry) executorId = entry.executor.id;
        }

        try {
            await guild.bans.create(author.id, { 
                deleteMessageSeconds: 604800, 
                reason: `[GodShield] ${reason}` 
            });
            isBanned = true;
            SYSTEM_STATE.stats.punishedCount++;
        } catch (banErr) {
            console.error(`[封鎖失敗] 無法封鎖 ${author.tag}: 權限不足或對象職位太高`);
            if (member && member.manageable) {
                await member.timeout(3600000, "封鎖失敗，系統自動轉為禁言").catch(() => {});
            }
        }

        if (executorId && executorId !== guild.ownerId) {
            await guild.bans.create(executorId, { 
                reason: `[連坐處分] 召喚惡意來源: ${reason}` 
            }).catch(() => console.log(`[連坐失敗] 無法封鎖引進者 ${executorId}`));
        }

    } catch (e) {
        console.error("[階段三錯誤]", e.message);
    }

    try {
        const modLogChannel = guild.channels.cache.find(ch => ch.name === '⛔│modlog');
        if (modLogChannel) {
            const logEmbed = new EmbedBuilder()
                .setColor(isBanned ? CONFIG.THEME.COLOR_CRITICAL : 0xFFAA00)
                .setAuthor({ name: 'GodShield 安全攔截報告', iconURL: client.user.displayAvatarURL() })
                .setThumbnail(author.displayAvatarURL())
                .addFields(
                    { name: '違規成員', value: `<@${author.id}>`, inline: false },
                    { name: '違反規則', value: `\`${reason}\``, inline: true },
                    { name: '處置結果', value: isBanned ? '永久封鎖' : '清理訊息/禁言', inline: true },
                    { name: '刪除訊息', value: `\`${cleanedCount}\` 則`, inline: true },
                    { name: '事件頻道', value: `<#${channel.id}>`, inline: false }
                )
                .setTimestamp();

            if (executorId) {
                logEmbed.addFields({ name: '關聯引進者', value: `<@${executorId}> (\`${executorId}\`)` });
            }

            await modLogChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
    } catch (e) {
        console.error("[階段四錯誤] 日誌發送失敗:", e.message);
    }

    setTimeout(() => SYSTEM_STATE.cooldowns.delete(author.id), 30000);
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
        const roastMessage = await getRandomRoast(executor, guild);
        const nukeEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('偵測到未經授權的高階權限異動，系統已啟動自動防禦機制進行攔截')
            .setDescription(roastMessage)
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
