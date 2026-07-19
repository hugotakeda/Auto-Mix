import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    ChannelType,
    GuildMember,
    ActionRowBuilder,
    UserSelectMenuBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ComponentType,
    type Message,
    PermissionFlagsBits,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';
import { createEmbed, createErrorEmbed } from '../../utils/embedBuilder.js';
import { pickTwoTeamNames, shuffleAndSplit, pickRandomCaptain } from './teamNames.js';
import { runPickBan } from './pickban.js';
import { createMatch, getDatabase } from '../../utils/database.js';

export const data = new SlashCommandBuilder()
    .setName('mix')
    .setDescription('Inicia um mix 5v5 de Counter-Strike 2')
    .addStringOption(option =>
        option
            .setName('modo')
            .setDescription('Modo de selecao dos times')
            .setRequired(true)
            .addChoices(
                { name: 'Capitao', value: 'captain' },
                { name: 'Aleatorio', value: 'random' },
            )
    )
    .addStringOption(option =>
        option
            .setName('formato')
            .setDescription('Numero de partidas')
            .setRequired(true)
            .addChoices(
                { name: 'MD1 (uma partida)', value: 'MD1' },
                { name: 'MD3 (melhor de tres)', value: 'MD3' },
            )
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const modo = interaction.options.getString('modo', true);
    const formato = interaction.options.getString('formato', true) as 'MD1' | 'MD3';

    // Check if user is in a voice channel
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
        await interaction.reply({
            embeds: [createErrorEmbed('Voce precisa estar em um canal de voz com 10 jogadores para iniciar um mix.', interaction)],
            flags: 64,
        });
        return;
    }

    // Get members in voice channel (excluding bots)
    const voiceMembers = voiceChannel.members.filter(m => !m.user.bot);

    if (voiceMembers.size < 10) {
        await interaction.reply({
            embeds: [
                createEmbed(interaction)
                    .setDescription(`O canal de voz precisa ter exatamente 10 jogadores para iniciar o mix.\n\nJogadores no canal: **${voiceMembers.size}/10**`)
            ],
            flags: 64,
        });
        return;
    }

    if (voiceMembers.size > 10) {
        await interaction.reply({
            embeds: [
                createEmbed(interaction)
                    .setDescription(`O canal de voz tem mais de 10 jogadores (${voiceMembers.size}). Apenas 10 jogadores podem participar do mix.`)
            ],
            flags: 64,
        });
        return;
    }

    const players = Array.from(voiceMembers.values());

    await interaction.deferReply();

    if (modo === 'captain') {
        await handleCaptainMode(interaction, players, formato, guildId);
    } else {
        await handleRandomMode(interaction, players, formato, guildId);
    }
}

