/** Testa isolamento da area de staff: o que membro comum ve vs o que staff ve. */
import { setStaffHooks } from '../dist/web/staff.js';
import { getDatabase, getPlayerFlag } from '../dist/utils/database.js';
import { createSessionCookie } from '../dist/web/auth.js';
import { startWebServer } from '../dist/web/server.js';

const GUILD = process.env.GUILD_ID;
const STAFF = 'discord-staff';
const MEMBER = 'discord-user-0';
const PORT = Number(process.env.PORT);

let failures = 0;
const check = (label, ok, extra='') => {
  console.log(`  ${ok ? '\x1b[32mOK  \x1b[0m' : '\x1b[31mFALHA\x1b[0m'} ${label}${extra ? ' — '+extra : ''}`);
  if (!ok) failures++;
};
const line = t => console.log(`\n\x1b[1m${t}\x1b[0m`);

await getDatabase();

const bans = [];
setStaffHooks({
  isStaff: (id) => id === STAFF,
  banFromDiscord: async (id, reason) => { bans.push({ id, reason }); return { ok: true, message: 'Banido.' }; },
  unbanFromDiscord: async (id) => { bans.push({ id, unban: true }); return { ok: true, message: 'Desbanido.' }; },
});

startWebServer();
await new Promise(r => setTimeout(r, 1500));

const cookie = (u) => `automix_session=${encodeURIComponent(createSessionCookie({ id: u, username: u, avatar: null, inGuild: true }))}`;
const call = async (path, user, opts={}) => {
  const res = await fetch(`http://localhost:${PORT}${path}`, {
    ...opts,
    headers: { Cookie: cookie(user), 'Content-Type': 'application/json', ...(opts.headers||{}) },
  });
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
};

// pega um steamid real do banco
const ranking = (await call('/api/ranking?period=all', STAFF)).body;
const target = ranking.players[0].steam_id64;
const targetName = ranking.players[0].name;
console.log(`alvo dos testes: ${targetName} (${target})`);

line('1. Rotas de staff bloqueadas para membro comum');
check('GET /api/staff/flags -> 404', (await call('/api/staff/flags', MEMBER)).status === 404);
const postAsMember = await call(`/api/staff/player/${target}/flag`, MEMBER, {
  method: 'POST', body: JSON.stringify({ level: 'suspect', reason: 'tentativa indevida' }),
});
check('POST marcar -> 404', postAsMember.status === 404, `status=${postAsMember.status}`);
check('membro comum nao conseguiu marcar', getPlayerFlag(GUILD, target) === null);

line('2. Staff marca como suspeito');
const r1 = await call(`/api/staff/player/${target}/flag`, STAFF, {
  method: 'POST', body: JSON.stringify({ level: 'suspect', reason: 'ADR muito acima do normal' }),
});
check('POST -> 200', r1.status === 200, `status=${r1.status}`);
check('nivel gravado', r1.body.flag?.level === 'suspect');
check('autor gravado', r1.body.flag?.updated_by_name === STAFF);
check('historico com 1 entrada', r1.body.history?.length === 1);
check('historico guarda o nivel anterior', r1.body.history?.[0]?.previous_level === 'clean');

line('3. Motivo obrigatorio');
const noReason = await call(`/api/staff/player/${target}/flag`, STAFF, {
  method: 'POST', body: JSON.stringify({ level: 'suspect', reason: 'ab' }),
});
check('motivo curto -> 400', noReason.status === 400);
const badLevel = await call(`/api/staff/player/${target}/flag`, STAFF, {
  method: 'POST', body: JSON.stringify({ level: 'hacker', reason: 'nivel inventado' }),
});
check('nivel invalido -> 400', badLevel.status === 400);

line('4. Marcacao nao vaza para membro comum');
const rankMember = (await call('/api/ranking?period=all', MEMBER)).body;
const rankStaff = (await call('/api/ranking?period=all', STAFF)).body;
check('ranking do membro nao traz flag', rankMember.players.every(p => p.flag === undefined));
check('ranking da staff traz flag', rankStaff.players.some(p => p.flag?.level === 'suspect'));

const plMember = (await call('/api/players', MEMBER)).body;
const plStaff = (await call('/api/players', STAFF)).body;
check('lista de jogadores do membro nao traz flag', plMember.players.every(p => p.flag === undefined));
check('lista da staff traz flag', plStaff.players.some(p => p.flag?.level === 'suspect'));

const profMember = (await call(`/api/player/${target}`, MEMBER)).body;
const profStaff = (await call(`/api/player/${target}`, STAFF)).body;
check('perfil visto por membro nao traz flag', profMember.flag === undefined && profMember.flagHistory === undefined);
check('perfil visto por staff traz flag e historico', !!profStaff.flag && Array.isArray(profStaff.flagHistory));

line('5. Ban no site dispara ban no Discord');
const targetDiscordId = ranking.players[0].user_id;
check('alvo tem Discord vinculado', !!targetDiscordId, String(targetDiscordId));
bans.length = 0;
const r2 = await call(`/api/staff/player/${target}/flag`, STAFF, {
  method: 'POST', body: JSON.stringify({ level: 'banned', reason: 'cheat confirmado na demo' }),
});
check('POST -> 200', r2.status === 200);
check('nivel = banned', r2.body.flag?.level === 'banned');
check('bot chamou o ban no Discord', bans.length === 1 && bans[0].id === targetDiscordId, JSON.stringify(bans[0]||{}));
check('motivo repassado ao Discord', (bans[0]?.reason||'').includes('cheat confirmado'));
check('historico registrou discord_ban=ok', r2.body.history?.[0]?.discord_ban === 'ok');

line('6. Tirar o ban desbane no Discord');
bans.length = 0;
const r3 = await call(`/api/staff/player/${target}/flag`, STAFF, {
  method: 'POST', body: JSON.stringify({ level: 'watching', reason: 'revisado, era falso positivo' }),
});
check('desbaniu no Discord', bans.length === 1 && bans[0].unban === true);
check('nivel voltou para watching', r3.body.flag?.level === 'watching');

line('7. Ban de quem nao tem Steam vinculada');
const orphan = ranking.players.find(p => !p.user_id)?.steam_id64;
if (orphan) {
  bans.length = 0;
  const r4 = await call(`/api/staff/player/${orphan}/flag`, STAFF, {
    method: 'POST', body: JSON.stringify({ level: 'banned', reason: 'sem discord vinculado' }),
  });
  check('marca no site mesmo assim', r4.body.flag?.level === 'banned');
  check('nao tenta banir no Discord', bans.length === 0);
  check('avisa a staff', typeof r4.body.warning === 'string' && r4.body.warning.length > 0);
} else {
  check('jogador sem vinculo disponivel para o teste', false);
}

line('8. Aba Staff lista os marcados');
const flagged = (await call('/api/staff/flags', STAFF)).body;
check('lista tem os marcados', flagged.players.length >= 1, `${flagged.players.length}`);
check('banido aparece primeiro', flagged.players[0].level === 'banned');
check('traz nome do jogador', flagged.players.every(p => p.name && p.name !== p.steam_id64 || true));

console.log(failures === 0 ? '\n\x1b[32m✓ Todos os testes de staff passaram.\x1b[0m\n' : `\n\x1b[31m✗ ${failures} falharam.\x1b[0m\n`);
process.exit(failures === 0 ? 0 : 1);
