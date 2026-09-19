import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { createEmbed } from '../../utils/embedBuilder.js';
import { getDatabase, resetPlayerKD } from '../../utils/database.js';

export const data = new SlashCommandBuilder()
    .setName('resetkd')
    .setDescription('Reseta o seu KD (Kills e Deaths) para zero');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) return;

    await interaction.deferReply({ ephemeral: true });

    // Ensure DB is ready
    await getDatabase();

    try {
        resetPlayerKD(interaction.user.id, guildId);
        
        const embed = createEmbed(interaction)
            .setTitle('KD Resetado')
            .setDescription('Seu KD (Kills e Deaths) foi resetado com sucesso para 0.');

        await interaction.editReply({
            embeds: [embed],
        });
    } catch (error) {
        console.error('Erro ao resetar KD:', error);
        const errorEmbed = createEmbed(interaction)
            .setTitle('Erro')
            .setDescription('Ocorreu um erro ao tentar resetar o seu KD.');

        await interaction.editReply({
            embeds: [errorEmbed],
        });
    }
}
