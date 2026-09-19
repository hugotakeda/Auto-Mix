/**
 * Servidor web do Auto Mix.
 *
 * Roda no mesmo processo do bot: compartilha o sql.js sem sincronizacao
 * nenhuma. Na Discloud isso exige TYPE=site no discloud.config e escutar em
 * 0.0.0.0:8080 — um app TYPE=bot nao recebe URL publica.
 */

import express, { type Request, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import {
    attachUser,
    requireAuth,
    setSession,
    clearSession,
    oauthUrl,
    exchangeCode,
    fetchDiscordUser,
} from './auth.js';
import { enqueueDemo, queueLength } from '../demo/runner.js';
import { requireStaff, isStaffUser, staffHooks } from './staff.js';
import {
    getRankingByPeriod,
    getRecentDemoMatches,
    getDemoMatchPlayers,
    getPlayerDemoHistory,
    getRecentDemoJobs,
    getDemoJob,
    getSteamId,
    countMatchesInPeriod,
    countRoundsInPeriod,
    getAllPlayers,
    getPlayerSummary,
    getPlayerRank,
    getPlayerFlag,
    getFlagsFor,
    getFlaggedPlayers,
    getFlagHistory,
    setPlayerFlag,
    isFlagLevel,
    getUserBySteamId,
    type RankingPeriod,
} from '../utils/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';

/** Demos ficam num diretorio temporario e sao apagadas apos o parse. */
const UPLOAD_DIR = path.join(process.cwd(), 'tmp-demos');

/** 600 MB cobre demos longas de MR12 com folga. */
const MAX_DEMO_BYTES = 600 * 1024 * 1024;

function siteGuildId(): string {
    const id = process.env.GUILD_ID;
    if (!id) throw new Error('GUILD_ID precisa estar no .env para o site funcionar.');
    return id;
}

function baseUrl(req: Request): string {
    // Atras do proxy da Discloud o protocolo real vem no header.
    const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0] ?? req.protocol;
    return process.env.PUBLIC_URL?.replace(/\/$/, '') ?? `${proto}://${req.get('host')}`;
}

// --- Protecao de CSRF no fluxo OAuth ---

function makeState(): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    const sig = crypto
        .createHmac('sha256', process.env.SESSION_SECRET ?? 'dev')
        .update(nonce)
        .digest('base64url');
    return `${nonce}.${sig}`;
}

function checkState(state: string | undefined): boolean {
    if (!state) return false;

    const [nonce, sig] = state.split('.');
    if (!nonce || !sig) return false;

    const expected = crypto
        .createHmac('sha256', process.env.SESSION_SECRET ?? 'dev')
        .update(nonce)
        .digest('base64url');

    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
            fs.mkdirSync(UPLOAD_DIR, { recursive: true });
            cb(null, UPLOAD_DIR);
        },
        filename: (_req, file, cb) => {
            cb(null, `${crypto.randomUUID()}${path.extname(file.originalname) || '.dem'}`);
        },
    }),
    limits: { fileSize: MAX_DEMO_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
        if (!file.originalname.toLowerCase().endsWith('.dem')) {
            cb(new Error('Só arquivos .dem são aceitos.'));
            return;
        }
        cb(null, true);
    },
});

/**
 * Anexa a marcacao de suspeita a uma lista de jogadores — so quando quem
 * pediu e staff. Para membro comum a propriedade nem existe na resposta,
 * entao nao ha o que inspecionar no DevTools.
 */
function withFlags<T extends { steam_id64: string }>(
    req: Request,
    guildId: string,
    players: T[]
): T[] {
    if (!isStaffUser(req.user?.id)) return players;

    const flags = getFlagsFor(guildId, players.map(p => p.steam_id64));
    if (flags.size === 0) return players;

    return players.map(p => {
        const flag = flags.get(p.steam_id64);
        return flag ? { ...p, flag: { level: flag.level, reason: flag.reason } } : p;
    });
}

