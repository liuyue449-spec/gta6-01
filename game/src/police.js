// The wanted system and the Sunhaven Police Department. Committing crimes
// raises stars (0-5); each star level calls in more patrol cars, which chase
// the player, cut them off by aiming where they are heading, ram their car,
// and try to arrest them on foot. Patrol cars respect the buildings — a cop
// who clips a corner loses speed instead of driving through a wall. Stay
// out of sight and the heat cools off; get caught standing still next to a
// cop for too long and it is BUSTED — a fine and a trip to the precinct.
import { CITY_SIZE, POLICE, WANTED } from './config.js';
import { collideBuildings, nearestRoadCentre } from './city.js';
import { makeCar } from './vehicles.js';
import { range } from './random.js';

export function addWanted(state, stars, reason) {
  const before = state.wanted;
  state.wanted = Math.max(0, Math.min(5, state.wanted + stars));
  if (state.wanted > before && state.wanted >= 1) {
    state.toast = reason ? `${reason} — wanted level ${'★'.repeat(state.wanted)}` : `Wanted level ${'★'.repeat(state.wanted)}`;
    state.toastTime = 2.5;
    state.audio.sfx.siren();
  }
  return state.wanted;
}

/** Keep the right number of patrol cars on the street for the current stars. */
export function syncPolice(state, random) {
  const wanted = state.cops.filter((c) => c.isCop).length;
  const target = WANTED.copsForStars[state.wanted];
  if (wanted < target) {
    for (let i = wanted; i < target; i += 1) {
      const px = state.player.x;
      const py = state.player.y;
      // Spawn on a road a few blocks away, never on top of the player.
      const angle = range(random, 0, Math.PI * 2);
      const dist = range(random, 500, 900);
      let x = px + Math.cos(angle) * dist;
      let y = py + Math.sin(angle) * dist;
      x = Math.max(120, Math.min(CITY_SIZE - 120, x));
      y = Math.max(120, Math.min(CITY_SIZE - 120, y));
      x = nearestRoadCentre(x);
      const cop = makeCar(random, x, y, 0, { isCop: true, color: '#1d4ed8', type: { name: 'Patrol', speed: 1.15, color: '#1d4ed8' } });
      cop.speed = POLICE.copSpeed * 0.7;
      state.cops.push(cop);
    }
  } else if (wanted > target) {
    // Heat fell: the furthest cop gives up and drives off.
    let far = null;
    let farD = -1;
    for (const cop of state.cops) {
      const d = Math.hypot(cop.x - state.player.x, cop.y - state.player.y);
      if (d > farD) { farD = d; far = cop; }
    }
    if (far) state.cops.splice(state.cops.indexOf(far), 1);
  }
}

/** One step for every patrol car: steer to intercept, ram, and arrest on foot. */
export function stepPolice(state, dt) {
  const player = state.player;
  for (const cop of state.cops) {
    // Intercept, don't just follow: aim at where the player is heading.
    const lead = Math.min(0.55, Math.hypot(player.x - cop.x, player.y - cop.y) / 900);
    const aimX = player.x + (state.playerVx || 0) * lead;
    const aimY = player.y + (state.playerVy || 0) * lead;
    const dx = aimX - cop.x;
    const dy = aimY - cop.y;
    const dist = Math.hypot(player.x - cop.x, player.y - cop.y) || 1;
    const wantAngle = Math.atan2(dy, dx);
    let diff = wantAngle - cop.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cop.angle += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
    const targetSpeed = dist > 900 ? POLICE.copSpeed : dist < 130 ? 130 : Math.min(POLICE.copSpeed, 240 + dist * 0.45);
    cop.speed += (targetSpeed - cop.speed) * Math.min(1, dt * 1.2);
    const beforeX = cop.x;
    const beforeY = cop.y;
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
    // Buildings are solid for the police too: slide out and lose speed.
    const body = { x: cop.x, y: cop.y, radius: 26 };
    collideBuildings(state.city, body);
    if (body.x !== cop.x || body.y !== cop.y) {
      cop.x = body.x;
      cop.y = body.y;
      if (Math.abs(cop.speed) > 260) {
        cop.speed *= 0.45;
        state.effects.push({ kind: 'crash', x: cop.x, y: cop.y, t: 0.35 });
      } else {
        cop.speed *= 0.8;
      }
    } else if (cop.x === beforeX && cop.y === beforeY) {
      cop.speed *= 0.9;
    }
    cop.brake = dist < 200 && cop.speed > targetSpeed + 30 ? 1 : 0;

    // Ramming the player's car hurts the player and slows the cop.
    // A short cooldown per cop keeps a chase tense instead of lethal.
    cop.ramCd = Math.max(0, (cop.ramCd || 0) - dt);
    if (state.inCar && state.car) {
      const cd = Math.hypot(cop.x - state.car.x, cop.y - state.car.y);
      if (cd < 62 && cop.speed > 200 && cop.ramCd <= 0) {
        cop.ramCd = 0.9;
        state.damagePlayer(POLICE.ramDamage);
        cop.speed *= 0.4;
        state.effects.push({ kind: 'crash', x: cop.x, y: cop.y, t: 0.4 });
        state.audio.sfx.crash();
      }
    }
    // On foot, a cop that stays close starts the arrest timer.
    if (!state.inCar && dist < POLICE.arrestRange) {
      state.arrestTimer += dt;
      if (state.arrestTimer >= POLICE.arrestTime) {
        state.busted = true;
        state.arrestTimer = 0;
      }
    }
  }
  // Any cop close enough counts as "seen": heat does not cool.
  const seen = state.cops.some((c) => Math.hypot(c.x - player.x, c.y - player.y) < 620);
  state.playerSeen = seen;
  if (!seen && state.wanted > 0) {
    state.heat -= WANTED.decayPerSecond[state.wanted] * dt;
    if (state.heat <= 0) {
      state.heat = 1;
      state.wanted -= 1;
      if (state.wanted === 0) {
        state.toast = 'You lost the cops. Heat is off.';
        state.toastTime = 2.5;
      }
    }
  } else {
    state.heat = 1;
  }
  if (state.arrestTimer > 0 && !state.cops.some((c) => Math.hypot(c.x - player.x, c.y - player.y) < POLICE.arrestRange + 40)) {
    state.arrestTimer = Math.max(0, state.arrestTimer - dt * 2);
  }
}
