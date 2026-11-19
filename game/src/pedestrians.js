// Pedestrians: the city's foot traffic. They stroll along sidewalks, pause
// at shop windows, cross roads at intersections, and run away screaming
// (and call the police) when they see violence, a crash, or a stolen car.
// A few of them carry cash the player can earn by helping, never by hurting:
// hitting a pedestrian is a crime that raises the wanted level.
import { CITY_SIZE, PALETTE, ROAD_CENTRES, ROAD_W } from './config.js';
import { nearestRoadCentre } from './city.js';
import { pick, range } from './random.js';

export function makePed(random, x, y) {
  return {
    x, y,
    angle: range(random, 0, Math.PI * 2),
    speed: range(random, 40, 75),
    shirt: pick(random, PALETTE.pedShirt),
    state: 'walk', // walk | idle | flee | down
    stateTime: range(random, 0, 4),
    targetX: x,
    targetY: y,
    scared: 0,
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

/** Pick a new stroll target: the next intersection along the sidewalk. */
function pickStrollTarget(ped, random) {
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

export function stepPedestrians(peds, dt, random, danger) {
  for (const ped of peds) {
    ped.bob += dt * 8;
    ped.stateTime -= dt;
    if (ped.state === 'down') {
      // A knocked-down pedestrian gets up after a while and walks away.
      if (ped.stateTime <= 0) {
        ped.state = 'walk';
        pickStrollTarget(ped, random);
      }
      continue;
    }
    // A nearby danger (gunfire, crash, car theft) scares them into fleeing.
    if (danger && Math.hypot(ped.x - danger.x, ped.y - danger.y) < danger.radius) {
      ped.state = 'flee';
      ped.stateTime = 2.5;
      ped.scared = 1;
    }
    if (ped.state === 'flee') {
      const dx = ped.x - (danger ? danger.x : ped.x);
      const dy = ped.y - (danger ? danger.y : ped.y);
      const len = Math.hypot(dx, dy) || 1;
      ped.x += (dx / len) * 190 * dt;
      ped.y += (dy / len) * 190 * dt;
      ped.angle = Math.atan2(dy, dx);
      if (ped.stateTime <= 0) { ped.state = 'walk'; pickStrollTarget(ped, random); }
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
}
