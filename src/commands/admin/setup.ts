import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    type StringSelectMenuInteraction,
    PermissionFlagsBits,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    EmbedBuilder,
    ChannelType,
    type TextChannel,
} from 'discord.js';
import { createEmbed, createErrorEmbed } from '../../utils/embedBuilder.js';
import {
    GC_LEVEL_COLORS,
    FACEIT_LEVEL_COLORS,
    hexToDiscordColor,
} from '../../utils/levelColors.js';
import { updatePlayerRole, getDatabase } from '../../utils/database.js';

// --- Player roles/positions ---
const PLAYER_ROLES = [
    { label: 'IGL', value: 'IGL', description: 'In-Game Leader — lider tatico do time' },
    { label: 'Entry Fragger', value: 'Entry Fragger', description: 'Primeiro a entrar no bombsite' },
    { label: 'AWPer', value: 'AWPer', description: 'Especialista em AWP' },
    { label: 'Support', value: 'Support', description: 'Suporte com utilitarias e trades' },
    { label: 'Lurker', value: 'Lurker', description: 'Joga isolado coletando informacao' },
    { label: 'Anchor', value: 'Anchor', description: 'Ancora — segura o bombsite na defesa' },
];

export const data = new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configura os cargos de nivel GC, Faceit e posicao do jogador')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
        option
            .setName('canal')
            .setDescription('Canal onde o painel de selecao sera enviado')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const guild = interaction.guild!;
    const targetChannel = interaction.options.getChannel('canal', true) as TextChannel;

    await interaction.deferReply({ flags: 64 });

    // ==========================================
    // CREATE GC ROLES
    // ==========================================
    const gcRolesCreated: string[] = [];

    for (const [levelStr, color] of Object.entries(GC_LEVEL_COLORS)) {
        const level = parseInt(levelStr);
        const roleName = `GC ${level}`;

        // Check if role already exists
        let role = guild.roles.cache.find(r => r.name === roleName);

        if (!role) {
            try {
                role = await guild.roles.create({
                    name: roleName,
                    color: hexToDiscordColor(color),
                    reason: 'Auto Mix — Setup de niveis GC',
                    mentionable: false,
                    hoist: false,
                });
                gcRolesCreated.push(roleName);
            } catch (error) {
                console.error(`[AUTO MIX] Erro ao criar cargo ${roleName}:`, error);
            }
        }
    }

    // ==========================================
    // CREATE FACEIT ROLES
    // ==========================================
    const faceitRolesCreated: string[] = [];

    for (const [level, color] of Object.entries(FACEIT_LEVEL_COLORS)) {
        const roleName = `Faceit ${level}`;

        let role = guild.roles.cache.find(r => r.name === roleName);

        if (!role) {
            try {
                role = await guild.roles.create({
                    name: roleName,
                    color: hexToDiscordColor(color),
                    reason: 'Auto Mix — Setup de niveis Faceit',
                    mentionable: false,
                    hoist: false,
                });
                faceitRolesCreated.push(roleName);
            } catch (error) {
                console.error(`[AUTO MIX] Erro ao criar cargo ${roleName}:`, error);
            }
        }
    }

    // ==========================================
    // CREATE PLAYER ROLE ROLES (positions)
    // ==========================================
    const positionRolesCreated: string[] = [];
    const POSITION_COLOR = '#24242a';

    for (const pos of PLAYER_ROLES) {
        const roleName = pos.value;

        let role = guild.roles.cache.find(r => r.name === roleName);

        if (!role) {
            try {
                role = await guild.roles.create({
                    name: roleName,
                    color: hexToDiscordColor(POSITION_COLOR),
                    reason: 'Auto Mix — Setup de posicoes',
                    mentionable: false,
                    hoist: false,
                });
                positionRolesCreated.push(roleName);
            } catch (error) {
                console.error(`[AUTO MIX] Erro ao criar cargo ${roleName}:`, error);
            }
        }
    }

    // ==========================================
    // BUILD SELECT MENUS
    // ==========================================

    // --- GC Level Select (split into 2 menus since max 25 options) ---
    const gcOptions = Object.entries(GC_LEVEL_COLORS).map(([level]) => {
        return new StringSelectMenuOptionBuilder()
            .setLabel(`GC ${level}`)
            .setValue(`gc_${level}`)
            .setDescription(`Gamersclub Level ${level}`);
    });

    const gcSelect = new StringSelectMenuBuilder()
        .setCustomId('setup_gc_level')
        .setPlaceholder('Selecionar nivel da Gamersclub')
        .setMinValues(0)
        .setMaxValues(1)
        .addOptions(gcOptions);

    // --- Faceit Level Select ---
    const faceitOptions = Object.entries(FACEIT_LEVEL_COLORS)
        .filter(([level]) => level !== 'Challenger')
        .map(([level]) => {
            return new StringSelectMenuOptionBuilder()
                .setLabel(`Faceit ${level}`)
                .setValue(`faceit_${level}`)
                .setDescription(`Faceit Level ${level}`);
        });

    const faceitSelect = new StringSelectMenuBuilder()
        .setCustomId('setup_faceit_level')
        .setPlaceholder('Selecionar nivel da Faceit')
        .setMinValues(0)
        .setMaxValues(1)
        .addOptions(faceitOptions);

    // --- Player Role Select ---
    const roleOptions = PLAYER_ROLES.map(pos => {
        return new StringSelectMenuOptionBuilder()
            .setLabel(pos.label)
            .setValue(`role_${pos.value}`)
            .setDescription(pos.description);
    });

    const roleSelect = new StringSelectMenuBuilder()
        .setCustomId('setup_role_select')
        .setPlaceholder('Selecionar sua posicao no jogo')
        .setMinValues(0)
        .setMaxValues(1)
        .addOptions(roleOptions);

    // --- Build rows ---
    const gcRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(gcSelect);
    const faceitRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(faceitSelect);
    const roleRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(roleSelect);

    // --- Build embed ---
    const setupEmbed = createEmbed(interaction)
        .setTitle('Configuracao de Perfil')
        .setDescription(
            'Utilize os menus abaixo para configurar o seu perfil.\n\n' +
            '**Gamersclub** — Selecione o seu nivel atual na GC\n' +
            '**Faceit** — Selecione o seu nivel atual na Faceit\n' +
            '**Posicao** — Selecione a sua funcao principal no jogo\n\n' +
            'Para remover uma selecao, basta abrir o menu e enviar sem selecionar nenhuma opcao.'
        );

    // Send to target channel
    await targetChannel.send({
        embeds: [setupEmbed],
        components: [gcRow, faceitRow, roleRow],
    });

    // --- Report to admin ---
    const totalCreated = gcRolesCreated.length + faceitRolesCreated.length + positionRolesCreated.length;
    let reportDesc = `Painel de configuracao enviado para ${targetChannel}.\n\n`;

    if (totalCreated > 0) {
        reportDesc += `**Cargos criados:** ${totalCreated}\n`;
        if (gcRolesCreated.length > 0) {
            reportDesc += `GC: ${gcRolesCreated.join(', ')}\n`;
        }
        if (faceitRolesCreated.length > 0) {
            reportDesc += `Faceit: ${faceitRolesCreated.join(', ')}\n`;
        }
        if (positionRolesCreated.length > 0) {
            reportDesc += `Posicoes: ${positionRolesCreated.join(', ')}\n`;
        }
    } else {
        reportDesc += 'Todos os cargos ja existiam no servidor.';
    }

    await interaction.editReply({
        embeds: [createEmbed(interaction).setDescription(reportDesc)],
    });
}

