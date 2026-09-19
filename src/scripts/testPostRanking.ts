import { Client, GatewayIntentBits, AttachmentBuilder, type TextChannel } from 'discord.js';
import { getTopPlayers } from '../utils/database.js';
import { generateRankingCard, type RankingPlayer } from '../utils/canvasRanking.js';
import { createEmbed } from '../utils/embedBuilder.js';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once('ready', async () => {
    console.log('Bot logado como', client.user?.tag);
    try {
        const channelId = '1524528925664088187';
        const channel = await client.channels.fetch(channelId).catch(() => null);

        if (!channel || !channel.isTextBased()) {
            console.error('Canal não encontrado, o bot tem permissão para ver esse canal? ID:', channelId);
            process.exit(1);
        }

        // Pega a guild a partir do canal
        const guildId = (channel as any).guildId;
        let guild = null;
        if (guildId) {
            guild = await client.guilds.fetch(guildId).catch(() => null);
        }

        let topPlayers = guildId ? getTopPlayers(guildId, 10) : [];
        if (topPlayers.length === 0) {
            console.log('Nenhum jogador no banco para este servidor (ou falha na guild), usando mock data...');
            for (let i = 0; i < 10; i++) {
                topPlayers.push({
                    user_id: String(i + 1),
                    guild_id: guildId || '1',
                    role: i % 2 === 0 ? 'Duelista' : 'Suporte',
                    total_kills: 500 - (i * 20),
                    total_deaths: 300 + (i * 10),
                    matches_played: 25 - i,
                    wins: 20 - i,
                    losses: 5
                });
            }
        }

        const rankingPlayers: RankingPlayer[] = await Promise.all(topPlayers.map(async (p) => {
            let avatarBuffer: Buffer | null = null;
            let displayName = p.user_id.length > 5 ? `Player ${p.user_id.slice(-4)}` : `Player ${p.user_id}`;

            if (guild) {
                try {
                    const member = await guild.members.fetch(p.user_id);
                    displayName = member.displayName.split(' ')[0];
                    const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 128 });
                    const response = await fetch(avatarUrl);
                    if (response.ok) {
                        avatarBuffer = Buffer.from(await response.arrayBuffer());
                    }
                } catch {
                    // Ignora
                }
            }

            return { ...p, displayName, avatarBuffer };
        }));

        const buffer = await generateRankingCard(rankingPlayers);
        const attachment = new AttachmentBuilder(buffer, { name: 'ranking.png' });

        const embed = createEmbed()
            .setTitle('Confira o top:')
            .setImage('attachment://ranking.png');

        if (guild) {
            embed.setFooter({
                text: guild.name,
                iconURL: client.user?.displayAvatarURL() ?? undefined
            });
        }

        await (channel as TextChannel).send({
            embeds: [embed],
            files: [attachment]
        });

        console.log('Mensagem de teste de ranking postada com sucesso!');
        process.exit(0);
    } catch (e) {
        console.error('Erro:', e);
        process.exit(1);
    }
});

client.login(process.env.DISCORD_TOKEN);
