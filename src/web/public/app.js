/* Auto Mix — front-end. Sem dependencias. */

const state = {
  session: { authenticated: false },
  period: 'biweek',
  players: [],
  lastView: 'ranking',
  isStaff: false,
  currentPlayer: null,
};

/* Rótulos das marcações. A cor é reforço — o texto sempre aparece junto. */
const FLAG_LABEL = {
  clean: 'Limpo',
  watching: 'Observando',
  suspect: 'Suspeito',
  confirmed: 'Confirmado',
  banned: 'Banido',
};

function flagBadge(flag) {
  if (!flag || !flag.level || flag.level === 'clean') return '';
  return `<span class="flag flag-${esc(flag.level)}"><span class="flag-dot"></span>${esc(FLAG_LABEL[flag.level] || flag.level)}</span>`;
}

/* Nomes vem de dentro da demo — conteudo que ninguem controla.
   Tudo passa por aqui antes de virar HTML. */
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

const $ = (sel) => document.querySelector(sel);
const fmt = (n, d = 0) => Number(n ?? 0).toFixed(d);

async function api(path, options) {
  const res = await fetch(path, { credentials: 'same-origin', ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  const mins = Math.floor((Date.now() - then.getTime()) / 60000);
  if (Number.isNaN(mins)) return '';
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins} min atrás`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h atrás`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ontem' : `${d} dias atrás`;
}

const kpiTile = (label, value, note) => `
  <div class="kpi">
    <div class="kpi-label">${esc(label)}</div>
    <div class="kpi-value">${esc(value)}</div>
    ${note ? `<div class="kpi-note">${esc(note)}</div>` : ''}
  </div>`;

/* ============================ Navegação ============================ */

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('is-active'));
  $(`#view-${name}`)?.classList.add('is-active');

  // "player" é uma tela de detalhe, não uma aba — nenhuma aba fica marcada.
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('is-active', t.dataset.view === name)
  );

  if (name !== 'player') state.lastView = name;

  if (name === 'staff') loadStaffFlags();
  if (name === 'jogadores') loadPlayers();
  if (name === 'partidas') loadMatches();
  if (name === 'enviar') loadJobs();
  if (name === 'perfil') loadOwnProfile();

  window.scrollTo({ top: 0 });
}

$('#tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (tab) showView(tab.dataset.view);
});

$('#player-back').addEventListener('click', () => showView(state.lastView));

/* ============================ Sessão ============================ */

async function loadSession() {
  try {
    state.session = await api('/api/session');
  } catch {
    state.session = { authenticated: false };
  }

  const box = $('#session');
  const authed = state.session.authenticated;
  const member = authed && state.session.user?.inGuild;

  if (!authed) {
    box.innerHTML = '<a class="btn btn-primary" href="/auth/login">Entrar com Discord</a>';
  } else {
    const u = state.session.user;
    box.innerHTML = `
      ${u.avatar ? `<img class="avatar" src="${esc(u.avatar)}" alt="">` : ''}
      <span class="small">${esc(u.username)}</span>
      <button class="btn btn-ghost small" id="logout">Sair</button>`;

    $('#logout').addEventListener('click', async () => {
      await api('/auth/logout', { method: 'POST' });
      location.reload();
    });
  }

  // Logado mas fora do servidor é um caso distinto de não estar logado.
  if (authed && !member) {
    $('#wall-text').textContent =
      'Sua conta do Discord não é membro do servidor. Entre no servidor e recarregue esta página.';
    $('#wall-btn').hidden = true;
  }

  state.isStaff = !!(member && state.session.isStaff);
  $('#tab-staff').hidden = !state.isStaff;

  $('#wall').hidden = !!member;
  $('#app').hidden = !member;
  $('#tabs').hidden = !member;

  return member;
}

/* ============================ Ranking ============================ */

$('#period').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;

  state.period = btn.dataset.period;
  document.querySelectorAll('#period button').forEach((b) =>
    b.classList.toggle('is-active', b === btn)
  );
  loadRanking();
});

