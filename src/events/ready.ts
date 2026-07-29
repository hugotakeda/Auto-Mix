import { Client, Events, ActivityType } from 'discord.js';
import { getDatabase, getTotalMatchesCount } from '../utils/database.js';
import { initScheduler } from '../utils/scheduler.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client: Client<true>): Promise<void> {
    // Initialize database on startup
    await getDatabase();

    const updateStatus = () => {
        try {
            // Soma 18 partidas que ocorreram antes de implementarmos o status/rastreio
            const count = getTotalMatchesCount() + 18;
            client.user.setPresence({
                activities: [{
                    name: 'custom',
                    state: `Criamos ${count} partidas de mix`,
                    type: ActivityType.Custom,
                }],
                status: 'online',
            });
        } catch (error) {
            console.error('[AUTO MIX] Erro ao atualizar status:', error);
        }
    };

    updateStatus();
    // Atualiza o status a cada 5 minutos
    setInterval(updateStatus, 5 * 60 * 1000);

    console.log(`[AUTO MIX] Bot online como ${client.user.tag}`);
    console.log(`[AUTO MIX] Servidores: ${client.guilds.cache.size}`);

    // Inicia o scheduler do ranking
    initScheduler(client);
}
