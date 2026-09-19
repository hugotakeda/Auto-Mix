/**
 * Resolucao de perfis Steam para SteamID64.
 *
 * Aceita praticamente qualquer coisa que o jogador copie e cole:
 *   - https://steamcommunity.com/profiles/76561198293926551
 *   - https://steamcommunity.com/id/algumnick
 *   - steamcommunity.com/id/algumnick/
 *   - 76561198293926551
 *   - STEAM_1:1:166830411
 *   - [U:1:333660823]
 *
 * Vanity URLs (/id/nick) precisam de uma consulta a Steam. Usamos a Web API
 * quando STEAM_API_KEY existe; senao caimos no endpoint publico ?xml=1, que
 * nao exige chave nenhuma.
 */

/** Base do namespace de contas individuais da Steam. */
const STEAM64_BASE = 76561197960265728n;

export interface SteamProfile {
    steamId64: string;
    /** Como o ID foi obtido — util para mensagens de erro mais claras. */
    source: 'direct' | 'profiles-url' | 'vanity-api' | 'vanity-xml' | 'steam2' | 'steam3';
    /** Nome do perfil, quando a resolucao passou pela Steam. */
    personaName?: string;
    avatarUrl?: string;
}

export class SteamResolveError extends Error {
    constructor(public code: 'INVALID_INPUT' | 'VANITY_NOT_FOUND' | 'NETWORK', message: string) {
        super(message);
        this.name = 'SteamResolveError';
    }
}

/** Um SteamID64 de conta individual valida. */
export function isValidSteamId64(value: string): boolean {
    if (!/^\d{17}$/.test(value)) return false;

    try {
        const n = BigInt(value);
        // Faixa de contas individuais. O teto evita IDs de grupo/lobby.
        return n >= STEAM64_BASE && n < STEAM64_BASE + 10_000_000_000n;
    } catch {
        return false;
    }
}

function accountIdToSteam64(accountId: bigint): string {
    return (STEAM64_BASE + accountId).toString();
}

/** STEAM_X:Y:Z -> SteamID64 */
function fromSteam2(input: string): string | null {
    const m = input.trim().match(/^STEAM_[0-5]:([01]):(\d+)$/i);
    if (!m) return null;

    const y = BigInt(m[1]);
    const z = BigInt(m[2]);
    return accountIdToSteam64(z * 2n + y);
}

/** [U:1:accountid] -> SteamID64 */
function fromSteam3(input: string): string | null {
    const m = input.trim().match(/^\[?U:1:(\d+)\]?$/i);
    if (!m) return null;

    return accountIdToSteam64(BigInt(m[1]));
}

/**
 * Extrai o trecho relevante de uma URL da Steam.
 * Retorna { kind: 'id64' | 'vanity', value } ou null se nao for URL de perfil.
 */
function parseSteamUrl(input: string): { kind: 'id64' | 'vanity'; value: string } | null {
    const cleaned = input.trim().replace(/^<|>$/g, '');

    // Aceita com ou sem protocolo
    const withProtocol = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;

    let url: URL;
    try {
        url = new URL(withProtocol);
    } catch {
        return null;
    }

    if (!/(^|\.)steamcommunity\.com$/i.test(url.hostname)) return null;

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;

    const [section, value] = parts;

    if (/^profiles$/i.test(section)) return { kind: 'id64', value };
    if (/^id$/i.test(section)) return { kind: 'vanity', value };

    return null;
}

/** Resolve vanity pela Web API oficial (precisa de STEAM_API_KEY). */
async function resolveVanityViaApi(vanity: string, apiKey: string): Promise<string | null> {
    const url = new URL('https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('vanityurl', vanity);

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;

    const data = (await res.json()) as { response?: { success?: number; steamid?: string } };
    if (data.response?.success === 1 && data.response.steamid) return data.response.steamid;

    return null;
}

/**
 * Resolve vanity sem chave de API.
 * O endpoint ?xml=1 do perfil publico devolve <steamID64> no XML.
 */
async function resolveVanityViaXml(vanity: string): Promise<string | null> {
    const url = `https://steamcommunity.com/id/${encodeURIComponent(vanity)}/?xml=1`;

    const res = await fetch(url, {
        headers: { 'User-Agent': 'AutoMix-Bot/1.0' },
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;

    const xml = await res.text();
    const m = xml.match(/<steamID64>(\d{17})<\/steamID64>/);
    return m ? m[1] : null;
}

/** Busca nome e avatar. So funciona com STEAM_API_KEY configurada. */
export async function fetchPlayerSummary(
    steamId64: string
): Promise<{ personaName?: string; avatarUrl?: string }> {
    const apiKey = process.env.STEAM_API_KEY;
    if (!apiKey) return {};

    try {
        const url = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/');
        url.searchParams.set('key', apiKey);
        url.searchParams.set('steamids', steamId64);

        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return {};

        const data = (await res.json()) as any;
        const p = data?.response?.players?.[0];
        if (!p) return {};

        return { personaName: p.personaname, avatarUrl: p.avatarfull ?? p.avatarmedium };
    } catch {
        return {};
    }
}

/**
 * Ponto de entrada: transforma a entrada do usuario num SteamID64.
 * Lanca SteamResolveError com um code utilizavel para montar a mensagem.
 */
export async function resolveSteamId(input: string): Promise<SteamProfile> {
    const raw = input.trim();
    if (!raw) throw new SteamResolveError('INVALID_INPUT', 'Entrada vazia.');

    // 1. SteamID64 cru
    if (isValidSteamId64(raw)) {
        return { steamId64: raw, source: 'direct' };
    }

    // 2. Formatos legados
    const s2 = fromSteam2(raw);
    if (s2 && isValidSteamId64(s2)) return { steamId64: s2, source: 'steam2' };

    const s3 = fromSteam3(raw);
    if (s3 && isValidSteamId64(s3)) return { steamId64: s3, source: 'steam3' };

    // 3. URL da comunidade
    const parsed = parseSteamUrl(raw);
    if (!parsed) {
        throw new SteamResolveError(
            'INVALID_INPUT',
            'Nao reconheci esse formato. Envie o link do seu perfil da Steam ou o SteamID64.'
        );
    }

    if (parsed.kind === 'id64') {
        if (!isValidSteamId64(parsed.value)) {
            throw new SteamResolveError('INVALID_INPUT', 'O ID nesse link nao e um SteamID64 valido.');
        }
        return { steamId64: parsed.value, source: 'profiles-url' };
    }

    // 4. Vanity — precisa consultar a Steam
    const apiKey = process.env.STEAM_API_KEY;

    try {
        if (apiKey) {
            const viaApi = await resolveVanityViaApi(parsed.value, apiKey);
            if (viaApi && isValidSteamId64(viaApi)) {
                return { steamId64: viaApi, source: 'vanity-api' };
            }
        }

        const viaXml = await resolveVanityViaXml(parsed.value);
        if (viaXml && isValidSteamId64(viaXml)) {
            return { steamId64: viaXml, source: 'vanity-xml' };
        }
    } catch (error) {
        throw new SteamResolveError(
            'NETWORK',
            'Nao consegui falar com a Steam agora. Tente de novo em instantes.'
        );
    }

    throw new SteamResolveError(
        'VANITY_NOT_FOUND',
        'Esse perfil nao foi encontrado. Confira se o link esta certo e se o perfil e publico.'
    );
}

/** Link canonico do perfil. */
export function profileUrl(steamId64: string): string {
    return `https://steamcommunity.com/profiles/${steamId64}`;
}
