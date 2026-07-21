// Lista de nomes de times profissionais de CS para sortear os nomes das calls
export const TEAM_NAMES: string[] = [
    'NAVI',
    'FaZe',
    'Vitality',
    'G2',
    'Cloud9',
    'MOUZ',
    'Heroic',
    'ENCE',
    'Complexity',
    'Liquid',
    'Astralis',
    'fnatic',
    'NIP',
    'BIG',
    'Imperial',
    'FURIA',
    'paiN',
    'MIBR',
    'Sharks',
    'RED Canids',
    'Eternal Fire',
    'Spirit',
    'Falcons',
    'Monte',
    '9z',
    'The Mongolz',
    'GamerLegion',
    'Apeks',
    'SK-Gaming',
];

// Map pool competitivo atual do CS2
export const MAP_POOL: string[] = [
    'Anubis',
    'Overpass',
    'Inferno',
    'Mirage',
    'Dust 2',
    'Nuke',
    'Ancient',
];

/**
 * Sorteia dois nomes de times sem repetir.
 */
export function pickTwoTeamNames(): [string, string] {
    const shuffled = [...TEAM_NAMES].sort(() => Math.random() - 0.5);
    return [shuffled[0], shuffled[1]];
}

/**
 * Divide um array de membros em dois times de forma aleatoria.
 */
export function shuffleAndSplit<T>(members: T[], maxPerTeam = 5): [T[], T[]] {
    const shuffled = [...members].sort(() => Math.random() - 0.5);
    const teamA = shuffled.slice(0, maxPerTeam);
    const teamB = shuffled.slice(maxPerTeam, maxPerTeam * 2);
    return [teamA, teamB];
}

/**
 * Escolhe um capitao aleatorio de um time.
 */
export function pickRandomCaptain<T>(team: T[]): T {
    return team[Math.floor(Math.random() * team.length)];
}
