// Cars: the player's car physics (arcade handling, a Shift-key drift that
// scrubs speed and lays skid marks, crash sparks) and the traffic that fills
// the roads — each traffic car follows a road lane, turns at intersections,
// slows for the car ahead with its brake lights lit, and honks when stuck.
// Stealing a parked or traffic car is the heart of the game: E near a car
// pulls the driver out and puts the player behind the wheel.
import { CAR, CITY_SIZE, ROAD_CENTRES, ROAD_W } from './config.js';
import { nearestRoadCentre } from './city.js';
import { pick, range } from './random.js';

export const CAR_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22', '#ecf0f1', '#1abc9c', '#fd79a8', '#636e72'];
export const CAR_TYPES = [
  { name: 'Sedan', speed: 1.0, color: null },
  { name: 'Taxi', speed: 0.95, color: '#f1c40f' },
  { name: 'Van', speed: 0.8, color: null },
  { name: 'Sport', speed: 1.25, color: null },
  { name: 'Pickup', speed: 0.9, color: null },
];

export function makeCar(random, x, y, angle, opts) {
  const type = opts?.type ?? pick(random, CAR_TYPES);
  return {
    x, y, angle,
    speed: 0,
    color: opts?.color ?? type.color ?? pick(random, CAR_COLORS),
    type: type.name,
    speedMul: type.speed,
    isCop: !!opts?.isCop,
    isPlayer: false,
    driver: opts?.driver !== false, // traffic cars have a driver until stolen
    parked: !!opts?.parked,
    stuck: 0,
    honk: 0,
    brake: 0, // 0..1, how hard the car is braking this frame (lights in render)
    drift: 0, // 0..1, the player's handbrake drift amount this frame
    // traffic AI: which road it follows and which way along it
    axis: opts?.axis ?? 'x',
    dir: opts?.dir ?? (random() < 0.5 ? 1 : -1),
    lane: opts?.lane ?? 0,
  };
}

/** Spawn a parked car on a roadside, away from buildings. */
export function spawnParkedCar(random, city) {
  const c = pick(random, ROAD_CENTRES);
  const along = range(random, 150, CITY_SIZE - 150);
  const horizontal = random() < 0.5;
  const off = (random() < 0.5 ? -1 : 1) * (ROAD_W / 2 - 26);
  const x = horizontal ? along : c + off;
  const y = horizontal ? c + off : along;
  const angle = horizontal ? (off > 0 ? 0 : Math.PI) : (off > 0 ? Math.PI / 2 : -Math.PI / 2);
  return makeCar(random, x, y, angle, { parked: true, driver: false });
}

/** Spawn a moving traffic car on a random road lane. */
export function spawnTrafficCar(random) {
  const c = pick(random, ROAD_CENTRES);
  const along = range(random, 150, CITY_SIZE - 150);
  const horizontal = random() < 0.5;
  const dir = random() < 0.5 ? 1 : -1;
  const lane = dir * 34;
  const x = horizontal ? along : c + lane;
  const y = horizontal ? c + lane : along;
  const angle = horizontal ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  const car = makeCar(random, x, y, angle, { axis: horizontal ? 'x' : 'y', dir, lane });
  car.speed = range(random, 120, 210) * car.speedMul;
  return car;
}

export function createTraffic(random, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) cars.push(spawnTrafficCar(random));
  for (let i = 0; i < 14; i += 1) cars.push(spawnParkedCar(random));
  return cars;
}

/**
 * Arcade car physics for the player's car. WASD drives; holding Shift at
 * speed is a handbrake drift: the tail steps out, steering sharpens, speed
 * scrubs away and the world lays skid marks where the tyres slide.
 */
