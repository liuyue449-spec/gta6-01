// Pedestrians: the city's foot traffic. They stroll along sidewalks, pause
// at shop windows, drift toward the market and cafe doors at lunchtime, and
// run away screaming when they see violence, a crash, or a stolen car. A
// witness who gets clear of a crime scene phones it in, so gunfire near a
// crowd can raise a star even after the noise stops. Hitting a pedestrian
// is a crime that raises the wanted level.
import { CITY_SIZE, PALETTE, ROAD_CENTRES, ROAD_W } from './config.js';
import { LANDMARKS, nearestRoadCentre } from './city.js';
import { pick, range } from './random.js';

export function makePed(random, x, y) {
  return {
    x, y,
    angle: range(random, 0, Math.PI * 2),
    speed: range(random, 40, 75),
    shirt: pick(random, PALETTE.pedShirt),
    state: 'walk', // walk | idle | flee | down | phone
    stateTime: range(random, 0, 4),
    targetX: x,
    targetY: y,
    scared: 0,
    reported: false, // this witness has already phoned in their scare
    bob: range(random, 0, Math.PI * 2),
  };
}

export function createPedestrians(random, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    // Spawn on a sidewalk: just off a road, on a block edge.
    const c = pick(random, ROAD_CENTRES);
    const along = range(random, 120, CITY_SIZE - 120);
    const side = (random() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 14);
    if (random() < 0.5) peds.push(makePed(random, along, c + side));
    else peds.push(makePed(random, c + side, along));
  }
  return peds;
}

/** Pick a new stroll target: the next intersection along the sidewalk, or a shop door. */
function pickStrollTarget(ped, random) {
  // One stroll in six heads for a landmark door, so the market and the cafe
  // gather little crowds the player can buy from and hide among.
  if (random() < 0.16) {
    const door = pick(random, [LANDMARKS.market, LANDMARKS.cafe, LANDMARKS.pier]);
    ped.targetX = door.x + range(random, -70, 70);
    ped.targetY = door.y + range(random, 60, 130);
    return;
  }
  const horizontal = Math.abs(ped.y - nearestRoadCentre(ped.y)) < Math.abs(ped.x - nearestRoadCentre(ped.x));
  if (horizontal) {
    const c = nearestRoadCentre(ped.y);
    ped.targetX = Math.max(120, Math.min(CITY_SIZE - 120, ped.x + (random() < 0.5 ? -1 : 1) * range(random, 150, 420)));
    ped.targetY = c + (ped.y > c ? 1 : -1) * (ROAD_W / 2 + 14);
  } else {
    const c = nearestRoadCentre(ped.x);
    ped.targetY = Math.max(120, Math.min(CITY_SIZE - 120, ped.y + (random() < 0.5 ? -1 : 1) * range(random, 150, 420)));
    ped.targetX = c + (ped.x > c ? 1 : -1) * (ROAD_W / 2 + 14);
  }
}

/**
 * One step for the crowd. Returns true on the step where a witness finishes
 * phoning in a crime, so the world can raise a star for it (once per scare).
 */
export function stepPedestrians(peds, dt, random, danger) {
  let phonedIn = false;
  for (const ped of peds) {
    ped.bob += dt * 8;
    ped.stateTime -= dt;
    if (ped.state === 'down') {
      // A knocked-down pedestrian gets up after a while and walks away.
      if (ped.stateTime <= 0) {
        ped.state = 'walk';
        ped.reported = false;
        pickStrollTarget(ped, random);
      }
      continue;
    }
    // A nearby danger (gunfire, crash, car theft) scares them into fleeing.
    if (danger && Math.hypot(ped.x - danger.x, ped.y - danger.y) < danger.radius) {
      if (ped.state !== 'flee') ped.reported = false;
      ped.state = 'flee';
      ped.stateTime = 2.5;
      ped.scared = 1;
    }
    if (ped.state === 'flee') {
      const dx = ped.x - (danger ? danger.x : ped.x);
      const dy = ped.y - (danger ? danger.y : ped.y);
      const len = Math.hypot(dx, dy) || 1;
      ped.x += (dx / len) * 195 * dt;
      ped.y += (dy / len) * 195 * dt;
      ped.angle = Math.atan2(dy, dx);
      ped.x = Math.max(24, Math.min(CITY_SIZE - 24, ped.x));
      ped.y = Math.max(24, Math.min(CITY_SIZE - 24, ped.y));
      if (ped.stateTime <= 0) {
        // Clear of the scene: a scared witness stops and phones it in.
        if (ped.scared && !ped.reported) {
          ped.state = 'phone';
          ped.stateTime = 1.6;
        } else {
          ped.state = 'walk';
          pickStrollTarget(ped, random);
        }
      }
      continue;
    }
    if (ped.state === 'phone') {
      if (ped.stateTime <= 0) {
        ped.reported = true;
        ped.scared = 0;
        ped.state = 'walk';
        pickStrollTarget(ped, random);
        phonedIn = true;
      }
      continue;
    }
    if (ped.state === 'idle') {
      if (ped.stateTime <= 0) { ped.state = 'walk'; pickStrollTarget(ped, random); }
      continue;
    }
    // Walking: head for the target, idle a while when it is reached.
    const dx = ped.targetX - ped.x;
    const dy = ped.targetY - ped.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 12) {
      ped.state = 'idle';
      ped.stateTime = range(random, 1, 4);
      continue;
    }
    ped.angle = Math.atan2(dy, dx);
    ped.x += (dx / dist) * ped.speed * dt;
    ped.y += (dy / dist) * ped.speed * dt;
    ped.x = Math.max(30, Math.min(CITY_SIZE - 30, ped.x));
    ped.y = Math.max(30, Math.min(CITY_SIZE - 30, ped.y));
  }
  return phonedIn;
}
