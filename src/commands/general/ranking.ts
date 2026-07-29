import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    AttachmentBuilder
} from 'discord.js';
import { getTopPlayers } from '../../utils/database.js';
import { generateRankingCard, type RankingPlayer } from '../../utils/canvasRanking.js';
import { createEmbed, createErrorEmbed } from '../../utils/embedBuilder.js';

export const data = new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Exibe o ranking global do servidor (Top 10)');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) return;

    await interaction.deferReply();

    const topPlayers = getTopPlayers(guildId, 10);

    if (topPlayers.length === 0) {
        await interaction.editReply({ embeds: [createErrorEmbed('Ainda não há jogadores com partidas o suficiente para gerar o ranking.', interaction)] });
        return;
    }

    try {
        const guild = await interaction.client.guilds.fetch(guildId);

        // Populate avatars and display names
        const rankingPlayers: RankingPlayer[] = await Promise.all(topPlayers.map(async (p) => {
            let avatarBuffer: Buffer | null = null;
            let displayName = p.user_id; // fallback

            try {
                const member = await guild.members.fetch(p.user_id);
                displayName = member.displayName.split(' ')[0];
                const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 128 });
                const response = await fetch(avatarUrl);
                if (response.ok) {
                    avatarBuffer = Buffer.from(await response.arrayBuffer());
                }
            } catch {
                // If member left the server or fetch fails, just use ID
            }

            return {
                ...p,
                displayName,
                avatarBuffer
            };
        }));

        const buffer = await generateRankingCard(rankingPlayers);
        const attachment = new AttachmentBuilder(buffer, { name: 'ranking.png' });

        const embed = createEmbed(interaction)
            .setTitle('Confira o top:')
            .setImage('attachment://ranking.png');

        await interaction.editReply({ embeds: [embed], files: [attachment] });
    } catch (error) {
        console.error('Erro ao gerar o rank:', error);
        await interaction.editReply({ embeds: [createErrorEmbed('Ocorreu um erro ao gerar o ranking.', interaction)] });
    }
}
