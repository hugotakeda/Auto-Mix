import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    PermissionFlagsBits,
    ChannelType
} from 'discord.js';
import { createEmbed, createErrorEmbed } from '../../utils/embedBuilder.js';
import { setRankingChannel } from '../../utils/database.js';

export const data = new SlashCommandBuilder()
    .setName('set-ranking-channel')
    .setDescription('Define o canal onde o ranking quinzenal será postado.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
        option
            .setName('canal')
            .setDescription('Canal de texto para postar o ranking')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const channel = interaction.options.getChannel('canal', true);

    try {
        setRankingChannel(guildId, channel.id);

        await interaction.reply({
            embeds: [
                createEmbed(interaction)
                    .setTitle('Canal de Ranking Configurado')
                    .setDescription(`O canal para o ranking quinzenal foi configurado para <#${channel.id}>.`)
            ],
            ephemeral: true
        });
    } catch (error) {
        console.error('[AUTO MIX] Erro ao salvar canal de ranking:', error);
        await interaction.reply({
            embeds: [createErrorEmbed('Ocorreu um erro ao salvar o canal no banco de dados.', interaction)],
            ephemeral: true
        });
    }
}
