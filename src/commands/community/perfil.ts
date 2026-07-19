import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    AttachmentBuilder,
} from 'discord.js';
import { createEmbed } from '../../utils/embedBuilder.js';
import { getDatabase, getPlayer, upsertPlayer } from '../../utils/database.js';
import { generateProfileCard } from '../../utils/canvasProfile.js';

export const data = new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('Exibe o perfil de um jogador com suas estatisticas')
    .addUserOption(option =>
        option
            .setName('jogador')
            .setDescription('Jogador para visualizar o perfil (padrao: voce)')
            .setRequired(false)
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) return;

    await interaction.deferReply();

    // Ensure DB is ready
    await getDatabase();

    const targetUser = interaction.options.getUser('jogador') ?? interaction.user;
    const targetMember = interaction.guild?.members.cache.get(targetUser.id)
        ?? await interaction.guild?.members.fetch(targetUser.id).catch(() => null);

    if (!targetMember) {
        await interaction.editReply({
            embeds: [createEmbed(interaction).setDescription('Membro nao encontrado no servidor.')],
        });
        return;
    }

    // Ensure player exists in DB
    upsertPlayer(targetUser.id, guildId);
    const player = getPlayer(targetUser.id, guildId);

    // Detect GC and Faceit levels from roles
    let gcLevel: number | null = null;
    let faceitLevel: string | null = null;

    const memberRoles = targetMember.roles.cache;

    for (const [, role] of memberRoles) {
        const gcMatch = role.name.match(/^GC (\d+)$/);
        if (gcMatch) {
            gcLevel = parseInt(gcMatch[1]);
        }

        const faceitMatch = role.name.match(/^Faceit (\d+|Challenger)$/);
        if (faceitMatch) {
            faceitLevel = faceitMatch[1];
        }
    }

    // Calculate KD
    const kd = player && player.total_deaths > 0
        ? player.total_kills / player.total_deaths
        : (player?.total_kills ?? 0);

    // Fetch avatar
    let avatarBuffer: Buffer | null = null;
    try {
        const avatarUrl = targetUser.displayAvatarURL({ extension: 'png', size: 256 });
        const response = await fetch(avatarUrl);
        if (response.ok) {
            avatarBuffer = Buffer.from(await response.arrayBuffer());
        }
    } catch {
        // Use placeholder
    }

    // Generate profile card
    const imageBuffer = await generateProfileCard({
        displayName: targetMember.displayName,
        avatarBuffer,
        role: player?.role ?? null,
        kd,
        matchesPlayed: player?.matches_played ?? 0,
        totalKills: player?.total_kills ?? 0,
        totalDeaths: player?.total_deaths ?? 0,
        gcLevel,
        faceitLevel,
    });

    const attachment = new AttachmentBuilder(imageBuffer, { name: 'perfil.png' });

    const embed = createEmbed(interaction)
        .setImage('attachment://perfil.png');

    await interaction.editReply({
        embeds: [embed],
        files: [attachment],
    });
}
