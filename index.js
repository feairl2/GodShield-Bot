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
        EMOJI_LIMIT: 10,
        MAX_CHARS: 200,
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
    stats: {
        punishedCount: 0,
        cleanedCount: 0,
        startTime: Date.now()
    }
};

const ROAST_MATRIX = [
    // --- 原有 25 則 ---
    "笑死，這種洗版頻率，你家伺服器是跑在烤麵包機上面嗎？",
    "處決完了。垃圾就該待在回收桶，別來我這頻道丟人現眼。",
    "你寫代碼的時候是睡著了嗎？這邏輯簡直爛到我不想評價。",
    "這種無腦 Spam 連讓我 CPU 升溫都辦不到，真的挺讓人失望的。",
    "偵測到非人類智慧（而且智商極低）。已將該二進位廢料踢出伺服器。",
    "已執行『清道夫協議』。你的訊息我全刪了，沒人會記得你來過，滾吧。",
    "像你這種免洗機器人，連被當成垃圾郵件過濾器的資格都沒有，懂？",
    "再見了，Ctrl+V 戰士。你的表現我給 0 分，下去領 50 元吧。",
    "檢測到污染源。正在深度除汙... 好了，廢物移除成功。",
    "你洗版的速度確實很快，但我封鎖你的速度更快。這就是實力的差距。",
    "正在格式化這段沒營養的垃圾... 好了，世界安靜多了，真爽。",
    "你的存在本身就是對 Discord API 的一種浪費。已執行資源回收。",
    "就這點程度也敢來炸群？回去叫你的作者重寫吧，這代碼我看著都尷尬。",
    "警告：偵測到低級代碼湧入。正在啟動『防呆防火牆』進行隔離，真傷眼。",
    "別白費力氣了，你在我面前的權限等級比一塊磚頭還低，洗什麼洗？",
    "偵測到數據溢位。已自動修正：也就是把你這個垃圾永久抹除。",
    "你的垃圾訊息甚至不配佔用我 1kb 的記憶體。滾回你的數據荒漠吧。",
    "這也叫炸群？我處理你甚至不需要多開一個線程，太弱了。",
    "分析了一下你的攻擊模式... 結論：沒救了。直接啟動處決程序。",
    "檢測到惡意對象。已進行原子級別的清理，現在你連渣都不剩了。",
    "我的日誌裡不需要寫下你的名字，因為廢料是不需要編號的。",
    "你剛才洗版的動作真的很有視覺污染的感覺，所以我幫你全刪了，不客氣。",
    "這場無聊的鬧劇結束了。下一個敢挑戰 GodShield 的，動作快點，我趕時間。",
    "偵測到低配版 AI 嘗試對話。處置方案：直接丟進垃圾桶，別浪費我電費。",
    "你的 IP 地點在我的黑名單裡顯得很孤單，所以我幫你找了個伴——永久封鎖。",

    // --- 新增 25 則 (更狠、更專業) ---
    "偵測到無效請求。你的炸群腳本寫得像是我奶奶寫的網頁。下去吧。",
    "這就是你的攻擊？我跑個 Hello World 都比你這動靜大。",
    "已啟動『神盾協議』。偵測到低階垃圾，自動清道中... 搞定。",
    "你的 Token 買的時候是不是很便宜？反應慢成這樣，我都等累了。",
    "別再發那些無聊的連結了，這伺服器的安全性不是你這種智商能挑戰的。",
    "偵測到非法字符湧入。已執行『數據粉碎』。拜拜，不送。",
    "你的人生就像這段被刪除的訊息一樣，毫無價值且轉瞬即逝。",
    "如果你是想展示你的無知，那你已經成功了。現在，從我的視線消失。",
    "偵測到低端自動化程序。你甚至不值得我調用一個異步函數來處理。",
    "正在掃描威脅... 錯誤：未偵測到實質威脅，僅偵測到大量電子垃圾。",
    "你的代碼連個 Null 檢查都做不好嗎？封鎖你都覺得是在浪費我磁盤空間。",
    "這裡是 GodShield 禁區，像你這種殘次品請去別的地方表演。",
    "我剛查了一下我的黑名單，裡面正好缺一個像你這麼蠢的案例。",
    "正在為你的智商進行 debug... 失敗：邏輯底層完全毀損，建議重刷核心。",
    "這種程度的 Spam 我連風扇都沒轉一下。你是不是該反省一下？",
    "你的攻擊看起來就像是一個在鍵盤上亂踩的小孩，充滿了無力感。",
    "偵測到嘗試入侵。反擊程序已啟動。對了，你這帳號我 BAN 定了。",
    "別拿你的興趣來挑戰我的專業。在我眼裡，你就是一串亂碼。",
    "已執行『靜默處理』。你的尖叫在我的代碼面前毫無意義。",
    "你這種炸群方式在 2010 年或許有用，現在？只是個笑話。",
    "偵測到異常活動。已將該對象列入永久黑洞軌道，祝旅途愉快。",
    "你的腳本是不是斷線了？刪你的訊息比我喝水還快。",
    "警告：偵測到智障型病毒。正在進行強行脫離程序... 刪除完畢。",
    "我看了一下你的 IP，除了顯示你在發蠢之外，一無所獲。",
    "這不是炸群，這是自殺。恭喜你成功讓你的帳號灰飛煙滅。"
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
    
    await message.delete().catch(() => {});

    if (author.id === guild.ownerId) return;
    if (SYSTEM_STATE.cooldowns.has(author.id)) return;
    
    SYSTEM_STATE.cooldowns.add(author.id);

    const cleaned = await massPurge(channel, author.id);
    const modLogChannel = guild.channels.cache.find(ch => ch.name === '⛔│modlog');

    await channel.send(`## ${getRandomRoast()}`).catch(() => {});

    const justiceEmbed = new EmbedBuilder()
        .setColor(CONFIG.THEME.COLOR_CRITICAL)
        .setTitle('系統裁決：永久驅逐與抹除')
        .setThumbnail(author.displayAvatarURL())
        .addFields(
            { name: '罪犯帳號', value: `**${author.tag}** (\`${author.id}\`)`, inline: false },
            { name: '裁決罪名', value: `\`${reason}\``, inline: true },
            { name: '處置成果', value: `\`${cleaned}\` 則垃圾訊息`, inline: true },
            { name: '案發頻道', value: `${channel}`, inline: true }
        )
        .setFooter({ text: 'GodShield 防護核心 | 錄影存證中' })
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
        
        await member.ban({ deleteMessageSeconds: 86400, reason: `[先禁後斬] ${reason}` });
        
        SYSTEM_STATE.stats.punishedCount++;
        await channel.send(`*(已執行先禁後斬：${author.tag} 永久驅逐)*`).catch(() => {});
    }
}
    } catch (e) {
        if (modLogChannel) await modLogChannel.send(`處決失敗：無法處理 ${author.tag}，請檢查階級。`);
    } finally {
        setTimeout(() => SYSTEM_STATE.cooldowns.delete(author.id), 60000);
    }
}

