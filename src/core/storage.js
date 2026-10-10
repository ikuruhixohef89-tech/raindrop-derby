// localStorage for settings and records only. Every access is wrapped: private windows and blocked storage must not break the game.
const KEY = 'raindrop-derby:v2';

let memory = { muted: false, ambience: true, records: {}, cup: { heats: 0, final: 0 }, survival: { laps: 0, kills: 0 } };

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && typeof data === 'object') {
      const cup = data.cup && typeof data.cup === 'object' ? data.cup : {};
      const sv = data.survival && typeof data.survival === 'object' ? data.survival : {};
      memory = {
        muted: data.muted === true,
        ambience: data.ambience !== false,
        records: data.records && typeof data.records === 'object' ? data.records : {},
        cup: { heats: cup.heats | 0, final: cup.final | 0 },
        survival: { laps: sv.laps | 0, kills: sv.kills | 0 },
      };
    }
  } catch {
    // storage unavailable: keep the in-memory copy
  }
}

function write() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    // ignore
  }
}

read();

export const settings = {
  get muted() {
    return memory.muted;
  },
  set muted(v) {
    memory.muted = !!v;
    write();
  },
  get ambience() {
    return memory.ambience;
  },
  set ambience(v) {
    memory.ambience = !!v;
    write();
  },
};

// Survival: the furthest lap reached and the most rivals wiped in one run.
export function getSurvival() {
  return { laps: memory.survival.laps, kills: memory.survival.kills };
}

export function submitSurvival(laps, kills) {
  const s = memory.survival;
  const out = { newLaps: laps > s.laps, newKills: kills > s.kills };
  if (laps > s.laps) s.laps = laps;
  if (kills > s.kills) s.kills = kills;
  write();
  return out;
}

export function getRecord(stageId) {
  const r = memory.records[stageId];
  return r && typeof r.time === 'number' ? { time: r.time, place: r.place | 0 } : null;
}

// Returns { newTime, newPlace }.
export function submitRecord(stageId, time, place) {
  const old = getRecord(stageId);
  const out = { newTime: false, newPlace: false };
  if (place < 1) return out; // only finished races count
  const next = old ? { ...old } : { time, place };
  if (!old || time < old.time) {
    next.time = time;
    out.newTime = true;
  }
  if (!old || place < old.place) {
    next.place = place;
    out.newPlace = true;
  }
  memory.records[stageId] = next;
  write();
  return out;
}

// Cup progress: how many heats you reached, and your best place in the final (0 = never reached it).
export function getCup() {
  return { heats: memory.cup.heats, final: memory.cup.final };
}

export function submitCup(heatsReached, finalPlace) {
  const c = memory.cup;
  if (heatsReached > c.heats) c.heats = heatsReached;
  if (finalPlace > 0 && (c.final === 0 || finalPlace < c.final)) c.final = finalPlace;
  write();
  return getCup();
}
