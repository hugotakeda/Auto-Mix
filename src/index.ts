import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config } from 'dotenv';
import { loadCommands, loadEvents } from './handlers/commandHandler.js';

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

async function start(): Promise<void> {
    console.log('[AUTO MIX] Carregando comandos e eventos...');
    await loadCommands(client);
    await loadEvents(client);

    console.log('[AUTO MIX] Conectando ao Discord...');
    await client.login(token);
}

start().catch((error) => {
    console.error('[AUTO MIX] Erro fatal ao iniciar:', error);
    process.exit(1);
});
