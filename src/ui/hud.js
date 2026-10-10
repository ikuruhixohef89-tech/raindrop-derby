// In-race overlay. Touches the DOM only when a value actually changed.
import { H } from '../config.js';
import { STR, ordinal, fmtTime } from '../strings.js';
import { UPGRADES } from '../sim/upgrades.js';

const $ = id => document.getElementById(id);
const css = c => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;

export function createHud() {
  const root = $('hud');
  const els = {
    standings: $('standings'),
    place: $('hudPlace'),
    time: $('hudTime'),
    stage: $('hudStage'),
    massBar: $('massBar'),
    clingBar: $('clingBar'),
    banner: $('banner'),
    countdown: $('countdown'),
    hint: $('hint'),
    lives: $('lives'),
    chain: $('chain'),
    chainN: $('chainN'),
    chainBar: $('chainBar'),
    ups: $('ups'),
  };
  $('massLabel').textContent = STR.mass;
  $('clingLabel').textContent = STR.cling;
  $('tCling').textContent = STR.touchCling;
  $('tLeft').textContent = STR.touchLeft;
  $('tRight').textContent = STR.touchRight;

  let rows = [];
  const cache = { place: '', time: '', mass: -1, cling: -1, low: null, chain: 0, chainBar: -1 };
  let bannerTimer = 0;
  let hintTimer = 0;

  function build(drops) {
    els.standings.textContent = '';
    rows = drops.map(d => {
      if (d.out) return null; // not in this lap
      const row = document.createElement('div');
      row.className = 'row' + (d.isPlayer ? ' me' : '');
      row.style.color = css(d.color);
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = css(d.color);
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = d.name;
      nm.style.color = d.isPlayer ? '' : 'var(--ink)';
      const pg = document.createElement('span');
      pg.className = 'pg';
      const bar = document.createElement('i');
      pg.appendChild(bar);
      row.append(dot, nm, pg);
      els.standings.appendChild(row);
      return { row, bar, id: d.id, order: -1, width: -1, dead: false };
    });
  }

  return {
    // heatLabel: e.g. "Heat 2 of 6 · City Drive"; upgrades: ids the player owns; lives: { now, max } in survival.
    show(world, heatLabel, upgrades, lives) {
      root.classList.remove('hidden');
      els.stage.textContent = heatLabel || world.stage.name;
      build(world.drops);
      els.lives.textContent = '';
      if (lives) {
        els.lives.append(STR.lives + ' ');
        for (let i = 0; i < lives.max; i++) {
          const pip = document.createElement('span');
          pip.className = 'life' + (i < lives.now ? '' : ' gone');
          els.lives.appendChild(pip);
        }
      }
      els.ups.textContent = '';
      for (const id of upgrades || []) {
        const u = UPGRADES.find(x => x.id === id);
        if (!u) continue;
        const chip = document.createElement('span');
        chip.className = 'up-chip';
        chip.textContent = u.name;
        els.ups.appendChild(chip);
      }
      cache.place = cache.time = '';
      cache.mass = cache.cling = -1;
      cache.chain = 0;
      els.chain.classList.remove('on');
    },
    hide() {
      root.classList.add('hidden');
    },
    update(world) {
      const me = world.drops[0];
      const place = world.standings.indexOf(me) + 1;
      const ps = ordinal(place);
      if (ps !== cache.place) {
        cache.place = ps;
        els.place.textContent = ps;
      }
      const shown = world.phase === 'grid' ? 0 : me.finished && me.finishTime !== null ? me.finishTime : world.raceTime;
      // Alone on the glass the clock is the wiper: show the time against the par.
      const ts = world.par > 0 && world.fieldSize === 1 ? `${fmtTime(shown)} / ${world.par.toFixed(0)} s` : fmtTime(shown);
      if (ts !== cache.time) {
        cache.time = ts;
        els.time.textContent = ts;
      }
      const mass = Math.round(Math.min(1, (me.m - 0.5) / 4) * 100);
      if (mass !== cache.mass) {
        cache.mass = mass;
        els.massBar.style.width = mass + '%';
      }
      const cl = Math.round(me.stamina * 100);
      if (cl !== cache.cling) {
        cache.cling = cl;
        els.clingBar.style.width = cl + '%';
        const low = cl < 25;
        if (low !== cache.low) {
          cache.low = low;
          els.clingBar.classList.toggle('low', low);
        }
      }
      // Flow chain: big number while it lives, a bar that drains.
      if (me.chain !== cache.chain) {
        const grew = me.chain > cache.chain;
        cache.chain = me.chain;
        els.chain.classList.toggle('on', me.chain >= 2);
        if (me.chain >= 2) {
          els.chainN.textContent = STR.flow(me.chain);
          if (grew) {
            els.chain.classList.remove('pop');
            void els.chain.offsetWidth;
            els.chain.classList.add('pop');
          }
        }
      }
      if (me.chain >= 2) {
        const frac = Math.round(Math.max(0, Math.min(1, me.chainT / (1.7 * me.mods.chainWin))) * 50) * 2;
        if (frac !== cache.chainBar) {
          cache.chainBar = frac;
          els.chainBar.style.width = frac + '%';
        }
      }
      world.standings.forEach((d, i) => {
        const r = rows[d.id];
        if (!r) return;
        if (d.wiped !== r.dead) {
          r.dead = !!d.wiped;
          r.row.classList.toggle('dead', r.dead);
        }
        if (r.order !== i) {
          r.order = i;
          r.row.style.order = i;
        }
        const wpx = Math.round(Math.min(1, d.y / H) * 100);
        if (wpx !== r.width) {
          r.width = wpx;
          r.bar.style.width = wpx + '%';
        }
      });
    },
    banner(text, kind = '', ms = 1800) {
      els.banner.textContent = text;
      els.banner.className = 'banner on ' + kind;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => els.banner.classList.remove('on'), ms);
    },
    clearBanner() {
      clearTimeout(bannerTimer);
      els.banner.classList.remove('on');
    },
    countdown(text) {
      const c = els.countdown;
      c.textContent = text;
      c.classList.remove('pop');
      void c.offsetWidth; // restart the animation
      c.classList.add('pop');
    },
    hint(text, ms = 6500) {
      els.hint.textContent = text;
      els.hint.classList.add('on');
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => els.hint.classList.remove('on'), ms);
    },
    clearHint() {
      clearTimeout(hintTimer);
      els.hint.classList.remove('on');
    },
  };
}
