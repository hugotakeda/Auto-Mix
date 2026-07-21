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
    )
    .addStringOption(option =>
        option
            .setName('resultado')
            .setDescription('Resultado da partida para o seu time')
            .setRequired(true)
            .addChoices(
                { name: 'Vitória', value: 'win' },
                { name: 'Derrota', value: 'loss' },
                { name: 'Empate', value: 'draw' }
            )
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const kills = interaction.options.getInteger('kills', true);
    const deaths = interaction.options.getInteger('deaths', true);
    const resultado = interaction.options.getString('resultado', true) as 'win' | 'loss' | 'draw';

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
    const player = addPlayerStats(interaction.user.id, guildId, kills, deaths, resultado);

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
                value: `Vitórias: **${player.wins}**\nDerrotas: **${player.losses}**\nTotal abates: **${player.total_kills}**\nTotal mortes: **${player.total_deaths}**\nK/D: **${accumulatedKd.toFixed(2)}**`,
                inline: true,
            },
            {
                name: 'Partidas',
                value: `Jogadas: **${player.matches_played}**\nWinrate: **${player.matches_played > 0 ? ((player.wins / player.matches_played) * 100).toFixed(0) : 0}%**`,
                inline: false,
            },
        );

    await interaction.reply({
        embeds: [embed],
        flags: 64,
    });
}