async function loadRanking() {
  const body = $('#ranking-body');
  body.innerHTML = '<tr><td colspan="10" class="empty">Carregando…</td></tr>';

  let players = [];
  let matches = 0;
  let rounds = 0;
  try {
    ({ players, matches, rounds } = await api(`/api/ranking?period=${state.period}`));
  } catch (err) {
    body.innerHTML = `<tr><td colspan="10" class="empty">${esc(err.message)}</td></tr>`;
    return;
  }

  $('#ranking-empty').hidden = players.length > 0;
  renderKpis(players, matches, rounds);

  if (players.length === 0) {
    body.innerHTML = '';
    return;
  }

  const maxAdr = Math.max(...players.map((p) => p.adr), 1);

  body.innerHTML = players
    .map((p, i) => {
      const pos = i + 1;
      const linked = p.user_id
        ? '<span class="badge-link">vinculado</span>'
        : '<span class="badge-unlinked">sem Discord</span>';

      return `
      <tr class="clickable" data-steam="${esc(p.steam_id64)}">
        <td><span class="pos${pos <= 3 ? ' top' : ''}">${pos}</span></td>
        <td>
          <div class="player-cell">
            <span class="player-name">${esc(p.name)}</span>
            ${flagBadge(p.flag)}
            ${linked}
          </div>
        </td>
        <td class="num">
          <div class="adr-cell">
            <span class="adr-bar"><span class="adr-fill" style="width:${(p.adr / maxAdr) * 100}%"></span></span>
            <span class="strong">${fmt(p.adr, 1)}</span>
          </div>
        </td>
        <td class="num strong">${fmt(p.kd, 2)}</td>
        <td class="num">${p.kills}</td>
        <td class="num">${p.deaths}</td>
        <td class="num">${p.assists}</td>
        <td class="num">${fmt(p.hsPercent, 0)}%</td>
        <td class="num">${fmt(p.winRate, 0)}%</td>
        <td class="num">${p.matches}</td>
      </tr>`;
    })
    .join('');

  body.querySelectorAll('tr.clickable').forEach((tr) =>
    tr.addEventListener('click', () => openPlayer(tr.dataset.steam))
  );
}

function renderKpis(players, matches, rounds) {
  const box = $('#kpis');

  if (players.length === 0) {
    box.innerHTML = '';
    return;
  }

  const top = players[0];
  const bestKd = players.reduce((a, b) => (b.kd > a.kd ? b : a));

  box.innerHTML = [
    kpiTile('Jogadores', players.length, 'com partidas no período'),
    kpiTile('Partidas', matches, `${rounds} rounds jogados`),
    kpiTile('Maior ADR', fmt(top.adr, 1), top.name),
    kpiTile('Melhor K/D', fmt(bestKd.kd, 2), bestKd.name),
  ].join('');
}

/* ============================ Jogadores ============================ */

async function loadPlayers() {
  const grid = $('#player-grid');
  grid.innerHTML = '<p class="empty">Carregando…</p>';

  try {
    ({ players: state.players } = await api('/api/players'));
  } catch (err) {
    grid.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
    return;
  }

  renderPlayers();
}

function renderPlayers() {
  const grid = $('#player-grid');
  const term = $('#player-search').value.trim().toLowerCase();

  const list = term
    ? state.players.filter(
        (p) => p.name.toLowerCase().includes(term) || p.steam_id64.includes(term)
      )
    : state.players;

  $('#players-empty').hidden = list.length > 0;

  grid.innerHTML = list
    .map(
      (p) => `
    <button class="player-card" data-steam="${esc(p.steam_id64)}">
      <div class="pc-top">
        <span class="pc-name">${esc(p.name)}</span>
        ${flagBadge(p.flag)}
        ${p.user_id ? '<span class="badge-link">vinculado</span>' : ''}
      </div>
      <div class="pc-stats">
        <span class="pc-stat"><span class="pc-stat-label">ADR</span><span class="pc-stat-value">${fmt(p.adr, 1)}</span></span>
        <span class="pc-stat"><span class="pc-stat-label">K/D</span><span class="pc-stat-value">${fmt(p.kd, 2)}</span></span>
        <span class="pc-stat"><span class="pc-stat-label">Partidas</span><span class="pc-stat-value">${p.matches}</span></span>
      </div>
    </button>`
    )
    .join('');

  grid.querySelectorAll('.player-card').forEach((el) =>
    el.addEventListener('click', () => openPlayer(el.dataset.steam))
  );
}

$('#player-search').addEventListener('input', renderPlayers);

/* ============================ Perfil ============================ */

