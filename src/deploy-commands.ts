import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config();

const token = process.env.DISCORD_TOKEN!;
const clientId = process.env.CLIENT_ID!;
const guildId = process.env.GUILD_ID!;

if (!token || !clientId) {
    console.error('[AUTO MIX] DISCORD_TOKEN e CLIENT_ID sao obrigatorios no .env');
    process.exit(1);
}

async function deployCommands(): Promise<void> {
    const commands: any[] = [];

    const commandsPath = path.join(__dirname, 'commands');
    const categories = fs.readdirSync(commandsPath).filter(item =>
        fs.statSync(path.join(commandsPath, item)).isDirectory()
    );

    for (const category of categories) {
        const categoryPath = path.join(commandsPath, category);
        const commandFiles = fs.readdirSync(categoryPath).filter(file =>
            (file.endsWith('.ts') || file.endsWith('.js')) && !file.endsWith('.d.ts')
        );

        for (const file of commandFiles) {
            const filePath = path.join(categoryPath, file);
            const fileUrl = pathToFileURL(filePath).href;
            
            try {
                const commandModule = await import(fileUrl);

                if ('data' in commandModule) {
                    commands.push(commandModule.data.toJSON());
                    console.log(`[AUTO MIX] Comando encontrado: /${commandModule.data.name}`);
                }
            } catch (error) {
                console.warn(`[AUTO MIX] Aviso: Falha ao carregar o comando ${file}. Arquivo ignorado.`);
            }
        }
    }

    const rest = new REST({ version: '10' }).setToken(token);

    try {
        console.log(`[AUTO MIX] Registrando ${commands.length} comando(s)...`);

        if (guildId) {
            // Guild-specific (dev mode — instant)
            await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands },
            );
            console.log(`[AUTO MIX] Comandos registrados no servidor ${guildId}.`);
        } else {
            // Global (takes ~1 hour to propagate)
            await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands },
            );
            console.log('[AUTO MIX] Comandos registrados globalmente.');
        }
    } catch (error) {
        console.error('[AUTO MIX] Erro ao registrar comandos:', error);
    }
}

deployCommands();
