// Terbang Nusantara — the game loop: input, fixed-step physics, screens.
// One job: wire the world, the renderer and the input together.
import { VIEW, STEP, LEGS } from './config.js';
import { createWorld, resetLeg, nextLeg, step, EVENT_RING, EVENT_LEG, EVENT_CRASH, EVENT_OVER, EVENT_TOUCHDOWN } from './world.js';
import { draw } from './render.js';
import { createInput, readStick, wasPressed, endFrame } from './input.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || '20261126');
const shotName = params.get('shot');
const BEST_KEY = 'terbang-nusantara-best';

const canvas = document.getElementById('game');
canvas.width = VIEW.width;
canvas.height = VIEW.height;
const ctx = canvas.getContext('2d');

const world = createWorld(seed);
// Test hook: lets a browser play-test read the live state (screen, score,
// altitude, rings) without touching the game itself.
window.__terbang = { world, version: 1 };
try {
  world.best = Number(window.localStorage.getItem(BEST_KEY) || '0');
} catch (e) {
  world.best = 0;
}
let cockpit = false;
const input = createInput(canvas);

// Tiny WebAudio blips: a ring chime and a touchdown thud. No assets, no
// network; silence is fine when audio is unavailable.
let audio = null;
function beep(freq, dur, type = 'sine', gain = 0.08) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') void audio.resume();
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(gain, audio.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
    osc.connect(amp);
    amp.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + dur);
  } catch (e) {
    // Audio is decoration; the game plays on without it.
  }
}

function saveBest() {
  const best = Math.max(world.best, world.score);
  world.best = best;
  try {
    window.localStorage.setItem(BEST_KEY, String(best));
  } catch (e) {
    // Private mode or no storage: the score still shows this run.
  }
}

function startRun() {
  const fresh = createWorld(seed);
  world.route = fresh.route;
  world.score = 0;
  world.lives = fresh.lives;
  world.time = 0;
  world.ringsHit = 0;
  resetLeg(world, 0);
  world.screen = 'play';
}

function handleEvents(events) {
  if (events & EVENT_RING) beep(880, 0.18, 'sine', 0.09);
  if (events & EVENT_TOUCHDOWN) beep(140, 0.15, 'triangle', 0.12);
  if (events & EVENT_CRASH) beep(90, 0.4, 'sawtooth', 0.1);
  if (events & EVENT_OVER) {
    saveBest();
    world.screen = 'over';
    return;
  }
  if (events & EVENT_LEG) {
    saveBest();
    world.screen = 'legdone';
  }
}

function frame() {
  const stick = readStick(input);
  if (world.screen === 'play') {
    const events = step(world, stick, STEP);
    handleEvents(events);
    if (wasPressed(input, 'KeyP', 'Escape')) world.screen = 'paused';
  } else if (world.screen === 'paused') {
    if (wasPressed(input, 'KeyP', 'Escape', 'Enter')) world.screen = 'play';
  } else if (world.screen === 'title') {
    if (wasPressed(input, 'Enter', 'Space')) startRun();
  } else if (world.screen === 'legdone') {
    if (wasPressed(input, 'Enter', 'Space')) {
      if (nextLeg(world)) {
        saveBest();
        world.screen = 'win';
      } else {
        world.screen = 'play';
      }
    }
  } else if (world.screen === 'over' || world.screen === 'win') {
    if (wasPressed(input, 'Enter', 'Space')) {
      startRun();
    }
  }
  if (wasPressed(input, 'KeyC')) cockpit = !cockpit;
  draw(ctx, world, cockpit);
  endFrame(input);
}

if (shotName) {
  // Screenshot staging: play the real rules forward to a fixed scene, then
  // draw exactly one frame so the shot is deterministic for its seed.
  const staged = stageShot(shotName, world);
  world.screen = staged.screen;
  world.best = staged.best;
  draw(ctx, world, staged.cockpit);
} else {
  let last = performance.now();
  let acc = 0;
  function loop(now) {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    while (acc >= STEP) {
      frame();
      acc -= STEP;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
