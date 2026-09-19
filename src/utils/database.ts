import initSqlJs, { type Database } from 'sql.js';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data.db');

let db: Database | null = null;

export async function getDatabase(): Promise<Database> {
    if (db) return db;

    const SQL = await initSqlJs();

    // Load existing DB file or create new
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    initTables();
    return db;
}

function saveDatabase(): void {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

function initTables(): void {
    if (!db) return;

    db.run(`
        CREATE TABLE IF NOT EXISTS players (
            user_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            role TEXT DEFAULT NULL,
            total_kills INTEGER DEFAULT 0,
            total_deaths INTEGER DEFAULT 0,
            matches_played INTEGER DEFAULT 0,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, guild_id)
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            mode TEXT NOT NULL,
            format TEXT NOT NULL,
            maps TEXT NOT NULL,
            team_a TEXT NOT NULL,
            team_b TEXT NOT NULL,
            team_a_name TEXT,
            team_b_name TEXT,
            captain_a TEXT,
            captain_b TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS player_match_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            match_id INTEGER,
            kills INTEGER NOT NULL,
            deaths INTEGER NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (match_id) REFERENCES matches(id)
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS guild_settings (
            guild_id TEXT PRIMARY KEY,
            ranking_channel_id TEXT
        );
    `);

    try { db.run('ALTER TABLE players ADD COLUMN wins INTEGER DEFAULT 0;'); } catch {}
    try { db.run('ALTER TABLE players ADD COLUMN losses INTEGER DEFAULT 0;'); } catch {}

    // --- Migracao: vinculo Steam + stats avancadas (demo parser) ---
    try { db.run('ALTER TABLE players ADD COLUMN steam_id64 TEXT DEFAULT NULL;'); } catch {}
    try { db.run('ALTER TABLE players ADD COLUMN steam_linked_at TEXT DEFAULT NULL;'); } catch {}
    try { db.run('ALTER TABLE players ADD COLUMN total_assists INTEGER DEFAULT 0;'); } catch {}
    try { db.run('ALTER TABLE players ADD COLUMN total_headshots INTEGER DEFAULT 0;'); } catch {}
    try { db.run('ALTER TABLE players ADD COLUMN total_damage INTEGER DEFAULT 0;'); } catch {}
    try { db.run('ALTER TABLE players ADD COLUMN total_rounds INTEGER DEFAULT 0;'); } catch {}

    // Um SteamID64 so pode estar vinculado a um Discord por guild
    db.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_players_steam
        ON players (guild_id, steam_id64)
        WHERE steam_id64 IS NOT NULL;
    `);

    // --- Partidas importadas de demo ---
    db.run(`
        CREATE TABLE IF NOT EXISTS demo_matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            demo_hash TEXT NOT NULL,
            file_name TEXT,
            map_name TEXT,
            server_name TEXT,
            match_label TEXT,
            score_ct INTEGER DEFAULT 0,
            score_t INTEGER DEFAULT 0,
            rounds INTEGER DEFAULT 0,
            winner TEXT,
            uploaded_by TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
    `);
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_hash ON demo_matches (guild_id, demo_hash);');

    db.run(`
        CREATE TABLE IF NOT EXISTS demo_player_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            demo_match_id INTEGER NOT NULL,
            guild_id TEXT NOT NULL,
            steam_id64 TEXT NOT NULL,
            user_id TEXT,
            name TEXT,
            team INTEGER,
            result TEXT,
            kills INTEGER DEFAULT 0,
            deaths INTEGER DEFAULT 0,
            assists INTEGER DEFAULT 0,
            headshots INTEGER DEFAULT 0,
            damage INTEGER DEFAULT 0,
            rounds INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (demo_match_id) REFERENCES demo_matches(id)
        );
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_dps_steam ON demo_player_stats (guild_id, steam_id64);');
    db.run('CREATE INDEX IF NOT EXISTS idx_dps_created ON demo_player_stats (guild_id, created_at);');

    // --- Fila de processamento de demos ---
    db.run(`
        CREATE TABLE IF NOT EXISTS demo_jobs (
            id TEXT PRIMARY KEY,
            guild_id TEXT NOT NULL,
            uploaded_by TEXT,
            file_name TEXT,
            file_path TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            error TEXT,
            demo_match_id INTEGER,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
    `);

    // --- Marcacoes de staff (suspeita de cheat / banimento) ---
    db.run(`
        CREATE TABLE IF NOT EXISTS player_flags (
            guild_id TEXT NOT NULL,
            steam_id64 TEXT NOT NULL,
            level TEXT NOT NULL DEFAULT 'clean',
            reason TEXT,
            updated_by TEXT,
            updated_by_name TEXT,
            updated_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (guild_id, steam_id64)
        );
    `);

    // Cada mudanca vira uma linha aqui. Uma marcacao de cheat sem historico
    // vira boato: a staff seguinte precisa ver quem marcou, quando e por que.
    db.run(`
        CREATE TABLE IF NOT EXISTS player_flag_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            steam_id64 TEXT NOT NULL,
            level TEXT NOT NULL,
            previous_level TEXT,
            reason TEXT,
            actor_id TEXT,
            actor_name TEXT,
            discord_ban TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_flag_hist ON player_flag_history (guild_id, steam_id64);');

    saveDatabase();
}

// --- Player operations ---

export interface PlayerData {
    user_id: string;
    guild_id: string;
    role: string | null;
    total_kills: number;
    total_deaths: number;
    matches_played: number;
    wins: number;
    losses: number;
}

export function getPlayer(userId: string, guildId: string): PlayerData | undefined {
    if (!db) return undefined;

    const stmt = db.prepare('SELECT * FROM players WHERE user_id = ? AND guild_id = ?');
    stmt.bind([userId, guildId]);

    if (stmt.step()) {
        const row = stmt.getAsObject() as any;
        stmt.free();
        return row as PlayerData;
    }

    stmt.free();
    return undefined;
}

export function upsertPlayer(userId: string, guildId: string): PlayerData {
    if (!db) throw new Error('Database not initialized');

    db.run(
        'INSERT OR IGNORE INTO players (user_id, guild_id) VALUES (?, ?)',
        [userId, guildId]
    );
    saveDatabase();

    return getPlayer(userId, guildId)!;
}

export function updatePlayerRole(userId: string, guildId: string, role: string): void {
    if (!db) return;

    upsertPlayer(userId, guildId);
    db.run('UPDATE players SET role = ? WHERE user_id = ? AND guild_id = ?', [role, userId, guildId]);
    saveDatabase();
}

export function addPlayerStats(userId: string, guildId: string, kills: number, deaths: number, result?: 'win' | 'loss' | 'draw'): PlayerData {
    if (!db) throw new Error('Database not initialized');

    upsertPlayer(userId, guildId);

    const winInc = result === 'win' ? 1 : 0;
    const lossInc = result === 'loss' ? 1 : 0;

    db.run(
        `UPDATE players
         SET total_kills = total_kills + ?,
             total_deaths = total_deaths + ?,
             matches_played = matches_played + 1,
             wins = wins + ?,
             losses = losses + ?
         WHERE user_id = ? AND guild_id = ?`,
        [kills, deaths, winInc, lossInc, userId, guildId]
    );

    db.run(
        `INSERT INTO player_match_stats (user_id, guild_id, kills, deaths)
         VALUES (?, ?, ?, ?)`,
        [userId, guildId, kills, deaths]
    );

    saveDatabase();
    return getPlayer(userId, guildId)!;
}

export function resetPlayerKD(userId: string, guildId: string): PlayerData {
    if (!db) throw new Error('Database not initialized');

    upsertPlayer(userId, guildId);

    db.run(
        `UPDATE players
         SET total_kills = 0,
             total_deaths = 0
         WHERE user_id = ? AND guild_id = ?`,
        [userId, guildId]
    );

    saveDatabase();
    return getPlayer(userId, guildId)!;
}

export function resetPlayerMatches(userId: string, guildId: string): PlayerData {
    if (!db) throw new Error('Database not initialized');

    upsertPlayer(userId, guildId);

    db.run(
        `UPDATE players
         SET matches_played = 0,
             wins = 0,
             losses = 0
         WHERE user_id = ? AND guild_id = ?`,
        [userId, guildId]
    );

    saveDatabase();
    return getPlayer(userId, guildId)!;
}

// --- Match operations ---

export interface MatchData {
    id: number;
    guild_id: string;
    mode: string;
    format: string;
    maps: string;
    team_a: string;
    team_b: string;
    team_a_name: string | null;
    team_b_name: string | null;
    captain_a: string | null;
    captain_b: string | null;
    created_at: string;
}

export function createMatch(
    guildId: string,
    mode: string,
    format: string,
    maps: string[],
    teamA: string[],
    teamB: string[],
    teamAName: string,
    teamBName: string,
    captainA?: string,
    captainB?: string
): MatchData {
    if (!db) throw new Error('Database not initialized');

    db.run(
        `INSERT INTO matches (guild_id, mode, format, maps, team_a, team_b, team_a_name, team_b_name, captain_a, captain_b)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            guildId, mode, format,
            JSON.stringify(maps),
            JSON.stringify(teamA),
            JSON.stringify(teamB),
            teamAName, teamBName,
            captainA ?? null, captainB ?? null
        ]
    );

    saveDatabase();

    // Get the last inserted match
    const stmt = db.prepare('SELECT * FROM matches ORDER BY id DESC LIMIT 1');
    stmt.step();
    const row = stmt.getAsObject() as any;
    stmt.free();

    return row as MatchData;
}

