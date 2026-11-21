// Combat: fists and a pistol, bullets that stop at walls, and the Red Tide
// gang members who show up in missions and loiter around the arena. Enemies
// chase the player, swing when close, shoot back from mid-range with a
// cheap pistol of their own, and drop cash — sometimes an ammo box — when
// beaten. A badly hurt enemy breaks and runs. Shooting in public is a
// crime: every shot a pedestrian sees adds heat back in world.js.
import { CITY_SIZE, PLAYER } from './config.js';
import { hitsBuilding } from './city.js';
import { range } from './random.js';

export function makeEnemy(random, x, y, hp, home) {
  return {
    x, y, hp: hp ?? 100, maxHp: hp ?? 100,
    angle: range(random, 0, Math.PI * 2),
    speed: range(random, 95, 130),
    attackCooldown: 0,
    shootCooldown: range(random, 0.6, 1.6),
    state: 'chase', // chase | hurt | down | flee | home
    hurtTime: 0,
    home: home ? { x: home.x, y: home.y } : null,
    bob: range(random, 0, Math.PI * 2),
  };
}

export function fireBullet(bullets, x, y, angle, fromPlayer) {
  if (bullets.length > 48) return false;
  bullets.push({ x, y, angle, speed: 900, life: 0.9, fromPlayer });
  return true;
}

function downEnemy(state, e) {
  e.state = 'down';
  state.money += 60;
  state.toast = 'Gang member down — +$60';
  state.toastTime = 2;
  state.audio.sfx.coin();
  // One in three drops the ammo they were carrying, as a world pickup.
  if (state.random() < 0.34) {
    state.pickups.push({ x: e.x + 18, y: e.y + 10, kind: 'ammo', taken: false });
  }
}

export function stepBullets(state, dt) {
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const b = state.bullets[i];
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    b.life -= dt;
    let dead = b.life <= 0 || b.x < 0 || b.y < 0 || b.x > CITY_SIZE || b.y > CITY_SIZE;
    // Walls stop bullets: no shooting through a building to the next street.
    if (!dead && hitsBuilding(state.city, b.x, b.y, 3)) {
      state.effects.push({ kind: 'hit', x: b.x, y: b.y, t: 0.18 });
      dead = true;
    }
    if (!dead && b.fromPlayer) {
      for (const e of state.enemies) {
        if (e.state === 'down') continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < 20) {
          e.hp -= 34;
          e.state = 'hurt';
          e.hurtTime = 0.3;
          state.effects.push({ kind: 'hit', x: e.x, y: e.y, t: 0.3 });
          if (e.hp <= 0) downEnemy(state, e);
          dead = true;
          break;
        }
      }
    }
    if (!dead && !b.fromPlayer) {
      const target = state.inCar && state.car ? state.car : state.player;
      const radius = state.inCar ? 30 : 16;
      if (Math.hypot(target.x - b.x, target.y - b.y) < radius) {
        state.damagePlayer(11);
        dead = true;
      }
    }
    if (dead) state.bullets.splice(i, 1);
  }
}

/** The player's punch: hits the nearest enemy or pedestrian in range ahead. */
export function playerPunch(state) {
  if (state.punchCooldown > 0) return;
  state.punchCooldown = PLAYER.punchCooldown;
  state.audio.sfx.punch();
  state.effects.push({ kind: 'punch', x: state.player.x + Math.cos(state.player.angle) * 30, y: state.player.y + Math.sin(state.player.angle) * 30, t: 0.2 });
  for (const e of state.enemies) {
    if (e.state === 'down') continue;
    const d = Math.hypot(e.x - state.player.x, e.y - state.player.y);
    if (d < PLAYER.punchRange + 14) {
      e.hp -= PLAYER.punchDamage;
      e.state = 'hurt';
      e.hurtTime = 0.35;
      e.x += Math.cos(state.player.angle) * 18;
      e.y += Math.sin(state.player.angle) * 18;
      if (e.hp <= 0) downEnemy(state, e);
      return;
    }
  }
  // Punching a pedestrian is a crime, and it knocks them down.
  for (const p of state.peds) {
    if (p.state === 'down') continue;
    const d = Math.hypot(p.x - state.player.x, p.y - state.player.y);
    if (d < PLAYER.punchRange + 10) {
      p.state = 'down';
      p.stateTime = 8;
      state.crime('Assault', 1);
      state.danger = { x: state.player.x, y: state.player.y, radius: 240 };
      return;
    }
  }
}

export function stepEnemies(state, dt) {
  for (const e of state.enemies) {
    if (e.state === 'down') continue;
    e.bob += dt * 8;
    e.attackCooldown -= dt;
    e.shootCooldown -= dt;
    if (e.state === 'hurt') {
      e.hurtTime -= dt;
      if (e.hurtTime <= 0) e.state = 'chase';
      continue;
    }
    const dx = state.player.x - e.x;
    const dy = state.player.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    // A badly hurt gang member turns and runs instead of fighting on.
    if (e.hp <= 35 && e.state !== 'flee') e.state = 'flee';
    if (e.state === 'flee') {
      e.angle = Math.atan2(-dy, -dx);
      e.x += (-dx / dist) * e.speed * 1.15 * dt;
      e.y += (-dy / dist) * e.speed * 1.15 * dt;
      if (dist > 420) e.state = e.home ? 'home' : 'chase';
      continue;
    }
    // A lookout with a home corner drifts back to it once the player is far.
    if (e.home && dist > 300) e.state = 'home';
    if (e.state === 'home' && e.home) {
      const hx = e.home.x - e.x;
      const hy = e.home.y - e.y;
      const hd = Math.hypot(hx, hy) || 1;
      if (hd > 24) {
        e.angle = Math.atan2(hy, hx);
        e.x += (hx / hd) * e.speed * 0.7 * dt;
        e.y += (hy / hd) * e.speed * 0.7 * dt;
      }
      if (dist <= 300) e.state = 'chase';
      continue;
    }
    e.angle = Math.atan2(dy, dx);
    if (dist > 34) {
      e.x += (dx / dist) * e.speed * dt;
      e.y += (dy / dist) * e.speed * dt;
      // From mid-range a gang member stops to shoot: wild, slow, dodgeable.
      if (dist > 110 && dist < 330 && e.shootCooldown <= 0) {
        e.shootCooldown = range(state.random, 1.1, 2.1);
        const spread = range(state.random, -0.16, 0.16);
        const a = Math.atan2(dy, dx) + spread;
        fireBullet(state.bullets, e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20, a, false);
        state.audio.sfx.shoot();
        state.danger = { x: e.x, y: e.y, radius: 300 };
      }
    } else if (e.attackCooldown <= 0) {
      e.attackCooldown = 0.9;
      state.damagePlayer(9);
      state.effects.push({ kind: 'hit', x: state.player.x, y: state.player.y, t: 0.3 });
    }
  }
}