// ==========================================
// CAPTAIN MODE
// ==========================================
async function handleCaptainMode(
    interaction: ChatInputCommandInteraction,
    players: GuildMember[],
    formato: 'MD1' | 'MD3',
    guildId: string,
): Promise<void> {
    // Step 1: Ask for captains selection
    const selectEmbed = createEmbed(interaction)
        .setTitle('Selecao de Capitaes')
        .setDescription('Selecione o **Capitao 1** (Time A) usando o menu abaixo.');

    const selectMenu1 = new UserSelectMenuBuilder()
        .setCustomId('captain_select_1')
        .setPlaceholder('Selecionar Capitao 1')
        .setMinValues(1)
        .setMaxValues(1);

    const row1 = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(selectMenu1);

    const captainMsg = await interaction.editReply({
        embeds: [selectEmbed],
        components: [row1],
    }) as Message;

    // Wait for Captain 1
    let captainA: GuildMember;
    try {
        const cap1Interaction = await captainMsg.awaitMessageComponent({
            componentType: ComponentType.UserSelect,
            filter: (i) => i.customId === 'captain_select_1' && i.user.id === interaction.user.id,
            time: 60_000,
        });

        await cap1Interaction.deferUpdate();
        const cap1Id = cap1Interaction.values[0];
        const foundCap1 = players.find(p => p.id === cap1Id);

        if (!foundCap1) {
            await interaction.editReply({
                embeds: [createErrorEmbed('O jogador selecionado nao esta no canal de voz.', interaction)],
                components: [],
            });
            return;
        }
        captainA = foundCap1;
    } catch {
        await interaction.editReply({
            embeds: [createErrorEmbed('Tempo esgotado para selecao do Capitao 1.', interaction)],
            components: [],
        });
        return;
    }

    // Wait for Captain 2
    const selectEmbed2 = createEmbed(interaction)
        .setTitle('Selecao de Capitaes')
        .setDescription(`**Capitao 1:** ${captainA.displayName}\n\nAgora selecione o **Capitao 2** (Time B).`);

    const selectMenu2 = new UserSelectMenuBuilder()
        .setCustomId('captain_select_2')
        .setPlaceholder('Selecionar Capitao 2')
        .setMinValues(1)
        .setMaxValues(1);

    const row2 = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(selectMenu2);

    await interaction.editReply({
        embeds: [selectEmbed2],
        components: [row2],
    });

    let captainB: GuildMember;
    try {
        const cap2Interaction = await captainMsg.awaitMessageComponent({
            componentType: ComponentType.UserSelect,
            filter: (i) => {
                if (i.customId !== 'captain_select_2') return false;
                if (i.user.id !== interaction.user.id) return false;
                if (i.values[0] === captainA.id) {
                    i.reply({
                        embeds: [createErrorEmbed('O Capitao 2 nao pode ser o mesmo que o Capitao 1.', interaction)],
                        flags: 64,
                    }).catch(() => {});
                    return false;
                }
                return true;
            },
            time: 60_000,
        });

        await cap2Interaction.deferUpdate();
        const cap2Id = cap2Interaction.values[0];
        const foundCap2 = players.find(p => p.id === cap2Id);

        if (!foundCap2) {
            await interaction.editReply({
                embeds: [createErrorEmbed('O jogador selecionado nao esta no canal de voz.', interaction)],
                components: [],
            });
            return;
        }
        captainB = foundCap2;
    } catch {
        await interaction.editReply({
            embeds: [createErrorEmbed('Tempo esgotado para selecao do Capitao 2.', interaction)],
            components: [],
        });
        return;
    }

    // Step 2: Draft — captains alternate picking players
    const availablePlayers = players.filter(p => p.id !== captainA.id && p.id !== captainB.id);
    const teamA: GuildMember[] = [captainA];
    const teamB: GuildMember[] = [captainB];

    // Draft order: A picks 1, B picks 1, alternating (4 rounds each = 8 picks total)
    const draftOrder: ('A' | 'B')[] = ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B'];

    await interaction.editReply({
        embeds: [buildDraftEmbed(interaction, captainA, captainB, teamA, teamB, availablePlayers, draftOrder[0])],
        components: buildDraftSelectMenu(availablePlayers, draftOrder[0] === 'A' ? captainA : captainB),
    });

    for (let round = 0; round < draftOrder.length; round++) {
        const currentTeam = draftOrder[round];
        const currentCaptain = currentTeam === 'A' ? captainA : captainB;

        // Update embed
        if (round > 0) {
            await interaction.editReply({
                embeds: [buildDraftEmbed(interaction, captainA, captainB, teamA, teamB, availablePlayers, currentTeam)],
                components: buildDraftSelectMenu(availablePlayers, currentCaptain),
            }).catch(() => {});
        }

        try {
            const draftInteraction = await captainMsg.awaitMessageComponent({
                componentType: ComponentType.StringSelect,
                filter: (i) => {
                    if (i.customId !== 'draft_pick') return false;
                    if (i.user.id !== currentCaptain.id) {
                        i.reply({
                            embeds: [createErrorEmbed(`Nao e a sua vez. Aguarde ${currentCaptain.displayName} escolher.`, interaction)],
                            flags: 64,
                        }).catch(() => {});
                        return false;
                    }
                    return true;
                },
                time: 120_000,
            });

            await draftInteraction.deferUpdate();

            const pickedId = draftInteraction.values[0];
            const pickedPlayer = availablePlayers.find(p => p.id === pickedId);

            if (!pickedPlayer) continue;

            if (currentTeam === 'A') {
                teamA.push(pickedPlayer);
            } else {
                teamB.push(pickedPlayer);
            }

            // Remove from available
            const idx = availablePlayers.indexOf(pickedPlayer);
            if (idx !== -1) availablePlayers.splice(idx, 1);

        } catch {
            await interaction.editReply({
                embeds: [createErrorEmbed('Tempo esgotado durante o draft. O mix foi cancelado.', interaction)],
                components: [],
            });
            return;
        }
    }

    // Teams are formed — proceed
    const [teamAName, teamBName] = pickTwoTeamNames();

    await finalizeMix(interaction, teamA, teamB, teamAName, teamBName, captainA, captainB, formato, guildId, 'captain');
}