export function getPlayerMatches(userId: string, guildId: string): MatchData[] {
    if (!db) return [];

    const results: MatchData[] = [];
    const stmt = db.prepare(
        `SELECT * FROM matches
         WHERE guild_id = ?
         AND (team_a LIKE ? OR team_b LIKE ?)
         ORDER BY created_at DESC`
    );
    stmt.bind([guildId, `%${userId}%`, `%${userId}%`]);

    while (stmt.step()) {
        results.push(stmt.getAsObject() as any as MatchData);
    }

    stmt.free();
    return results;
}

export function getTotalMatchesCount(): number {
    if (!db) return 0;
    
    const stmt = db.prepare('SELECT COUNT(*) as count FROM matches');
    if (stmt.step()) {
        const row = stmt.getAsObject() as { count: number };
        stmt.free();
        return row.count || 0;
    }
    
    stmt.free();
    return 0;
}

// --- Ranking operations ---

export function getTopPlayers(guildId: string, limit: number = 10): PlayerData[] {
    if (!db) return [];

    const results: PlayerData[] = [];
    const stmt = db.prepare(
        `SELECT * FROM players
         WHERE guild_id = ? AND matches_played > 0
         ORDER BY total_kills DESC
         LIMIT ?`
    );
    stmt.bind([guildId, limit]);

    while (stmt.step()) {
        results.push(stmt.getAsObject() as any as PlayerData);
    }

    stmt.free();
    return results;
}

