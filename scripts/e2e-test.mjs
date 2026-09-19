/**
 * Teste ponta a ponta: parser -> banco -> ranking.
 * Uso: node scripts/e2e-test.mjs <caminho-da-demo>
 */

import { parseDemo } from '../dist/demo/parser.js';
import {
    getDatabase,
    linkSteamId,
    importDemoMatch,
    getRankingByPeriod,
    getRecentDemoMatches,
    getPlayerDemoHistory,
    getPlayer,
    findDemoMatchByHash,
    getAllPlayers,
    getPlayerSummary,
    getPlayerRank,
} from '../dist/utils/database.js';

const GUILD = 'guild-teste';
const demoPath = process.argv[2];

const line = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);
let failures = 0;
const check = (label, ok, extra = '') => {
    console.log(`  ${ok ? '\x1b[32mOK  \x1b[0m' : '\x1b[31mFALHA\x1b[0m'} ${label}${extra ? ' — ' + extra : ''}`);
    if (!ok) failures++;
};

line('1. Banco');
await getDatabase();
check('migração aplicada sem erro', true);

line('2. Parse da demo');
const t0 = Date.now();
const demo = parseDemo(demoPath);
const secs = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`     mapa: ${demo.mapName} | placar: ${demo.scoreCt}-${demo.scoreT} | rounds: ${demo.rounds}`);
console.log(`     servidor: ${demo.serverName} | label: ${demo.matchLabel}`);
if (demo.warnings.length) console.log(`     avisos: ${demo.warnings.join(' | ')}`);

check('detectou como Xplay', demo.isXplay);
check('10 jogadores', demo.players.length === 10, `${demo.players.length}`);
check('placar coerente com rounds', demo.scoreCt + demo.scoreT === demo.rounds,
    `${demo.scoreCt}+${demo.scoreT} vs ${demo.rounds}`);

const totalK = demo.players.reduce((s, p) => s + p.kills, 0);
const totalD = demo.players.reduce((s, p) => s + p.deaths, 0);
check('soma de kills = soma de deaths', totalK === totalD, `${totalK} vs ${totalD}`);

const maxAdr = Math.max(...demo.players.map((p) => p.damage / p.rounds));
check('ADR máximo dentro do plausível (<200)', maxAdr < 200, maxAdr.toFixed(1));
check('nenhum ADR negativo', demo.players.every((p) => p.damage >= 0));
check('todos com SteamID64 válido', demo.players.every((p) => /^\d{17}$/.test(p.steamId64)));

const winners = demo.players.filter((p) => p.result === 'win');
check('5 vencedores e 5 perdedores', winners.length === 5, `${winners.length} vencedores`);
console.log(`     parse levou ${secs}s`);

line('3. Vínculo de Steam (2 dos 10 jogadores)');
const linked = demo.players.slice(0, 2);
linked.forEach((p, i) => linkSteamId(`discord-user-${i}`, GUILD, p.steamId64));
check('vinculou 2 contas', true, linked.map((p) => p.name).join(', '));

line('4. Importação');
const hash = 'hash-teste-' + Date.now();
const res = importDemoMatch({
    guildId: GUILD, demoHash: hash, fileName: 'xplay1.dem',
    mapName: demo.mapName, serverName: demo.serverName, matchLabel: demo.matchLabel,
    scoreCt: demo.scoreCt, scoreT: demo.scoreT, rounds: demo.rounds,
    winner: demo.winner, uploadedBy: 'discord-user-0', players: demo.players,
});
check('creditou exatamente os 2 vinculados', res.applied === 2, `applied=${res.applied}`);
check('listou os 8 sem vínculo', res.unlinked.length === 8, `${res.unlinked.length}`);

line('5. Deduplicação');
check('encontra a demo pelo hash', findDemoMatchByHash(GUILD, hash) === res.matchId);
let dupBlocked = false;
try {
    importDemoMatch({ guildId: GUILD, demoHash: hash, fileName: 'x', mapName: 'a', serverName: '',
        matchLabel: null, scoreCt: 0, scoreT: 0, rounds: 1, winner: 'CT', uploadedBy: null, players: [] });
} catch (e) { dupBlocked = e.message === 'DEMO_ALREADY_IMPORTED'; }
check('reimportar a mesma demo é bloqueado', dupBlocked);

