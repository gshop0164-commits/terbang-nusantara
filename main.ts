// Terbang Nusantara — a best-flight-game entry (Node 22, standard library
// only): the game is this directory's game/ folder, plain static files a
// desktop browser loads offline (game/index.html and its ES modules, no
// library and no network request), and the program hands it in. It copies
// game/ and screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library. Before it copies anything it runs the entry checks the
// gate would refuse: the game entrypoint is there, 3 or 4 screenshots each
// within the size cap, the game fits the file and byte caps, and the license
// and claim file are in place. A failed check refuses the run with the fix,
// so a bad entry never reaches the submit step.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const failures = [];

function refuse(check, fix) {
  failures.push(`${check}: ${fix}`);
}

function countGameFiles(dir, seen = { files: 0, bytes: 0 }) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) countGameFiles(path, seen);
    else {
      seen.files += 1;
      seen.bytes += st.size;
      if (Buffer.byteLength(path, 'utf8') > 1000) refuse('game_path', `path over 1000 bytes: ${path}`);
    }
  }
  return seen;
}

// The game entrypoint must be a real file the browser can open.
if (!existsSync(join(here, 'game', 'index.html'))) refuse('game_index', 'game/index.html is missing');
// Screenshots: 3 or 4 images, each at most 256 KiB, first by name is the cover.
const shotsDir = join(here, 'screenshots');
if (!existsSync(shotsDir)) refuse('screenshots', 'screenshots/ is missing');
else {
  const shots = readdirSync(shotsDir).filter((n) => !n.startsWith('.')).sort();
  if (shots.length < 3 || shots.length > 4) refuse('screenshots', `need 3 or 4 screenshots, found ${shots.length}`);
  for (const name of shots) {
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(name) || name.startsWith('-')) refuse('screenshot_name', `bad screenshot name: ${name}`);
    const size = statSync(join(shotsDir, name)).size;
    if (size > 262144) refuse('screenshot_size', `${name} is ${size} bytes, over the 256 KiB cap`);
  }
}
// The game itself must fit the gate's caps.
const game = countGameFiles(join(here, 'game'));
if (game.files > 993) refuse('game_files', `${game.files} files in game/, over the 993 cap`);
if (game.bytes > 50331648) refuse('game_bytes', `${game.bytes} bytes in game/, over the 48 MiB cap`);
// The license must be OSI-approved and name itself; the claim file names the wallet.
const license = existsSync(join(here, 'LICENSE')) ? readFileSync(join(here, 'LICENSE'), 'utf8') : '';
if (!license.includes('SPDX-License-Identifier:')) refuse('license', 'LICENSE has no SPDX-License-Identifier line');
if (!existsSync(join(here, '.makefun', 'owner.json'))) refuse('owner', '.makefun/owner.json is missing');
if (!existsSync(join(here, 'vendor', 'makefun-game.ts'))) refuse('vendor', 'vendor/makefun-game.ts is missing');

if (failures.length > 0) {
  for (const f of failures) console.error(`entry check failed — ${f}`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