export function setRankingChannel(guildId: string, channelId: string): void {
    if (!db) throw new Error('Database not initialized');

    db.run(
        'INSERT OR REPLACE INTO guild_settings (guild_id, ranking_channel_id) VALUES (?, ?)',
        [guildId, channelId]
    );

    saveDatabase();
}

export function getRankingChannel(guildId: string): string | null {
    if (!db) return null;

    const stmt = db.prepare('SELECT ranking_channel_id FROM guild_settings WHERE guild_id = ?');
    stmt.bind([guildId]);

    if (stmt.step()) {
        const row = stmt.getAsObject() as { ranking_channel_id: string | null };
        stmt.free();
        return row.ranking_channel_id;
    }

    stmt.free();
    return null;
}


// ============================================================
// VINCULO STEAM
// ============================================================

export interface SteamLink {
    user_id: string;
    guild_id: string;
    steam_id64: string;
    steam_linked_at: string | null;
}

/** Retorna o Discord ID ja vinculado a esse SteamID64 nesta guild, se houver. */
export function getUserBySteamId(guildId: string, steamId64: string): string | null {
    if (!db) return null;

    const stmt = db.prepare('SELECT user_id FROM players WHERE guild_id = ? AND steam_id64 = ?');
    stmt.bind([guildId, steamId64]);

    if (stmt.step()) {
        const row = stmt.getAsObject() as { user_id: string };
        stmt.free();
        return row.user_id;
    }

    stmt.free();
    return null;
}

export function getSteamId(userId: string, guildId: string): string | null {
    if (!db) return null;

    const stmt = db.prepare('SELECT steam_id64 FROM players WHERE user_id = ? AND guild_id = ?');
    stmt.bind([userId, guildId]);

    if (stmt.step()) {
        const row = stmt.getAsObject() as { steam_id64: string | null };
        stmt.free();
        return row.steam_id64 ?? null;
    }

    stmt.free();
    return null;
}

/**
 * Vincula um SteamID64 a um Discord ID.
 * Lanca se o SteamID64 ja pertence a outro membro da guild.
 */
