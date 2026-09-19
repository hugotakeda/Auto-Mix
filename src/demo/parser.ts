/**
 * Parser de demos CS2 (Source 2) — validado contra demos da Xplay.gg.
 *
 * O que foi confirmado numa demo real da plataforma:
 *   - magic "PBDEMS2", demo_version_name "valve_demo_2"
 *   - server_name no formato "XPLAY.GG • CS2 Matches #390"
 *   - o warmup/faca aparece nos eventos, entao TEM que ser cortado
 *   - os times trocam de lado no intervalo, entao team_num so vale por evento
 *
 * Roda em processo separado (ver worker.ts): o parse e sincrono e trava o
 * event loop por alguns segundos numa demo de ~200MB.
 */

import { parseEvent, parseHeader, parsePlayerInfo } from '@laihoe/demoparser2';

/** Numeros de time do CS2. 2 = TR, 3 = CT. 0/1 = sem time / espectador. */
const TEAM_T = 2;
const TEAM_CT = 3;

/** Um jogador nao pode perder mais que 100 de vida por round. */
const MAX_HEALTH_PER_ROUND = 100;

export interface ParsedPlayer {
    steamId64: string;
    name: string;
    /** Time no fim da partida (2 = TR, 3 = CT). */
    team: number;
    result: 'win' | 'loss' | 'draw';
    kills: number;
    deaths: number;
    assists: number;
    headshots: number;
    /** Dano ja limitado a vida real removida. */
    damage: number;
    rounds: number;
}

export interface ParsedDemo {
    mapName: string;
    serverName: string;
    /** "CS2 Matches #390" quando a demo e da Xplay. */
    matchLabel: string | null;
    isXplay: boolean;
    scoreCt: number;
    scoreT: number;
    rounds: number;
    winner: 'CT' | 'T' | 'DRAW';
    players: ParsedPlayer[];
    warnings: string[];
}

export class DemoParseError extends Error {
    constructor(public code: string, message: string) {
        super(message);
        this.name = 'DemoParseError';
    }
}

interface Accumulator {
    steamId64: string;
    name: string;
    team: number;
    kills: number;
    deaths: number;
    assists: number;
    headshots: number;
    damage: number;
}

/**
 * Descobre o tick em que a partida de verdade comeca.
 *
 * "begin_new_match" aparece duas vezes: uma no tick 1 (abertura da demo) e
 * outra quando o warmup acaba de fato. Pegamos a ultima. Sem esse corte, os
 * kills de faca do aquecimento entram na conta (na demo testada eram 7).
 */
function findMatchStartTick(filePath: string): number {
    let candidates: number[] = [];

    try {
        candidates = parseEvent(filePath, 'begin_new_match').map((e: any) => Number(e.tick));
    } catch {
        candidates = [];
    }

    if (candidates.length === 0) {
        try {
            candidates = parseEvent(filePath, 'round_announce_match_start').map((e: any) => Number(e.tick));
        } catch {
            candidates = [];
        }
    }

    const real = candidates.filter(t => Number.isFinite(t) && t > 1);
    if (real.length === 0) return 0;

    return Math.max(...real);
}

