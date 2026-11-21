// The city of Sunhaven: a road grid, the buildings that fill each block, two
// parks, open parking lots, a beach and boardwalk along the south bay, four
// named districts, and the named places the missions use (bank, pier,
// hospital, garage, hideout, market, arena, cafe). Pure data: no drawing and
// no browser in here, so the same layout can be built from any seed and
// re-used by collisions, traffic, the minimap and the screenshots.
import { CITY_SIZE, PALETTE, ROAD_CENTRES, ROAD_W } from './config.js';
import { intRange, pick, range } from './random.js';

export const LANDMARKS = {
  bank: { name: 'Sunhaven Bank', x: 1250, y: 250, kind: 'bank' },
  pier: { name: 'Marina Pier', x: 1750, y: 3350, kind: 'pier' },
  hospital: { name: 'St. Coral Hospital', x: 2750, y: 750, kind: 'hospital' },
  garage: { name: "Rico's Garage", x: 750, y: 1750, kind: 'garage' },
  hideout: { name: 'Hideout', x: 3250, y: 3250, kind: 'hideout' },
  market: { name: 'Coral Market', x: 2250, y: 1250, kind: 'market' },
  arena: { name: 'Backstreet Arena', x: 750, y: 2750, kind: 'arena' },
  cafe: { name: 'Sunset Cafe', x: 1750, y: 750, kind: 'cafe' },
};

/** The four quarters of the city; the HUD names the one you are standing in. */
export const DISTRICTS = [
  { name: 'Downtown', x0: 0, y0: 0, x1: 1800, y1: 1800 },
  { name: 'Palm Heights', x0: 1800, y0: 0, x1: 3600, y1: 1800 },
  { name: 'Old Coral', x0: 0, y0: 1800, x1: 1800, y1: 3600 },
  { name: 'The Marina', x0: 1800, y0: 1800, x1: 3600, y1: 3600 },
];

/** The district containing a point, or the first when outside them all. */
export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  }
  return DISTRICTS[0].name;
}

/** True when the point is on a road (within half the road width of a centre). */
export function isOnRoad(x, y) {
  for (const c of ROAD_CENTRES) {
    if (Math.abs(x - c) <= ROAD_W / 2 || Math.abs(y - c) <= ROAD_W / 2) return true;
  }
  return false;
}

/** Nearest road centre to a coordinate, for snapping cars and peds to lanes. */
export function nearestRoadCentre(v) {
  let best = ROAD_CENTRES[0];
  for (const c of ROAD_CENTRES) if (Math.abs(v - c) < Math.abs(v - best)) best = c;
  return best;
}

export function buildCity(random) {
  const buildings = [];
  const trees = [];
  const lots = [];
  const parks = [
    { x: 1000, y: 1000, w: 350, h: 350, name: 'Palm Park' },
    { x: 2500, y: 2500, w: 350, h: 350, name: 'Coral Park' },
  ];
  // Beach strip along the south edge, below the last road, with a wooden
  // boardwalk between the sand and the water where the pier crowd gathers.
  const beach = { x: 0, y: 3425, w: CITY_SIZE, h: 175 };
  const boardwalk = { x: 0, y: 3495, w: CITY_SIZE, h: 42 };

  // Landmark spots first: each named place gets a building inside the block
  // diagonally next to it (never on a road), so regular buildings keep clear.
  const landmarkSpots = [];
  for (const key of Object.keys(LANDMARKS)) {
    const lm = LANDMARKS[key];
    const dx = lm.x >= 3000 ? -250 : 250;
    const dy = lm.y >= 3000 ? -250 : 250;
    landmarkSpots.push({ x: lm.x + dx, y: lm.y + dy, key });
  }

  // Blocks between roads: most hold one or two buildings; a few are open
  // parking lots instead, which breaks up the rooftops and gives the city
  // ground-level variety (and somewhere honest to find a parked car).
  for (let bx = 0; bx < ROAD_CENTRES.length - 1; bx += 1) {
    for (let by = 0; by < ROAD_CENTRES.length - 1; by += 1) {
      const x0 = ROAD_CENTRES[bx] + ROAD_W / 2 + 18;
      const y0 = ROAD_CENTRES[by] + ROAD_W / 2 + 18;
      const x1 = ROAD_CENTRES[bx + 1] - ROAD_W / 2 - 18;
      const y1 = ROAD_CENTRES[by + 1] - ROAD_W / 2 - 18;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const inPark = parks.some((p) => cx > p.x && cx < p.x + p.w && cy > p.y && cy < p.y + p.h);
      const inBeach = cy > beach.y;
      const nearLandmark = landmarkSpots.some((s) => Math.hypot(s.x - cx, s.y - cy) < 280);
      if (inPark || inBeach || nearLandmark) continue;
      if (random() < 0.14) {
        lots.push({ x: x0 + 8, y: y0 + 8, w: (x1 - x0) - 16, h: (y1 - y0) - 16, bays: intRange(random, 4, 7) });
        continue;
      }
      const count = random() < 0.45 ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        const w = range(random, 110, 190);
        const h = range(random, 110, 190);
        const ox = count === 1 ? cx : x0 + 30 + i * ((x1 - x0) / 2);
        const oy = count === 1 ? cy : cy + (i === 0 ? -55 : 55);
        buildings.push({
          x: ox - w / 2, y: oy - h / 2, w, h,
          color: pick(random, PALETTE.buildingRoof),
          floors: intRange(random, 1, 4),
          landmark: null,
        });
      }
    }
  }

  // Landmark buildings sit inside the block diagonally next to their place
  // (never on a road), big enough to spot from the street, with a label.
  for (const spot of landmarkSpots) {
    buildings.push({
      x: spot.x - 100, y: spot.y - 70, w: 200, h: 140,
      color: spot.key === 'bank' ? '#f2c94c' : spot.key === 'hospital' ? '#ffffff' : '#5b8dd9',
      floors: 2, landmark: spot.key,
    });
  }

  // Palm trees: scattered in parks, along the beach and down the boardwalk.
  for (const p of parks) {
    for (let i = 0; i < 14; i += 1) {
      trees.push({ x: range(random, p.x + 20, p.x + p.w - 20), y: range(random, p.y + 20, p.y + p.h - 20) });
    }
  }
  for (let i = 0; i < 26; i += 1) {
    trees.push({ x: range(random, 60, CITY_SIZE - 60), y: range(random, beach.y + 25, beach.y + 140) });
  }
  for (let i = 0; i < 10; i += 1) {
    trees.push({ x: 180 + i * 340 + range(random, -30, 30), y: boardwalk.y - 14 });
  }

  return { buildings, trees, parks, beach, boardwalk, lots, size: CITY_SIZE };
}

/** Push a circle (x, y, radius) out of every building it overlaps. Mutates in place. */
export function collideBuildings(city, body) {
  for (const b of city.buildings) {
    const nx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - nx;
    const dy = body.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= body.radius * body.radius) continue;
    if (d2 === 0) { body.x = b.x - body.radius; continue; }
    const d = Math.sqrt(d2);
    body.x = nx + (dx / d) * body.radius;
    body.y = ny + (dy / d) * body.radius;
  }
  body.x = Math.max(20, Math.min(CITY_SIZE - 20, body.x));
  body.y = Math.max(20, Math.min(CITY_SIZE - 20, body.y));
}

/** True when a circle overlaps any building. */
export function hitsBuilding(city, x, y, radius) {
  for (const b of city.buildings) {
    const nx = Math.max(b.x, Math.min(x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(y, b.y + b.h));
    if ((x - nx) ** 2 + (y - ny) ** 2 < radius * radius) return true;
  }
  return false;
}
