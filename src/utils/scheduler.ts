import cron from 'node-cron';
import { type Client, AttachmentBuilder, type TextChannel } from 'discord.js';
import { getTopPlayers, getRankingChannel } from './database.js';
import { generateRankingCard, type RankingPlayer } from './canvasRanking.js';

export function initScheduler(client: Client): void {
    // Schedule for the 15th and the last day of the month at 12:00 PM (noon)
    // The expression "0 12 15,L * *" works in some cron libraries, but node-cron
    // doesn't support 'L' out of the box natively for all cases. 
    // Wait, node-cron DOES NOT support 'L' character for days of month. 
    // To handle 15th and last day of month, we can run daily and check the date.

    cron.schedule('0 12 * * *', async () => {
        const today = new Date();
        const date = today.getDate();
        
        // Get the last day of the current month
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

        // Check if today is the 15th or the last day of the month
        if (date !== 15 && date !== lastDayOfMonth) {
            return;
        }

        console.log('[AUTO MIX] Executando rotina de ranking quinzenal...');
        
        // Iterate over all guilds the bot is in
        for (const [guildId, guild] of client.guilds.cache) {
            try {
                const rankingChannelId = getRankingChannel(guildId);
                if (!rankingChannelId) continue; // Ranking channel not set for this guild

                const channel = await guild.channels.fetch(rankingChannelId).catch(() => null);
                if (!channel || !channel.isTextBased()) {
                    console.log(`[AUTO MIX] Canal de ranking não encontrado ou inválido no servidor ${guild.name}`);
                    continue;
                }

                const topPlayers = getTopPlayers(guildId, 10);
                if (topPlayers.length === 0) continue;

                // Populate avatars and display names
                const rankingPlayers: RankingPlayer[] = await Promise.all(topPlayers.map(async (p) => {
                    let avatarBuffer: Buffer | null = null;
                    let displayName = p.user_id; // fallback

                    try {
                        const member = await guild.members.fetch(p.user_id);
                        displayName = member.displayName;
                        const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 128 });
                        const response = await fetch(avatarUrl);
                        if (response.ok) {
                            avatarBuffer = Buffer.from(await response.arrayBuffer());
                        }
                    } catch {
                        // Ignore
                    }

                    return { ...p, displayName, avatarBuffer };
                }));

                const buffer = await generateRankingCard(rankingPlayers);
                const attachment = new AttachmentBuilder(buffer, { name: 'ranking.png' });

                await (channel as TextChannel).send({
                    content: '🏆 **RANKING QUINZENAL ATUALIZADO!** 🏆\nConfira os top players desta quinzena:',
                    files: [attachment]
                });
            } catch (error) {
                console.error(`[AUTO MIX] Erro ao postar ranking quinzenal no servidor ${guild.name}:`, error);
            }
        }
    });

    console.log('[AUTO MIX] Agendador (Scheduler) iniciado com sucesso.');
}