/** Monta a tela de perfil. Serve tanto pro próprio usuário quanto pros outros. */
function renderProfile(container, data, opts = {}) {
  const { summary, history, rank } = data;

  const resLabel = { win: 'Vitória', loss: 'Derrota', draw: 'Empate' };
  const resCls = { win: 'res-win', loss: 'res-loss', draw: 'res-draw' };

  const header = opts.showHeader
    ? `<div class="profile-head">
         <h1 class="profile-name">${esc(summary.name)}</h1>
         ${summary.user_id ? '<span class="badge-link">Discord vinculado</span>' : '<span class="badge-unlinked">sem Discord</span>'}
       </div>
       <p class="profile-sub">
         SteamID64 <code>${esc(summary.steam_id64)}</code>
         ${rank?.rank ? ` · #${rank.rank} de ${rank.total} no ranking geral` : ''}
         ${summary.last_played ? ` · última partida ${esc(timeAgo(summary.last_played))}` : ''}
       </p>`
    : '';

  const staffPanel = opts.staffPanel && state.isStaff ? renderStaffPanel(data) : '';

  container.innerHTML = `
    ${header}
    ${staffPanel}
    <div class="kpis">
      ${kpiTile('ADR', fmt(summary.adr, 1), `${summary.rounds} rounds`)}
      ${kpiTile('K/D', fmt(summary.kd, 2), `${summary.kills} / ${summary.deaths}`)}
      ${kpiTile('HS%', fmt(summary.hsPercent, 0) + '%', `${summary.headshots} de ${summary.kills} abates`)}
      ${kpiTile('Vitórias', `${summary.wins}/${summary.matches}`, fmt(summary.winRate, 0) + '% de aproveitamento')}
    </div>
    <div class="card"><div class="table-scroll"><table class="table">
      <thead><tr>
        <th>Mapa</th><th>Placar</th><th>Resultado</th>
        <th class="num">ADR</th><th class="num">K</th><th class="num">D</th>
        <th class="num">A</th><th class="num">HS%</th><th>Quando</th>
      </tr></thead>
      <tbody>${history
        .map(
          (h) => `
        <tr class="clickable" data-match="${h.demo_match_id}">
          <td>${esc(h.map_name)}</td>
          <td class="muted">${h.score_ct}:${h.score_t}</td>
          <td><span class="res ${resCls[h.result] || ''}">${esc(resLabel[h.result] || h.result)}</span></td>
          <td class="num strong">${fmt(h.rounds ? h.damage / h.rounds : 0, 1)}</td>
          <td class="num">${h.kills}</td>
          <td class="num">${h.deaths}</td>
          <td class="num">${h.assists}</td>
          <td class="num">${fmt(h.kills ? (h.headshots / h.kills) * 100 : 0, 0)}%</td>
          <td class="muted small">${esc(timeAgo(h.match_date))}</td>
        </tr>`
        )
        .join('')}</tbody>
    </table></div></div>`;

  container.querySelectorAll('tr.clickable').forEach((tr) =>
    tr.addEventListener('click', () => openMatch(tr.dataset.match))
  );

  if (staffPanel) wireStaffPanel(container, data);
}

/* ============================ Painel de staff ============================ */

function renderStaffPanel(data) {
  const flag = data.flag || { level: 'clean', reason: '', updated_by_name: null, updated_at: null };
  const hist = data.flagHistory || [];

  const options = Object.entries(FLAG_LABEL)
    .map(([v, label]) => `<option value="${v}"${v === flag.level ? ' selected' : ''}>${esc(label)}</option>`)
    .join('');

  const current =
    flag.level && flag.level !== 'clean'
      ? `Marcado como <strong>${esc(FLAG_LABEL[flag.level])}</strong>${flag.reason ? ` — ${esc(flag.reason)}` : ''}
         <span class="muted">(${esc(flag.updated_by_name || '?')}, ${esc(timeAgo(flag.updated_at))})</span>`
      : 'Sem marcação.';

  const history = hist.length
    ? `<div class="flag-hist">${hist
        .map(
          (h) => `<div class="flag-hist-item">
            ${esc(FLAG_LABEL[h.previous_level] || h.previous_level || '?')} &rarr; <strong>${esc(FLAG_LABEL[h.level] || h.level)}</strong>
            ${h.reason ? ` — ${esc(h.reason)}` : ''}
            <span class="muted">· ${esc(h.actor_name || '?')}, ${esc(timeAgo(h.created_at))}${h.discord_ban ? ` · Discord: ${esc(h.discord_ban)}` : ''}</span>
          </div>`
        )
        .join('')}</div>`
    : '';

  return `
    <div class="staff-panel">
      <div class="staff-panel-head">
        <span class="staff-panel-title">VISÍVEL SÓ PARA STAFF</span>
        ${flagBadge(flag)}
      </div>
      <p class="flag-current">${current}</p>
      <div class="flag-form">
        <select class="flag-select" id="flag-level">${options}</select>
        <input class="flag-reason" id="flag-reason" type="text" maxlength="500"
               placeholder="Motivo (obrigatório)" value="${esc(flag.reason || '')}">
        <button class="btn" id="flag-save">Salvar</button>
      </div>
      <p class="warn" id="flag-msg" hidden></p>
      ${history}
    </div>`;
}

function wireStaffPanel(container, data) {
  const select = container.querySelector('#flag-level');
  const reason = container.querySelector('#flag-reason');
  const save = container.querySelector('#flag-save');
  const msg = container.querySelector('#flag-msg');

  let armed = false;

  const refreshButton = () => {
    const banning = select.value === 'banned';
    save.className = banning ? 'btn btn-danger' : 'btn';
    save.textContent = banning ? (armed ? 'Confirmar banimento' : 'Banir') : 'Salvar';
  };

  select.addEventListener('change', () => { armed = false; refreshButton(); });
  refreshButton();

  save.addEventListener('click', async () => {
    const level = select.value;
    const text = reason.value.trim();

    if (level !== 'clean' && text.length < 3) {
      msg.hidden = false;
      msg.textContent = 'Escreva um motivo antes de salvar.';
      return;
    }

    // Banir tira a pessoa do Discord também — exige um segundo clique.
    if (level === 'banned' && !armed) {
      armed = true;
      refreshButton();
      msg.hidden = false;
      msg.textContent = 'Isso bane o jogador no site E no servidor do Discord. Clique de novo para confirmar.';
      return;
    }

    save.disabled = true;
    save.textContent = 'Salvando…';

    try {
      const res = await api(`/api/staff/player/${data.summary.steam_id64}/flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, reason: text }),
      });

      // Recarrega o perfil pra refletir marcação e histórico novos.
      await openPlayer(data.summary.steam_id64);

      if (res.warning) {
        const box = $('#player-detail').querySelector('#flag-msg');
        if (box) { box.hidden = false; box.textContent = res.warning; }
      }
    } catch (err) {
      save.disabled = false;
      refreshButton();
      msg.hidden = false;
      msg.textContent = err.message;
    }
  });
}