// ==========================================
// RANDOM MODE
// ==========================================
async function handleRandomMode(
    interaction: ChatInputCommandInteraction,
    players: GuildMember[],
    formato: 'MD1' | 'MD3',
    guildId: string,
): Promise<void> {
    const [teamAName, teamBName] = pickTwoTeamNames();
    const [teamA, teamB] = shuffleAndSplit(players);

    // Pick random temporary captains for pick & ban
    const captainA = pickRandomCaptain(teamA);
    const captainB = pickRandomCaptain(teamB);

    const shuffleEmbed = createEmbed(interaction)
        .setTitle('Times sorteados')
        .setDescription('Os times foram divididos de forma aleatoria.')
        .addFields(
            {
                name: `${teamAName}`,
                value: teamA.map(m => m.displayName).join('\n'),
                inline: true,
            },
            {
                name: `${teamBName}`,
                value: teamB.map(m => m.displayName).join('\n'),
                inline: true,
            },
        )
        .addFields(
            {
                name: 'Capitaes (temporarios — apenas para picks e bans)',
                value: `**${teamAName}:** ${captainA.displayName}\n**${teamBName}:** ${captainB.displayName}`,
                inline: false,
            },
        );

    await interaction.editReply({
        embeds: [shuffleEmbed],
        components: [],
    });

    await finalizeMix(interaction, teamA, teamB, teamAName, teamBName, captainA, captainB, formato, guildId, 'random');
}

