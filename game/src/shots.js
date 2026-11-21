// The screenshot scenes behind ?shot=cover|street|chase|mission. Each one
// stages the real game state by hand — the player, traffic, police and
// mission markers placed exactly where the camera can see them — then the
// renderer paints the frame exactly as a player would see it. The same seed
// always gives the same frame, because the world is built from that seed
// and the staging only moves things to fixed spots. The scenes are dressed
// to show the whole game at a glance: dense traffic and a patrol car on the
// cover, a busy market street on foot, a chase with skid marks and braking
// traffic, and the arena brawl mid-fight with one gang member already down.
import { LANDMARKS } from './city.js';
import { makeCar, spawnTrafficCar } from './vehicles.js';
import { makeEnemy } from './combat.js';
import { startMission } from './missions.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function placePlayerInCar(state, x, y, angle, speed, color) {
  const car = makeCar(state.random, x, y, angle, { color, type: { name: 'Sport', speed: 1.25, color }, parked: false, driver: false });
  car.isPlayer = true;
  car.speed = speed;
  state.car = car;
  state.inCar = true;
  state.player.x = x;
  state.player.y = y;
  state.player.angle = angle;
  state.camera.x = x;
  state.camera.y = y;
  return car;
}

function scatterTraffic(state, count, cx, cy) {
  state.traffic.length = 0;
  for (let i = 0; i < count; i += 1) {
    const car = spawnTrafficCar(state.random);
    // Pull the new car near the camera instead of anywhere in the city.
    car.x = cx + ((i % 5) - 2) * 260 + (i % 2) * 120;
    car.y = cy + (Math.floor(i / 5) % 3 - 1) * 190;
    car.axis = i % 2 === 0 ? 'x' : 'y';
    car.angle = car.axis === 'x' ? 0 : Math.PI / 2;
    car.speed = 150;
    state.traffic.push(car);
  }
}

function addParkedCars(state, cx, cy) {
  // Two cars parked along the kerb near the camera, doors shut, going nowhere.
  const a = makeCar(state.random, cx - 300, cy - 96, 0, { parked: true, driver: false, color: '#2ecc71' });
  const b = makeCar(state.random, cx + 340, cy + 96, Math.PI, { parked: true, driver: false, color: '#9b59b6' });
  state.traffic.push(a, b);
}

