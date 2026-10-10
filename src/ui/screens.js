// Title, results, upgrade picker, pause and error screens. Plain DOM, built once, shown and hidden.
import { STAGES } from '../config.js';
import { STR, ordinal, fmtTime } from '../strings.js';

const css = c => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(label, cls, onClick) {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export function createScreens(handlers) {
  const root = document.getElementById('screens');
  let selected = 0;
  let records = {};
  let cupBest = { heats: 0, final: 0 };
  let survivalBest = { laps: 0, kills: 0 };
  let muted = false;
  let ambience = true;

  // ----- title -----
  const title = el('div', 'screen');
  const card = el('div', 'screen-card');
  const logo = el('h1', 'logo');
  logo.append('Raindrop ', Object.assign(el('span'), { textContent: 'Derby' }));
  const tag = el('p', 'tag', STR.tagline);
  const goRow = el('div', 'go-row');
  const playCup = button(STR.playCup, 'btn', () => handlers.onPlayCup());
  const playSurvival = button(STR.playSurvival, 'btn alt', () => handlers.onPlaySurvival());
  const soundBtn = button('', 'btn ghost', () => handlers.onToggleSound());
  const rainBtn = button('', 'btn ghost', () => handlers.onToggleAmbience());
  const modeLines = el('div', 'mode-lines');
  const cupLine = el('span', 'cup-line');
  const survLine = el('span', 'cup-line');
  modeLines.append(cupLine, survLine);
  const optRow = el('div', 'go-row');
  optRow.append(soundBtn, rainBtn);
  goRow.append(playCup, playSurvival, modeLines);
  const pickRow = el('div', 'pick-title', STR.pickStage);
  const stagesRow = el('div', 'stages');
  const cards = STAGES.map((s, i) => {
    const b = el('button', 'stage-card');
    b.type = 'button';
    b.append(el('h3', '', `${i + 1}. ${s.name}`), el('p', '', s.blurb));
    const meta = el('div', 'meta');
    b.append(meta);
    b.addEventListener('click', () => {
      select(i);
      handlers.onPractice(i);
    });
    stagesRow.appendChild(b);
    return { b, meta };
  });
  const how = el('ul', 'how');
  for (const [k, v] of STR.how) {
    const li = el('li');
    li.append(el('b', '', k), v);
    how.appendChild(li);
  }
  const keys = el('div', 'keys', STR.keys);
  card.append(logo, tag, goRow, pickRow, stagesRow, how, optRow, keys);
  title.appendChild(card);

  function cupText() {
    if (cupBest.final === 1) return STR.cupBest.champion;
    if (cupBest.final > 0) return STR.cupBest.podium(cupBest.final);
    if (cupBest.heats > 0) return STR.cupBest.heats(cupBest.heats);
    return STR.cupBest.none;
  }
  function refreshCards() {
    cards.forEach((c, i) => {
      c.b.classList.toggle('on', i === selected);
      const r = records[STAGES[i].id];
      const dots = '●'.repeat(STAGES[i].difficulty) + '○'.repeat(3 - STAGES[i].difficulty);
      c.meta.textContent = '';
      c.meta.append(Object.assign(el('span', 'drops'), { textContent: dots }));
      c.meta.append('  ' + (r ? `${STR.best} ${fmtTime(r.time)} · ${ordinal(r.place)}` : STR.noRecord));
    });
    cupLine.textContent = cupText();
    survLine.textContent = survivalBest.laps > 0 ? STR.survivalBest.best(survivalBest.laps, survivalBest.kills) : STR.survivalBest.none;
  }
  function select(i) {
    selected = i;
    refreshCards();
  }
  function refreshSound() {
    soundBtn.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
    rainBtn.textContent = ambience ? STR.ambienceOn : STR.ambienceOff;
  }

  // ----- result (heat result, cup result, practice result) -----
  const result = el('div', 'screen');
  const rcard = el('div', 'screen-card');
  result.appendChild(rcard);

  // ----- upgrade picker -----
  const upgrade = el('div', 'screen');
  const ucard = el('div', 'screen-card');
  upgrade.appendChild(ucard);

  // ----- pause -----
  const pause = el('div', 'screen');
  const pcard = el('div', 'screen-card pause-card');
  const pauseRow = el('div', 'go-row center');
  const resumeBtn = button(STR.resumeButton, 'btn', () => handlers.onResume());
  const quitBtn = button(STR.quitToMenu, 'btn ghost', () => handlers.onQuit());
  pauseRow.append(resumeBtn, quitBtn);
  pcard.append(el('h2', '', STR.pause), el('p', '', STR.resume), pauseRow);
  pause.appendChild(pcard);

  // ----- error -----
  const error = el('div', 'screen');
  const ecard = el('div', 'screen-card pause-card');
  error.appendChild(ecard);

  for (const s of [title, result, upgrade, pause, error]) {
    s.classList.add('hidden');
    root.appendChild(s);
  }

  return {
    get selected() {
      return selected;
    },
    select,
    setRecords(r, cup, survival) {
      records = r;
      if (cup) cupBest = cup;
      if (survival) survivalBest = survival;
      refreshCards();
    },
    setMuted(m) {
      muted = m;
      refreshSound();
    },
    setAmbience(on) {
      ambience = on;
      refreshSound();
    },
    showTitle() {
      refreshCards();
      refreshSound();
      title.classList.remove('hidden');
      playCup.focus({ preventScroll: true });
    },
    hideTitle() {
      title.classList.add('hidden');
    },
    // info: { big, sub, stats: [{label, value, isNew}], note, standings, actions: [{label, primary, run}] }
    showResult(info) {
      rcard.textContent = '';
      rcard.append(el('h2', 'result-big', info.big), el('p', 'result-sub', info.sub));
      const stats = el('div', 'stats');
      for (const s of info.stats || []) {
        const box = el('div', 'stat' + (s.isNew ? ' new' : ''));
        box.append(el('small', '', s.label), el('b', '', s.value));
        stats.appendChild(box);
      }
      if (stats.children.length) rcard.appendChild(stats);
      if (info.note) rcard.appendChild(el('p', 'result-sub', info.note));
      const list = el('ul', 'result-list');
      (info.standings || []).forEach((d, i) => {
        const li = el('li', d.isPlayer ? 'me' : '');
        const dot = el('span', 'dot');
        dot.style.background = css(d.color);
        const tail = d.wiped ? STR.wipedTag : d.cut ? STR.behind : d.finished ? fmtTime(d.finishTime) : STR.stillGoing;
        li.append(dot, `${i + 1}. ${d.name}`, `  ${tail}`);
        list.appendChild(li);
      });
      rcard.appendChild(list);
      const row = el('div', 'go-row');
      let first = null;
      for (const a of info.actions || []) {
        const b = button(a.label, a.primary ? 'btn' : 'btn ghost', a.run);
        if (!first) first = b;
        row.appendChild(b);
      }
      rcard.appendChild(row);
      result.classList.remove('hidden');
      if (first) first.focus({ preventScroll: true });
    },
    hideResult() {
      result.classList.add('hidden');
    },
    showUpgrade(choices, owned, onPick) {
      ucard.textContent = '';
      ucard.append(el('h2', 'result-big small', STR.upgradeTitle), el('p', 'result-sub', STR.upgradeSub));
      const grid = el('div', 'stages');
      let first = null;
      for (const u of choices) {
        const b = el('button', 'stage-card up');
        b.type = 'button';
        b.append(el('h3', '', u.name), el('p', '', u.desc));
        b.addEventListener('click', () => onPick(u));
        grid.appendChild(b);
        if (!first) first = b;
      }
      ucard.appendChild(grid);
      if (owned.length) {
        const have = el('p', 'keys');
        have.textContent = `${STR.yourUpgrades}: ${owned.map(o => o.name).join(' · ')}`;
        ucard.appendChild(have);
      }
      upgrade.classList.remove('hidden');
      if (first) first.focus({ preventScroll: true });
    },
    hideUpgrade() {
      upgrade.classList.add('hidden');
    },
    showPause(on) {
      pause.classList.toggle('hidden', !on);
      if (on) resumeBtn.focus({ preventScroll: true });
    },
    showError(msg) {
      ecard.textContent = '';
      ecard.append(el('h2', '', 'Oops'), el('p', '', msg));
      error.classList.remove('hidden');
    },
  };
}
