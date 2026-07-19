import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
} from 'discord.js';
import { createEmbed } from '../../utils/embedBuilder.js';
import { getDatabase, addPlayerStats } from '../../utils/database.js';

export const data = new SlashCommandBuilder()
    .setName('mix-fim')
    .setDescription('Registra suas estatisticas apos uma partida de mix')
    .addIntegerOption(option =>
        option
            .setName('kills')
            .setDescription('Total de abates na partida')
            .setRequired(true)
            .setMinValue(0)
    )
    .addIntegerOption(option =>
        option
            .setName('deaths')
            .setDescription('Total de mortes na partida')
            .setRequired(true)
            .setMinValue(0)
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const kills = interaction.options.getInteger('kills', true);
    const deaths = interaction.options.getInteger('deaths', true);

    if (kills === 0 && deaths === 0) {
        await interaction.reply({
            embeds: [createEmbed(interaction).setDescription('Voce precisa informar pelo menos kills ou deaths maiores que zero.')],
            flags: 64,
        });
        return;
    }

    // Ensure DB is ready
    await getDatabase();

    // Calculate KD for this match
    const matchKd = deaths > 0 ? kills / deaths : kills;

    // Update accumulated stats
    const player = addPlayerStats(interaction.user.id, guildId, kills, deaths);

    // Calculate accumulated KD
    const accumulatedKd = player.total_deaths > 0
        ? player.total_kills / player.total_deaths
        : player.total_kills;

    const embed = createEmbed(interaction)
        .setTitle('Estatisticas registradas')
        .addFields(
            {
                name: 'Partida atual',
                value: `Abates: **${kills}**\nMortes: **${deaths}**\nK/D: **${matchKd.toFixed(2)}**`,
                inline: true,
            },
            {
                name: 'Acumulado',
                value: `Total de abates: **${player.total_kills}**\nTotal de mortes: **${player.total_deaths}**\nK/D: **${accumulatedKd.toFixed(2)}**`,
                inline: true,
            },
            {
                name: 'Partidas jogadas',
                value: `**${player.matches_played}**`,
                inline: false,
            },
        );

    await interaction.reply({
        embeds: [embed],
        flags: 64,
    });
}
