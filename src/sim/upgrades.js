// Upgrades the player picks between heats. Each one only edits a "mods" record the simulation reads.

export function defaultMods() {
  return {
    wind: 1, // how much the wind pushes this drop
    draft: 1, // strength of slipstreams
    wax: 1, // strength of wax lanes
    steer: 1, // sideways speed
    slick: 1, // how much turning costs (0 = free)
    flow: 1, // speed per chain link
    chainWin: 1, // how long a chain lasts
    absorb: 1, // swallowing reach
    clingTime: 1,
    clingRecover: 1,
    shed: 1,
    startMass: 0,
    rain: 1, // how fast rain feeds this drop
    bugproof: 0, // 1 = bugs cost nothing
    wiperLoss: 1, // share of the normal wiper loss
    bite: 1, // how much a bite steals
  };
}

export const UPGRADES = [
  { id: 'hydro', name: 'Hydrophobic Coat', desc: 'Slipstreams and wax lanes work 60% harder.', apply: m => { m.draft *= 1.6; m.wax *= 1.6; } },
  { id: 'grip', name: 'Sticky Feet', desc: 'Cling lasts 60% longer and refills faster.', apply: m => { m.clingTime *= 1.6; m.clingRecover *= 0.6; } },
  { id: 'sponge', name: 'Sponge', desc: 'Swallow droplets from much further away.', apply: m => { m.absorb *= 1.7; } },
  { id: 'heavy', name: 'Heavy Drop', desc: 'Start fatter and shed less water.', apply: m => { m.startMass += 0.7; m.shed *= 0.6; } },
  { id: 'slick', name: 'Slick Surface', desc: 'Turning costs no speed, and you steer 25% sharper.', apply: m => { m.slick = 0; m.steer *= 1.25; } },
  { id: 'wind', name: 'Windbreaker', desc: 'The wind pushes you 60% less.', apply: m => { m.wind *= 0.4; } },
  { id: 'flow', name: 'Flow State', desc: 'Chains last longer and every link is worth more.', apply: m => { m.chainWin *= 1.5; m.flow *= 1.5; } },
  { id: 'rainmaker', name: 'Rainmaker', desc: 'Rain feeds you two and a half times faster.', apply: m => { m.rain *= 2.5; } },
  { id: 'shell', name: 'Armoured Shell', desc: 'Bugs bounce off you and cost nothing.', apply: m => { m.bugproof = 1; } },
  { id: 'wiperwax', name: 'Wiper Wax', desc: 'A wiper hit takes a quarter of your water, not half.', apply: m => { m.wiperLoss *= 0.5; } },
  { id: 'thirsty', name: 'Thirsty', desc: 'Your bites steal 60% more.', apply: m => { m.bite *= 1.6; } },
];

export function buildMods(ids) {
  const m = defaultMods();
  for (const id of ids || []) {
    const u = UPGRADES.find(x => x.id === id);
    if (u) u.apply(m);
  }
  return m;
}

// Three different offers the player does not own yet.
export function rollChoices(ownedIds, rng, n = 3) {
  const pool = UPGRADES.filter(u => !ownedIds.includes(u.id));
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}
