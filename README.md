# Raindrop Derby

You are a raindrop on a car windshield. Race five rivals to the dashboard through a three-heat cup. Gravity drives, the wipers do not care.

Made for Vibe Games. One public repo per game, hosted on GitHub Pages, shown in an `<iframe>`.

## Play it locally

Windows: double-click `play-local.cmd`. It starts a tiny Node server and opens http://localhost:8090/raindrop-derby/.
The game is made of ES modules, so a browser will not load it from a file opened by double-click.

Other systems:

```bash
node tools/serve.mjs
```

Add `?debug=1` to the URL for the console hook `__rd` (for example `__rd.advance(5)` plays five seconds and renders).
`?stage=city` preselects a heat, `?autostart=1` skips the title screen.

## How to play

| Key | Action |
|---|---|
| ← → / A D | Steer (drag on a touch screen) |
| Space / Shift / ↓ | Cling: grip the glass and ignore wipers, splashes and turns. It drains, so use it at the right moment |
| H | Hide the interface (clean screenshots) |
| F | Fullscreen |
| M | All sound on / off |
| N | Only the rain and engine bed on / off (effects stay) |
| P / Esc | Pause |
| R | Restart the heat (practice only; the cup has no do-overs) |

- **Flow**: swallow droplets in a row. Every link in the chain makes you faster.
- **Slipstream**: a rival's fresh trail and the teal wax lanes are shortcuts. Your own trail does not help you.
- **Hazards**: wipers (cling when a blade reaches you), bugs, dirty glass, wind, a truck splash, and the car itself (hard brake, hard turn, pothole).
- **Cup** (about 3 to 4 minutes if you keep winning): six heats, the three glasses twice, the second time angrier. Cut-offs: top 4, 3, 3, 3, 2, then win the final. Between heats you pick one of three upgrades.
- **Survival** (endless; the simulator's average-skill player lasts about 11 minutes, the shortest runs 2.5; no human data yet): every lap the last drop home is wiped and the glass gets nastier. You have three lives: if *you* are last you lose a life and nobody else goes. A life comes back every third lap. When the rivals run out you race alone against a shrinking clock. Score = the furthest lap.
- **Practice**: any one of the three heats, with a personal best.

## Files

```
index.html            entry point, relative paths only
src/main.js           boot, state machine (title / race / results / upgrade), frame loop, events
src/config.js         every tuning number, the three heats, the rivals
src/sim/              the game itself, no DOM and no Three.js, seeded and testable
  world.js            race rules, drops, rain, trails, splash, finish
  physics.js          the single motion model (player, rivals and the AI's look-ahead use it)
  hazards.js          wipers, car events, bugs, wax lanes
  ai.js               rival brains
  upgrades.js         the 11 upgrades and offers
  modes.js            the six-heat cup, survival laps, how glass gets harder, par time, lives
src/render/           Three.js: scene, shaders, painted night backdrop
src/ui/               HUD, screens, CSS
src/audio/audio.js    all sound is synthesised with Web Audio
vendor/three.min.js   Three.js r186 bundle (MIT), see tools/vendor/readme.txt
site/                 images and text for the Vibe Games page (not loaded by the game)
tools/                tests, static checks, balance simulator, local server
```

## Checks

```bash
npm test          # node --test tools/tests/
npm run check     # brief rules: no external requests, no cookies, preloads, weight
npm run stats     # balance: race times and placements, headless
npm run stats:survival   # balance: how long whole survival runs last
node tools/upgrade-power.mjs   # how much faster each upgrade makes a lone drop
```

No external requests: all code and the Three.js bundle live in the repo. Only settings and records go into `localStorage`.