export function drivePlayerCar(car, input, dt) {
  const move = input.moveVector();
  const forward = move.y < 0; // W / up accelerates
  const reverse = move.y > 0;
  const steer = move.x;
  const before = car.speed;
  if (forward) car.speed += CAR.accel * dt;
  else if (reverse) car.speed -= (car.speed > 0 ? CAR.brake : CAR.accel * 0.55) * dt;
  else {
    const drag = CAR.drag * 60 * dt;
    car.speed = Math.abs(car.speed) <= drag ? 0 : car.speed - Math.sign(car.speed) * drag;
  }
  car.brake = reverse && car.speed > 10 ? 1 : Math.max(0, (before - car.speed) * 2.2);

  const drifting = input.held.run && Math.abs(car.speed) > 150 && steer !== 0;
  car.drift = drifting ? Math.min(1, car.drift + dt * 5) : Math.max(0, car.drift - dt * 4);
  if (car.drift > 0) {
    const scrub = CAR.driftDrag * car.drift * dt;
    car.speed = Math.abs(car.speed) <= scrub ? 0 : car.speed - Math.sign(car.speed) * scrub;
  }
  car.speed = Math.max(-CAR.reverseSpeed, Math.min(CAR.maxSpeed * car.speedMul, car.speed));
  const grip = Math.min(1, Math.abs(car.speed) / 120 + 0.25);
  const turnMul = 1 + (CAR.driftTurnMul - 1) * car.drift;
  car.angle += steer * CAR.turnRate * turnMul * dt * grip * Math.sign(car.speed || 1);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = Math.max(30, Math.min(CITY_SIZE - 30, car.x));
  car.y = Math.max(30, Math.min(CITY_SIZE - 30, car.y));
  return Math.abs(car.speed);
}

/** One traffic step: follow the lane, turn at the next intersection sometimes, slow for cars ahead. */
export function stepTraffic(cars, dt, random, playerCar) {
  for (const car of cars) {
    if (car.isPlayer || car.parked) continue;
    // Slow down for the car directly ahead (traffic or the player's).
    let ahead = Infinity;
    for (const other of cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const along = car.axis === 'x' ? dx * car.dir : dy * car.dir;
      const side = car.axis === 'x' ? Math.abs(dy) : Math.abs(dx);
      if (along > 0 && along < 130 && side < 40) ahead = Math.min(ahead, along);
    }
    if (playerCar) {
      const dx = playerCar.x - car.x;
      const dy = playerCar.y - car.y;
      const along = car.axis === 'x' ? dx * car.dir : dy * car.dir;
      const side = car.axis === 'x' ? Math.abs(dy) : Math.abs(dx);
      if (along > 0 && along < 130 && side < 40) ahead = Math.min(ahead, along);
    }
    const cruising = 175 * car.speedMul;
    const target = ahead < 95 ? Math.max(0, (ahead - 55) * 2.2) : cruising;
    const before = car.speed;
    car.speed += (target - car.speed) * Math.min(1, dt * 1.6);
    car.brake = car.speed < before - 4 ? 1 : Math.max(0, car.brake - dt * 3);
    if (ahead < 60) car.stuck += dt; else car.stuck = 0;
    if (car.stuck > 2.5 && car.honk <= 0) { car.honk = 1.2; car.stuck = 0; }
    if (car.honk > 0) car.honk -= dt;

    // At an intersection (near a crossing road centre), sometimes turn.
    const along = car.axis === 'x' ? car.x : car.y;
    const cross = nearestRoadCentre(along);
    if (Math.abs(along - cross) < 14 && random() < dt * 0.5) {
      const turnLeft = random() < 0.5;
      const newAxis = car.axis === 'x' ? 'y' : 'x';
      const newDir = turnLeft ? -car.dir : car.dir;
      // Snap onto the crossing road's lane.
      const centre = nearestRoadCentre(car.axis === 'x' ? car.y : car.x);
      if (newAxis === 'x') { car.y = centre + newDir * 34; car.angle = newDir > 0 ? 0 : Math.PI; }
      else { car.x = centre + newDir * 34; car.angle = newDir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      car.axis = newAxis;
      car.dir = newDir;
      car.lane = newDir * 34;
    }
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    // Wrap around the city edge instead of piling up at the border.
    if (car.x < 60) car.x = CITY_SIZE - 70;
    if (car.x > CITY_SIZE - 60) car.x = 70;
    if (car.y < 60) car.y = CITY_SIZE - 70;
    if (car.y > CITY_SIZE - 60) car.y = 70;
  }
}

/** Simple circle-vs-car crash: returns impact speed for the pair, 0 when apart. */
export function carOverlap(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dist = Math.hypot(dx, dy);
  return dist < 58 ? 58 - dist : 0;
}

export function randomCarName(random) {
  return `${pick(random, ['Coral', 'Palm', 'Sunset', 'Marina', 'Neon', 'Turbo'])} ${pick(random, CAR_TYPES).name}`;
}