function scatterPeds(state, count, cx, cy) {
  for (let i = 0; i < count; i += 1) {
    const ped = state.peds[i % state.peds.length];
    ped.x = cx + ((i * 173) % 700) - 350;
    ped.y = cy + ((i * 251) % 420) - 210;
    ped.state = 'walk';
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * cover: driving through downtown with traffic, a patrol car and the HUD.
 * street: on foot at Coral Market starting the courier mission.
 * chase: a 3-star police chase with cops, skid marks, stars and minimap.
 * mission: the arena brawl, fists out, one gang member already down.
 */
export function stageShot(name, world) {
  const state = world.state;
  state.busted = false;
  state.wasted = false;
  state.enemies.length = 0;
  state.cops.length = 0;
  state.bullets.length = 0;
  state.effects.length = 0;
  state.skids.length = 0;

  if (name === 'street') {
    state.inCar = false;
    state.car = null;
    state.player.x = LANDMARKS.market.x;
    state.player.y = LANDMARKS.market.y + 260;
    state.player.angle = -Math.PI / 2;
    state.player.health = 100;
    state.money = 470;
    state.wanted = 0;
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    startMission(state, 1);
    state.toast = 'Drop-off 1 · Coral Market — pick up the package';
    state.toastTime = 5;
    scatterPeds(state, 14, state.player.x, state.player.y);
    addParkedCars(state, state.player.x, state.player.y);
    const passer = spawnTrafficCar(state.random);
    passer.x = state.player.x - 420;
    passer.y = state.player.y - 190;
    passer.axis = 'x';
    passer.angle = 0;
    passer.speed = 170;
    state.traffic.push(passer);
    return { screen: SCREEN_PLAY };
  }

  if (name === 'chase') {
    state.wanted = 3;
    state.heat = 1;
    state.playerSeen = true;
    state.money = 890;
    state.player.health = 76;
    const hero = placePlayerInCar(state, 1750, 1750, 0, 320, '#e74c3c');
    hero.drift = 0.7;
    startMission(state, 5);
    state.missionStage = 2;
    state.setTarget(LANDMARKS.hideout.x, LANDMARKS.hideout.y, 'Hideout — lose the cops');
    state.toast = '3 stars! Lose the cops and reach the Hideout';
    state.toastTime = 5;
    scatterTraffic(state, 6, 1750, 1750);
    // One traffic car ahead is braking hard to get out of the way.
    const braking = state.traffic[0];
    if (braking) { braking.brake = 1; braking.speed = 60; }
    for (let i = 0; i < 3; i += 1) {
      const cop = makeCar(state.random, 1750 - 260 - i * 130, 1750 + (i % 2 ? 34 : -34), 0, { isCop: true, color: '#1d4ed8', type: { name: 'Patrol', speed: 1.15, color: '#1d4ed8' } });
      cop.speed = 480;
      state.cops.push(cop);
    }
    // The hero car has just swung through the junction: a fan of skid marks.
    for (let i = 0; i < 14; i += 1) {
      state.skids.push({ x: 1750 - 40 - i * 16, y: 1750 + 26 + Math.sin(i * 0.5) * 14, t: 5.5 - i * 0.2 });
      state.skids.push({ x: 1750 - 40 - i * 16, y: 1750 - 26 + Math.sin(i * 0.5) * 14, t: 5.5 - i * 0.2 });
    }
    state.effects.push({ kind: 'crash', x: 1750 - 210, y: 1750 - 60, t: 0.45 });
    scatterPeds(state, 6, 1750, 1750);
    return { screen: SCREEN_PLAY };
  }

  if (name === 'mission') {
    state.inCar = false;
    state.car = null;
    state.player.x = LANDMARKS.arena.x;
    state.player.y = LANDMARKS.arena.y + 60;
    state.player.angle = 0;
    state.player.health = 88;
    state.player.ammo = 18;
    state.money = 640;
    state.wanted = 0;
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    startMission(state, 3);
    state.missionStage = 1;
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2;
      state.enemies.push(makeEnemy(state.random, state.player.x + Math.cos(angle) * 150, state.player.y + Math.sin(angle) * 130, 100));
    }
    // The fight is already on: one is down, one is reeling, cash spilled.
    state.enemies[0].state = 'down';
    state.enemies[0].hp = 0;
    state.enemies[1].hp = 34;
    state.enemies[1].state = 'hurt';
    state.enemies[1].hurtTime = 0.3;
    state.pickups.push({ x: state.player.x + 90, y: state.player.y - 60, kind: 'cash', taken: false });
    state.effects.push({ kind: 'punch', x: state.player.x + 40, y: state.player.y, t: 0.4 });
    state.toast = 'Arena Brawl — take all 4 gang members down!';
    state.toastTime = 5;
    return { screen: SCREEN_PLAY };
  }

  // Default: cover — driving downtown at speed, city and HUD on show.
  state.wanted = 1;
  state.heat = 1;
  state.playerSeen = false;
  state.money = 320;
  state.player.health = 100;
  placePlayerInCar(state, 1250, 1750, 0, 300, '#f1c40f');
  startMission(state, 0);
  state.missionStage = 1;
  state.setTarget(LANDMARKS.garage.x, LANDMARKS.garage.y, "Rico's Garage");
  state.toast = 'Nice wheels! Bring the car to Rico\'s Garage';
  state.toastTime = 5;
  scatterTraffic(state, 11, 1250, 1750);
  // A patrol car cruises the far side of the junction, lights ready.
  const patrol = makeCar(state.random, 1250 + 430, 1750 - 190, Math.PI, { isCop: true, color: '#1d4ed8', type: { name: 'Patrol', speed: 1.15, color: '#1d4ed8' } });
  patrol.speed = 200;
  state.cops.push(patrol);
  scatterPeds(state, 10, 1250, 1750);
  return { screen: SCREEN_PLAY };
}

export function stageTitleShot(world) {
  const state = world.state;
  state.player.x = 1750;
  state.player.y = 1750;
  state.camera.x = 1750;
  state.camera.y = 1750;
  return { screen: SCREEN_TITLE };
}
