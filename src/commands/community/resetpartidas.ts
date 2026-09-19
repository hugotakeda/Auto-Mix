import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { createEmbed } from '../../utils/embedBuilder.js';
import { getDatabase, resetPlayerMatches } from '../../utils/database.js';

export const data = new SlashCommandBuilder()
    .setName('resetpartidas')
    .setDescription('Reseta as suas partidas (vitórias, derrotas e total) para zero');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) return;

    await interaction.deferReply({ ephemeral: true });

    // Ensure DB is ready
    await getDatabase();

    try {
        resetPlayerMatches(interaction.user.id, guildId);
        
        const embed = createEmbed(interaction)
            .setTitle('Partidas Resetadas')
            .setDescription('Suas partidas (vitórias, derrotas e total) foram resetadas com sucesso para 0.');

        await interaction.editReply({
            embeds: [embed],
        });
    } catch (error) {
        console.error('Erro ao resetar partidas:', error);
        const errorEmbed = createEmbed(interaction)
            .setTitle('Erro')
            .setDescription('Ocorreu um erro ao tentar resetar as suas partidas.');

        await interaction.editReply({
            embeds: [errorEmbed],
        });
    }
}
