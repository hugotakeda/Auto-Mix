import {
    Events,
    type Interaction,
    type ChatInputCommandInteraction,
    type StringSelectMenuInteraction,
    type ButtonInteraction,
    type UserSelectMenuInteraction,
} from 'discord.js';
import { createErrorEmbed } from '../utils/embedBuilder.js';

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
    // Buttons are handled by collectors inside command files
    // This is a fallback for expired collectors
    if (interaction.customId.startsWith('pickban_') || interaction.customId.startsWith('captain_')) {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                embeds: [createErrorEmbed('Esta interacao expirou. Inicie um novo mix.', interaction)],
                flags: 64,
            }).catch(() => {});
        }
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
    // This is a fallback
    if (!interaction.replied && !interaction.deferred) {
        await interaction.deferUpdate().catch(() => {});
    }
}