export function linkSteamId(userId: string, guildId: string, steamId64: string): void {
    if (!db) throw new Error('Database not initialized');

    const owner = getUserBySteamId(guildId, steamId64);
    if (owner && owner !== userId) {
        const err = new Error('STEAM_ALREADY_LINKED');
        (err as any).ownerId = owner;
        throw err;
    }

    upsertPlayer(userId, guildId);
    db.run(
        "UPDATE players SET steam_id64 = ?, steam_linked_at = datetime('now') WHERE user_id = ? AND guild_id = ?",
        [steamId64, userId, guildId]
    );

    // Demos importadas antes do vinculo ficaram com user_id NULL e nao somaram
    // nos totais do jogador. Agora que sabemos de quem sao, somamos de uma vez —
    // senao a pessoa vincularia a Steam e veria o perfil zerado no Discord.
    const pending = db.prepare(`
        SELECT
            COUNT(*) AS matches,
            COALESCE(SUM(kills), 0) AS kills,
            COALESCE(SUM(deaths), 0) AS deaths,
            COALESCE(SUM(assists), 0) AS assists,
            COALESCE(SUM(headshots), 0) AS headshots,
            COALESCE(SUM(damage), 0) AS damage,
            COALESCE(SUM(rounds), 0) AS rounds,
            COALESCE(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END), 0) AS wins,
            COALESCE(SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END), 0) AS losses
        FROM demo_player_stats
        WHERE guild_id = ? AND steam_id64 = ? AND user_id IS NULL
    `);
    pending.bind([guildId, steamId64]);
    pending.step();
    const backfill = pending.getAsObject() as any;
    pending.free();

    db.run(
        'UPDATE demo_player_stats SET user_id = ? WHERE guild_id = ? AND steam_id64 = ?',
        [userId, guildId, steamId64]
    );

    if ((backfill.matches ?? 0) > 0) {
        db.run(
            `UPDATE players SET
                total_kills = total_kills + ?,
                total_deaths = total_deaths + ?,
                total_assists = total_assists + ?,
                total_headshots = total_headshots + ?,
                total_damage = total_damage + ?,
                total_rounds = total_rounds + ?,
                matches_played = matches_played + ?,
                wins = wins + ?,
                losses = losses + ?
             WHERE user_id = ? AND guild_id = ?`,
            [
                backfill.kills, backfill.deaths, backfill.assists,
                backfill.headshots, backfill.damage, backfill.rounds,
                backfill.matches, backfill.wins, backfill.losses,
                userId, guildId,
            ]
        );
    }

    saveDatabase();
}

export function unlinkSteamId(userId: string, guildId: string): void {
    if (!db) throw new Error('Database not initialized');

    db.run(
        'UPDATE players SET steam_id64 = NULL, steam_linked_at = NULL WHERE user_id = ? AND guild_id = ?',
        [userId, guildId]
    );
    saveDatabase();
}

// ============================================================
// IMPORTACAO DE DEMO
// ============================================================

export interface DemoPlayerRow {
    steamId64: string;
    name: string;
    team: number;
    result: 'win' | 'loss' | 'draw';
    kills: number;
    deaths: number;
    assists: number;
    headshots: number;
    damage: number;
    rounds: number;
}

export interface DemoMatchInput {
    guildId: string;
    demoHash: string;
    fileName: string;
    mapName: string;
    serverName: string;
    matchLabel: string | null;
    scoreCt: number;
    scoreT: number;
    rounds: number;
    winner: string | null;
    uploadedBy: string | null;
    players: DemoPlayerRow[];
}

export function findDemoMatchByHash(guildId: string, demoHash: string): number | null {
    if (!db) return null;

    const stmt = db.prepare('SELECT id FROM demo_matches WHERE guild_id = ? AND demo_hash = ?');
    stmt.bind([guildId, demoHash]);

    if (stmt.step()) {
        const row = stmt.getAsObject() as { id: number };
        stmt.free();
        return row.id;
    }

    stmt.free();
    return null;
}

/**
 * Grava a partida e aplica as estatisticas aos jogadores vinculados.
 * Idempotente por demo_hash: reimportar a mesma demo nao duplica nada.
 */
