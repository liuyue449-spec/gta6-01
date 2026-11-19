// Drawing only: the world's state and the current screen in, pixels out.
// The 1280x720 viewport is scaled to fit the window and centred; the world
// is drawn through the camera, the HUD and menus in screen space. Sun-soaked
// palette, long soft shadows, palm trees and a blue bay — a bright modern
// coastal city, drawn entirely with canvas shapes.
import { CITY_SIZE, FONT, PALETTE, ROAD_CENTRES, ROAD_W, VIEW } from './config.js';
import { missionStatus } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const MAP_SIZE = 208;
const MAP_SCALE = MAP_SIZE / CITY_SIZE;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, dpr: 1 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    view.dpr = ratio;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    view.x = (canvas.width - VIEW.width * view.scale) / 2;
    view.y = (canvas.height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function drawCarShape(car, isPlayer) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    // Soft shadow.
    context.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(context, -30, -13, 64, 32, 8);
    context.fill();
    context.fillStyle = car.color;
    roundRect(context, -32, -15, 64, 30, 9);
    context.fill();
    context.fillStyle = 'rgba(20,30,45,0.85)';
    roundRect(context, -12, -12, 22, 24, 4);
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.75)';
    context.fillRect(28, -12, 3, 24);
    if (car.isCop) {
      const flash = Math.floor(performance.now() / 180) % 2 === 0;
      context.fillStyle = flash ? '#ff2d2d' : '#2d6bff';
      context.fillRect(-4, -13, 10, 5);
      context.fillStyle = flash ? '#2d6bff' : '#ff2d2d';
      context.fillRect(-4, 8, 10, 5);
      text('POLICE', 0, -20, 11, '#ffffff', 'center');
    }
    if (isPlayer) {
      context.strokeStyle = '#ffd23f';
      context.lineWidth = 3;
      roundRect(context, -34, -17, 68, 34, 10);
      context.stroke();
    }
    context.restore();
  }

  function drawPerson(x, y, angle, shirt, down, bob, label) {
    context.save();
    context.translate(x, y);
    if (down) context.rotate(Math.PI / 2);
    const wobble = Math.sin(bob) * 2;
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.ellipse(2, 4, 11, 8, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = shirt;
    context.beginPath();
    context.arc(0, wobble * 0.3, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f2c89b';
    context.beginPath();
    context.arc(Math.cos(angle) * 4, Math.sin(angle) * 4 + wobble * 0.3, 6, 0, Math.PI * 2);
    context.fill();
    context.restore();
    if (label) text(label, x, y - 22, 12, '#ffffff', 'center');
  }

  function drawCity(state) {
    const city = state.city;
    const cam = state.camera;
    const left = cam.x - VIEW.width / 2 - 80;
    const top = cam.y - VIEW.height / 2 - 80;
    const right = cam.x + VIEW.width / 2 + 80;
    const bottom = cam.y + VIEW.height / 2 + 80;

    // Ground: grass everywhere, sand and water along the south bay.
    context.fillStyle = PALETTE.grass;
    context.fillRect(left, top, right - left, bottom - top);
    context.fillStyle = PALETTE.sand;
    context.fillRect(left, city.beach.y, right - left, city.beach.h);
    context.fillStyle = PALETTE.water;
    context.fillRect(left, city.beach.y + 110, right - left, 80);
    context.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 8; i += 1) {
      const wx = ((i * 457) % CITY_SIZE);
      if (wx > left && wx < right) context.fillRect(wx, city.beach.y + 128 + (i % 3) * 18, 90, 4);
    }
    // Parks.
    for (const p of city.parks) {
      context.fillStyle = PALETTE.grassDark;
      roundRect(context, p.x, p.y, p.w, p.h, 18);
      context.fill();
      text(p.name, p.x + p.w / 2, p.y + 30, 16, '#ffffff', 'center');
    }
    // Sidewalks then roads.
    context.fillStyle = PALETTE.sidewalk;
    for (const c of ROAD_CENTRES) {
      context.fillRect(left, c - ROAD_W / 2 - 12, right - left, ROAD_W + 24);
      context.fillRect(c - ROAD_W / 2 - 12, top, ROAD_W + 24, bottom - top);
    }
    context.fillStyle = PALETTE.road;
    for (const c of ROAD_CENTRES) {
      context.fillRect(left, c - ROAD_W / 2, right - left, ROAD_W);
      context.fillRect(c - ROAD_W / 2, top, ROAD_W, bottom - top);
    }
    // Centre dashes.
    context.fillStyle = PALETTE.roadLine;
    for (const c of ROAD_CENTRES) {
      for (let v = 0; v < CITY_SIZE; v += 90) {
        if (v > left - 90 && v < right) context.fillRect(v, c - 3, 44, 6);
        if (v > top - 90 && v < bottom) context.fillRect(c - 3, v, 6, 44);
      }
    }
    // Buildings with roofs, windows and a soft shadow.
    for (const b of city.buildings) {
      if (b.x + b.w < left || b.x > right || b.y + b.h < top || b.y > bottom) continue;
      context.fillStyle = 'rgba(0,0,0,0.22)';
      context.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.strokeStyle = 'rgba(0,0,0,0.25)';
      context.lineWidth = 2;
      context.strokeRect(b.x, b.y, b.w, b.h);
      context.fillStyle = 'rgba(255,255,255,0.5)';
      const cols = Math.max(2, Math.floor(b.w / 42));
      const rows = Math.max(2, Math.floor(b.h / 42));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          context.fillRect(b.x + 12 + cx * ((b.w - 24) / cols), b.y + 12 + cy * ((b.h - 24) / rows), 14, 10);
        }
      }
      if (b.landmark) {
        const names = { bank: 'BANK', hospital: 'HOSPITAL', garage: "RICO'S", hideout: 'HIDEOUT', market: 'MARKET', arena: 'ARENA', pier: 'PIER', cafe: 'CAFE' };
        text(names[b.landmark] || '', b.x + b.w / 2, b.y + b.h / 2 + 6, 18, '#ffffff', 'center');
      }
    }
    // Palm trees.
    for (const t of city.trees) {
      if (t.x < left || t.x > right || t.y < top || t.y > bottom) continue;
      context.fillStyle = '#7a5230';
      context.fillRect(t.x - 2, t.y - 2, 4, 10);
      context.fillStyle = PALETTE.parkTree;
      context.beginPath();
      context.arc(t.x, t.y - 6, 11, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawWorld(state) {
    drawCity(state);
    // Mission target: a pulsing gold beacon with a beam.
    if (state.target) {
      const pulse = 1 + Math.sin(performance.now() / 220) * 0.15;
      context.save();
      context.globalAlpha = 0.25;
      context.fillStyle = PALETTE.mission;
      context.beginPath();
      context.arc(state.target.x, state.target.y, 60 * pulse, 0, Math.PI * 2);
      context.fill();
      context.restore();
      context.strokeStyle = PALETTE.mission;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(state.target.x, state.target.y, 26 * pulse, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = PALETTE.mission;
      context.beginPath();
      context.arc(state.target.x, state.target.y, 7, 0, Math.PI * 2);
      context.fill();
      text(state.target.label, state.target.x, state.target.y - 40, 15, '#fff200', 'center');
    }
    // Pickups.
    for (const p of state.pickups) {
      if (p.taken) continue;
      context.fillStyle = p.kind === 'cash' ? '#2ecc71' : '#f39c12';
      context.beginPath();
      context.arc(p.x, p.y, 11, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      context.stroke();
      text(p.kind === 'cash' ? '$' : 'A', p.x, p.y + 5, 13, '#ffffff', 'center');
    }
    // Traffic and police cars.
    for (const car of state.traffic) drawCarShape(car, false);
    for (const cop of state.cops) drawCarShape(cop, false);
    if (state.inCar && state.car) drawCarShape(state.car, true);
    // Pedestrians, gang members, the player.
    for (const ped of state.peds) {
      drawPerson(ped.x, ped.y, ped.angle, ped.shirt, ped.state === 'down', ped.bob);
    }
    for (const e of state.enemies) {
      drawPerson(e.x, e.y, e.angle, '#8b1e2d', e.state === 'down', e.bob, '');
      if (e.state !== 'down') {
        text(`HP ${Math.max(0, Math.ceil(e.hp))}`, e.x, e.y - 40, 12, '#ffffff', 'center');
        context.fillStyle = 'rgba(0,0,0,0.5)';
        context.fillRect(e.x - 18, e.y - 34, 36, 5);
        context.fillStyle = '#ff5252';
        context.fillRect(e.x - 18, e.y - 34, 36 * (e.hp / e.maxHp), 5);
      }
    }
    if (!state.inCar) {
      drawPerson(state.player.x, state.player.y, state.player.angle, PALETTE.playerShirt, false, performance.now() / 90);
      // Facing arrow and name tag.
      context.strokeStyle = '#ffffff';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(state.player.x, state.player.y);
      context.lineTo(state.player.x + Math.cos(state.player.angle) * 26, state.player.y + Math.sin(state.player.angle) * 26);
      context.stroke();
      text('ALEX', state.player.x, state.player.y - 24, 12, '#ffffff', 'center');
    }
    // Bullets.
    context.fillStyle = '#ffe66d';
    for (const b of state.bullets) {
      context.save();
      context.translate(b.x, b.y);
      context.rotate(b.angle);
      context.fillRect(-8, -2, 16, 4);
      context.restore();
    }
    // Effects: crash stars and hit flashes.
    for (const fx of state.effects) {
      const a = Math.max(0, fx.t * 2);
      context.save();
      context.globalAlpha = a;
      context.fillStyle = fx.kind === 'crash' ? '#ff9f1c' : '#ffffff';
      context.beginPath();
      context.arc(fx.x, fx.y, 18 * (1 - a) + 6, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  function drawMinimap(state) {
    const mx = VIEW.width - MAP_SIZE - 16;
    const my = 16;
    context.fillStyle = 'rgba(10,16,26,0.78)';
    roundRect(context, mx - 6, my - 6, MAP_SIZE + 12, MAP_SIZE + 12, 10);
    context.fill();
    context.save();
    context.beginPath();
    roundRect(context, mx, my, MAP_SIZE, MAP_SIZE, 6);
    context.clip();
    context.fillStyle = '#4a7c3a';
    context.fillRect(mx, my, MAP_SIZE, MAP_SIZE);
    context.fillStyle = '#3fa7d6';
    context.fillRect(mx, my + MAP_SIZE - 12, MAP_SIZE, 12);
    context.strokeStyle = '#3d4450';
    context.lineWidth = 5;
    for (const c of ROAD_CENTRES) {
      const v = c * MAP_SCALE;
      context.beginPath();
      context.moveTo(mx + v, my);
      context.lineTo(mx + v, my + MAP_SIZE);
      context.moveTo(mx, my + v);
      context.lineTo(mx + MAP_SIZE, my + v);
      context.stroke();
    }
    const dot = (x, y, color, r) => {
      context.fillStyle = color;
      context.beginPath();
      context.arc(mx + x * MAP_SCALE, my + y * MAP_SCALE, r, 0, Math.PI * 2);
      context.fill();
    };
    if (state.target) dot(state.target.x, state.target.y, '#ffd23f', 6);
    for (const cop of state.cops) dot(cop.x, cop.y, '#ff5252', 4);
    for (const e of state.enemies) if (e.state !== 'down') dot(e.x, e.y, '#ff8c42', 3);
    dot(state.player.x, state.player.y, '#ffffff', 5);
    context.strokeStyle = '#ffd23f';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(mx + state.player.x * MAP_SCALE, my + state.player.y * MAP_SCALE, 8, 0, Math.PI * 2);
    context.stroke();
    context.restore();
    text('SUNHAVEN', mx + MAP_SIZE / 2, my + MAP_SIZE + 20, 12, '#ffffff', 'center');
  }

  function drawHud(state) {
    // Top-left panel: health, money, wanted stars, ammo.
    context.fillStyle = PALETTE.hudPanel;
    roundRect(context, 14, 14, 330, 118, 10);
    context.fill();
    text(`$${state.money}`, 28, 44, 26, PALETTE.hudGold, 'left');
    text('HEALTH', 28, 72, 13, '#9fb3c8', 'left');
    context.fillStyle = 'rgba(255,255,255,0.2)';
    context.fillRect(28, 80, 180, 12);
    context.fillStyle = state.player.health > 30 ? '#2ecc71' : '#ff5252';
    context.fillRect(28, 80, 180 * (state.player.health / 100), 12);
    text(`${Math.ceil(state.player.health)}`, 216, 92, 14, '#ffffff', 'left');
    const stars = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
    text(stars, 28, 120, 22, state.wanted > 0 ? '#ff5252' : '#9fb3c8', 'left');
    text(state.inCar ? `${state.car ? state.car.type : 'CAR'} · ${Math.round(Math.abs(state.car ? state.car.speed : 0) * 0.12)} mph` : `AMMO ${state.player.ammo}`, 246, 120, 14, '#ffffff', 'left');

    // Mission tracker under the top-left panel.
    const status = missionStatus(state);
    context.fillStyle = PALETTE.hudPanel;
    roundRect(context, 14, 142, 420, 34, 8);
    context.fill();
    text(status.length > 62 ? status.slice(0, 62) + '…' : status, 26, 164, 15, PALETTE.hudGold, 'left');

    // Arrest progress: a cop is grabbing you.
    if (state.arrestTimer > 0.2) {
      context.fillStyle = 'rgba(255,45,45,0.85)';
      roundRect(context, VIEW.width / 2 - 160, 90, 320, 30, 8);
      context.fill();
      text('ARREST IN PROGRESS — MOVE! (hold a direction)', VIEW.width / 2, 110, 15, '#ffffff', 'center');
    }
    // Toast messages.
    if (state.toastTime > 0 && state.toast) {
      context.fillStyle = 'rgba(10,16,26,0.8)';
      const w = Math.min(760, 40 + state.toast.length * 8.4);
      roundRect(context, VIEW.width / 2 - w / 2, VIEW.height - 84, w, 40, 8);
      context.fill();
      text(state.toast.length > 88 ? state.toast.slice(0, 88) + '…' : state.toast, VIEW.width / 2, VIEW.height - 57, 16, '#ffffff', 'center');
    }
    // Controls hint.
    text('WASD move/drive · E enter/exit car · F punch · G shoot (aim with mouse) · P pause · H save', VIEW.width / 2, VIEW.height - 14, 13, 'rgba(255,255,255,0.75)', 'center');
    drawMinimap(state);
    if (state.storyComplete) {
      text('★ KING OF SUNHAVEN ★', VIEW.width / 2, 52, 22, PALETTE.hudGold, 'center');
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 32 + 70;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = 'rgba(8,12,20,0.82)';
    roundRect(context, x, y, width, height, 16);
    context.fill();
    context.strokeStyle = accent || PALETTE.hudGold;
    context.lineWidth = 3;
    roundRect(context, x, y, width, height, 16);
    context.stroke();
    text(title, VIEW.width / 2, y + 62, 44, accent || PALETTE.hudGold, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW.width / 2, y + 118 + i * 32, 19, '#e8eef4', 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 30, 20, PALETTE.hudGold, 'center');
  }

  /** Paint one frame: the world through the camera, then the HUD or a menu. */
  function draw(state, screen) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0b1524';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const cam = state.camera;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + VIEW.width * view.scale / 2 - cam.x * view.scale, view.y + VIEW.height * view.scale / 2 - cam.y * view.scale);
    drawWorld(state);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      context.fillStyle = 'rgba(8,14,24,0.45)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('SUNHAVEN STREETS', [
        'A sun-soaked open-world crime game. You are Alex Vega,',
        'a driver new in town with a debt to clear.',
        'Steal cars, outrun the police, run 5 story missions,',
        'and become the King of Sunhaven.',
        '',
        `Missions done: ${state.missionsDone} / 5    Money: $${state.money}`,
        'WASD move & drive · E steal / exit car · F punch · G shoot',
      ], 'Press Space or click to start — C continues a saved game', '#ffd23f');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) {
      context.fillStyle = 'rgba(8,14,24,0.55)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('PAUSED', [
        'The city waits for you.',
        `Money $${state.money} · Missions ${state.missionsDone}/5 · Cars stolen ${state.stats.carsStolen}`,
        'H saves your game. M toggles music.',
      ], 'Press P or Space to resume');
    } else if (screen === SCREEN_BUSTED) {
      context.fillStyle = 'rgba(20,4,8,0.6)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('BUSTED', ['The Sunhaven police caught you.', 'A fine was taken from your cash.'], 'Press Space to walk out of the precinct', '#ff5252');
    } else if (screen === SCREEN_WASTED) {
      context.fillStyle = 'rgba(20,4,8,0.6)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('WASTED', ['You blacked out on the streets of Sunhaven.', 'The hospital patched you up — for a price.'], 'Press Space to leave St. Coral Hospital', '#ff5252');
    }
  }

  /** Convert a mouse position in CSS pixels to world coordinates. */
  function screenToWorld(cssX, cssY, camera) {
    const dx = cssX * view.dpr;
    const dy = cssY * view.dpr;
    return {
      x: (dx - view.x) / view.scale + camera.x - VIEW.width / 2,
      y: (dy - view.y) / view.scale + camera.y - VIEW.height / 2,
    };
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld };
}
