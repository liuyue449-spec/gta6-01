// Drawing only: the world's state and the current screen in, pixels out.
// The 1280x720 viewport is scaled to fit the window and centred; the world
// is drawn through the camera, the HUD and menus in screen space. Sun-soaked
// palette, long soft shadows, fan palms, rooftop clutter, animated bay
// water and a blue bay — a bright modern coastal city, drawn entirely with
// canvas shapes. The HUD names the district, shows the heat cooling under
// the stars, points at off-screen targets and flashes red when Alex is hurt.
import { CITY_SIZE, DAY_LENGTH, FONT, PALETTE, ROAD_CENTRES, ROAD_W, VIEW } from './config.js';
import { districtAt, LANDMARKS } from './city.js';
import { hash2 } from './random.js';
import { MISSIONS, missionStatus } from './missions.js';
import { shopHint } from './shops.js';

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
    // Headlights at the nose, tail lights at the rear — the rear pair burns
    // bright red while the car brakes, so traffic reads at a glance.
    context.fillStyle = PALETTE.headlight;
    context.beginPath();
    context.arc(31, -10, 3, 0, Math.PI * 2);
    context.arc(31, 10, 3, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = car.brake > 0.15 ? PALETTE.brakeLight : 'rgba(255,80,70,0.45)';
    context.fillRect(-33, -11, 3, 6);
    context.fillRect(-33, 5, 3, 6);
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
    // A stuck driver honks: a little quaver floats over the car.
    if (car.honk > 0) text('♪', car.x + 6, car.y - 30, 18, '#ffffff', 'center');
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
    // The boardwalk: a pale strip between the sand and the water.
    context.fillStyle = '#e8d9b0';
    context.fillRect(left, city.boardwalk.y, right - left, city.boardwalk.h);
    context.fillStyle = PALETTE.water;
    context.fillRect(left, city.beach.y + 110, right - left, 80);
    // Sparkle on the water, drifting with time so the bay feels alive.
    context.fillStyle = 'rgba(255,255,255,0.35)';
    const drift = (state.elapsed * 26) % 457;
    for (let i = 0; i < 8; i += 1) {
      const wx = ((i * 457 + drift) % CITY_SIZE);
      if (wx > left && wx < right) context.fillRect(wx, city.beach.y + 128 + (i % 3) * 18, 90, 4);
    }
    // Parks.
    for (const p of city.parks) {
      context.fillStyle = PALETTE.grassDark;
      roundRect(context, p.x, p.y, p.w, p.h, 18);
      context.fill();
      text(p.name, p.x + p.w / 2, p.y + 30, 16, '#ffffff', 'center');
    }
    // Parking lots: asphalt with bay lines, a breather between rooftops.
    for (const lot of city.lots) {
      if (lot.x + lot.w < left || lot.x > right || lot.y + lot.h < top || lot.y > bottom) continue;
      context.fillStyle = '#565d66';
      context.fillRect(lot.x, lot.y, lot.w, lot.h);
      context.strokeStyle = 'rgba(255,255,255,0.5)';
      context.lineWidth = 2;
      for (let i = 1; i < lot.bays; i += 1) {
        const bx = lot.x + (lot.w / lot.bays) * i;
        context.beginPath();
        context.moveTo(bx, lot.y + 10);
        context.lineTo(bx, lot.y + 44);
        context.stroke();
      }
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
    // Buildings with roofs, windows, rooftop clutter and a soft shadow.
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
      // Rooftop clutter, placed by a hash of the corner so it never flickers:
      // a water tank on some roofs, an air-conditioning box on others.
      const clutter = hash2(b.x, b.y);
      context.fillStyle = 'rgba(0,0,0,0.28)';
      if (clutter < 0.33) {
        context.beginPath();
        context.arc(b.x + b.w * 0.78, b.y + b.h * 0.24, 13, 0, Math.PI * 2);
        context.fill();
      } else if (clutter < 0.66) {
        context.fillRect(b.x + b.w * 0.66, b.y + b.h * 0.14, 30, 20);
      }
      if (b.landmark) {
        const names = { bank: 'BANK', hospital: 'HOSPITAL', garage: "RICO'S", hideout: 'HIDEOUT', market: 'MARKET', arena: 'ARENA', pier: 'PIER', cafe: 'CAFE' };
        text(names[b.landmark] || '', b.x + b.w / 2, b.y + b.h / 2 + 6, 18, '#ffffff', 'center');
      }
    }
    // Palm trees: a short trunk and a fan of fronds, not a lollipop.
    for (const t of city.trees) {
      if (t.x < left || t.x > right || t.y < top || t.y > bottom) continue;
      context.fillStyle = 'rgba(0,0,0,0.2)';
      context.beginPath();
      context.ellipse(t.x + 5, t.y + 6, 12, 7, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#7a5230';
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(t.x, t.y + 8);
      context.lineTo(t.x, t.y - 6);
      context.stroke();
      context.strokeStyle = PALETTE.parkTree;
      context.lineWidth = 3;
      for (let f = 0; f < 6; f += 1) {
        const a = (f / 6) * Math.PI * 2 + 0.4;
        context.beginPath();
        context.moveTo(t.x, t.y - 6);
        context.quadraticCurveTo(
          t.x + Math.cos(a) * 10, t.y - 6 + Math.sin(a) * 10 - 3,
          t.x + Math.cos(a) * 17, t.y - 6 + Math.sin(a) * 17 + 4,
        );
        context.stroke();
      }
    }
  }

  function drawWorld(state) {
    drawCity(state);
    // Skid marks under everything mobile: dark streaks that fade out.
    context.fillStyle = PALETTE.skid;
    for (const s of state.skids) {
      context.globalAlpha = Math.max(0, Math.min(0.55, s.t * 0.16));
      context.beginPath();
      context.arc(s.x, s.y, 5, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
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
    // Pickups: cash is green, ammo orange, first aid a white cross on red.
    for (const p of state.pickups) {
      if (p.taken) continue;
      if (p.kind === 'health') {
        context.fillStyle = '#e23b3b';
        context.beginPath();
        context.arc(p.x, p.y, 11, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#ffffff';
        context.fillRect(p.x - 2, p.y - 7, 4, 14);
        context.fillRect(p.x - 7, p.y - 2, 14, 4);
        continue;
      }
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
      if (ped.state === 'flee') text('!', ped.x, ped.y - 24, 15, '#ffd23f', 'center');
      if (ped.state === 'phone') text('☎', ped.x, ped.y - 24, 14, '#ffffff', 'center');
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
    // Effects: crash stars, hit flashes, muzzle flashes, punch arcs.
    for (const fx of state.effects) {
      const a = Math.max(0, fx.t * 2);
      context.save();
      context.globalAlpha = a;
      if (fx.kind === 'flash') {
        context.fillStyle = '#ffd23f';
        context.beginPath();
        context.arc(fx.x, fx.y, 9, 0, Math.PI * 2);
        context.fill();
      } else if (fx.kind === 'punch') {
        context.strokeStyle = '#ffffff';
        context.lineWidth = 3;
        context.beginPath();
        context.arc(fx.x, fx.y, 14 * (1 - a) + 6, 0, Math.PI * 2);
        context.stroke();
      } else {
        context.fillStyle = fx.kind === 'crash' ? '#ff9f1c' : '#ffffff';
        context.beginPath();
        context.arc(fx.x, fx.y, 18 * (1 - a) + 6, 0, Math.PI * 2);
        context.fill();
      }
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
    // Landmark letters, so the map teaches the city: $ bank, + hospital.
    const marks = { bank: '$', hospital: '+', garage: 'G', market: 'M', cafe: 'C', arena: 'A', pier: 'P', hideout: 'H' };
    for (const key of Object.keys(marks)) {
      const lm = LANDMARKS[key];
      text(marks[key], mx + lm.x * MAP_SCALE, my + lm.y * MAP_SCALE + 4, 10, 'rgba(255,255,255,0.85)', 'center');
    }
    // The player: a heading wedge inside the gold ring, not just a dot.
    const px = mx + state.player.x * MAP_SCALE;
    const py = my + state.player.y * MAP_SCALE;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.moveTo(px + Math.cos(state.player.angle) * 7, py + Math.sin(state.player.angle) * 7);
    context.lineTo(px + Math.cos(state.player.angle + 2.5) * 5, py + Math.sin(state.player.angle + 2.5) * 5);
    context.lineTo(px + Math.cos(state.player.angle - 2.5) * 5, py + Math.sin(state.player.angle - 2.5) * 5);
    context.closePath();
    context.fill();
    context.strokeStyle = '#ffd23f';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(px, py, 8, 0, Math.PI * 2);
    context.stroke();
    context.restore();
    text('SUNHAVEN', mx + MAP_SIZE / 2, my + MAP_SIZE + 20, 12, '#ffffff', 'center');
  }

  /** An arrow at the screen edge pointing at an off-screen mission target. */
  function drawTargetArrow(state) {
    if (!state.target) return;
    const cam = state.camera;
    const sx = state.target.x - cam.x + VIEW.width / 2;
    const sy = state.target.y - cam.y + VIEW.height / 2;
    if (sx > 40 && sx < VIEW.width - 40 && sy > 40 && sy < VIEW.height - 40) return;
    const cx = VIEW.width / 2;
    const cy = VIEW.height / 2;
    const angle = Math.atan2(sy - cy, sx - cx);
    const ax = Math.max(46, Math.min(VIEW.width - 46, sx));
    const ay = Math.max(46, Math.min(VIEW.height - 46, sy));
    const dist = Math.round(Math.hypot(state.target.x - state.player.x, state.target.y - state.player.y) / 10);
    context.save();
    context.translate(ax, ay);
    context.rotate(angle);
    context.fillStyle = PALETTE.mission;
    context.beginPath();
    context.moveTo(16, 0);
    context.lineTo(-8, -10);
    context.lineTo(-8, 10);
    context.closePath();
    context.fill();
    context.restore();
    text(`${dist}m`, ax, ay + 26, 12, PALETTE.mission, 'center');
  }

  function drawHud(state) {
    // Top-left panel: health, money, wanted stars, ammo.
    context.fillStyle = PALETTE.hudPanel;
    roundRect(context, 14, 14, 330, 132, 10);
    context.fill();
    text(`$${state.money}`, 28, 44, 26, PALETTE.hudGold, 'left');
    text(districtAt(state.player.x, state.player.y).toUpperCase(), 344, 44, 13, '#9fb3c8', 'right');
    text('HEALTH', 28, 72, 13, '#9fb3c8', 'left');
    context.fillStyle = 'rgba(255,255,255,0.2)';
    context.fillRect(28, 80, 180, 12);
    context.fillStyle = state.player.health > 30 ? '#2ecc71' : '#ff5252';
    context.fillRect(28, 80, 180 * (state.player.health / 100), 12);
    text(`${Math.ceil(state.player.health)}`, 216, 92, 14, '#ffffff', 'left');
    const stars = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
    text(stars, 28, 120, 22, state.wanted > 0 ? '#ff5252' : '#9fb3c8', 'left');
    text(state.inCar ? `${state.car ? state.car.type : 'CAR'} · ${Math.round(Math.abs(state.car ? state.car.speed : 0) * 0.12)} mph` : `AMMO ${state.player.ammo}`, 246, 120, 14, '#ffffff', 'left');
    // Under the stars: the heat bar. It drains while no cop can see Alex;
    // while he is in sight it stays full and says so.
    if (state.wanted > 0) {
      context.fillStyle = 'rgba(255,255,255,0.18)';
      context.fillRect(28, 128, 180, 6);
      context.fillStyle = state.playerSeen ? '#ff5252' : '#ffb84d';
      context.fillRect(28, 128, 180 * Math.max(0, Math.min(1, state.heat)), 6);
      text(state.playerSeen ? 'IN SIGHT' : 'COOLING…', 216, 136, 11, state.playerSeen ? '#ff5252' : '#ffb84d', 'left');
    }

    // Mission tracker under the top-left panel.
    const status = missionStatus(state);
    context.fillStyle = PALETTE.hudPanel;
    roundRect(context, 14, 156, 420, 34, 8);
    context.fill();
    text(status.length > 62 ? status.slice(0, 62) + '…' : status, 26, 178, 15, PALETTE.hudGold, 'left');

    // A shop door offers its wares on the line under the tracker.
    const hint = shopHint(state);
    if (hint) {
      context.fillStyle = PALETTE.hudPanel;
      roundRect(context, 14, 196, 420, 30, 8);
      context.fill();
      text(hint, 26, 216, 14, '#7be495', 'left');
    }

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
    text('WASD move/drive · Shift run / drift · E car · F punch · G shoot · B buy · P pause · H save', VIEW.width / 2, VIEW.height - 14, 13, 'rgba(255,255,255,0.75)', 'center');
    drawMinimap(state);
    drawTargetArrow(state);
    if (state.storyComplete) {
      text('★ KING OF SUNHAVEN ★', VIEW.width / 2, 52, 22, PALETTE.hudGold, 'center');
    }
    // Hurt feedback last, over everything: a red flash on the hit itself and
    // a deepening vignette while health is low.
    if (state.hurtT > 0) {
      context.fillStyle = `rgba(255,30,30,${(state.hurtT * 0.55).toFixed(3)})`;
      context.fillRect(0, 0, VIEW.width, VIEW.height);
    } else if (state.player.health > 0 && state.player.health <= 30) {
      const pulse = 0.10 + 0.05 * Math.sin(performance.now() / 300);
      context.fillStyle = `rgba(200,0,0,${pulse.toFixed(3)})`;
      context.fillRect(0, 0, VIEW.width, VIEW.height);
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

  /** A whisper of day tint over the world: the light warms and cools slowly. */
  function dayTint(state) {
    const phase = (state.elapsed % DAY_LENGTH) / DAY_LENGTH;
    const warm = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
    context.fillStyle = `rgba(255,${Math.round(150 + warm * 60)},60,${(0.03 + warm * 0.03).toFixed(3)})`;
    context.fillRect(0, 0, VIEW.width, VIEW.height);
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
    dayTint(state);
    if (screen === SCREEN_TITLE) {
      context.fillStyle = 'rgba(8,14,24,0.45)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('SUNHAVEN STREETS', [
        'A sun-soaked open-world crime game. You are Alex Vega,',
        'a driver new in town with a debt to clear.',
        `Steal cars, outrun the police, run ${MISSIONS.length} story missions,`,
        'and become the King of Sunhaven.',
        '',
        `Missions done: ${state.missionsDone} / ${MISSIONS.length}    Money: $${state.money}`,
        'WASD move & drive · E steal / exit car · F punch · G shoot',
        'B buys ammo at the market and a hot meal at the cafe',
      ], 'Press Space or click to start — C continues a saved game', '#ffd23f');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) {
      context.fillStyle = 'rgba(8,14,24,0.55)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('PAUSED', [
        'The city waits for you.',
        `Money $${state.money} · Missions ${state.missionsDone}/${MISSIONS.length} · Cars stolen ${state.stats.carsStolen}`,
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