/* ============================ Aba Staff ============================ */

async function loadStaffFlags() {
  const box = $('#staff-list');
  box.innerHTML = '<p class="empty">Carregando…</p>';

  let players = [];
  try {
    ({ players } = await api('/api/staff/flags'));
  } catch (err) {
    box.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
    return;
  }

  $('#staff-empty').hidden = players.length > 0;

  box.innerHTML = players
    .map(
      (p) => `
    <div class="staff-row" data-steam="${esc(p.steam_id64)}">
      <span class="staff-row-name">${esc(p.name)}</span>
      ${flagBadge(p)}
      <span class="staff-row-reason">${esc(p.reason || '')}</span>
      <span class="staff-row-meta">${esc(p.updated_by_name || '?')}<br>${esc(timeAgo(p.updated_at))}</span>
    </div>`
    )
    .join('');

  box.querySelectorAll('.staff-row').forEach((el) =>
    el.addEventListener('click', () => openPlayer(el.dataset.steam))
  );
}

async function openPlayer(steamId) {
  const box = $('#player-detail');
  box.innerHTML = '<p class="empty">Carregando…</p>';
  $('#modal').hidden = true;
  showView('player');

  try {
    const data = await api(`/api/player/${steamId}`);
    state.currentPlayer = steamId;
    renderProfile(box, data, { showHeader: true, staffPanel: true });
  } catch (err) {
    box.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
  }
}