line('6. Totais do jogador');
const p0 = getPlayer('discord-user-0', GUILD);
const src0 = demo.players.find((p) => p.steamId64 === linked[0].steamId64);
check('kills batem com a demo', p0.total_kills === src0.kills, `${p0.total_kills} vs ${src0.kills}`);
check('damage batem com a demo', p0.total_damage === src0.damage);
check('1 partida contabilizada', p0.matches_played === 1);

line('7. Backfill ao vincular depois');
const late = demo.players[5];
linkSteamId('discord-late', GUILD, late.steamId64);
const pLate = getPlayer('discord-late', GUILD);
check('stats retroativas aplicadas', pLate.total_kills === late.kills,
    `${pLate.total_kills} vs ${late.kills}`);
check('partida retroativa contada', pLate.matches_played === 1);

line('8. Ranking');
for (const period of ['week', 'biweek', 'month', 'all']) {
    const r = getRankingByPeriod(GUILD, period, 50);
    check(`período "${period}" retorna 10 jogadores`, r.length === 10, `${r.length}`);
}
const rank = getRankingByPeriod(GUILD, 'all', 50);
check('ordenado por ADR desc', rank.every((p, i) => i === 0 || rank[i - 1].adr >= p.adr));
check('ADR calculado corretamente', Math.abs(rank[0].adr - rank[0].damage / rank[0].rounds) < 0.01);
check('HS% entre 0 e 100', rank.every((p) => p.hsPercent >= 0 && p.hsPercent <= 100));

console.log('\n  Top 3 por ADR:');
rank.slice(0, 3).forEach((p, i) =>
    console.log(`    ${i + 1}. ${p.name.padEnd(22).slice(0, 22)} ADR ${p.adr.toFixed(1).padStart(6)}  K/D ${p.kd.toFixed(2)}  HS ${p.hsPercent.toFixed(0)}%`));

line('9. Perfis de jogador');
const all = getAllPlayers(GUILD, 500);
check('lista os 10 jogadores', all.length === 10, `${all.length}`);
check('ordenada por ADR desc', all.every((p, i) => i === 0 || all[i - 1].adr >= p.adr));
check('todos têm last_played', all.every((p) => !!p.last_played));

const top = demo.players[0];
const sum = getPlayerSummary(GUILD, top.steamId64);
check('perfil individual encontrado', !!sum);
check('kills do perfil batem com a demo', sum.kills === top.kills, `${sum.kills} vs ${top.kills}`);
check('ADR do perfil bate', Math.abs(sum.adr - top.damage / top.rounds) < 0.01);
check('winRate 0 ou 100 numa única partida', sum.winRate === 0 || sum.winRate === 100);
check('perfil inexistente retorna null', getPlayerSummary(GUILD, '76561190000000000') === null);

const pos = getPlayerRank(GUILD, top.steamId64);
check('rank dentro do total', pos.rank >= 1 && pos.rank <= pos.total, `#${pos.rank} de ${pos.total}`);
check('rank de quem não jogou é 0', getPlayerRank(GUILD, '76561190000000000').rank === 0);

line('10. Histórico e partidas');
check('partida aparece na listagem', getRecentDemoMatches(GUILD, 10).length >= 1);
const hist = getPlayerDemoHistory(GUILD, linked[0].steamId64, 10);
check('histórico do jogador retorna a partida', hist.length === 1);
check('histórico traz demo_match_id (link pro placar)', !!hist[0].demo_match_id);
check('histórico traz mapa e placar', hist[0].map_name === demo.mapName && hist[0].score_ct === demo.scoreCt);

console.log(failures === 0
    ? '\n\x1b[32m✓ Todos os testes passaram.\x1b[0m\n'
    : `\n\x1b[31m✗ ${failures} verificação(ões) falharam.\x1b[0m\n`);
process.exit(failures === 0 ? 0 : 1);
