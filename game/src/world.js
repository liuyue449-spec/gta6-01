// The world: one state object holding everything, and step() advancing it.
// No drawing here — render.js paints this state — and no direct DOM except
// the localStorage save. The loop in main.js owns screens; this file owns
// the rules: walking and driving (with drift skid marks), stealing cars,
// crimes and wanted heat, witness phone-ins, the arena's ambient gang,
// pickups, the two shops, damage, busted/wasted, and the mission hooks in
// missions.js.
import { AMBIENT_GANG, CAR, CITY_SIZE, ECONOMY, PED_COUNT, PLAYER, POLICE, SAVE_KEY, SKIDS, TRAFFIC_COUNT } from './config.js';
import { buildCity, collideBuildings, hitsBuilding, LANDMARKS } from './city.js';
import { chance, createRandom, range } from './random.js';
import { createTraffic, drivePlayerCar, spawnTrafficCar, stepTraffic } from './vehicles.js';
import { createPedestrians, makePed, stepPedestrians } from './pedestrians.js';
import { addWanted, stepPolice, syncPolice } from './police.js';
import { fireBullet, makeEnemy, playerPunch, stepBullets, stepEnemies } from './combat.js';
import { MISSIONS, startMission, stepMission } from './missions.js';
import { stepShops } from './shops.js';
import { createAudio } from './audio.js';
import { ACTION_ENTER, ACTION_PUNCH, ACTION_SAVE, ACTION_SHOOT } from './input.js';

export const EVENT_NONE = 0;