export function startWebServer(): void {
    const app = express();

    app.disable('x-powered-by');
    app.set('trust proxy', true);
    app.use(express.json());
    app.use(attachUser);

    // ============================================================
    // AUTENTICACAO
    // ============================================================

    app.get('/auth/login', (req, res) => {
        const state = makeState();
        res.redirect(oauthUrl(`${baseUrl(req)}/auth/callback`, state));
    });

    app.get('/auth/callback', async (req, res) => {
        const { code, state } = req.query as { code?: string; state?: string };

        if (!checkState(state)) {
            res.status(400).send('Requisicao de login invalida. Tente de novo.');
            return;
        }
        if (!code) {
            res.redirect('/');
            return;
        }

        try {
            const token = await exchangeCode(code, `${baseUrl(req)}/auth/callback`);
            const user = await fetchDiscordUser(token);
            setSession(res, user);
            res.redirect('/');
        } catch (error) {
            console.error('[AUTO MIX] Falha no OAuth:', error);
            res.status(500).send('Nao consegui completar o login com o Discord.');
        }
    });

    app.post('/auth/logout', (_req, res) => {
        clearSession(res);
        res.json({ ok: true });
    });

    app.get('/api/session', (req, res) => {
        if (!req.user) {
            res.json({ authenticated: false });
            return;
        }

        let steamId: string | null = null;
        try {
            steamId = getSteamId(req.user.id, siteGuildId());
        } catch {
            steamId = null;
        }

        res.json({
            authenticated: true,
            user: req.user,
            steamId,
            isStaff: isStaffUser(req.user.id),
        });
    });

    // ============================================================
    // TUDO ABAIXO EXIGE LOGIN
    //
    // O site inteiro e fechado: so membros do servidor veem ranking,
    // perfis e partidas. /api/session fica de fora porque e justamente
    // quem responde se a pessoa esta logada ou nao.
    // ============================================================

    app.use('/api', (req, res, next) => {
        if (req.path === '/session') {
            next();
            return;
        }
        requireAuth(req, res, next);
    });

    // ============================================================
    // RANKING E PARTIDAS
    // ============================================================

    app.get('/api/ranking', (req, res) => {
        const period = (req.query.period as RankingPeriod) ?? 'biweek';
        const valid: RankingPeriod[] = ['week', 'biweek', 'month', 'all'];

        if (!valid.includes(period)) {
            res.status(400).json({ error: 'Periodo invalido.' });
            return;
        }

        try {
            const guildId = siteGuildId();
            const players = getRankingByPeriod(guildId, period, 100);

            res.json({
                period,
                players: withFlags(req, guildId, players),
                matches: countMatchesInPeriod(guildId, period),
                rounds: countRoundsInPeriod(guildId, period),
            });
        } catch (error) {
            console.error('[AUTO MIX] Erro no ranking:', error);
            res.status(500).json({ error: 'Erro ao montar o ranking.' });
        }
    });

    app.get('/api/matches', (_req, res) => {
        try {
            res.json({ matches: getRecentDemoMatches(siteGuildId(), 30) });
        } catch (error) {
            console.error('[AUTO MIX] Erro ao listar partidas:', error);
            res.status(500).json({ error: 'Erro ao listar partidas.' });
        }
    });

    app.get('/api/matches/:id', (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            res.status(400).json({ error: 'ID invalido.' });
            return;
        }

        const players = getDemoMatchPlayers(id);
        if (players.length === 0) {
            res.status(404).json({ error: 'Partida nao encontrada.' });
            return;
        }

        const match = getRecentDemoMatches(siteGuildId(), 200).find(m => m.id === id) ?? null;
        res.json({ match, players });
    });

    /** Todos os jogadores que ja apareceram numa demo — alimenta a aba Jogadores. */
    app.get('/api/players', (req, res) => {
        try {
            const guildId = siteGuildId();
            res.json({ players: withFlags(req, guildId, getAllPlayers(guildId, 500)) });
        } catch (error) {
            console.error('[AUTO MIX] Erro ao listar jogadores:', error);
            res.status(500).json({ error: 'Erro ao listar jogadores.' });
        }
    });

    app.get('/api/player/:steamId', (req, res) => {
        const steamId = String(req.params.steamId);
        if (!/^\d{17}$/.test(steamId)) {
            res.status(400).json({ error: 'SteamID64 invalido.' });
            return;
        }

        const guildId = siteGuildId();
        const summary = getPlayerSummary(guildId, steamId);

        if (!summary) {
            res.status(404).json({ error: 'Esse jogador ainda nao aparece em nenhuma demo.' });
            return;
        }

        const staff = isStaffUser(req.user?.id);

        res.json({
            steamId,
            summary,
            rank: getPlayerRank(guildId, steamId),
            history: getPlayerDemoHistory(guildId, steamId, 50),
            // Marcacao e historico so existem para quem e staff.
            flag: staff ? getPlayerFlag(guildId, steamId) : undefined,
            flagHistory: staff ? getFlagHistory(guildId, steamId, 30) : undefined,
        });
    });

    // ============================================================
    // STAFF
    //
    // requireStaff responde 404 para quem nao e staff — estas rotas
    // simplesmente nao existem do lado de fora.
    // ============================================================

    app.get('/api/staff/flags', requireStaff, (_req, res) => {
        try {
            res.json({ players: getFlaggedPlayers(siteGuildId()) });
        } catch (error) {
            console.error('[AUTO MIX] Erro ao listar marcados:', error);
            res.status(500).json({ error: 'Erro ao listar jogadores marcados.' });
        }
    });

    app.post('/api/staff/player/:steamId/flag', requireStaff, async (req, res) => {
        const steamId = String(req.params.steamId);
        const { level, reason } = (req.body ?? {}) as { level?: string; reason?: string };

        if (!/^\d{17}$/.test(steamId)) {
            res.status(400).json({ error: 'SteamID64 invalido.' });
            return;
        }
        if (!level || !isFlagLevel(level)) {
            res.status(400).json({ error: 'Nivel invalido.' });
            return;
        }

        const trimmed = (reason ?? '').trim();
        if (level !== 'clean' && trimmed.length < 3) {
            res.status(400).json({ error: 'Escreva um motivo (minimo 3 caracteres).' });
            return;
        }
        if (trimmed.length > 500) {
            res.status(400).json({ error: 'Motivo muito longo (maximo 500 caracteres).' });
            return;
        }

        const guildId = siteGuildId();
        const actor = req.user!;
        const hooks = staffHooks();

        let discordBan: string | null = null;
        let warning: string | null = null;

        // Banir no site bane no Discord. Se o jogador nunca vinculou a Steam,
        // nao ha Discord ID para banir — a marcacao vale, o ban nao acontece.
        if (level === 'banned') {
            const discordId = getUserBySteamId(guildId, steamId);

            if (!discordId) {
                discordBan = 'skipped';
                warning = 'Marcado como banido no site, mas esse jogador nao tem Steam vinculada a nenhum Discord — nao deu para banir no servidor.';
            } else if (!hooks) {
                discordBan = 'unavailable';
                warning = 'Marcado no site. O bot nao esta conectado ao Discord agora, entao o banimento no servidor nao foi feito.';
            } else {
                const outcome = await hooks.banFromDiscord(
                    discordId,
                    `Auto Mix — banido por ${actor.username}: ${trimmed}`
                );
                discordBan = outcome.ok ? 'ok' : 'failed';
                if (!outcome.ok) warning = outcome.message;
            }
        }

        // Tirar o ban no site tira o ban no Discord tambem.
        const previous = getPlayerFlag(guildId, steamId);
        if (previous?.level === 'banned' && level !== 'banned') {
            const discordId = getUserBySteamId(guildId, steamId);
            if (discordId && hooks) {
                const outcome = await hooks.unbanFromDiscord(discordId);
                discordBan = outcome.ok ? 'unbanned' : 'unban_failed';
                if (!outcome.ok) warning = outcome.message;
            }
        }

        try {
            const flag = setPlayerFlag(
                guildId, steamId, level, trimmed,
                actor.id, actor.username, discordBan
            );

            res.json({
                flag,
                history: getFlagHistory(guildId, steamId, 30),
                warning,
            });
        } catch (error) {
            console.error('[AUTO MIX] Erro ao marcar jogador:', error);
            res.status(500).json({ error: 'Erro ao salvar a marcacao.' });
        }
    });

    // ============================================================
    // ENVIO DE DEMO
    // ============================================================

    app.post('/api/demos', requireAuth, (req: Request, res: Response) => {
        upload.single('demo')(req, res, err => {
            if (err) {
                const tooBig = (err as any).code === 'LIMIT_FILE_SIZE';
                res.status(400).json({
                    error: tooBig
                        ? `A demo passou do limite de ${Math.round(MAX_DEMO_BYTES / 1024 / 1024)} MB.`
                        : err.message,
                });
                return;
            }

            const file = (req as any).file as Express.Multer.File | undefined;
            if (!file) {
                res.status(400).json({ error: 'Nenhum arquivo enviado.' });
                return;
            }

            const jobId = crypto.randomUUID();

            try {
                enqueueDemo({
                    jobId,
                    guildId: siteGuildId(),
                    uploadedBy: req.user!.id,
                    fileName: file.originalname,
                    filePath: file.path,
                });
            } catch (error) {
                fs.promises.unlink(file.path).catch(() => {});
                console.error('[AUTO MIX] Erro ao enfileirar demo:', error);
                res.status(500).json({ error: 'Nao consegui colocar a demo na fila.' });
                return;
            }

            res.status(202).json({ jobId, position: queueLength() });
        });
    });

    app.get('/api/demos/jobs', requireAuth, (_req, res) => {
        res.json({ jobs: getRecentDemoJobs(siteGuildId(), 20), queue: queueLength() });
    });

    app.get('/api/demos/jobs/:id', requireAuth, (req, res) => {
        const job = getDemoJob(String(req.params.id));
        if (!job) {
            res.status(404).json({ error: 'Envio nao encontrado.' });
            return;
        }
        res.json({ job });
    });

    // ============================================================
    // ESTATICOS
    // ============================================================

    const publicDir = path.join(__dirname, 'public');
    app.use(express.static(publicDir, { maxAge: '1h' }));

    // Catch-all como middleware: no Express 5 o path-to-regexp v8 rejeita
    // app.get('*', ...), que era o jeito antigo de fazer isso.
    app.use((req, res) => {
        if (req.path.startsWith('/api/')) {
            res.status(404).json({ error: 'Rota nao encontrada.' });
            return;
        }
        res.sendFile(path.join(publicDir, 'index.html'));
    });

    app.listen(PORT, HOST, () => {
        console.log(`[AUTO MIX] Site no ar em http://${HOST}:${PORT}`);
    });
}