// ==========================================
// HANDLE SELECT MENU INTERACTIONS (persistent)
// ==========================================
export async function handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const guild = interaction.guild!;
    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) return;

    await interaction.deferReply({ flags: 64 });

    // Ensure DB is ready
    await getDatabase();

    // --- GC Level ---
    if (interaction.customId === 'setup_gc_level') {
        // Remove any existing GC roles
        const existingGcRoles = member.roles.cache.filter(r => /^GC \d+$/.test(r.name));
        for (const [, role] of existingGcRoles) {
            await member.roles.remove(role).catch(() => {});
        }

        if (interaction.values.length === 0) {
            await interaction.editReply({
                embeds: [createEmbed(interaction).setDescription('Seu nivel da Gamersclub foi removido.')],
            });
            return;
        }

        const level = interaction.values[0].replace('gc_', '');
        const roleName = `GC ${level}`;
        const role = guild.roles.cache.find(r => r.name === roleName);

        if (role) {
            await member.roles.add(role);
            await interaction.editReply({
                embeds: [createEmbed(interaction).setDescription(`Seu nivel da Gamersclub foi atualizado para **${roleName}**.`)],
            });
        } else {
            await interaction.editReply({
                embeds: [createErrorEmbed(`Cargo ${roleName} nao encontrado. Execute /setup novamente.`, interaction)],
            });
        }
        return;
    }

    // --- Faceit Level ---
    if (interaction.customId === 'setup_faceit_level') {
        // Remove existing Faceit roles
        const existingFaceitRoles = member.roles.cache.filter(r => /^Faceit (\d+|Challenger)$/.test(r.name));
        for (const [, role] of existingFaceitRoles) {
            await member.roles.remove(role).catch(() => {});
        }

        if (interaction.values.length === 0) {
            await interaction.editReply({
                embeds: [createEmbed(interaction).setDescription('Seu nivel da Faceit foi removido.')],
            });
            return;
        }

        const level = interaction.values[0].replace('faceit_', '');
        const roleName = `Faceit ${level}`;
        const role = guild.roles.cache.find(r => r.name === roleName);

        if (role) {
            await member.roles.add(role);
            await interaction.editReply({
                embeds: [createEmbed(interaction).setDescription(`Seu nivel da Faceit foi atualizado para **${roleName}**.`)],
            });
        } else {
            await interaction.editReply({
                embeds: [createErrorEmbed(`Cargo ${roleName} nao encontrado. Execute /setup novamente.`, interaction)],
            });
        }
        return;
    }

    // --- Player Role/Position ---
    if (interaction.customId === 'setup_role_select') {
        // Remove existing position roles
        const positionNames = PLAYER_ROLES.map(p => p.value);
        const existingPosRoles = member.roles.cache.filter(r => positionNames.includes(r.name));
        for (const [, role] of existingPosRoles) {
            await member.roles.remove(role).catch(() => {});
        }

        if (interaction.values.length === 0) {
            // Also clear from database
            updatePlayerRole(interaction.user.id, guildId, '');
            await interaction.editReply({
                embeds: [createEmbed(interaction).setDescription('Sua posicao foi removida.')],
            });
            return;
        }

        const posValue = interaction.values[0].replace('role_', '');
        const role = guild.roles.cache.find(r => r.name === posValue);

        if (role) {
            await member.roles.add(role);
            // Save to database
            updatePlayerRole(interaction.user.id, guildId, posValue);
            await interaction.editReply({
                embeds: [createEmbed(interaction).setDescription(`Sua posicao foi atualizada para **${posValue}**.`)],
            });
        } else {
            await interaction.editReply({
                embeds: [createErrorEmbed(`Cargo ${posValue} nao encontrado. Execute /setup novamente.`, interaction)],
            });
        }
        return;
    }
}