export function createWorld(seed) {
  const random = createRandom(seed);
  const city = buildCity(random);
  const audio = createAudio();
  const state = {
    seed, city, audio, random,
    elapsed: 0,
    player: { x: 1250, y: 1250, angle: -Math.PI / 2, radius: PLAYER.radius, health: PLAYER.maxHealth, ammo: 24 },
    playerVx: 0,
    playerVy: 0,
    playerSeen: false,
    hurtT: 0,
    inCar: false,
    car: null,
    traffic: createTraffic(random, TRAFFIC_COUNT),
    peds: createPedestrians(random, PED_COUNT),
    cops: [],
    enemies: [],
    bullets: [],
    effects: [],
    skids: [],
    pickups: [],
    money: ECONOMY.startMoney,
    wanted: 0,
    heat: 1,
    arrestTimer: 0,
    busted: false,
    wasted: false,
    punchCooldown: 0,
    shootCooldown: 0,
    missionIndex: 0,
    missionStage: 0,
    missionTimer: 0,
    missionFailed: false,
    missionDone: false,
    missionsDone: 0,
    storyComplete: false,
    vaultTimer: 0,
    checkpoints: [],
    target: null,
    toast: '',
    toastTime: 0,
    camera: { x: 1250, y: 1250 },
    stats: { carsStolen: 0, crimes: 0, distanceDriven: 0 },
    danger: null,
  };

  // Cash, ammo and health pickups scattered around the city; the hearts
  // sit near the places that patch Alex up (hospital, cafe, market).
  const pickupRoads = [750, 1250, 1750, 2250, 2750];
  for (let i = 0; i < 10; i += 1) {
    state.pickups.push({
      x: pickupRoads[i % 5] + range(random, -200, 200),
      y: pickupRoads[(i + 2) % 5] + range(random, -200, 200),
      kind: i % 3 === 0 ? 'ammo' : 'cash', taken: false,
    });
  }
  for (const lm of [LANDMARKS.hospital, LANDMARKS.cafe, LANDMARKS.market]) {
    state.pickups.push({ x: lm.x + 60, y: lm.y + 90, kind: 'health', taken: false });
  }

  function setTarget(x, y, label) { state.target = { x, y, label }; }
  state.setTarget = setTarget;

  function crime(reason, stars) {
    state.stats.crimes += 1;
    state.lastCrimeAt = state.elapsed;
    if (stars > 0) addWanted(state, stars, reason);
  }
  state.crime = crime;

  function damagePlayer(amount) {
    if (state.wasted || state.busted) return;
    state.player.health -= amount;
    state.hurtT = 0.4;
    state.audio.sfx.hurt();
    state.effects.push({ kind: 'hit', x: state.player.x, y: state.player.y, t: 0.3 });
    if (state.player.health <= 0) {
      state.player.health = 0;
      state.wasted = true;
      state.audio.sfx.busted();
    }
  }
  state.damagePlayer = damagePlayer;

  function spawnGang(count, x, y) {
    for (let i = 0; i < count; i += 1) {
      state.enemies.push(makeEnemy(random, x + range(random, -90, 90), y + range(random, -90, 90), 100));
    }
  }
  state.spawnGang = spawnGang;

  function saveGame() {
    try {
      const data = {
        money: state.money, missionsDone: state.missionsDone, missionIndex: state.missionIndex,
        health: state.player.health, ammo: state.player.ammo,
        x: state.player.x, y: state.player.y, storyComplete: state.storyComplete,
        carsStolen: state.stats.carsStolen, elapsed: Math.round(state.elapsed),
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      state.toast = 'Game saved.';
      state.toastTime = 2;
    } catch { /* storage off: the run lasts this visit only */ }
  }
  state.saveGame = saveGame;

  function loadGame() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      state.money = data.money ?? ECONOMY.startMoney;
      state.missionsDone = data.missionsDone ?? 0;
      state.missionIndex = Math.min(data.missionIndex ?? 0, MISSIONS.length);
      state.storyComplete = !!data.storyComplete;
      state.player.health = data.health ?? PLAYER.maxHealth;
      state.player.ammo = data.ammo ?? 24;
      state.player.x = data.x ?? 1250;
      state.player.y = data.y ?? 1250;
      state.stats.carsStolen = data.carsStolen ?? 0;
      if (state.missionIndex >= MISSIONS.length) {
        state.missionsDone = MISSIONS.length;
        state.target = null;
      } else {
        startMission(state, state.missionIndex);
      }
      return true;
    } catch {
      return false;
    }
  }
  state.loadGame = loadGame;

  function nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of state.traffic) {
      const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function enterCar() {
    const car = nearestCar(78);
    if (!car) return;
    if (car.driver && !car.isCop) {
      // Pull the driver out: they flee on foot, and it is grand theft auto.
      const driver = makePed(random, car.x + 40, car.y + 40);
      driver.state = 'flee';
      driver.stateTime = 3;
      driver.scared = 1;
      state.peds.push(driver);
      car.driver = false;
      state.stats.carsStolen += 1;
      crime('Car stolen', 1);
      state.danger = { x: car.x, y: car.y, radius: 260 };
    }
    state.traffic.splice(state.traffic.indexOf(car), 1);
    car.isPlayer = true;
    car.parked = false;
    car.speed = 0;
    car.brake = 0;
    car.drift = 0;
    state.car = car;
    state.inCar = true;
    state.player.x = car.x;
    state.player.y = car.y;
    state.audio.sfx.engineStart();
    state.audio.startEngine();
    state.toast = `${car.type} — drive with W A S D, E to get out`;
    state.toastTime = 2.5;
  }

  function exitCar() {
    if (!state.car) return;
    const car = state.car;
    car.isPlayer = false;
    car.parked = true;
    car.speed = 0;
    state.traffic.push(car);
    state.car = null;
    state.inCar = false;
    state.player.x = car.x - Math.cos(car.angle) * 44;
    state.player.y = car.y - Math.sin(car.angle) * 44;
    state.player.angle = car.angle;
    collideBuildings(city, state.player);
  }
  state.exitCar = exitCar;

  function respawnAfterBusted() {
    const fine = Math.min(state.money, ECONOMY.bustedFine);
    state.money -= fine;
    state.wanted = 0;
    state.heat = 1;
    state.cops.length = 0;
    state.busted = false;
    state.arrestTimer = 0;
    if (state.inCar) exitCar();
    state.player.x = 1750;
    state.player.y = 750;
    state.player.health = PLAYER.maxHealth;
    state.toast = `BUSTED — fined $${fine}. Released at the precinct steps.`;
    state.toastTime = 4;
  }
  state.respawnAfterBusted = respawnAfterBusted;

  function respawnAfterWasted() {
    const bill = Math.min(state.money, ECONOMY.hospitalBill);
    state.money -= bill;
    state.wanted = 0;
    state.heat = 1;
    state.cops.length = 0;
    state.wasted = false;
    state.player.health = PLAYER.maxHealth;
    // Out of the car FIRST: exitCar parks Alex beside it, and only then does
    // the hospital teleport below put him on the hospital steps.
    if (state.inCar) exitCar();
    state.player.x = LANDMARKS.hospital.x;
    state.player.y = LANDMARKS.hospital.y + 130;
    state.toast = `WASTED — hospital bill $${bill}. You wake up at St. Coral Hospital.`;
    state.toastTime = 4;
  }
  state.respawnAfterWasted = respawnAfterWasted;

  function stepPlayerOnFoot(input, dt) {
    const move = input.moveVector();
    const speed = input.held.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    state.player.x += move.x * speed * dt;
    state.player.y += move.y * speed * dt;
    if (move.x !== 0 || move.y !== 0) state.player.angle = Math.atan2(move.y, move.x);
    collideBuildings(city, state.player);
    // Do not walk through cars: push out of any overlapping car.
    for (const car of state.traffic) {
      const dx = state.player.x - car.x;
      const dy = state.player.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d < 34 && d > 0.01) {
        state.player.x = car.x + (dx / d) * 34;
        state.player.y = car.y + (dy / d) * 34;
      }
    }
    state.player.x = Math.max(20, Math.min(CITY_SIZE - 20, state.player.x));
    state.player.y = Math.max(20, Math.min(CITY_SIZE - 20, state.player.y));
  }

  function stepPlayerCar(input, dt) {
    const car = state.car;
    const beforeX = car.x;
    const beforeY = car.y;
    drivePlayerCar(car, input, dt);
    state.stats.distanceDriven += Math.hypot(car.x - beforeX, car.y - beforeY);
    state.audio.setEngine(Math.abs(car.speed) / (CAR.maxSpeed * car.speedMul), true);
    // Drifting or cornering hard lays a pair of fading skid marks.
    if ((car.drift > 0.3 || (Math.abs(car.speed) > SKIDS.minSpeed && input.moveVector().x !== 0)) && Math.abs(car.speed) > 120) {
      const back = 20;
      const side = 13;
      const cos = Math.cos(car.angle);
      const sin = Math.sin(car.angle);
      for (const s of [-1, 1]) {
        state.skids.push({
          x: car.x - cos * back - sin * side * s,
          y: car.y - sin * back + cos * side * s,
          t: SKIDS.life,
        });
      }
      if (state.skids.length > SKIDS.max) state.skids.splice(0, state.skids.length - SKIDS.max);
    }
    if (hitsBuilding(city, car.x, car.y, 30)) {
      car.x = beforeX;
      car.y = beforeY;
      if (Math.abs(car.speed) > 200) {
        state.damagePlayer(6);
        state.effects.push({ kind: 'crash', x: car.x, y: car.y, t: 0.5 });
        state.audio.sfx.crash();
      }
      car.speed *= -0.25;
    }
    // Car-vs-car crashes.
    for (const other of state.traffic) {
      const dx = car.x - other.x;
      const dy = car.y - other.y;
      const d = Math.hypot(dx, dy);
      if (d < 58 && d > 0.01) {
        const push = (58 - d) / 2;
        car.x += (dx / d) * push;
        car.y += (dy / d) * push;
        other.x -= (dx / d) * push;
        other.y -= (dy / d) * push;
        if (Math.abs(car.speed) > 240) {
          state.damagePlayer(4);
          state.audio.sfx.crash();
          state.effects.push({ kind: 'crash', x: (car.x + other.x) / 2, y: (car.y + other.y) / 2, t: 0.4 });
          car.speed *= 0.5;
        }
      }
    }
    // Running over a pedestrian is a crime.
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < 34 && Math.abs(car.speed) > 140) {
        ped.state = 'down';
        ped.stateTime = 8;
        crime('Pedestrian hit', 1);
        state.danger = { x: car.x, y: car.y, radius: 300 };
      }
    }
    state.player.x = car.x;
    state.player.y = car.y;
    state.player.angle = car.angle;
  }

  /** Red Tide lookouts keep the arena corner dangerous between missions. */
  function stepAmbientGang() {
    const mission = state.missionIndex < MISSIONS.length ? MISSIONS[state.missionIndex] : null;
    if (mission && mission.id === 'arena-brawl') return; // the mission owns the arena
    const arena = LANDMARKS.arena;
    const near = Math.hypot(state.player.x - arena.x, state.player.y - arena.y) < AMBIENT_GANG.anchorRadius;
    const lookouts = state.enemies.filter((e) => e.home);
    if (near && lookouts.length < AMBIENT_GANG.count && chance(random, 0.02)) {
      const a = range(random, 0, Math.PI * 2);
      const home = { x: arena.x + Math.cos(a) * 120, y: arena.y + Math.sin(a) * 120 };
      state.enemies.push(makeEnemy(random, home.x, home.y, 80, home));
    }
    if (!near) {
      // The player left the district: the lookouts melt away.
      state.enemies = state.enemies.filter((e) => !e.home);
    }
  }

  function stepPickups() {
    for (const p of state.pickups) {
      if (p.taken) continue;
      if (Math.hypot(p.x - state.player.x, p.y - state.player.y) < 30) {
        p.taken = true;
        if (p.kind === 'cash') {
          state.money += 40;
          state.toast = 'Found cash — +$40';
        } else if (p.kind === 'ammo') {
          state.player.ammo += ECONOMY.ammoPack;
          state.toast = `Ammo +${ECONOMY.ammoPack}`;
        } else {
          state.player.health = Math.min(PLAYER.maxHealth, state.player.health + 30);
          state.toast = 'First aid — +30 health';
        }
        state.toastTime = 2;
        state.audio.sfx.coin();
      }
    }
  }

  /** One fixed step. `actions` are the one-shot ACTION_* flags from input. */
  function step(input, actions, dt) {
    if (state.busted || state.wasted) return EVENT_NONE;
    const prevX = state.player.x;
    const prevY = state.player.y;
    state.elapsed += dt;
    state.toastTime = Math.max(0, state.toastTime - dt);
    state.punchCooldown = Math.max(0, state.punchCooldown - dt);
    state.shootCooldown = Math.max(0, state.shootCooldown - dt);
    state.hurtT = Math.max(0, state.hurtT - dt);
    state.danger = null;

    if (actions & ACTION_ENTER) {
      if (state.inCar) exitCar();
      else enterCar();
    }
    if (actions & ACTION_PUNCH && !state.inCar) playerPunch(state);
    if (actions & ACTION_SHOOT && !state.inCar) {
      if (state.player.ammo > 0 && state.shootCooldown <= 0) {
        state.shootCooldown = 0.28;
        state.player.ammo -= 1;
        const aim = input.mouseAimAngle ? input.mouseAimAngle() : null;
        const angle = aim === null || aim === undefined ? state.player.angle : aim;
        fireBullet(state.bullets, state.player.x + Math.cos(angle) * 22, state.player.y + Math.sin(angle) * 22, angle, true);
        state.audio.sfx.shoot();
        state.effects.push({ kind: 'flash', x: state.player.x + Math.cos(angle) * 30, y: state.player.y + Math.sin(angle) * 30, t: 0.09 });
        state.danger = { x: state.player.x, y: state.player.y, radius: 420 };
        if (state.peds.some((p) => p.state !== 'down' && Math.hypot(p.x - state.player.x, p.y - state.player.y) < 420)) {
          crime('Shots fired', 1);
        }
      }
    }
    if (actions & ACTION_SAVE) saveGame();
    stepShops(state, actions);

    if (state.inCar) stepPlayerCar(input, dt);
    else stepPlayerOnFoot(input, dt);

    // The player's velocity, for the camera lead and the police intercept.
    state.playerVx = (state.player.x - prevX) / dt;
    state.playerVy = (state.player.y - prevY) / dt;

    stepTraffic(state.traffic, dt, random, state.car);
    // Keep the streets full: replace traffic cars that drove far away.
    if (state.traffic.length < 30 && chance(random, dt * 0.8)) {
      state.traffic.push(spawnTrafficCar(random));
    }
    if (state.traffic.length > 60) state.traffic.splice(0, state.traffic.length - 60);
    const phonedIn = stepPedestrians(state.peds, dt, random, state.danger);
    if (phonedIn && state.wanted === 0 && state.elapsed - (state.lastCrimeAt ?? -999) < 20) {
      // A witness report on a crime from the last few seconds that the
      // police had not heard about yet — old history is never dredged up.
      addWanted(state, 1, 'Witness report');
    }
    if (state.peds.length < PED_COUNT && chance(random, dt * 0.5)) {
      state.peds.push(createPedestrians(random, 1)[0]);
    }
    stepBullets(state, dt);
    stepAmbientGang();
    stepEnemies(state, dt);
    syncPolice(state, random);
    stepPolice(state, dt);

    for (let i = state.effects.length - 1; i >= 0; i -= 1) {
      state.effects[i].t -= dt;
      if (state.effects[i].t <= 0) state.effects.splice(i, 1);
    }
    for (let i = state.skids.length - 1; i >= 0; i -= 1) {
      state.skids[i].t -= dt;
      if (state.skids[i].t <= 0) state.skids.splice(i, 1);
    }

    stepPickups();
    const result = stepMission(state, dt);
    if (result === 'failed') {
      state.toast = 'Mission failed — the timer ran out. Retrying the mission…';
      state.toastTime = 4;
      startMission(state, state.missionIndex);
    }

    // Camera follows the player with a lead toward where they are heading,
    // clamped inside the city.
    const leadX = Math.max(-150, Math.min(150, state.playerVx * 0.32));
    const leadY = Math.max(-150, Math.min(150, state.playerVy * 0.32));
    const tx = Math.max(640, Math.min(CITY_SIZE - 640, state.player.x + leadX));
    const ty = Math.max(360, Math.min(CITY_SIZE - 360, state.player.y + leadY));
    state.camera.x += (tx - state.camera.x) * Math.min(1, dt * 5);
    state.camera.y += (ty - state.camera.y) * Math.min(1, dt * 5);
    return EVENT_NONE;
  }

  function reset() {
    state.player.x = 1250;
    state.player.y = 1250;
    state.player.health = PLAYER.maxHealth;
    state.player.ammo = 24;
    state.money = ECONOMY.startMoney;
    state.wanted = 0;
    state.heat = 1;
    state.cops.length = 0;
    state.enemies.length = 0;
    state.bullets.length = 0;
    state.skids.length = 0;
    state.busted = false;
    state.wasted = false;
    state.missionsDone = 0;
    state.storyComplete = false;
    state.elapsed = 0;
    if (state.inCar) exitCar();
    startMission(state, 0);
  }

  startMission(state, 0);
  return { state, step, reset, saveGame, loadGame, enterCar, exitCar };
}