export function importDemoMatch(input: DemoMatchInput): { matchId: number; applied: number; unlinked: string[] } {
    if (!db) throw new Error('Database not initialized');

    const existing = findDemoMatchByHash(input.guildId, input.demoHash);
    if (existing !== null) {
        const err = new Error('DEMO_ALREADY_IMPORTED');
        (err as any).matchId = existing;
        throw err;
    }

    db.run(
        `INSERT INTO demo_matches
         (guild_id, demo_hash, file_name, map_name, server_name, match_label, score_ct, score_t, rounds, winner, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            input.guildId, input.demoHash, input.fileName, input.mapName,
            input.serverName, input.matchLabel, input.scoreCt, input.scoreT,
            input.rounds, input.winner, input.uploadedBy,
        ]
    );

    const idStmt = db.prepare('SELECT last_insert_rowid() AS id');
    idStmt.step();
    const matchId = (idStmt.getAsObject() as { id: number }).id;
    idStmt.free();

    let applied = 0;
    const unlinked: string[] = [];

    for (const p of input.players) {
        const userId = getUserBySteamId(input.guildId, p.steamId64);

        db.run(
            `INSERT INTO demo_player_stats
             (demo_match_id, guild_id, steam_id64, user_id, name, team, result, kills, deaths, assists, headshots, damage, rounds)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                matchId, input.guildId, p.steamId64, userId, p.name, p.team, p.result,
                p.kills, p.deaths, p.assists, p.headshots, p.damage, p.rounds,
            ]
        );

        if (!userId) {
            unlinked.push(p.name);
            continue;
        }

        upsertPlayer(userId, input.guildId);
        db.run(
            `UPDATE players SET
                total_kills = total_kills + ?,
                total_deaths = total_deaths + ?,
                total_assists = total_assists + ?,
                total_headshots = total_headshots + ?,
                total_damage = total_damage + ?,
                total_rounds = total_rounds + ?,
                matches_played = matches_played + 1,
                wins = wins + ?,
                losses = losses + ?
             WHERE user_id = ? AND guild_id = ?`,
            [
                p.kills, p.deaths, p.assists, p.headshots, p.damage, p.rounds,
                p.result === 'win' ? 1 : 0,
                p.result === 'loss' ? 1 : 0,
                userId, input.guildId,
            ]
        );
        applied++;
    }

    saveDatabase();
    return { matchId, applied, unlinked };
}

// ============================================================
// RANKING POR PERIODO
// ============================================================

export type RankingPeriod = 'week' | 'biweek' | 'month' | 'all';

export interface RankedPlayer {
    steam_id64: string;
    user_id: string | null;
    name: string;
    kills: number;
    deaths: number;
    assists: number;
    headshots: number;
    damage: number;
    rounds: number;
    matches: number;
    wins: number;
    kd: number;
    adr: number;
    hsPercent: number;
    winRate: number;
}

/** Corte SQLite para cada periodo. null = sem filtro. */
function periodCutoff(period: RankingPeriod): string | null {
    switch (period) {
        case 'week':   return "datetime('now', '-7 days')";
        case 'biweek': return "datetime('now', '-15 days')";
        case 'month':  return "datetime('now', '-30 days')";
        default:       return null;
    }
}

/** Quantas partidas distintas entraram no periodo. */
export function countMatchesInPeriod(guildId: string, period: RankingPeriod): number {
    if (!db) return 0;

    const cutoff = periodCutoff(period);
    const where = cutoff ? `AND created_at >= ${cutoff}` : '';

    const stmt = db.prepare(
        `SELECT COUNT(*) AS n FROM demo_matches WHERE guild_id = ? ${where}`
    );
    stmt.bind([guildId]);
    stmt.step();
    const n = (stmt.getAsObject() as { n: number }).n ?? 0;
    stmt.free();
    return n;
}

/** Total de rounds jogados no periodo (soma das partidas, nao dos jogadores). */
export function countRoundsInPeriod(guildId: string, period: RankingPeriod): number {
    if (!db) return 0;

    const cutoff = periodCutoff(period);
    const where = cutoff ? `AND created_at >= ${cutoff}` : '';

    const stmt = db.prepare(
        `SELECT COALESCE(SUM(rounds), 0) AS n FROM demo_matches WHERE guild_id = ? ${where}`
    );
    stmt.bind([guildId]);
    stmt.step();
    const n = (stmt.getAsObject() as { n: number }).n ?? 0;
    stmt.free();
    return n;
}

