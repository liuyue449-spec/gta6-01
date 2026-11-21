// The story of Sunhaven Streets: six missions for Alex Vega, a driver new
// in town who owes money to the wrong people and has to earn it back. Each
// mission has a target marker on the map and the minimap, a timer where the
// pressure matters, and a cash reward. Finishing all six clears the debt
// and unlocks free roam with the "King of Sunhaven" title.
import { LANDMARKS } from './city.js';

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: '1 · First Wheels',
    brief: 'You need wheels. Steal any car (press E near one) and bring it to Rico\'s Garage.',
    reward: 200,
  },
  {
    id: 'coral-courier',
    title: '2 · Coral Courier',
    brief: 'Rico needs packages run across town. Hit all 3 drop-offs before the 100 second timer runs out.',
    reward: 350,
  },
  {
    id: 'hot-package',
    title: '3 · Hot Package',
    brief: 'Pick up the package at Coral Market. The cops are already watching — 2 stars on you. Lose them and reach the Hideout.',
    reward: 500,
  },
  {
    id: 'arena-brawl',
    title: '4 · Arena Brawl',
    brief: 'The Red Tide gang jumped Rico\'s nephew. Go to the Backstreet Arena and teach all 4 of them a lesson. Fists or pistol — watch for return fire.',
    reward: 450,
  },
  {
    id: 'sunset-run',
    title: '5 · Sunset Run',
    brief: 'Rico\'s crew bet $800 you cannot run the bay: 5 checkpoints, beach to bank and back, before the clock dies. Every gate buys you more time.',
    reward: 800,
  },
  {
    id: 'big-score',
    title: '6 · The Big Score',
    brief: 'Rob Sunhaven Bank: stand at the vault door to crack it, grab the cash, then lose a 3-star chase and reach the Hideout. Clear the debt.',
    reward: 1000,
  },
];

/** The Sunset Run gates, in order: pier, arena hill, the bank, the hospital, home. */
const SUNSET_GATES = [
  { x: 1750, y: 3350, label: 'Gate 1 · Marina Pier' },
  { x: 750, y: 2750, label: 'Gate 2 · Backstreet Arena' },
  { x: 1250, y: 250, label: 'Gate 3 · Sunhaven Bank' },
  { x: 2750, y: 750, label: 'Gate 4 · St. Coral Hospital' },
  { x: 3250, y: 3250, label: 'Gate 5 · The Hideout — finish' },
];

export function currentMission(state) {
  return state.missionIndex < MISSIONS.length ? MISSIONS[state.missionIndex] : null;
}

/** Begin a mission: set its first target, timer and any scripted setup. */
export function startMission(state, index) {
  const mission = MISSIONS[index];
  state.missionIndex = index;
  state.missionStage = 0;
  state.missionTimer = 0;
  state.missionFailed = false;
  state.missionDone = false;
  state.enemies.length = 0;
  if (mission.id === 'first-wheels') {
    state.setTarget(LANDMARKS.garage.x, LANDMARKS.garage.y, "Rico's Garage");
  } else if (mission.id === 'coral-courier') {
    state.missionTimer = 100;
    state.checkpoints = [
      { x: LANDMARKS.market.x, y: LANDMARKS.market.y, label: 'Drop-off 1 · Coral Market', done: false },
      { x: LANDMARKS.cafe.x, y: LANDMARKS.cafe.y, label: 'Drop-off 2 · Sunset Cafe', done: false },
      { x: LANDMARKS.pier.x, y: LANDMARKS.pier.y, label: 'Drop-off 3 · Marina Pier', done: false },
    ];
    state.setTarget(state.checkpoints[0].x, state.checkpoints[0].y, state.checkpoints[0].label);
  } else if (mission.id === 'hot-package') {
    state.setTarget(LANDMARKS.market.x, LANDMARKS.market.y, 'Pick up the package');
    state.wanted = 2;
    state.heat = 1;
  } else if (mission.id === 'arena-brawl') {
    state.setTarget(LANDMARKS.arena.x, LANDMARKS.arena.y, 'Backstreet Arena');
  } else if (mission.id === 'sunset-run') {
    state.missionTimer = 95;
    state.checkpoints = SUNSET_GATES.map((g) => ({ ...g, done: false }));
    state.setTarget(state.checkpoints[0].x, state.checkpoints[0].y, state.checkpoints[0].label);
  } else if (mission.id === 'big-score') {
    state.setTarget(LANDMARKS.bank.x, LANDMARKS.bank.y, 'Sunhaven Bank — crack the vault');
  }
  state.toast = `${mission.title}: ${mission.brief}`;
  state.toastTime = 5;
}

/** Shared checkpoint logic for the two timed runs. Returns 'done' at the last gate. */
function stepCheckpoints(state, dt, secondsPerGate, cashPerGate) {
  state.missionTimer -= dt;
  if (state.missionTimer <= 0) {
    state.missionFailed = true;
    return 'failed';
  }
  const near = (x, y, r) => Math.hypot(state.player.x - x, state.player.y - y) < r;
  const cp = state.checkpoints.find((c) => !c.done);
  if (cp && near(cp.x, cp.y, 100)) {
    cp.done = true;
    state.audio.sfx.pickup();
    state.money += cashPerGate;
    state.missionTimer += secondsPerGate;
    const next = state.checkpoints.find((c) => !c.done);
    if (next) {
      state.setTarget(next.x, next.y, next.label);
      state.toast = `${cp.label} done — +$${cashPerGate}, +${secondsPerGate}s. Next: ${next.label}`;
    } else {
      return completeMission(state);
    }
    state.toastTime = 3;
  }
  return null;
}

