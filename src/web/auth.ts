/**
 * Login com Discord OAuth2.
 *
 * A sessao vive num cookie assinado com HMAC em vez de ficar na memoria:
 * com AUTORESTART ligado a Discloud reinicia o app sozinho, e uma sessao em
 * memoria derrubaria todo mundo a cada restart.
 */

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const COOKIE_NAME = 'automix_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

export interface SessionUser {
    id: string;
    username: string;
    avatar: string | null;
    /** Esta no servidor configurado em GUILD_ID? */
    inGuild: boolean;
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            user?: SessionUser;
        }
    }
}

function secret(): string {
    const value = process.env.SESSION_SECRET;
    if (!value || value.length < 16) {
        throw new Error(
            'SESSION_SECRET ausente ou curto demais no .env. Gere um com: openssl rand -hex 32'
        );
    }
    return value;
}

function sign(payload: string): string {
    return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createSessionCookie(user: SessionUser): string {
    const body = JSON.stringify({ ...user, exp: Date.now() + SESSION_TTL_MS });
    const encoded = Buffer.from(body).toString('base64url');
    return `${encoded}.${sign(encoded)}`;
}

export function readSessionCookie(raw: string | undefined): SessionUser | null {
    if (!raw) return null;

    const [encoded, signature] = raw.split('.');
    if (!encoded || !signature) return null;

    // Comparacao em tempo constante evita vazar o segredo por timing.
    const expected = sign(encoded);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    try {
        const data = JSON.parse(Buffer.from(encoded, 'base64url').toString());
        if (!data.exp || data.exp < Date.now()) return null;

        return { id: data.id, username: data.username, avatar: data.avatar, inGuild: data.inGuild };
    } catch {
        return null;
    }
}

/** Le o cookie de sessao a partir do header, sem depender de cookie-parser. */
function cookieFromHeader(req: Request, name: string): string | undefined {
    const header = req.headers.cookie;
    if (!header) return undefined;

    for (const part of header.split(';')) {
        const [k, ...rest] = part.trim().split('=');
        if (k === name) return decodeURIComponent(rest.join('='));
    }
    return undefined;
}

export function attachUser(req: Request, _res: Response, next: NextFunction): void {
    req.user = readSessionCookie(cookieFromHeader(req, COOKIE_NAME)) ?? undefined;
    next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
        res.status(401).json({ error: 'Faca login com o Discord para continuar.' });
        return;
    }
    if (!req.user.inGuild) {
        res.status(403).json({ error: 'Voce precisa ser membro do servidor para acessar o site.' });
        return;
    }
    next();
}

export function setSession(res: Response, user: SessionUser): void {
    const isProd = process.env.NODE_ENV === 'production';
    res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=${encodeURIComponent(createSessionCookie(user))}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; SameSite=Lax${isProd ? '; Secure' : ''}`
    );
}

export function clearSession(res: Response): void {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

// --- OAuth2 ---

export function oauthUrl(redirectUri: string, state: string): string {
    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id', process.env.CLIENT_ID!);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'identify guilds');
    url.searchParams.set('state', state);
    return url.toString();
}

export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
    const res = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.CLIENT_ID!,
            client_secret: process.env.CLIENT_SECRET!,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
        }),
        signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
        throw new Error(`Discord recusou a troca do code (${res.status}).`);
    }

    const data = (await res.json()) as { access_token: string };
    return data.access_token;
}

export async function fetchDiscordUser(accessToken: string): Promise<SessionUser> {
    const headers = { Authorization: `Bearer ${accessToken}` };

    const meRes = await fetch('https://discord.com/api/users/@me', {
        headers,
        signal: AbortSignal.timeout(10_000),
    });
    if (!meRes.ok) throw new Error('Nao consegui ler seu perfil do Discord.');
    const me = (await meRes.json()) as any;

    // Confere se a pessoa esta no servidor configurado
    let inGuild = false;
    const guildId = process.env.GUILD_ID;

    if (guildId) {
        const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
            headers,
            signal: AbortSignal.timeout(10_000),
        });
        if (guildsRes.ok) {
            const guilds = (await guildsRes.json()) as any[];
            inGuild = guilds.some(g => g.id === guildId);
        }
    } else {
        inGuild = true; // sem GUILD_ID configurado, nao da pra checar
    }

    return {
        id: me.id,
        username: me.global_name || me.username,
        avatar: me.avatar
            ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128`
            : null,
        inGuild,
    };
}