// ==========================================
// FINALIZE MIX — Create channels, pick/ban, move players
// ==========================================
async function finalizeMix(
    interaction: ChatInputCommandInteraction,
    teamA: GuildMember[],
    teamB: GuildMember[],
    teamAName: string,
    teamBName: string,
    captainA: GuildMember,
    captainB: GuildMember,
    formato: 'MD1' | 'MD3',
    guildId: string,
    mode: 'captain' | 'random',
): Promise<void> {
    const guild = interaction.guild!;

    // Run pick & ban
    const pickBanResult = await runPickBan(
        interaction,
        formato,
        captainA.id,
        captainA.displayName,
        captainB.id,
        captainB.displayName,
        teamAName,
        teamBName,
    );

    if (!pickBanResult) return; // Cancelled/timeout

    // Create voice channels
    let channelA, channelB;
    try {
        const parent = interaction.channel?.isTextBased()
            ? (interaction.member as GuildMember).voice.channel?.parent
            : null;

        channelA = await guild.channels.create({
            name: `MIX — ${teamAName}`,
            type: ChannelType.GuildVoice,
            parent: parent ?? undefined,
            userLimit: 5,
        });

        channelB = await guild.channels.create({
            name: `MIX — ${teamBName}`,
            type: ChannelType.GuildVoice,
            parent: parent ?? undefined,
            userLimit: 5,
        });
    } catch (error) {
        await interaction.followUp({
            embeds: [createErrorEmbed('Nao foi possivel criar os canais de voz. Verifique as permissoes do bot.', interaction)],
        });
        return;
    }

    // Move players to their channels
    const moveErrors: string[] = [];

    for (const member of teamA) {
        try {
            if (member.voice.channel) {
                await member.voice.setChannel(channelA);
            }
        } catch {
            moveErrors.push(member.displayName);
        }
    }

    for (const member of teamB) {
        try {
            if (member.voice.channel) {
                await member.voice.setChannel(channelB);
            }
        } catch {
            moveErrors.push(member.displayName);
        }
    }

    // Save match to database
    await getDatabase();
    const match = createMatch(
        guildId,
        mode,
        formato,
        pickBanResult.maps,
        teamA.map(m => m.id),
        teamB.map(m => m.id),
        teamAName,
        teamBName,
        captainA.id,
        captainB.id,
    );

    // Build final embed
    const mapsList = pickBanResult.maps.map((map, i) => {
        if (formato === 'MD3') {
            const label = i < 2 ? `Mapa ${i + 1}` : 'Decisivo';
            return `${label}: **${map}**`;
        }
        return `Mapa: **${map}**`;
    }).join('\n');

    const finalEmbed = createEmbed(interaction)
        .setTitle(`Mix iniciado — ${formato}`)
        .addFields(
            {
                name: `${teamAName}`,
                value: teamA.map(m => m.displayName).join('\n'),
                inline: true,
            },
            {
                name: `${teamBName}`,
                value: teamB.map(m => m.displayName).join('\n'),
                inline: true,
            },
            {
                name: 'Mapas',
                value: mapsList,
                inline: false,
            },
        );

    if (moveErrors.length > 0) {
        finalEmbed.addFields({
            name: 'Aviso',
            value: `Nao foi possivel mover: ${moveErrors.join(', ')}`,
            inline: false,
        });
    }

    // Add cleanup button
    const cleanupRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`mix_cleanup_${channelA.id}_${channelB.id}`)
            .setLabel('Encerrar Mix')
            .setStyle(ButtonStyle.Secondary)
    );

    const finalMsg = await interaction.followUp({
        embeds: [finalEmbed],
        components: [cleanupRow],
    }) as Message;

    // Cleanup collector — delete voice channels when clicked
    const cleanupCollector = finalMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 7_200_000, // 2 hours
    });

    cleanupCollector.on('collect', async (btnInteraction) => {
        if (!btnInteraction.customId.startsWith('mix_cleanup_')) return;

        // Only allow original command user or admins
        const btnMember = btnInteraction.member as GuildMember;
        if (btnInteraction.user.id !== interaction.user.id && !btnMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
            await btnInteraction.reply({
                embeds: [createErrorEmbed('Apenas o autor do mix ou um administrador pode encerrar o mix.', interaction)],
                flags: 64,
            });
            return;
        }

        await btnInteraction.deferUpdate();

        try {
            await channelA.delete().catch(() => {});
            await channelB.delete().catch(() => {});
        } catch { /* channels may already be deleted */ }

        await finalMsg.edit({
            embeds: [
                createEmbed(interaction)
                    .setTitle('Mix encerrado')
                    .setDescription(`Os canais de voz foram removidos.\n\nUtilize **/mix-fim** para registrar suas estatisticas.`)
            ],
            components: [],
        }).catch(() => {});

        cleanupCollector.stop();
    });

    cleanupCollector.on('end', async () => {
        // Auto-cleanup after 2 hours
        try {
            await channelA.delete().catch(() => {});
            await channelB.delete().catch(() => {});
        } catch { /* already deleted */ }

        await finalMsg.edit({ components: [] }).catch(() => {});
    });
}

// ==========================================
// HELPER: Build draft embed
// ==========================================
function buildDraftEmbed(
    interaction: ChatInputCommandInteraction,
    captainA: GuildMember,
    captainB: GuildMember,
    teamA: GuildMember[],
    teamB: GuildMember[],
    available: GuildMember[],
    currentTurn: 'A' | 'B',
): any {
    const currentCaptain = currentTurn === 'A' ? captainA : captainB;

    return createEmbed(interaction)
        .setTitle('Draft — Selecao de jogadores')
        .setDescription(`Vez de **${currentCaptain.displayName}** escolher um jogador.`)
        .addFields(
            {
                name: `Time A — ${captainA.displayName} (Cap.)`,
                value: teamA.map(m => m.displayName).join('\n') || 'Vazio',
                inline: true,
            },
            {
                name: `Time B — ${captainB.displayName} (Cap.)`,
                value: teamB.map(m => m.displayName).join('\n') || 'Vazio',
                inline: true,
            },
            {
                name: 'Jogadores disponiveis',
                value: available.map(m => m.displayName).join(', ') || 'Nenhum',
                inline: false,
            },
        );
}

// ==========================================
// HELPER: Build draft select menu
// ==========================================
function buildDraftSelectMenu(
    available: GuildMember[],
    _captain: GuildMember,
): ActionRowBuilder<StringSelectMenuBuilder>[] {
    if (available.length === 0) return [];

    const select = new StringSelectMenuBuilder()
        .setCustomId('draft_pick')
        .setPlaceholder('Escolher jogador')
        .addOptions(
            available.map(m =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(m.displayName)
                    .setValue(m.id)
            )
        );

    return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)];
}
