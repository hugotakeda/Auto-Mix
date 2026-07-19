import { Client, Events, ActivityType } from 'discord.js';
import { getDatabase } from '../utils/database.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client: Client<true>): Promise<void> {
    // Initialize database on startup
    await getDatabase();

    client.user.setPresence({
        activities: [{
            name: 'MIX 5x5 — CS2',
            type: ActivityType.Competing,
        }],
        status: 'online',
    });

    console.log(`[AUTO MIX] Bot online como ${client.user.tag}`);
    console.log(`[AUTO MIX] Servidores: ${client.guilds.cache.size}`);
}
