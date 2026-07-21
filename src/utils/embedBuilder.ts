import { EmbedBuilder, type CommandInteraction, type MessageComponentInteraction } from 'discord.js';

const EMBED_COLOR = 0x24242a;

export function createEmbed(interaction?: CommandInteraction | MessageComponentInteraction): EmbedBuilder {
    const embed = new EmbedBuilder().setColor(EMBED_COLOR);

    if (interaction && interaction.guild) {
        embed.setFooter({
            text: interaction.guild.name,
            iconURL: interaction.client.user?.displayAvatarURL() ?? undefined
        });
    }
    
    embed.setTimestamp();

    return embed;
}

export function createErrorEmbed(description: string, interaction?: CommandInteraction | MessageComponentInteraction): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription(description);
        
    if (interaction && interaction.guild) {
        embed.setFooter({
            text: interaction.guild.name,
            iconURL: interaction.client.user?.displayAvatarURL() ?? undefined
        });
    }
    
    embed.setTimestamp();
    
    return embed;
}