export function getRankingByPeriod(guildId: string, period: RankingPeriod, limit = 50): RankedPlayer[] {
    if (!db) return [];

    const cutoff = periodCutoff(period);
    const where = cutoff ? `AND s.created_at >= ${cutoff}` : '';

    const stmt = db.prepare(`
        SELECT
            s.steam_id64,
            MAX(s.user_id) AS user_id,
            MAX(s.name) AS name,
            SUM(s.kills) AS kills,
            SUM(s.deaths) AS deaths,
            SUM(s.assists) AS assists,
            SUM(s.headshots) AS headshots,
            SUM(s.damage) AS damage,
            SUM(s.rounds) AS rounds,
            COUNT(*) AS matches,
            SUM(CASE WHEN s.result = 'win' THEN 1 ELSE 0 END) AS wins
        FROM demo_player_stats s
        WHERE s.guild_id = ? ${where}
        GROUP BY s.steam_id64
        ORDER BY (CAST(SUM(s.damage) AS REAL) / MAX(SUM(s.rounds), 1)) DESC
        LIMIT ?
    `);
    stmt.bind([guildId, limit]);

    const out: RankedPlayer[] = [];
    while (stmt.step()) {
        const r = stmt.getAsObject() as any;
        out.push({
            steam_id64: r.steam_id64,
            user_id: r.user_id ?? null,
            name: r.name ?? r.steam_id64,
            kills: r.kills ?? 0,
            deaths: r.deaths ?? 0,
            assists: r.assists ?? 0,
            headshots: r.headshots ?? 0,
            damage: r.damage ?? 0,
            rounds: r.rounds ?? 0,
            matches: r.matches ?? 0,
            wins: r.wins ?? 0,
            kd: r.deaths > 0 ? r.kills / r.deaths : r.kills,
            adr: r.rounds > 0 ? r.damage / r.rounds : 0,
            hsPercent: r.kills > 0 ? (r.headshots / r.kills) * 100 : 0,
            winRate: r.matches > 0 ? (r.wins / r.matches) * 100 : 0,
        });
    }

    stmt.free();
    return out;
}

export interface DemoMatchRow {
    id: number;
    map_name: string;
    server_name: string;
    match_label: string | null;
    score_ct: number;
    score_t: number;
    rounds: number;
    winner: string | null;
    file_name: string;
    uploaded_by: string | null;
    created_at: string;
}

export function getRecentDemoMatches(guildId: string, limit = 20): DemoMatchRow[] {
    if (!db) return [];

    const stmt = db.prepare(
        'SELECT * FROM demo_matches WHERE guild_id = ? ORDER BY id DESC LIMIT ?'
    );
    stmt.bind([guildId, limit]);

    const out: DemoMatchRow[] = [];
    while (stmt.step()) out.push(stmt.getAsObject() as any);
    stmt.free();
    return out;
}

export function getDemoMatchPlayers(matchId: number): any[] {
    if (!db) return [];

    const stmt = db.prepare(
        'SELECT * FROM demo_player_stats WHERE demo_match_id = ? ORDER BY kills DESC'
    );
    stmt.bind([matchId]);

    const out: any[] = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return out;
}

export function getPlayerDemoHistory(guildId: string, steamId64: string, limit = 25): any[] {
    if (!db) return [];

    const stmt = db.prepare(`
        SELECT s.*, m.map_name, m.score_ct, m.score_t, m.match_label, m.created_at AS match_date
        FROM demo_player_stats s
        JOIN demo_matches m ON m.id = s.demo_match_id
        WHERE s.guild_id = ? AND s.steam_id64 = ?
        ORDER BY s.id DESC
        LIMIT ?
    `);
    stmt.bind([guildId, steamId64, limit]);

    const out: any[] = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return out;
}

// ============================================================
// FILA DE DEMOS
// ============================================================

export function createDemoJob(id: string, guildId: string, uploadedBy: string, fileName: string, filePath: string): void {
    if (!db) throw new Error('Database not initialized');

    db.run(
        'INSERT INTO demo_jobs (id, guild_id, uploaded_by, file_name, file_path, status) VALUES (?, ?, ?, ?, ?, ?)',
        [id, guildId, uploadedBy, fileName, filePath, 'pending']
    );
    saveDatabase();
}

export function updateDemoJob(id: string, status: string, error?: string | null, matchId?: number | null): void {
    if (!db) return;

    db.run(
        "UPDATE demo_jobs SET status = ?, error = ?, demo_match_id = ?, updated_at = datetime('now') WHERE id = ?",
        [status, error ?? null, matchId ?? null, id]
    );
    saveDatabase();
}

export function getDemoJob(id: string): any | null {
    if (!db) return null;

    const stmt = db.prepare('SELECT * FROM demo_jobs WHERE id = ?');
    stmt.bind([id]);

    if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
    }

    stmt.free();
    return null;
}

