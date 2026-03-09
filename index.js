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
    "報告 <@${ownerId}>，有個智障 ${target} 在那邊亂炸，我已經直接送他下去了",
    "欸 <@${ownerId}>，剛剛抓到 ${target} 在耍猴戲，我直接給他永久禁賽",
    "笑死，${target} 居然敢在老大 <@${ownerId}> 的地盤撒野，我已經把他處理掉了",
    "報告，偵測到 ${target} 腦袋異常，為了伺服器健康，我已執行人道毀滅",
    "那個 ${target} 以為自己很勇喔？還不是被我一秒踢掉，<@${ownerId}> 你看他多可憐",
    "<@${ownerId}> 老大，${target} 剛才想挑戰防禦極限，現在他已經在黑名單裡納涼了。",
    "抓到一個想炸群的憨子 ${target}，已經幫他點了份「永久封鎖」大禮包，不用謝了",
    "這年頭還有人用這麼破的手段炸群？${target} 你下去練練再回來吧，報告完畢！",
    "偵測到惡意垃圾（其實是廢物訊息），${target} 已被清理，請 <@${ownerId}> 放心",
    "原本想說點什麼，但 ${target} 表現太爛了，直接封掉比較快，老大請過目",
    "報告 <@${ownerId}>，這隻 ${target} 剛才在瘋狂洗版，我已經送他去火星了",
    "喔吼！${target} 觸發了我的死亡陷阱，現在已經變成一具(被封鎖)屍體了，老大",
    "老大 <@${ownerId}>，這個 ${target} 是不是以為我沒在看？封鎖名單加一，不客氣",
    "笑噴，${target} 這種程度也想炸群？我已經把他骨灰都揚了。",
    "提醒一下 <@${ownerId}>，剛才有個不長眼的 ${target} 來亂，現在他連門票都沒了",
    "沒事，${target} 只是個過客，因為他已經被我永封了，老大請繼續休息",
    "報告老大，${target} 剛才試圖挑戰我的底線，我送他一張通往地獄的單程票",
    "那個 ${target} 真的很有勇氣，敢在老大面前耍花招，現在已經徹底消失了",
    "嘿 <@${ownerId}>，剛才幫你清理了一個垃圾 ${target}，伺服器現在乾淨多了",
    "偵測到 ${target} 智商低落且意圖炸群，系統已自動執行垃圾回收程序",
    "這隻 ${target} 剛才在那邊跳，我直接一巴掌把他拍到封鎖名單底部",
    "老大，${target} 剛才在試探我的耐心，現在他已經知道代價是永久 Ban 了",
    "報告！${target} 試圖散播病毒(或廢話)，我已將其掃地出門，請 <@${ownerId}> 核對",
    "笑死我了，${target} 這種低端操作也敢拿出來？我已經送他去領便當了",
    "欸 <@${ownerId}>，有個小丑 ${target} 剛才在表演炸群，我直接讓他謝幕了",
    "那個 ${target} 真的欠處理，我已經幫他安排好永久封鎖套餐了，老大不用擔心",
    "報告老大，${target} 的存取權限已經被我物理抹除了，他現在只能在外面哭",
    "抓到一隻炸群狗 ${target}，已經打斷腿丟出去了，<@${ownerId}> 沒事了",
    "這年頭炸群的都這麼沒技術含量嗎？${target} 下去重練吧，別來煩老大",
    "老大 <@${ownerId}>，剛剛解決掉一個想搞事的 ${target}，現在伺服器太平盛世。"
];

const getRandomRoast = (user, guild) => {
    const ownerId = guild.ownerId; // 獲取該伺服器的擁有者 ID
    const rawText = ROAST_MATRIX[Math.floor(Math.random() * ROAST_MATRIX.length)];
    return rawText
        .replace('${target}', `<@${user.id}>`)
        .replace('${ownerId}', ownerId);
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
