/**
 * Fila de processamento de demos.
 *
 * Uma demo por vez, em processo separado. Medido numa demo de 197 MB da Xplay:
 * 3,8 s de parse e pico de 106 MB de RSS — cabe tranquilo nos 2 GB da Discloud,
 * mas o parse e 100% sincrono e travaria o bot se rodasse no mesmo processo.
 *
 * O .dem e apagado assim que o parse termina: guardar demos estouraria o
 * armazenamento da host em poucas partidas.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import type { ParsedDemo } from './parser.js';
import {
    createDemoJob,
    updateDemoJob,
    importDemoMatch,
    findDemoMatchByHash,
} from '../utils/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Em dev rodamos .ts via tsx; em producao, .js compilado. */
const IS_TS = __filename.endsWith('.ts');

const PARSE_TIMEOUT_MS = 5 * 60 * 1000;

export interface DemoJobInput {
    jobId: string;
    guildId: string;
    uploadedBy: string;
    fileName: string;
    filePath: string;
}

export interface DemoJobResult {
    jobId: string;
    guildId: string;
    uploadedBy: string;
    fileName: string;
    status: 'done' | 'failed';
    matchId?: number;
    applied?: number;
    unlinked?: string[];
    demo?: ParsedDemo;
    code?: string;
    message?: string;
}

type Listener = (result: DemoJobResult) => void;

const queue: DemoJobInput[] = [];
const listeners = new Set<Listener>();
let running = false;

export function onDemoProcessed(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

function emit(result: DemoJobResult): void {
    for (const fn of listeners) {
        try {
            fn(result);
        } catch (error) {
            console.error('[AUTO MIX] Erro em listener de demo:', error);
        }
    }
}

/** SHA-256 do arquivo, usado pra impedir a mesma demo de entrar duas vezes. */
export function hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);

        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

/** Roda o worker num processo separado e devolve o resultado do parse. */
function runWorker(filePath: string): Promise<ParsedDemo> {
    return new Promise((resolve, reject) => {
        const workerPath = path.join(__dirname, IS_TS ? 'worker.ts' : 'worker.js');

        const command = IS_TS ? 'npx' : process.execPath;
        const args = IS_TS
            ? ['tsx', workerPath, filePath]
            : ['--max-old-space-size=512', workerPath, filePath];

        const child = spawn(command, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: process.env,
        });

        let stdout = '';
        let stderr = '';

        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            reject(Object.assign(new Error('O parse da demo passou de 5 minutos e foi cancelado.'), { code: 'TIMEOUT' }));
        }, PARSE_TIMEOUT_MS);

        child.stdout.on('data', d => { stdout += d.toString(); });
        child.stderr.on('data', d => { stderr += d.toString(); });

        child.on('error', err => {
            clearTimeout(timer);
            reject(Object.assign(err, { code: 'SPAWN_FAILED' }));
        });

        child.on('close', () => {
            clearTimeout(timer);

            let payload: any;
            try {
                payload = JSON.parse(stdout.trim());
            } catch {
                reject(Object.assign(
                    new Error(`O processador da demo falhou sem resposta valida. ${stderr.slice(0, 300)}`),
                    { code: 'BAD_OUTPUT' }
                ));
                return;
            }

            if (payload.ok) resolve(payload.data as ParsedDemo);
            else reject(Object.assign(new Error(payload.message), { code: payload.code }));
        });
    });
}

/** Coloca a demo na fila. Retorna assim que enfileira — o parse e assincrono. */
export function enqueueDemo(input: DemoJobInput): void {
    createDemoJob(input.jobId, input.guildId, input.uploadedBy, input.fileName, input.filePath);
    queue.push(input);
    void drain();
}

async function drain(): Promise<void> {
    if (running) return;
    running = true;

    while (queue.length > 0) {
        const job = queue.shift()!;
        await processOne(job);
    }

    running = false;
}

async function processOne(job: DemoJobInput): Promise<void> {
    const base = {
        jobId: job.jobId,
        guildId: job.guildId,
        uploadedBy: job.uploadedBy,
        fileName: job.fileName,
    };

    const fail = (code: string, message: string) => {
        updateDemoJob(job.jobId, 'failed', message, null);
        emit({ ...base, status: 'failed', code, message });
    };

    try {
        updateDemoJob(job.jobId, 'processing', null, null);

        // Mesma demo ja importada? Corta antes de gastar 4 s de CPU.
        const hash = await hashFile(job.filePath);
        const duplicate = findDemoMatchByHash(job.guildId, hash);
        if (duplicate !== null) {
            fail('DUPLICATE', 'Essa demo ja foi enviada antes — as estatisticas dela ja estao no ranking.');
            return;
        }

        const demo = await runWorker(job.filePath);

        const { matchId, applied, unlinked } = importDemoMatch({
            guildId: job.guildId,
            demoHash: hash,
            fileName: job.fileName,
            mapName: demo.mapName,
            serverName: demo.serverName,
            matchLabel: demo.matchLabel,
            scoreCt: demo.scoreCt,
            scoreT: demo.scoreT,
            rounds: demo.rounds,
            winner: demo.winner,
            uploadedBy: job.uploadedBy,
            players: demo.players,
        });

        updateDemoJob(job.jobId, 'done', null, matchId);
        emit({ ...base, status: 'done', matchId, applied, unlinked, demo });
    } catch (error: any) {
        const code = error?.code ?? 'UNKNOWN';

        if (code === 'DEMO_ALREADY_IMPORTED') {
            fail('DUPLICATE', 'Essa demo ja foi importada.');
        } else {
            console.error(`[AUTO MIX] Falha ao processar demo ${job.fileName}:`, error);
            fail(code, error?.message ?? 'Erro desconhecido ao processar a demo.');
        }
    } finally {
        // O arquivo some sempre — sucesso ou erro.
        fs.promises.unlink(job.filePath).catch(() => {});
    }
}

export function queueLength(): number {
    return queue.length + (running ? 1 : 0);
}
