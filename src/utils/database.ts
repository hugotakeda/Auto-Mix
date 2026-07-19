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

export function addPlayerStats(userId: string, guildId: string, kills: number, deaths: number): PlayerData {
    if (!db) throw new Error('Database not initialized');

    upsertPlayer(userId, guildId);

    db.run(
        `UPDATE players
         SET total_kills = total_kills + ?,
             total_deaths = total_deaths + ?,
             matches_played = matches_played + 1
         WHERE user_id = ? AND guild_id = ?`,
        [kills, deaths, userId, guildId]
    );

    db.run(
        `INSERT INTO player_match_stats (user_id, guild_id, kills, deaths)
         VALUES (?, ?, ?, ?)`,
        [userId, guildId, kills, deaths]
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