export function getRecentDemoJobs(guildId: string, limit = 15): any[] {
    if (!db) return [];

    const stmt = db.prepare('SELECT * FROM demo_jobs WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?');
    stmt.bind([guildId, limit]);

    const out: any[] = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return out;
}

// ============================================================
// PERFIS DE JOGADOR
// ============================================================

export interface PlayerSummary {
    steam_id64: string;
    user_id: string | null;
    name: string;
    matches: number;
    wins: number;
    losses: number;
    draws: number;
    kills: number;
    deaths: number;
    assists: number;
    headshots: number;
    damage: number;
    rounds: number;
    kd: number;
    adr: number;
    hsPercent: number;
    winRate: number;
    last_played: string | null;
}

/**
 * SELECT compartilhado entre a listagem e o perfil individual.
 * Mantem os dois com exatamente a mesma definicao de cada metrica.
 */
const PLAYER_AGG_SELECT = `
    SELECT
        s.steam_id64,
        MAX(s.user_id) AS user_id,
        MAX(s.name) AS name,
        COUNT(*) AS matches,
        SUM(CASE WHEN s.result = 'win' THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN s.result = 'loss' THEN 1 ELSE 0 END) AS losses,
        SUM(CASE WHEN s.result = 'draw' THEN 1 ELSE 0 END) AS draws,
        SUM(s.kills) AS kills,
        SUM(s.deaths) AS deaths,
        SUM(s.assists) AS assists,
        SUM(s.headshots) AS headshots,
        SUM(s.damage) AS damage,
        SUM(s.rounds) AS rounds,
        MAX(s.created_at) AS last_played
    FROM demo_player_stats s
`;

function toSummary(r: any): PlayerSummary {
    const kills = r.kills ?? 0;
    const deaths = r.deaths ?? 0;
    const rounds = r.rounds ?? 0;
    const damage = r.damage ?? 0;
    const matches = r.matches ?? 0;

    return {
        steam_id64: r.steam_id64,
        user_id: r.user_id ?? null,
        name: r.name ?? r.steam_id64,
        matches,
        wins: r.wins ?? 0,
        losses: r.losses ?? 0,
        draws: r.draws ?? 0,
        kills,
        deaths,
        assists: r.assists ?? 0,
        headshots: r.headshots ?? 0,
        damage,
        rounds,
        kd: deaths > 0 ? kills / deaths : kills,
        adr: rounds > 0 ? damage / rounds : 0,
        hsPercent: kills > 0 ? (r.headshots / kills) * 100 : 0,
        winRate: matches > 0 ? ((r.wins ?? 0) / matches) * 100 : 0,
        last_played: r.last_played ?? null,
    };
}

/** Todos os jogadores que ja apareceram em alguma demo da guild. */
export function getAllPlayers(guildId: string, limit = 500): PlayerSummary[] {
    if (!db) return [];

    const stmt = db.prepare(`
        ${PLAYER_AGG_SELECT}
        WHERE s.guild_id = ?
        GROUP BY s.steam_id64
        ORDER BY (CAST(SUM(s.damage) AS REAL) / MAX(SUM(s.rounds), 1)) DESC
        LIMIT ?
    `);
    stmt.bind([guildId, limit]);

    const out: PlayerSummary[] = [];
    while (stmt.step()) out.push(toSummary(stmt.getAsObject()));
    stmt.free();
    return out;
}

export function getPlayerSummary(guildId: string, steamId64: string): PlayerSummary | null {
    if (!db) return null;

    const stmt = db.prepare(`
        ${PLAYER_AGG_SELECT}
        WHERE s.guild_id = ? AND s.steam_id64 = ?
        GROUP BY s.steam_id64
    `);
    stmt.bind([guildId, steamId64]);

    const row = stmt.step() ? toSummary(stmt.getAsObject()) : null;
    stmt.free();
    return row;
}

/**
 * Posicao do jogador no ranking geral (por ADR), e quantos jogadores existem.
 * Devolve rank 0 quando o jogador nao tem partidas.
 */
export function getPlayerRank(guildId: string, steamId64: string): { rank: number; total: number } {
    const all = getAllPlayers(guildId, 1000);
    const index = all.findIndex(p => p.steam_id64 === steamId64);
    return { rank: index === -1 ? 0 : index + 1, total: all.length };
}

// ============================================================
// MARCACOES DE STAFF
// ============================================================

/**
 * Niveis de marcacao, do mais leve ao mais grave.
 * 'banned' e o unico que dispara acao fora do site (ban no Discord).
 */