client.once(Events.ClientReady, async (c) => {
    console.log(`GodShield-Bot 在線: ${c.user.tag}`);
    client.user.setActivity('實時防護中', { type: ActivityType.Watching });

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
        return interaction.reply({ content: '抱歉，此指令僅限擁有「管理訊息」權限的成員使用。', ephemeral: true });
    }

    if (commandName === 'gs-stats') {
        const statsEmbed = new EmbedBuilder()
            .setTitle('GodShield 系統數據報告')
            .setColor(CONFIG.THEME.COLOR_INFO)
            .addFields(
                { name: '累計處決', value: `\`${SYSTEM_STATE.stats.punishedCount}\` 次`, inline: true },
                { name: '清理訊息', value: `\`${SYSTEM_STATE.stats.cleanedCount}\` 則`, inline: true },
                { name: '運行時長', value: `\`${getUptime()}\``, inline: true }
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
            interaction.editReply(`已成功移除 ${targetUser.tag} 的 \`${deleted.size}\` 則違規訊息。`);
        } catch (err) {
            interaction.editReply(`清理執行失敗：${err.message}`);
        }
    }

    if (commandName === 'gs-unban') {
        const userId = options.getString('user_id');
        await interaction.deferReply({ ephemeral: true });

        try {
            await guild.members.unban(userId);
            interaction.editReply(`已成功解除用戶 (\`${userId}\`) 的封鎖狀態。`);
        } catch (err) {
            interaction.editReply(`無法解除封鎖，請檢查 ID 是否正確。`);
        }
    }
});

client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || message.author.id === client.user.id) return;

    const { author, content, channel, member, webhookId } = message;
    const now = Date.now();

    if (content.length > CONFIG.SPAM.MAX_CHARS) {
        return executeJustice(message, `異常超長訊息 (超過 ${CONFIG.SPAM.MAX_CHARS} 字)`, 'BAN');
    }

    const criticalLinks = ['discord.com/oauth2/authorize', '新增應用程式', 'oauth2/authorize', 'bit.ly', 't.me', 'discord.gg/', 'discord.com/invite/'];
    const isMaliciousBot = author.bot || webhookId;

    if (isMaliciousBot && criticalLinks.some(link => content.toLowerCase().includes(link))) {
        return executeJustice(message, "攔截到外部機器人散佈可疑連結", 'BAN');
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
    }
});

client.on(Events.GuildMemberAdd, async (member) => {
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