async function loadOwnProfile() {
  const box = $('#profile');

  if (!state.session.steamId) {
    box.innerHTML = `<div class="gate">
      <p>Você ainda não vinculou sua Steam.</p>
      <p class="muted small">No Discord, rode <code>/steam vincular</code> com o link do seu perfil.</p></div>`;
    return;
  }

  box.innerHTML = '<p class="empty">Carregando…</p>';

  try {
    const data = await api(`/api/player/${state.session.steamId}`);
    renderProfile(box, data, { showHeader: false });
  } catch (err) {
    box.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
  }
}

/* ============================ Partidas ============================ */

async function loadMatches() {
  const box = $('#matches');
  box.innerHTML = '<p class="empty">Carregando…</p>';

  let matches = [];
  try {
    ({ matches } = await api('/api/matches'));
  } catch (err) {
    box.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
    return;
  }

  $('#matches-empty').hidden = matches.length > 0;

  box.innerHTML = matches
    .map(
      (m) => `
    <div class="match" data-id="${m.id}">
      <span class="match-map">${esc(m.map_name)}</span>
      <span class="match-score">
        <span class="score-ct">${m.score_ct}</span><span class="score-sep">:</span><span class="score-t">${m.score_t}</span>
      </span>
      <span class="pill">${m.rounds} rounds</span>
      ${m.match_label ? `<span class="pill">${esc(m.match_label)}</span>` : ''}
      <span class="match-meta">${esc(timeAgo(m.created_at))}</span>
    </div>`
    )
    .join('');

  box.querySelectorAll('.match').forEach((el) =>
    el.addEventListener('click', () => openMatch(el.dataset.id))
  );
}

async function openMatch(id) {
  const content = $('#modal-content');
  content.innerHTML = '<p class="empty">Carregando…</p>';
  $('#modal').hidden = false;

  let data;
  try {
    data = await api(`/api/matches/${id}`);
  } catch (err) {
    content.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
    return;
  }

  const { match, players } = data;
  const ct = players.filter((p) => p.team === 3);
  const t = players.filter((p) => p.team === 2);

  const rows = (list) =>
    list
      .map(
        (p) => `
    <tr>
      <td><button class="link-name" data-steam="${esc(p.steam_id64)}">${esc(p.name)}</button></td>
      <td class="num strong">${fmt(p.rounds ? p.damage / p.rounds : 0, 1)}</td>
      <td class="num strong">${fmt(p.deaths ? p.kills / p.deaths : p.kills, 2)}</td>
      <td class="num">${p.kills}</td>
      <td class="num">${p.deaths}</td>
      <td class="num">${p.assists}</td>
      <td class="num">${fmt(p.kills ? (p.headshots / p.kills) * 100 : 0, 0)}%</td>
    </tr>`
      )
      .join('');

  const head = `
    <thead><tr>
      <th>Jogador</th><th class="num">ADR</th><th class="num">K/D</th>
      <th class="num">K</th><th class="num">D</th><th class="num">A</th><th class="num">HS%</th>
    </tr></thead>`;

  const side = (label, score, cls, list) => `
    <div class="team-head">
      <span class="${cls}">${esc(label)}</span>
      <span class="pill">${score} rounds</span>
    </div>
    <div class="card"><div class="table-scroll"><table class="table">${head}<tbody>${rows(list)}</tbody></table></div></div>`;

  // O match_label costuma ser um pedaço do server_name — não repete.
  const server = match?.server_name ?? '';
  const label = match?.match_label && !server.includes(match.match_label) ? ` · ${match.match_label}` : '';

  content.innerHTML = `
    <h2>${esc(match?.map_name ?? 'Partida')} — ${match?.score_ct ?? 0} : ${match?.score_t ?? 0}</h2>
    <p class="sub">${esc(server)}${esc(label)}</p>
    ${side('Counter-Terrorists', match?.score_ct ?? 0, 'score-ct', ct)}
    ${side('Terrorists', match?.score_t ?? 0, 'score-t', t)}`;

  content.querySelectorAll('.link-name').forEach((btn) =>
    btn.addEventListener('click', () => openPlayer(btn.dataset.steam))
  );
}

$('#modal-close').addEventListener('click', () => ($('#modal').hidden = true));
$('#modal').addEventListener('click', (e) => {
  if (e.target === $('#modal')) $('#modal').hidden = true;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $('#modal').hidden = true;
});

