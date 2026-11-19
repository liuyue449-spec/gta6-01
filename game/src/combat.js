// Combat: fists and a pistol, bullets with trails, and the street gang
// members who show up in missions and around the arena. Enemies chase the
// player, swing when close, and drop cash when beaten. The player can also
// buy ammo at the market. Shooting in public is a crime: every shot that a
// pedestrian sees adds heat.
import { CITY_SIZE, PLAYER } from './config.js';
import { range } from './random.js';

export function makeEnemy(random, x, y, hp) {
  return {
    x, y, hp: hp ?? 100, maxHp: hp ?? 100,
    angle: range(random, 0, Math.PI * 2),
    speed: range(random, 95, 130),
    attackCooldown: 0,
    state: 'chase', // chase | hurt | down
    hurtTime: 0,
    bob: range(random, 0, Math.PI * 2),
  };
}

export function fireBullet(bullets, x, y, angle, fromPlayer) {
  if (bullets.length > 40) return false;
  bullets.push({ x, y, angle, speed: 900, life: 0.9, fromPlayer });
  return true;
}

export function stepBullets(state, dt) {
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const b = state.bullets[i];
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    b.life -= dt;
    let dead = b.life <= 0 || b.x < 0 || b.y < 0 || b.x > CITY_SIZE || b.y > CITY_SIZE;
    if (!dead && b.fromPlayer) {
      for (const e of state.enemies) {
        if (e.state === 'down') continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < 20) {
          e.hp -= 34;
          e.state = 'hurt';
          e.hurtTime = 0.3;
          state.effects.push({ kind: 'hit', x: e.x, y: e.y, t: 0.3 });
          if (e.hp <= 0) {
            e.state = 'down';
            state.money += 60;
            state.toast = 'Gang member down — +$60';
            state.toastTime = 2;
            state.audio.sfx.coin();
          }
          dead = true;
          break;
        }
      }
    }
    if (!dead && !b.fromPlayer) {
      if (Math.hypot(state.player.x - b.x, state.player.y - b.y) < 16) {
        state.damagePlayer(12, 'shot');
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
      if (e.hp <= 0) {
        e.state = 'down';
        state.money += 60;
        state.toast = 'Gang member down — +$60';
        state.toastTime = 2;
        state.audio.sfx.coin();
      }
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
      return;
    }
  }
}

export function stepEnemies(state, dt) {
  for (const e of state.enemies) {
    if (e.state === 'down') continue;
    e.bob += dt * 8;
    e.attackCooldown -= dt;
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
      if (dist > 420) e.state = 'chase';
      continue;
    }
    e.angle = Math.atan2(dy, dx);
    if (dist > 34) {
      e.x += (dx / dist) * e.speed * dt;
      e.y += (dy / dist) * e.speed * dt;
    } else if (e.attackCooldown <= 0) {
      e.attackCooldown = 0.9;
      state.damagePlayer(9, 'beaten up');
      state.effects.push({ kind: 'hit', x: state.player.x, y: state.player.y, t: 0.3 });
    }
  }
}
