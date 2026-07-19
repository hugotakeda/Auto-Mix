import { Client, Collection, type ChatInputCommandInteraction } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export interface Command {
    data: any;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    handleSelectMenu?: (interaction: any) => Promise<void>;
}

// Extend Client type
declare module 'discord.js' {
    interface Client {
        commands?: Collection<string, Command>;
    }
}

export async function loadCommands(client: Client): Promise<void> {
    client.commands = new Collection<string, Command>();

    const commandsPath = path.join(__dirname, '..', 'commands');

    if (!fs.existsSync(commandsPath)) {
        console.warn('[AUTO MIX] Pasta de comandos nao encontrada.');
        return;
    }

    const categories = fs.readdirSync(commandsPath).filter(item => {
        return fs.statSync(path.join(commandsPath, item)).isDirectory();
    });

    for (const category of categories) {
        const categoryPath = path.join(commandsPath, category);
        const commandFiles = fs.readdirSync(categoryPath).filter(file =>
            file.endsWith('.ts') || file.endsWith('.js')
        );

        for (const file of commandFiles) {
            const filePath = path.join(categoryPath, file);
            try {
                const fileUrl = pathToFileURL(filePath).href;
                const commandModule = await import(fileUrl);

                if ('data' in commandModule && 'execute' in commandModule) {
                    client.commands.set(commandModule.data.name, commandModule);
                    console.log(`[AUTO MIX] Comando carregado: /${commandModule.data.name} (${category})`);
                } else {
                    console.warn(`[AUTO MIX] Comando ignorado (sem data/execute): ${file}`);
                }
            } catch (error) {
                console.error(`[AUTO MIX] Erro ao carregar comando ${file}:`, error);
            }
        }
    }

    console.log(`[AUTO MIX] Total de comandos: ${client.commands.size}`);
}

export async function loadEvents(client: Client): Promise<void> {
    const eventsPath = path.join(__dirname, '..', 'events');

    if (!fs.existsSync(eventsPath)) {
        console.warn('[AUTO MIX] Pasta de eventos nao encontrada.');
        return;
    }

    const eventFiles = fs.readdirSync(eventsPath).filter(file =>
        file.endsWith('.ts') || file.endsWith('.js')
    );

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        try {
            const fileUrl = pathToFileURL(filePath).href;
            const eventModule = await import(fileUrl);

            if (eventModule.once) {
                client.once(eventModule.name, (...args: any[]) => eventModule.execute(...args));
            } else {
                client.on(eventModule.name, (...args: any[]) => eventModule.execute(...args));
            }
            console.log(`[AUTO MIX] Evento carregado: ${eventModule.name}`);
        } catch (error) {
            console.error(`[AUTO MIX] Erro ao carregar evento ${file}:`, error);
        }
    }
}
