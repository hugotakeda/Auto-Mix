import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    type ChatInputCommandInteraction,
    type Message,
    ComponentType,
    EmbedBuilder,
} from 'discord.js';
import { createEmbed } from '../../utils/embedBuilder.js';
import { MAP_POOL } from './teamNames.js';

// --- Types ---

interface PickBanResult {
    maps: string[];           // Mapas selecionados para jogar
    bans: string[];           // Mapas banidos
    actions: PickBanAction[]; // Historico de acoes
}

interface PickBanAction {
    captain: string;     // ID do capitao
    captainName: string; // Display name do capitao
    action: 'ban' | 'pick';
    map: string;
    team: 'A' | 'B';
}

// --- MD3 sequence: ban, ban, pick, pick, ban, ban → last map = 3rd map ---
const MD3_SEQUENCE: Array<{ action: 'ban' | 'pick'; team: 'A' | 'B' }> = [
    { action: 'ban',  team: 'A' },
    { action: 'ban',  team: 'B' },
    { action: 'pick', team: 'A' },
    { action: 'pick', team: 'B' },
    { action: 'ban',  team: 'A' },
    { action: 'ban',  team: 'B' },
    // remaining map is the 3rd map (decider)
];

// --- MD1 sequence: alternating bans until 1 map left ---
const MD1_SEQUENCE: Array<{ action: 'ban' | 'pick'; team: 'A' | 'B' }> = [
    { action: 'ban', team: 'A' },
    { action: 'ban', team: 'B' },
    { action: 'ban', team: 'A' },
    { action: 'ban', team: 'B' },
    { action: 'ban', team: 'A' },
    { action: 'ban', team: 'B' },
    // remaining map is played
];

/**
 * Executes the full interactive pick & ban phase.
 * Returns the final map(s) selected.
 */