/** Advance the active mission. Returns 'done' | 'failed' | null. */
export function stepMission(state, dt) {
  const mission = currentMission(state);
  if (!mission || state.storyComplete) return null;
  const near = (x, y, r) => Math.hypot(state.player.x - x, state.player.y - y) < r;

  if (mission.id === 'first-wheels') {
    if (state.missionStage === 0 && state.inCar) {
      state.missionStage = 1;
      state.toast = 'Nice wheels. Now bring the car to Rico\'s Garage.';
      state.toastTime = 3;
    } else if (state.missionStage === 1 && state.inCar && near(LANDMARKS.garage.x, LANDMARKS.garage.y, 130)) {
      return completeMission(state);
    }
  } else if (mission.id === 'coral-courier') {
    return stepCheckpoints(state, dt, 0, 50);
  } else if (mission.id === 'sunset-run') {
    return stepCheckpoints(state, dt, 9, 25);
  } else if (mission.id === 'hot-package') {
    if (state.missionStage === 0 && near(LANDMARKS.market.x, LANDMARKS.market.y, 110)) {
      state.missionStage = 1;
      state.setTarget(LANDMARKS.hideout.x, LANDMARKS.hideout.y, 'Hideout — lose the cops first');
      state.toast = 'Package grabbed! Now reach the Hideout.';
      state.toastTime = 3;
      state.audio.sfx.pickup();
    } else if (state.missionStage === 1 && state.wanted === 0 && near(LANDMARKS.hideout.x, LANDMARKS.hideout.y, 130)) {
      return completeMission(state);
    }
  } else if (mission.id === 'arena-brawl') {
    if (state.missionStage === 0 && near(LANDMARKS.arena.x, LANDMARKS.arena.y, 160)) {
      state.missionStage = 1;
      state.spawnGang(4, LANDMARKS.arena.x, LANDMARKS.arena.y);
      state.toast = 'The Red Tide gang is here — take all 4 down!';
      state.toastTime = 3;
    } else if (state.missionStage === 1 && state.enemies.length > 0 && state.enemies.every((e) => e.state === 'down')) {
      return completeMission(state);
    }
  } else if (mission.id === 'big-score') {
    if (state.missionStage === 0 && near(LANDMARKS.bank.x, LANDMARKS.bank.y, 120)) {
      state.missionStage = 1;
      state.vaultTimer = 3;
      state.toast = 'Cracking the vault — stay at the door…';
      state.toastTime = 3;
    } else if (state.missionStage === 1) {
      if (near(LANDMARKS.bank.x, LANDMARKS.bank.y, 120)) {
        state.vaultTimer -= dt;
        if (state.vaultTimer <= 0) {
          state.missionStage = 2;
          state.money += 300;
          state.wanted = 3;
          state.heat = 1;
          state.setTarget(LANDMARKS.hideout.x, LANDMARKS.hideout.y, 'Hideout — lose the 3-star chase');
          state.toast = 'Cash grabbed (+$300)! Now lose the cops and reach the Hideout.';
          state.toastTime = 4;
        }
      } else {
        state.vaultTimer = 3;
      }
    } else if (state.missionStage === 2 && state.wanted === 0 && near(LANDMARKS.hideout.x, LANDMARKS.hideout.y, 130)) {
      return completeMission(state);
    }
  }
  return null;
}

function completeMission(state) {
  const mission = currentMission(state);
  state.money += mission.reward;
  state.missionsDone += 1;
  state.missionDone = true;
  state.audio.sfx.missionDone();
  state.toast = `${mission.title} complete — +$${mission.reward}!`;
  state.toastTime = 4;
  state.saveGame();
  if (state.missionIndex + 1 < MISSIONS.length) {
    startMission(state, state.missionIndex + 1);
  } else {
    state.storyComplete = true;
    state.missionIndex = MISSIONS.length;
    state.target = null;
    state.toast = 'DEBT CLEARED — you are the King of Sunhaven! Free roam unlocked.';
    state.toastTime = 6;
  }
  return 'done';
}

/** What the HUD tracker shows for the active mission. */
export function missionStatus(state) {
  const mission = currentMission(state);
  if (!mission) return 'All missions complete — free roam!';
  if (mission.id === 'coral-courier' || mission.id === 'sunset-run') {
    const done = state.checkpoints.filter((c) => c.done).length;
    const total = state.checkpoints.length;
    return `${mission.title} — ${done}/${total} gates · ${Math.max(0, Math.ceil(state.missionTimer))}s left`;
  }
  if (mission.id === 'arena-brawl' && state.missionStage === 1) {
    const left = state.enemies.filter((e) => e.state !== 'down').length;
    return `${mission.title} — ${left} gang members left`;
  }
  if (mission.id === 'big-score' && state.missionStage === 1) {
    return `${mission.title} — cracking vault… ${Math.max(0, state.vaultTimer).toFixed(1)}s`;
  }
  return `${mission.title} — ${state.target ? state.target.label : mission.brief}`;
}
