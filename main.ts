// Sunhaven Streets, version 2 — the hand-in program for the make.fun
// gta6-01 bounty. Version 2 adds a sixth story mission, walk-in shops,
// police who drive around buildings, and a livelier city; the game itself
// is unchanged in shape.
// Node 22, standard library only. The game lives in this directory's game/
// folder: plain static files a desktop browser loads offline (game/index.html
// and its ES modules, no library, no network request, all sound synthesised
// with WebAudio). This program copies game/ and screenshots/ from beside
// this file to /output and writes /output/dossier.json — the summary the
// judge reads — with the vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fresh output every run: stale screenshots or game files from an earlier
// build must never leak into a submission.
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps: only text_max_bytes shapes the bytes; the others
// refuse an entry the scorer would refuse (more than 4 screenshots or one
// over 256 KiB; more than 993 files in game/ or 48 MiB of game files in all,
// or a path under game/ over 1000 bytes — game/ counts beside /output's own
// 1000-entry cap, its screenshots/ and dossier.json).
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

// A short build summary on stdout, so a bad run is obvious at a glance:
// how many screenshots shipped and how big the dossier came out.
const shots = existsSync(join(out, 'screenshots')) ? readdirSync(join(out, 'screenshots')) : [];
console.log(`Sunhaven Streets v2: ${shots.length} screenshots, dossier ${statSync(join(out, 'dossier.json')).size} bytes -> ${out}`);
