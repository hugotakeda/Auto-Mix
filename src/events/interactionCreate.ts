import {
    Events,
    type Interaction,
    type ChatInputCommandInteraction,
    type StringSelectMenuInteraction,
    type ButtonInteraction,
    type UserSelectMenuInteraction,
} from 'discord.js';
import { createErrorEmbed } from '../utils/embedBuilder.js';
import { resetPlayerMatches, resetPlayerKD } from '../utils/database.js';

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction: Interaction): Promise<void> {
    // --- Slash commands ---
    if (interaction.isChatInputCommand()) {
        await handleCommand(interaction);
        return;
    }

    // --- Buttons (pick & ban, confirmations) ---
    if (interaction.isButton()) {
        await handleButton(interaction);
        return;
    }

    // --- String select menus (setup levels, map selection) ---
    if (interaction.isStringSelectMenu()) {
        await handleStringSelectMenu(interaction);
        return;
    }

    // --- User select menus (captain selection) ---
    if (interaction.isUserSelectMenu()) {
        await handleUserSelectMenu(interaction);
        return;
    }
}

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const command = interaction.client.commands?.get(interaction.commandName);

    if (!command) {
        await interaction.reply({
            embeds: [createErrorEmbed('Comando nao encontrado.', interaction)],
            flags: 64,
        });
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`[AUTO MIX] Erro no comando /${interaction.commandName}:`, error);

        const errorEmbed = createErrorEmbed('Ocorreu um erro ao executar este comando.', interaction);

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [errorEmbed], flags: 64 }).catch(() => {});
        } else {
            await interaction.reply({ embeds: [errorEmbed], flags: 64 }).catch(() => {});
        }
    }
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) return;

    if (interaction.customId.startsWith('reset_matches_')) {
        const targetId = interaction.customId.replace('reset_matches_', '');
        if (interaction.user.id !== targetId) {
            await interaction.reply({ content: '❌ Você não pode resetar as estatisticas no perfil de outra pessoa.', flags: 64 });
            return;
        }

        resetPlayerMatches(interaction.user.id, guildId);
        await interaction.reply({
            content: '✅ Suas **partidas** foram zeradas com sucesso! Use `/perfil` novamente para ver as alterações.',
            flags: 64,
        });
        return;
    }

    if (interaction.customId.startsWith('reset_kd_')) {
        const targetId = interaction.customId.replace('reset_kd_', '');
        if (interaction.user.id !== targetId) {
            await interaction.reply({ content: '❌ Você não pode resetar as estatisticas no perfil de outra pessoa.', flags: 64 });
            return;
        }

        resetPlayerKD(interaction.user.id, guildId);
        await interaction.reply({
            content: '✅ Seu **KD** foi zerado com sucesso! Use `/perfil` novamente para ver as alterações.',
            flags: 64,
        });
        return;
    }

}

async function handleStringSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
    // Setup level selection is handled by persistent collectors
    if (interaction.customId === 'setup_gc_level' || interaction.customId === 'setup_faceit_level') {
        // This is handled in the setup command's persistent handler
        const setupCommand = interaction.client.commands?.get('setup');
        if (setupCommand && 'handleSelectMenu' in setupCommand) {
            try {
                await (setupCommand as any).handleSelectMenu(interaction);
            } catch (error) {
                console.error('[AUTO MIX] Erro no select menu do setup:', error);
            }
        }
        return;
    }

    // Role selection
    if (interaction.customId === 'setup_role_select') {
        const setupCommand = interaction.client.commands?.get('setup');
        if (setupCommand && 'handleSelectMenu' in setupCommand) {
            try {
                await (setupCommand as any).handleSelectMenu(interaction);
            } catch (error) {
                console.error('[AUTO MIX] Erro no select menu de role:', error);
            }
        }
        return;
    }
}

async function handleUserSelectMenu(interaction: UserSelectMenuInteraction): Promise<void> {
    // Captain selection is handled by collectors inside the mix command
}
