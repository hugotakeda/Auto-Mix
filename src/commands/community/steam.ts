import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
} from 'discord.js';
import { createEmbed, createErrorEmbed } from '../../utils/embedBuilder.js';
import {
    getDatabase,
    linkSteamId,
    unlinkSteamId,
    getSteamId,
    getUserBySteamId,
} from '../../utils/database.js';
import {
    resolveSteamId,
    fetchPlayerSummary,
    profileUrl,
    SteamResolveError,
} from '../../utils/steam.js';

export const data = new SlashCommandBuilder()
    .setName('steam')
    .setDescription('Vincula seu perfil da Steam ao seu Discord')
    .addSubcommand(sub =>
        sub
            .setName('vincular')
            .setDescription('Vincula seu perfil da Steam para as stats das demos irem pra voce')
            .addStringOption(option =>
                option
                    .setName('perfil')
                    .setDescription('Link do seu perfil da Steam, ou o SteamID64')
                    .setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub
            .setName('ver')
            .setDescription('Mostra o perfil da Steam vinculado')
            .addUserOption(option =>
                option
                    .setName('jogador')
                    .setDescription('De quem voce quer ver (padrao: voce)')
                    .setRequired(false)
            )
    )
    .addSubcommand(sub =>
        sub
            .setName('remover')
            .setDescription('Remove o vinculo da sua conta Steam')
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) return;

    await getDatabase();

    switch (interaction.options.getSubcommand()) {
        case 'vincular':
            return handleLink(interaction, guildId);
        case 'ver':
            return handleView(interaction, guildId);
        case 'remover':
            return handleUnlink(interaction, guildId);
    }
}

async function handleLink(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
    const input = interaction.options.getString('perfil', true);

    // A resolucao pode bater na Steam, entao defer antes.
    await interaction.deferReply({ flags: 64 });

    let steamId64: string;
    let personaName: string | undefined;
    let avatarUrl: string | undefined;

    try {
        const profile = await resolveSteamId(input);
        steamId64 = profile.steamId64;

        const summary = await fetchPlayerSummary(steamId64);
        personaName = summary.personaName;
        avatarUrl = summary.avatarUrl;
    } catch (error) {
        const message = error instanceof SteamResolveError
            ? error.message
            : 'Nao consegui resolver esse perfil.';

        await interaction.editReply({
            embeds: [
                createErrorEmbed(
                    `${message}\n\n**Formatos aceitos:**\n` +
                    '`https://steamcommunity.com/profiles/76561198...`\n' +
                    '`https://steamcommunity.com/id/seunick`\n' +
                    '`76561198293926551`',
                    interaction
                ),
            ],
        });
        return;
    }

    // Ja vinculado a outra pessoa?
    const owner = getUserBySteamId(guildId, steamId64);
    if (owner && owner !== interaction.user.id) {
        await interaction.editReply({
            embeds: [
                createErrorEmbed(
                    `Esse perfil da Steam ja esta vinculado a <@${owner}>.\n\n` +
                    'Se a conta e sua, peca pra essa pessoa rodar `/steam remover` primeiro.',
                    interaction
                ),
            ],
        });
        return;
    }

    const previous = getSteamId(interaction.user.id, guildId);

    try {
        linkSteamId(interaction.user.id, guildId, steamId64);
    } catch (error) {
        console.error('[AUTO MIX] Erro ao vincular Steam:', error);
        await interaction.editReply({
            embeds: [createErrorEmbed('Erro ao salvar o vinculo no banco de dados.', interaction)],
        });
        return;
    }

    const embed = createEmbed(interaction)
        .setTitle(previous && previous !== steamId64 ? 'Perfil da Steam atualizado' : 'Perfil da Steam vinculado')
        .setDescription(
            `${personaName ? `**${personaName}**\n` : ''}` +
            `SteamID64: \`${steamId64}\`\n` +
            `[Abrir perfil](${profileUrl(steamId64)})\n\n` +
            'A partir de agora, as demos enviadas no site que tiverem esse ID vao creditar as estatisticas pra voce.'
        );

    if (avatarUrl) embed.setThumbnail(avatarUrl);

    await interaction.editReply({ embeds: [embed] });
}

async function handleView(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
    const target = interaction.options.getUser('jogador') ?? interaction.user;
    const isSelf = target.id === interaction.user.id;

    await interaction.deferReply({ flags: 64 });

    const steamId64 = getSteamId(target.id, guildId);

    if (!steamId64) {
        await interaction.editReply({
            embeds: [
                createEmbed(interaction).setDescription(
                    isSelf
                        ? 'Voce ainda nao vinculou sua Steam. Use `/steam vincular` com o link do seu perfil.'
                        : `<@${target.id}> ainda nao vinculou uma conta da Steam.`
                ),
            ],
        });
        return;
    }

    const summary = await fetchPlayerSummary(steamId64);

    const embed = createEmbed(interaction)
        .setTitle(isSelf ? 'Sua conta da Steam' : `Conta da Steam de ${target.displayName}`)
        .setDescription(
            `${summary.personaName ? `**${summary.personaName}**\n` : ''}` +
            `SteamID64: \`${steamId64}\`\n` +
            `[Abrir perfil](${profileUrl(steamId64)})`
        );

    if (summary.avatarUrl) embed.setThumbnail(summary.avatarUrl);

    await interaction.editReply({ embeds: [embed] });
}

async function handleUnlink(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
    await interaction.deferReply({ flags: 64 });

    const current = getSteamId(interaction.user.id, guildId);

    if (!current) {
        await interaction.editReply({
            embeds: [createEmbed(interaction).setDescription('Voce nao tem nenhuma conta da Steam vinculada.')],
        });
        return;
    }

    unlinkSteamId(interaction.user.id, guildId);

    await interaction.editReply({
        embeds: [
            createEmbed(interaction)
                .setTitle('Vinculo removido')
                .setDescription(
                    `A conta \`${current}\` nao esta mais vinculada ao seu Discord.\n\n` +
                    'Suas estatisticas ja registradas continuam salvas — se vincular de novo, elas voltam a aparecer.'
                ),
        ],
    });
}