/* ============================ Envio de demo ============================ */

const dropzone = $('#dropzone');
const fileInput = $('#file-input');

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});

['dragenter', 'dragover'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('is-over'); })
);
['dragleave', 'drop'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('is-over'); })
);

dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files?.[0];
  if (file) uploadDemo(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files?.[0]) uploadDemo(fileInput.files[0]);
});

function setStatus({ name, state: label, percent, detail, variant }) {
  $('#upload-status').hidden = false;
  if (name !== undefined) $('#us-name').textContent = name;
  if (label !== undefined) $('#us-state').textContent = label;
  if (detail !== undefined) $('#us-detail').textContent = detail;

  const bar = $('#us-bar');
  if (percent !== undefined) bar.style.width = `${percent}%`;
  bar.className = `progress-fill${variant ? ' ' + variant : ''}`;
}

function uploadDemo(file) {
  if (!file.name.toLowerCase().endsWith('.dem')) {
    setStatus({ name: file.name, state: 'Recusado', percent: 100, variant: 'error',
      detail: 'Só arquivos .dem são aceitos.' });
    return;
  }

  const mb = (file.size / 1048576).toFixed(0);
  setStatus({ name: file.name, state: 'Enviando…', percent: 0, variant: '', detail: `${mb} MB` });

  const form = new FormData();
  form.append('demo', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/demos');
  xhr.withCredentials = true;

  xhr.upload.addEventListener('progress', (e) => {
    if (!e.lengthComputable) return;
    const pct = (e.loaded / e.total) * 100;
    setStatus({ percent: pct, state: `Enviando… ${pct.toFixed(0)}%` });
  });

  xhr.addEventListener('load', () => {
    let data = {};
    try { data = JSON.parse(xhr.responseText); } catch {}

    if (xhr.status !== 202) {
      setStatus({ state: 'Falhou', percent: 100, variant: 'error',
        detail: data.error || `Erro ${xhr.status}` });
      return;
    }

    setStatus({ state: 'Processando…', percent: 100,
      detail: 'Lendo o placar e as estatísticas da demo. Leva alguns segundos.' });
    pollJob(data.jobId);
  });

  xhr.addEventListener('error', () =>
    setStatus({ state: 'Falhou', percent: 100, variant: 'error', detail: 'Erro de rede no envio.' })
  );

  xhr.send(form);
}

function pollJob(jobId) {
  let tries = 0;

  const tick = async () => {
    tries++;
    if (tries > 150) {
      setStatus({ state: 'Sem resposta', variant: 'error',
        detail: 'O processamento demorou demais. Confira a lista de envios.' });
      return;
    }

    let job;
    try {
      ({ job } = await api(`/api/demos/jobs/${jobId}`));
    } catch {
      setTimeout(tick, 2000);
      return;
    }

    if (job.status === 'done') {
      setStatus({ state: 'Pronto', variant: 'done',
        detail: 'Estatísticas creditadas. O ranking já está atualizado.' });
      loadJobs();
      loadRanking();
      return;
    }

    if (job.status === 'failed') {
      setStatus({ state: 'Falhou', variant: 'error', detail: job.error || 'Erro ao processar.' });
      loadJobs();
      return;
    }

    setTimeout(tick, 2000);
  };

  setTimeout(tick, 1500);
}

async function loadJobs() {
  let jobs = [];
  try {
    ({ jobs } = await api('/api/demos/jobs'));
  } catch {
    return;
  }

  $('#jobs-empty').hidden = jobs.length > 0;

  const label = {
    pending: 'Na fila', processing: 'Processando', done: 'Pronto', failed: 'Falhou',
  };
  const cls = { done: 'res-win', failed: 'res-loss' };

  $('#jobs-body').innerHTML = jobs
    .map(
      (j) => `
    <tr>
      <td>${esc(j.file_name)}</td>
      <td>
        <span class="res ${cls[j.status] || 'res-draw'}">${esc(label[j.status] || j.status)}</span>
        ${j.error ? `<div class="muted small">${esc(j.error)}</div>` : ''}
      </td>
      <td class="muted small">${esc(timeAgo(j.created_at))}</td>
    </tr>`
    )
    .join('');
}

/* ============================ Início ============================ */

(async function init() {
  const member = await loadSession();
  if (member) await loadRanking();
})();