export async function runPickBan(
    interaction: ChatInputCommandInteraction,
    format: 'MD1' | 'MD3',
    captainAId: string,
    captainAName: string,
    captainBId: string,
    captainBName: string,
    teamAName: string,
    teamBName: string,
    matchIndex: number,
): Promise<PickBanResult | null> {
    const sequence = format === 'MD3' ? MD3_SEQUENCE : MD1_SEQUENCE;
    const availableMaps = [...MAP_POOL];
    const actions: PickBanAction[] = [];
    const pickedMaps: string[] = [];
    const bannedMaps: string[] = [];

    // Build the initial embed
    let currentStep = 0;

    function buildEmbed(): EmbedBuilder {
        const embed = createEmbed(interaction)
            .setTitle(`Picks e Bans — ${format} (Partida ${matchIndex})`)
            .setDescription(buildDescription());

        return embed;
    }

    function buildDescription(): string {
        let desc = '';

        // Show history
        if (actions.length > 0) {
            desc += '**Historico:**\n';
            for (const a of actions) {
                const icon = a.action === 'ban' ? '[BAN]' : '[PICK]';
                desc += `${icon} ${a.captainName} (${a.team === 'A' ? teamAName : teamBName}): **${a.map}**\n`;
            }
            desc += '\n';
        }

        // Current step info
        if (currentStep < sequence.length) {
            const step = sequence[currentStep];
            const captainName = step.team === 'A' ? captainAName : captainBName;
            const teamName = step.team === 'A' ? teamAName : teamBName;
            const actionLabel = step.action === 'ban' ? 'BANIR' : 'ESCOLHER';

            desc += `**Vez de:** ${captainName} (${teamName})\n`;
            desc += `**Acao:** ${actionLabel} um mapa\n\n`;
            desc += `**Mapas disponiveis:** ${availableMaps.join(', ')}`;
        } else {
            desc += `**Mapas disponiveis:** ${availableMaps.join(', ')}`;
        }

        return desc;
    }

    function buildMapButtons(): ActionRowBuilder<ButtonBuilder>[] {
        const rows: ActionRowBuilder<ButtonBuilder>[] = [];
        let currentRow = new ActionRowBuilder<ButtonBuilder>();

        for (let i = 0; i < availableMaps.length; i++) {
            const map = availableMaps[i];
            const step = sequence[currentStep];
            const style = step?.action === 'ban' ? ButtonStyle.Danger : ButtonStyle.Success;

            currentRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`pickban_${map}_${Date.now()}`)
                    .setLabel(map)
                    .setStyle(style)
            );

            // Discord limit: 5 buttons per row
            if ((i + 1) % 5 === 0 || i === availableMaps.length - 1) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder<ButtonBuilder>();
            }
        }

        return rows;
    }

    // Send the initial pick/ban message
    const message = await (interaction.channel as any).send({
        embeds: [buildEmbed()],
        components: buildMapButtons(),
    }) as Message;

    // --- Interactive loop ---
    for (currentStep = 0; currentStep < sequence.length; currentStep++) {
        const step = sequence[currentStep];
        const expectedCaptainId = step.team === 'A' ? captainAId : captainBId;
        const captainName = step.team === 'A' ? captainAName : captainBName;

        // Update the embed and buttons
        await message.edit({
            embeds: [buildEmbed()],
            components: buildMapButtons(),
        }).catch(() => {});

        // Wait for the correct captain to click
        try {
            const buttonInteraction = await message.awaitMessageComponent({
                componentType: ComponentType.Button,
                filter: (i) => {
                    if (i.user.id !== expectedCaptainId) {
                        i.reply({
                            embeds: [createEmbed(interaction).setDescription(`Nao e a sua vez. Aguarde ${captainName} fazer a escolha.`)],
                            flags: 64,
                        }).catch(() => {});
                        return false;
                    }
                    return i.customId.startsWith('pickban_');
                },
                time: 120_000, // 2 minutes per pick
            });

            await buttonInteraction.deferUpdate();

            // Extract map name from customId: "pickban_MapName_timestamp"
            const parts = buttonInteraction.customId.split('_');
            // Map name might contain spaces, so rejoin all parts except first and last
            const mapName = parts.slice(1, -1).join('_').replace(/_/g, ' ');

            // Find the matching map
            const selectedMap = availableMaps.find(m =>
                m.toLowerCase() === mapName.toLowerCase() ||
                m.replace(/\s/g, '_').toLowerCase() === parts.slice(1, -1).join('_').toLowerCase()
            );

            if (!selectedMap) continue;

            // Record the action
            const action: PickBanAction = {
                captain: expectedCaptainId,
                captainName,
                action: step.action,
                map: selectedMap,
                team: step.team,
            };
            actions.push(action);

            if (step.action === 'ban') {
                bannedMaps.push(selectedMap);
            } else {
                pickedMaps.push(selectedMap);
            }

            // Remove the map from available pool
            const idx = availableMaps.indexOf(selectedMap);
            if (idx !== -1) availableMaps.splice(idx, 1);

        } catch {
            // Timeout — cancel pick/ban
            await message.edit({
                embeds: [createEmbed(interaction).setDescription('Tempo esgotado para a selecao de mapas. O mix foi cancelado.')],
                components: [],
            }).catch(() => {});
            return null;
        }
    }

    // --- Final result ---
    // The remaining map(s) in the pool
    if (format === 'MD3') {
        // In MD3: 2 picked + 1 remaining (decider)
        if (availableMaps.length === 1) {
            pickedMaps.push(availableMaps[0]);
        }
    } else {
        // In MD1: 1 remaining map
        if (availableMaps.length === 1) {
            pickedMaps.push(availableMaps[0]);
        }
    }

    // Build final result embed
    const resultEmbed = createEmbed(interaction)
        .setTitle(`Mapas definidos — ${format} (Partida ${matchIndex})`);

    let resultDesc = '**Historico completo:**\n';
    for (const a of actions) {
        const icon = a.action === 'ban' ? '[BAN]' : '[PICK]';
        resultDesc += `${icon} ${a.captainName} (${a.team === 'A' ? teamAName : teamBName}): **${a.map}**\n`;
    }

    resultDesc += '\n**Mapas da partida:**\n';
    pickedMaps.forEach((map, i) => {
        if (format === 'MD3') {
            const label = i < 2 ? `Mapa ${i + 1}` : 'Mapa Decisivo';
            resultDesc += `${label}: **${map}**\n`;
        } else {
            resultDesc += `Mapa: **${map}**\n`;
        }
    });

    resultEmbed.setDescription(resultDesc);

    await message.edit({
        embeds: [resultEmbed],
        components: [],
    }).catch(() => {});

    return {
        maps: pickedMaps,
        bans: bannedMaps,
        actions,
    };
}