export function parseDemo(filePath: string): ParsedDemo {
    const warnings: string[] = [];

    // --- Cabecalho ---
    let header: any;
    try {
        header = parseHeader(filePath);
    } catch (error) {
        throw new DemoParseError(
            'INVALID_DEMO',
            'Nao consegui ler o cabecalho. O arquivo parece corrompido ou nao e uma demo de CS2.'
        );
    }

    const mapName: string = header.map_name ?? 'desconhecido';
    const serverName: string = header.server_name ?? '';

    if (header.demo_file_stamp && !String(header.demo_file_stamp).startsWith('PBDEMS2')) {
        throw new DemoParseError(
            'NOT_CS2',
            'Essa demo parece ser de CS:GO (Source 1). Só demos de CS2 são suportadas.'
        );
    }

    const isXplay = /xplay/i.test(serverName);
    const labelMatch = serverName.match(/(CS2\s*Matches?\s*#\s*\d+)/i);
    const matchLabel = labelMatch ? labelMatch[1].replace(/\s+/g, ' ').trim() : null;

    if (!isXplay) {
        warnings.push(
            `Demo de servidor nao-Xplay ("${serverName || 'sem nome'}"). As stats foram extraidas mesmo assim.`
        );
    }

    const matchStartTick = findMatchStartTick(filePath);
    if (matchStartTick === 0) {
        warnings.push('Nao achei o marcador de inicio de partida — kills de aquecimento podem ter entrado na conta.');
    }

    // --- Placar final ---
    const roundEnds = parseEvent(filePath, 'round_end', [], ['total_rounds_played', 'team_rounds_total'])
        .filter((e: any) => Number(e.tick) > matchStartTick && e.winner);

    if (roundEnds.length === 0) {
        throw new DemoParseError(
            'NO_ROUNDS',
            'Nenhum round completo encontrado. A partida foi cancelada ou a demo esta incompleta.'
        );
    }

    const lastRound: any = roundEnds[roundEnds.length - 1];
    const scoreCt = Number(lastRound.ct_team_rounds_total ?? 0);
    const scoreT = Number(lastRound.t_team_rounds_total ?? 0);
    const rounds = Number(lastRound.total_rounds_played ?? roundEnds.length);

    if (rounds <= 0) {
        throw new DemoParseError('NO_ROUNDS', 'A demo nao tem rounds validos.');
    }

    // --- Nomes conhecidos (fallback quando o jogador nao aparece em eventos) ---
    const knownNames = new Map<string, string>();
    try {
        for (const p of parsePlayerInfo(filePath) as any[]) {
            if (p.steamid && p.steamid !== '0') knownNames.set(String(p.steamid), String(p.name ?? ''));
        }
    } catch {
        // parsePlayerInfo e opcional — os eventos ja trazem os nomes
    }

    const acc = new Map<string, Accumulator>();
    const touch = (steamId: string, name?: string, team?: number): Accumulator => {
        let a = acc.get(steamId);
        if (!a) {
            a = {
                steamId64: steamId,
                name: name || knownNames.get(steamId) || steamId,
                team: team ?? 0,
                kills: 0, deaths: 0, assists: 0, headshots: 0, damage: 0,
            };
            acc.set(steamId, a);
        }
        if (name) a.name = name;
        if (team === TEAM_T || team === TEAM_CT) a.team = team;
        return a;
    };

    // --- Kills / deaths / assists / headshots ---
    const deaths = parseEvent(filePath, 'player_death', ['team_num'])
        .filter((e: any) => Number(e.tick) > matchStartTick);

    let teamKills = 0;

    for (const e of deaths as any[]) {
        const victim = e.user_steamid ? String(e.user_steamid) : null;
        const attacker = e.attacker_steamid ? String(e.attacker_steamid) : null;
        const assister = e.assister_steamid ? String(e.assister_steamid) : null;

        if (victim && victim !== '0') {
            touch(victim, e.user_name, Number(e.user_team_num)).deaths++;
        }

        // Kill so conta contra o time adversario. Suicidio e team kill nao creditam.
        if (attacker && attacker !== '0' && attacker !== victim) {
            const sameTeam = Number(e.attacker_team_num) === Number(e.user_team_num);
            if (sameTeam) {
                teamKills++;
                touch(attacker, e.attacker_name, Number(e.attacker_team_num));
            } else {
                const a = touch(attacker, e.attacker_name, Number(e.attacker_team_num));
                a.kills++;
                if (e.headshot) a.headshots++;
            }
        }

        if (assister && assister !== '0' && Number(e.assister_team_num) !== Number(e.user_team_num)) {
            touch(assister, e.assister_name, Number(e.assister_team_num)).assists++;
        }
    }

    if (teamKills > 0) {
        warnings.push(`${teamKills} team kill(s) ignorado(s) na contagem de abates.`);
    }

    // --- Dano (ADR) ---
    //
    // dmg_health vem SEM limite: numa demo real teve um evento marcando 459 de
    // dano num unico tiro. O valor real e a vida que o alvo efetivamente perdeu,
    // entao acompanhamos a vida de cada um e ainda limitamos a 100 por round.
    const hurts = parseEvent(filePath, 'player_hurt', ['team_num'], ['total_rounds_played'])
        .filter((e: any) => Number(e.tick) > matchStartTick)
        .sort((a: any, b: any) => Number(a.tick) - Number(b.tick));

    const healthByVictim = new Map<string, number>();
    const takenThisRound = new Map<string, number>();
    let currentRound = -1;

    for (const e of hurts as any[]) {
        const round = Number(e.total_rounds_played);
        if (round !== currentRound) {
            currentRound = round;
            healthByVictim.clear();
            takenThisRound.clear();
        }

        const victim = e.user_steamid ? String(e.user_steamid) : null;
        if (!victim || victim === '0') continue;

        const healthBefore = healthByVictim.get(victim) ?? MAX_HEALTH_PER_ROUND;
        const healthAfter = Number(e.health ?? 0);

        // Queda de vida observada, com o dano bruto como teto de seguranca.
        let real = Math.max(0, healthBefore - healthAfter);
        real = Math.min(real, Math.max(0, Number(e.dmg_health ?? 0)), healthBefore);

        healthByVictim.set(victim, healthAfter);

        // Trava fisica: ninguem perde mais de 100 de vida num round.
        const taken = takenThisRound.get(victim) ?? 0;
        const room = Math.max(0, MAX_HEALTH_PER_ROUND - taken);
        real = Math.min(real, room);
        takenThisRound.set(victim, taken + real);

        if (real <= 0) continue;

        const attacker = e.attacker_steamid ? String(e.attacker_steamid) : null;
        if (!attacker || attacker === '0' || attacker === victim) continue;
        if (Number(e.attacker_team_num) === Number(e.user_team_num)) continue;

        touch(attacker, e.attacker_name, Number(e.attacker_team_num)).damage += real;
    }

    // --- Monta o resultado por jogador ---
    const winner: 'CT' | 'T' | 'DRAW' =
        scoreCt > scoreT ? 'CT' : scoreT > scoreCt ? 'T' : 'DRAW';

    const players: ParsedPlayer[] = [];

    for (const a of acc.values()) {
        // Espectadores / GOTV nao entram
        if (a.team !== TEAM_T && a.team !== TEAM_CT) continue;

        const myScore = a.team === TEAM_CT ? scoreCt : scoreT;
        const theirScore = a.team === TEAM_CT ? scoreT : scoreCt;

        players.push({
            steamId64: a.steamId64,
            name: a.name,
            team: a.team,
            result: myScore > theirScore ? 'win' : myScore < theirScore ? 'loss' : 'draw',
            kills: a.kills,
            deaths: a.deaths,
            assists: a.assists,
            headshots: a.headshots,
            damage: Math.round(a.damage),
            rounds,
        });
    }

    if (players.length === 0) {
        throw new DemoParseError('NO_PLAYERS', 'Nenhum jogador encontrado na demo.');
    }

    if (players.length !== 10) {
        warnings.push(`A demo tem ${players.length} jogadores em vez de 10.`);
    }

    // Conferencia de sanidade: a soma dos abates tem que bater com as mortes.
    const totalKills = players.reduce((s, p) => s + p.kills, 0);
    const totalDeaths = players.reduce((s, p) => s + p.deaths, 0);
    if (Math.abs(totalKills - (totalDeaths - teamKills)) > 2) {
        warnings.push(
            `Soma de abates (${totalKills}) nao bate com as mortes (${totalDeaths}). Confira o placar.`
        );
    }

    players.sort((a, b) => b.kills - a.kills);

    return {
        mapName,
        serverName,
        matchLabel,
        isXplay,
        scoreCt,
        scoreT,
        rounds,
        winner,
        players,
        warnings,
    };
}
