import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config } from 'dotenv';
import { loadCommands, loadEvents } from './handlers/commandHandler.js';
import { getDatabase } from './utils/database.js';
import { startWebServer } from './web/server.js';
import { onDemoProcessed } from './demo/runner.js';
import { setStaffHooks } from './web/staff.js';
import { createEmbed } from './utils/embedBuilder.js';

config();

const token = process.env.DISCORD_TOKEN;

if (!token) {
    console.error('[AUTO MIX] DISCORD_TOKEN nao encontrado no .env');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
    ],
    partials: [
        Partials.GuildMember,
        Partials.Channel,
    ],
});

/**
 * Avisa no privado quem mandou a demo assim que o parse termina.
 * O upload acontece no site, entao sem isso a pessoa ficaria sem retorno.
 */
function wireDemoNotifications(): void {
    onDemoProcessed(async (result) => {
        try {
            const user = await client.users.fetch(result.uploadedBy).catch(() => null);

            if (result.status === 'failed') {
                console.warn(`[AUTO MIX] Demo ${result.fileName} falhou: ${result.message}`);

                await user?.send({
                    embeds: [
                        createEmbed()
                            .setTitle('Nao consegui processar a demo')
                            .setDescription(`\`${result.fileName}\`\n\n${result.message}`),
                    ],
                }).catch(() => {});
                return;
            }

            const demo = result.demo!;

            console.log(
                `[AUTO MIX] Demo importada: ${demo.mapName} ${demo.scoreCt}-${demo.scoreT} ` +
                `(${result.applied}/${demo.players.length} jogadores vinculados)`
            );
            for (const warning of demo.warnings) {
                console.warn(`[AUTO MIX]   aviso: ${warning}`);
            }

            const top = demo.players
                .slice(0, 5)
                .map((p, i) => {
                    const adr = p.rounds > 0 ? (p.damage / p.rounds).toFixed(0) : '0';
                    return `\`${i + 1}.\` **${p.name}** — ${p.kills}/${p.deaths}/${p.assists} · ${adr} ADR`;
                })
                .join('\n');

            const embed = createEmbed()
                .setTitle('Demo processada')
                .setDescription(
                    `**${demo.mapName}** — \`${demo.scoreCt} : ${demo.scoreT}\` (${demo.rounds} rounds)` +
                    `${demo.matchLabel ? `\n${demo.matchLabel}` : ''}\n\n${top}`
                )
                .addFields({
                    name: 'Estatisticas aplicadas',
                    value:
                        `${result.applied} de ${demo.players.length} jogadores tinham a Steam vinculada.` +
                        (result.unlinked?.length
                            ? `\n\nSem vinculo: ${result.unlinked.map(n => `\`${n}\``).join(', ')}` +
                              '\nEsses jogadores podem rodar `/steam vincular` — as stats desta partida entram automaticamente depois.'
                            : ''),
                });

            await user?.send({ embeds: [embed] }).catch(() => {});
        } catch (error) {
            console.error('[AUTO MIX] Erro ao notificar resultado da demo:', error);
        }
    });
}

/**
 * Liga o site ao Discord para as duas coisas que so o bot sabe fazer:
 * dizer quem tem o cargo de staff, e banir alguem do servidor.
 */
function wireStaffHooks(): void {
    const guildId = process.env.GUILD_ID;
    const staffRoleId = process.env.STAFF_ROLE_ID;

    if (!guildId || !staffRoleId) {
        console.warn(
            '[AUTO MIX] GUILD_ID ou STAFF_ROLE_ID ausentes no .env — a area de staff do site fica desligada.'
        );
        return;
    }

    const guild = () => client.guilds.cache.get(guildId) ?? null;

    setStaffHooks({
        isStaff(userId) {
            // Le do cache: com a intent GuildMembers o discord.js mantem os
            // cargos atualizados por evento, entao perder o cargo tira o
            // acesso na hora, sem esperar a sessao expirar.
            const member = guild()?.members.cache.get(userId);
            return member?.roles.cache.has(staffRoleId) ?? false;
        },

        async banFromDiscord(userId, reason) {
            const g = guild();
            if (!g) {
                return { ok: false, message: 'O bot nao esta no servidor configurado em GUILD_ID.' };
            }

            try {
                await g.members.ban(userId, { reason: reason.slice(0, 500) });
                return { ok: true, message: 'Banido do Discord.' };
            } catch (error: any) {
                const code = error?.code;

                if (code === 50013) {
                    return {
                        ok: false,
                        message: 'Marcado no site, mas o Discord recusou o ban: o bot precisa da permissao Banir Membros, e o cargo dele tem que estar ACIMA do cargo do jogador.',
                    };
                }
                if (code === 10013) {
                    return { ok: false, message: 'Marcado no site, mas esse usuario do Discord nao existe mais.' };
                }

                console.error('[AUTO MIX] Falha ao banir no Discord:', error);
                return { ok: false, message: `Marcado no site, mas o ban no Discord falhou: ${error?.message ?? 'erro desconhecido'}` };
            }
        },

        async unbanFromDiscord(userId) {
            const g = guild();
            if (!g) return { ok: false, message: 'O bot nao esta no servidor configurado.' };

            try {
                await g.bans.remove(userId, 'Auto Mix — marcacao removida no site');
                return { ok: true, message: 'Desbanido do Discord.' };
            } catch (error: any) {
                // Ja nao estava banido: nao e erro que precise assustar a staff.
                if (error?.code === 10026) {
                    return { ok: true, message: 'Esse usuario ja nao estava banido no Discord.' };
                }
                return { ok: false, message: `Marcacao atualizada, mas o desbanimento falhou: ${error?.message ?? 'erro'}` };
            }
        },
    });

    console.log('[AUTO MIX] Area de staff ligada ao cargo ' + staffRoleId);
}

async function start(): Promise<void> {
    console.log('[AUTO MIX] Preparando banco de dados...');
    await getDatabase();

    console.log('[AUTO MIX] Carregando comandos e eventos...');
    await loadCommands(client);
    await loadEvents(client);

    wireDemoNotifications();
    wireStaffHooks();

    // O site sobe antes do login: na Discloud o health check do proxy bate na
    // porta 8080 e nao pode esperar o handshake do Discord.
    if (process.env.WEB_ENABLED !== 'false') {
        try {
            startWebServer();
        } catch (error) {
            console.error('[AUTO MIX] Nao consegui subir o site:', error);
        }
    }

    console.log('[AUTO MIX] Conectando ao Discord...');
    await client.login(token);

    // O isStaff le do cache de membros. Sem este fetch inicial o cache so
    // teria quem interagiu com o bot, e a staff nao seria reconhecida ate
    // a pessoa falar algo no servidor.
    const guildId = process.env.GUILD_ID;
    if (guildId) {
        try {
            const guild = await client.guilds.fetch(guildId);
            const members = await guild.members.fetch();
            console.log(`[AUTO MIX] Cache de membros carregado: ${members.size}`);
        } catch (error) {
            console.warn('[AUTO MIX] Nao consegui carregar os membros do servidor:', error);
        }
    }
}

start().catch((error) => {
    console.error('[AUTO MIX] Erro fatal ao iniciar:', error);
    process.exit(1);
});