export const FLAG_LEVELS = ['clean', 'watching', 'suspect', 'confirmed', 'banned'] as const;
export type FlagLevel = (typeof FLAG_LEVELS)[number];

export function isFlagLevel(value: string): value is FlagLevel {
    return (FLAG_LEVELS as readonly string[]).includes(value);
}

export interface PlayerFlag {
    steam_id64: string;
    level: FlagLevel;
    reason: string | null;
    updated_by: string | null;
    updated_by_name: string | null;
    updated_at: string | null;
}

export function getPlayerFlag(guildId: string, steamId64: string): PlayerFlag | null {
    if (!db) return null;

    const stmt = db.prepare('SELECT * FROM player_flags WHERE guild_id = ? AND steam_id64 = ?');
    stmt.bind([guildId, steamId64]);

    const row = stmt.step() ? (stmt.getAsObject() as any as PlayerFlag) : null;
    stmt.free();

    // 'clean' e o estado implicito de quem nunca foi marcado
    if (row && !row.level) row.level = 'clean';
    return row;
}

/** Marcacoes de varios jogadores de uma vez, para nao consultar em loop. */
export function getFlagsFor(guildId: string, steamIds: string[]): Map<string, PlayerFlag> {
    const out = new Map<string, PlayerFlag>();
    if (!db || steamIds.length === 0) return out;

    const placeholders = steamIds.map(() => '?').join(',');
    const stmt = db.prepare(
        `SELECT * FROM player_flags
         WHERE guild_id = ? AND level != 'clean' AND steam_id64 IN (${placeholders})`
    );
    stmt.bind([guildId, ...steamIds]);

    while (stmt.step()) {
        const row = stmt.getAsObject() as any as PlayerFlag;
        out.set(row.steam_id64, row);
    }

    stmt.free();
    return out;
}

/** Todos os jogadores marcados (exclui 'clean'), do mais grave para o mais leve. */
export function getFlaggedPlayers(guildId: string): Array<PlayerFlag & { name: string; user_id: string | null }> {
    if (!db) return [];

    const stmt = db.prepare(`
        SELECT
            f.*,
            COALESCE(MAX(s.name), f.steam_id64) AS name,
            MAX(s.user_id) AS user_id
        FROM player_flags f
        LEFT JOIN demo_player_stats s
               ON s.guild_id = f.guild_id AND s.steam_id64 = f.steam_id64
        WHERE f.guild_id = ? AND f.level != 'clean'
        GROUP BY f.steam_id64
        ORDER BY
            CASE f.level
                WHEN 'banned' THEN 0
                WHEN 'confirmed' THEN 1
                WHEN 'suspect' THEN 2
                WHEN 'watching' THEN 3
                ELSE 4
            END,
            f.updated_at DESC
    `);
    stmt.bind([guildId]);

    const out: any[] = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return out;
}

export function getFlagHistory(guildId: string, steamId64: string, limit = 50): any[] {
    if (!db) return [];

    const stmt = db.prepare(
        `SELECT * FROM player_flag_history
         WHERE guild_id = ? AND steam_id64 = ?
         ORDER BY id DESC LIMIT ?`
    );
    stmt.bind([guildId, steamId64, limit]);

    const out: any[] = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return out;
}

/** Grava o novo nivel e registra a mudanca no historico. */
export function setPlayerFlag(
    guildId: string,
    steamId64: string,
    level: FlagLevel,
    reason: string,
    actorId: string,
    actorName: string,
    discordBan?: string | null
): PlayerFlag {
    if (!db) throw new Error('Database not initialized');

    const previous = getPlayerFlag(guildId, steamId64);

    db.run(
        `INSERT INTO player_flags (guild_id, steam_id64, level, reason, updated_by, updated_by_name, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(guild_id, steam_id64) DO UPDATE SET
            level = excluded.level,
            reason = excluded.reason,
            updated_by = excluded.updated_by,
            updated_by_name = excluded.updated_by_name,
            updated_at = excluded.updated_at`,
        [guildId, steamId64, level, reason, actorId, actorName]
    );

    db.run(
        `INSERT INTO player_flag_history
         (guild_id, steam_id64, level, previous_level, reason, actor_id, actor_name, discord_ban)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [guildId, steamId64, level, previous?.level ?? 'clean', reason, actorId, actorName, discordBan ?? null]
    );

    saveDatabase();
    return getPlayerFlag(guildId, steamId64)!;
}
