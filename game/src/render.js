// Terbang Nusantara — everything the pilot sees: sky, pseudo-3D terrain,
// rings, the aircraft, the HUD and the lit instruments. One job: draw the
// world state; it never changes the world.
import { VIEW, CAM_DEPTH, CAM_BACK, CAM_UP, WORLD_HALF, LEGS, FT_PER_M } from './config.js';
import { segmentAt, groundHeightAt, isRunway, nextTarget, hud } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LEGDONE = 'legdone';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const { width: W, height: H } = VIEW;
const HORIZON = H * 0.42;

function paletteFor(dusk) {
  if (dusk) {
    return {
      skyTop: '#3b2a6b', skyMid: '#c86dd7', skyLow: '#ff9a5c',
      sun: '#ffd27a', sunGlow: 'rgba(255,170,90,0.55)',
      sea: ['#274b6d', '#254866'], sand: '#c9a886', grass: ['#3f7d46', '#3d7944'],
      runway: '#3a3d44', cloud: 'rgba(255,205,190,0.85)',
    };
  }
  return {
    skyTop: '#5db4f0', skyMid: '#a5dcf7', skyLow: '#ffe9bd',
    sun: '#fff3b0', sunGlow: 'rgba(255,240,170,0.5)',
    sea: ['#1f7fb8', '#1d76ac'], sand: '#ecd9a0', grass: ['#57a84f', '#53a24b'],
    runway: '#4a4d52', cloud: 'rgba(255,255,255,0.9)',
  };
}

/** Project a world point to the screen; null when behind the camera. */
function project(cam, x, yM, z) {
  const dz = z - cam.z;
  if (dz < 2) return null;
  const scale = CAM_DEPTH / dz;
  return {
    x: W / 2 + scale * (x - cam.x) * (W / 2),
    y: HORIZON + scale * (cam.y - yM) * (H / 2),
    scale,
  };
}

function poly(ctx, points, fill) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawSky(ctx, world, pal) {
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON + 60);
  g.addColorStop(0, pal.skyTop);
  g.addColorStop(0.55, pal.skyMid);
  g.addColorStop(1, pal.skyLow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, HORIZON + 60);
  // Sun, low and warm, drifting with the heading.
  const sunX = W * 0.78 - world.plane.headingDeg * 2;
  const sunY = world.legIndex === 2 ? HORIZON - 40 : 90;
  const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 130);
  glow.addColorStop(0, pal.sunGlow);
  glow.addColorStop(1, 'rgba(255,240,170,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 130, sunY - 130, 260, 260);
  ctx.fillStyle = pal.sun;
  ctx.beginPath();
  ctx.arc(sunX, sunY, world.legIndex === 2 ? 46 : 34, 0, Math.PI * 2);
  ctx.fill();
}

function drawClouds(ctx, world, pal, cam) {
  for (const cloud of world.route.clouds) {
    const p = project(cam, cloud.x + cloud.drift * world.time * 0.4, cloud.altM, cloud.z);
    if (!p || p.y > HORIZON + 40) continue;
    const rx = Math.max(8, p.scale * 130 * cloud.s * (W / 2));
    const ry = rx * 0.36;
    ctx.fillStyle = pal.cloud;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - rx * 0.55, p.y + ry * 0.25, rx * 0.6, ry * 0.7, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + rx * 0.55, p.y + ry * 0.25, rx * 0.6, ry * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function groundColor(seg, pal) {
  if (seg.type === 'sea') return pal.sea[seg.shade];
  if (seg.type === 'beach') return pal.sand;
  if (seg.type === 'runway') return pal.runway;
  return pal.grass[seg.shade];
}

function drawTerrain(ctx, world, pal, cam) {
  const route = world.route;
  const camSeg = Math.floor(cam.z / 25);
  const farSeg = Math.min(route.segments.length - 2, camSeg + 90);
  // Far to near so nearer ground covers farther ground.
  for (let i = farSeg; i >= camSeg; i -= 1) {
    const seg = route.segments[i];
    const next = route.segments[i + 1];
    const z0 = seg.z;
    const z1 = next.z;
    const left0 = project(cam, cam.x - WORLD_HALF, seg.elev, z0);
    const right0 = project(cam, cam.x + WORLD_HALF, seg.elev, z0);
    const left1 = project(cam, cam.x - WORLD_HALF, next.elev, z1);
    const right1 = project(cam, cam.x + WORLD_HALF, next.elev, z1);
    if (!left0 || !right0 || !left1 || !right1) continue;
    // Sea everywhere first, then land on top of it inside the coast.
    poly(ctx, [[left0.x, left0.y], [right0.x, right0.y], [right1.x, right1.y], [left1.x, left1.y]], pal.sea[seg.shade]);
    if (seg.type !== 'sea') {
      const hw = seg.halfWidth;
      const hw1 = next.halfWidth;
      const l0 = project(cam, cam.x - hw, seg.elev, z0);
      const r0 = project(cam, cam.x + hw, seg.elev, z0);
      const l1 = project(cam, cam.x - hw1, next.elev, z1);
      const r1 = project(cam, cam.x + hw1, next.elev, z1);
      if (l0 && r0 && l1 && r1) {
        poly(ctx, [[l0.x, l0.y], [r0.x, r0.y], [r1.x, r1.y], [l1.x, l1.y]], groundColor(seg, pal));
      }
      if (seg.type === 'runway') {
        // Runway strip with centre dashes and threshold bars.
        const w0 = project(cam, 0, seg.elev + 0.3, z0);
        const w1 = project(cam, 0, next.elev + 0.3, z1);
        if (w0 && w1) {
          const half0 = Math.max(1.5, w0.scale * 30 * (W / 2));
          const half1 = Math.max(0.5, w1.scale * 30 * (W / 2));
          poly(ctx, [[w0.x - half0, w0.y], [w0.x + half0, w0.y], [w1.x + half1, w1.y], [w1.x - half1, w1.y]], '#565a61');
          if (seg.shade === 0) {
            const d0 = Math.max(1, w0.scale * 3 * (W / 2));
            const d1 = Math.max(0.5, w1.scale * 3 * (W / 2));
            poly(ctx, [[w0.x - d0, w0.y], [w0.x + d0, w0.y], [w1.x + d1, w1.y], [w1.x - d1, w1.y]], '#f5f5f0');
          }
        }
      }
      // Wave sparkle where the coast meets the sea.
      if (seg.type === 'beach' && seg.shade === 0) {
        const s = project(cam, cam.x - seg.halfWidth - 30, 0.5, z0);
        if (s) {
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fillRect(s.x, s.y, Math.max(2, s.scale * 60 * (W / 2)), 2);
        }
      }
    }
  }
}

function drawVolcano(ctx, world, cam) {
  // The Merapi cone stands at the middle of its island; draw it big.
  const z = 3300;
  if (z < cam.z - 50 || z > cam.z + 90 * 25) return;
  const base = project(cam, 0, 0, z);
  const apex = project(cam, 0, 380, z);
  const left = project(cam, -420, 0, z);
  const right = project(cam, 420, 0, z);
  if (!base || !apex || !left || !right) return;
  poly(ctx, [[left.x, base.y], [right.x, base.y], [apex.x, apex.y]], '#6b5a52');
  poly(ctx, [[apex.x - (right.x - apex.x) * 0.22, apex.y + (base.y - apex.y) * 0.22], [apex.x + (right.x - apex.x) * 0.22, apex.y + (base.y - apex.y) * 0.22], [apex.x, apex.y]], '#f4f6f8');
  // Smoke drifting off the crater.
  const t = world.time;
  for (let i = 0; i < 4; i += 1) {
    const sy = apex.y - 14 - ((t * 12 + i * 26) % 90);
    const sx = apex.x + Math.sin(t * 0.7 + i * 2) * 10 + i * 8;
    ctx.fillStyle = `rgba(220,220,220,${0.5 - i * 0.1})`;
    ctx.beginPath();
    ctx.arc(sx, sy, 10 + i * 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawObject(ctx, world, cam, seg, obj) {
  const p = project(cam, obj.x, seg.elev, seg.z);
  if (!p) return;
  const h = p.scale * (obj.kind === 'house' ? 14 : obj.kind === 'lighthouse' ? 26 : 10) * obj.s * (H / 2);
  if (h < 2) return;
  const x = p.x;
  const y = p.y;
  ctx.save();
  if (obj.kind === 'palm') {
    ctx.strokeStyle = '#7a5230';
    ctx.lineWidth = Math.max(1.5, h * 0.06);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + h * 0.12, y - h * 0.6, x + h * 0.05, y - h);
    ctx.stroke();
    ctx.fillStyle = '#2f7d33';
    for (let i = 0; i < 5; i += 1) {
      const a = (-0.3 - i * 0.5) * Math.PI;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * h * 0.3, y - h + Math.sin(a) * h * 0.22, h * 0.34, h * 0.1, a, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (obj.kind === 'house') {
    ctx.fillStyle = '#e8e0cc';
    ctx.fillRect(x - h * 0.5, y - h * 0.6, h, h * 0.6);
    ctx.fillStyle = '#b3543f';
    poly(ctx, [[x - h * 0.6, y - h * 0.6], [x + h * 0.6, y - h * 0.6], [x, y - h]], '#b3543f');
  } else if (obj.kind === 'tree') {
    ctx.fillStyle = '#5a4128';
    ctx.fillRect(x - h * 0.05, y - h * 0.4, h * 0.1, h * 0.4);
    ctx.fillStyle = '#2e7d32';
    ctx.beginPath();
    ctx.arc(x, y - h * 0.65, h * 0.36, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawObjects(ctx, world, cam) {
  const route = world.route;
  const camSeg = Math.floor(cam.z / 25);
  const farSeg = Math.min(route.segments.length - 2, camSeg + 90);
  for (let i = farSeg; i >= camSeg; i -= 1) {
    for (const obj of route.segments[i].objects) drawObject(ctx, world, cam, route.segments[i], obj);
  }
}

function drawRings(ctx, world, cam) {
  for (const ring of world.route.rings) {
    if (ring.leg !== world.legIndex) continue;
    const p = project(cam, ring.x, ring.altM, ring.z);
    if (!p) continue;
    const rx = p.scale * ring.r * (W / 2);
    const ry = rx * 0.9;
    if (rx < 2 || rx > W * 1.6) continue;
    const passed = ring.passed;
    ctx.save();
    ctx.lineWidth = Math.max(2, rx * 0.08);
    ctx.strokeStyle = passed ? 'rgba(120,220,130,0.9)' : 'rgba(255,150,40,0.95)';
    ctx.shadowColor = passed ? '#4caf50' : '#ff8c1a';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1, rx * 0.02);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx * 0.82, ry * 0.82, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPlane(ctx, world) {
  const p = world.plane;
  const px = W / 2;
  const py = H * 0.6 - p.pitchDeg * 1.4;
  const bank = (p.rollDeg * Math.PI) / 180;
  // Ground shadow: closer to the horizon and fainter the higher the plane is.
  const altF = Math.min(1, p.altM / 900);
  const shY = py + 108 - altF * 62;
  const shW = 150 * (1 - altF * 0.45);
  if (p.airborne || p.altM > 2) {
    ctx.fillStyle = `rgba(0,0,0,${0.28 * (1 - altF * 0.7)})`;
    ctx.beginPath();
    ctx.ellipse(px, shY, shW, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(bank * 0.85);
  const S = 1; // sprite scale
  // Wings, left and right, with red tips and navigation lights.
  ctx.fillStyle = '#e8e8e8';
  poly(ctx, [[-8 * S, -6], [-150 * S, 26], [-138 * S, 40], [-6 * S, 10]], '#e8e8e8');
  poly(ctx, [[8 * S, -6], [150 * S, 26], [138 * S, 40], [6 * S, 10]], '#e8e8e8');
  ctx.fillStyle = '#c62828';
  poly(ctx, [[-150 * S, 26], [-138 * S, 40], [-128 * S, 38], [-140 * S, 24]], '#c62828');
  poly(ctx, [[150 * S, 26], [138 * S, 40], [128 * S, 38], [140 * S, 24]], '#c62828');
  // Engine nacelles under the wings.
  ctx.fillStyle = '#37474f';
  ctx.beginPath();
  ctx.ellipse(-58 * S, 30, 26, 10, 0.12, 0, Math.PI * 2);
  ctx.ellipse(58 * S, 30, 26, 10, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,200,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(-58 * S, 30, 16, 6, 0.12, 0, Math.PI * 2);
  ctx.ellipse(58 * S, 30, 16, 6, -0.12, 0, Math.PI * 2);
  ctx.fill();
  // Fuselage, seen from behind and above: wide at the tail, tapering forward.
  const body = ctx.createLinearGradient(0, -90, 0, 60);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.55, '#f2f2f2');
  body.addColorStop(1, '#c9c9c9');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-34 * S, 52);
  ctx.quadraticCurveTo(-40 * S, -30, -16 * S, -88);
  ctx.quadraticCurveTo(0, -98, 16 * S, -88);
  ctx.quadraticCurveTo(40 * S, -30, 34 * S, 52);
  ctx.quadraticCurveTo(0, 64, -34 * S, 52);
  ctx.fill();
  // Red cheatline and tail number.
  ctx.fillStyle = '#c62828';
  ctx.fillRect(-37 * S, 18, 74 * S, 7);
  ctx.fillStyle = '#37474f';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PK-TN1', 0, 44);
  // Tail fin with the red-and-white mark, and the stabiliser.
  ctx.fillStyle = '#c62828';
  ctx.beginPath();
  ctx.moveTo(-14 * S, -84);
  ctx.lineTo(0, -138);
  ctx.lineTo(14 * S, -84);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, -102, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c62828';
  ctx.beginPath();
  ctx.arc(0, -102, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d7d7d7';
  poly(ctx, [[-20 * S, -72], [-64 * S, -58], [-58 * S, -46], [-16 * S, -60]], '#d7d7d7');
  poly(ctx, [[20 * S, -72], [64 * S, -58], [58 * S, -46], [16 * S, -60]], '#d7d7d7');
  // Navigation lights: port red on the left, starboard green on the right.
  ctx.fillStyle = '#ff2d2d';
  ctx.shadowColor = '#ff2d2d';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(-146 * S, 32, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2dff5e';
  ctx.shadowColor = '#2dff5e';
  ctx.beginPath();
  ctx.arc(146 * S, 32, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawCockpitFrame(ctx) {
  // In cockpit view the windshield pillars frame the scene: two dark posts
  // at the screen edges, below the HUD bar and clear of the instruments.
  ctx.fillStyle = 'rgba(10,12,16,0.85)';
  poly(ctx, [[0, 76], [74, 76], [38, H - 170], [0, H - 170]], 'rgba(10,12,16,0.85)');
  poly(ctx, [[W, 76], [W - 74, 76], [W - 38, H - 170], [W, H - 170]], 'rgba(10,12,16,0.85)');
  ctx.fillStyle = 'rgba(10,12,16,0.55)';
  ctx.fillRect(0, 0, W, 10);
}

function gauge(ctx, x, y, r, label, drawFace) {
  ctx.save();
  ctx.translate(x, y);
  const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.25);
  glow.addColorStop(0, 'rgba(255,190,90,0.28)');
  glow.addColorStop(1, 'rgba(255,190,90,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#101418';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a6d3b';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r - 3, 0, Math.PI * 2);
  ctx.clip();
  drawFace(ctx, r);
  ctx.restore();
  ctx.fillStyle = '#ffd27a';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 0, r + 16);
  ctx.restore();
}

function drawInstruments(ctx, world, cockpit) {
  const h = hud(world);
  const p = world.plane;
  const y = H - 78;
  const panelH = cockpit ? 150 : 118;
  // Dashboard panel.
  const g = ctx.createLinearGradient(0, H - panelH - 10, 0, H);
  g.addColorStop(0, 'rgba(24,28,34,0.92)');
  g.addColorStop(1, 'rgba(10,12,15,0.96)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(0, H - panelH - 6, W, panelH + 6, [18, 18, 0, 0]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,210,122,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const gap = cockpit ? 170 : 150;
  const x0 = W / 2 - gap * 2;
  // Artificial horizon.
  gauge(ctx, x0, y, 46, 'SIKAP', (c, r) => {
    c.save();
    c.rotate((-p.rollDeg * Math.PI) / 180);
    const pitchPx = Math.max(-r, Math.min(r, p.pitchDeg * 1.6));
    // Sky first across the whole dial, then the ground from the horizon line
    // down, so no gap ever shows between the two halves.
    c.fillStyle = '#4aa3df';
    c.fillRect(-r, -r, r * 2, r * 2);
    c.fillStyle = '#8a5a2b';
    c.fillRect(-r, -pitchPx, r * 2, r + pitchPx);
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-r, -pitchPx);
    c.lineTo(r, -pitchPx);
    c.stroke();
    c.restore();
    c.fillStyle = '#ffd27a';
    c.beginPath();
    c.moveTo(-14, 0);
    c.lineTo(0, -6);
    c.lineTo(14, 0);
    c.lineTo(0, 4);
    c.closePath();
    c.fill();
  });
  // Altimeter.
  gauge(ctx, x0 + gap, y, 46, 'ALT (ft)', (c, r) => {
    c.fillStyle = '#e8f4ff';
    c.font = 'bold 22px monospace';
    c.textAlign = 'center';
    c.fillText(String(h.altFt), 0, 4);
    c.fillStyle = '#7fb3d8';
    c.font = '11px monospace';
    c.fillText(h.vsFtS >= 0 ? `+${h.vsFtS} ft/s` : `${h.vsFtS} ft/s`, 0, 24);
  });
  // Airspeed.
  gauge(ctx, x0 + gap * 2, y, 46, 'KECEPATAN', (c, r) => {
    c.fillStyle = '#e8f4ff';
    c.font = 'bold 22px monospace';
    c.textAlign = 'center';
    c.fillText(String(h.speedKt), 0, 4);
    c.fillStyle = '#7fb3d8';
    c.font = '11px monospace';
    c.fillText('knot', 0, 24);
    if (h.speedKt < 68) {
      c.fillStyle = '#ff5252';
      c.font = 'bold 12px sans-serif';
      c.fillText('STALL', 0, -22);
    }
  });
  // Fuel.
  gauge(ctx, x0 + gap * 3, y, 46, 'BAHAN BAKAR', (c, r) => {
    c.strokeStyle = h.fuel < 20 ? '#ff5252' : '#4caf50';
    c.lineWidth = 7;
    c.beginPath();
    c.arc(0, 0, r - 10, -Math.PI * 0.75, -Math.PI * 0.75 + (Math.PI * 1.5 * h.fuel) / 100);
    c.stroke();
    c.fillStyle = '#e8f4ff';
    c.font = 'bold 20px monospace';
    c.textAlign = 'center';
    c.fillText(`${h.fuel}%`, 0, 6);
  });
  // Throttle lever.
  gauge(ctx, x0 + gap * 4, y, 46, 'GAS', (c, r) => {
    c.fillStyle = '#222';
    c.fillRect(-6, -r + 8, 12, r * 2 - 16);
    const ty = -r + 8 + (1 - h.throttle / 100) * (r * 2 - 16);
    c.fillStyle = '#ffd27a';
    c.beginPath();
    c.roundRect(-14, ty - 7, 28, 14, 5);
    c.fill();
    c.fillStyle = '#e8f4ff';
    c.font = 'bold 13px monospace';
    c.textAlign = 'center';
    c.fillText(`${h.throttle}%`, 0, r - 22);
  });
}

function drawHud(ctx, world, showTop = true) {
  const h = hud(world);
  const leg = LEGS[world.legIndex];
  if (!showTop) return; // title screen: the slim banner replaces the top bar
  ctx.fillStyle = 'rgba(12,16,22,0.72)';
  ctx.beginPath();
  ctx.roundRect(10, 10, W - 20, 56, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,210,122,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd27a';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('ALT', 28, 28);
  ctx.fillText('KEC', 152, 28);
  ctx.fillText('ARAH', 276, 28);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(`${h.altFt} ft`, 28, 54);
  ctx.fillText(`${h.speedKt} kt`, 152, 54);
  ctx.fillText(`${String(h.headingDeg).padStart(3, '0')}°`, 276, 54);
  // Compass strip.
  const cx = W / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 150, 14, 300, 48);
  ctx.clip();
  const dirs = [['U', 0], ['TL', 45], ['T', 90], ['TG', 135], ['S', 180], ['BD', 225], ['B', 270], ['BL', 315]];
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  for (const [label, deg] of dirs) {
    let d = ((deg - h.headingDeg + 540) % 360) - 180;
    const x = cx + d * 1.6;
    if (Math.abs(d) > 90) continue;
    ctx.fillStyle = d === 0 ? '#ffd27a' : '#cfe3f2';
    ctx.fillText(label, x, 34);
    ctx.fillRect(x - 1, 42, 2, 8);
  }
  ctx.restore();
  ctx.fillStyle = '#ffd27a';
  ctx.beginPath();
  ctx.moveTo(cx - 6, 14);
  ctx.lineTo(cx + 6, 14);
  ctx.lineTo(cx, 24);
  ctx.closePath();
  ctx.fill();
  // Right side: fuel, score, leg, lives.
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffd27a';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('BAHAN BAKAR', W - 28, 28);
  ctx.fillStyle = h.fuel < 20 ? '#ff5252' : '#4caf50';
  ctx.fillRect(W - 168, 34, 140 * (h.fuel / 100), 8);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(W - 168, 34, 140, 8);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px monospace';
  ctx.fillText(`${h.fuel}%`, W - 28, 58);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd27a';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('SKOR', W - 330, 28);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(String(h.score), W - 330, 54);
  ctx.fillStyle = '#ffd27a';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(`Leg ${h.leg} • Cincin ${world.ringsHit}/${leg.rings.length}`, 372, 30);
  ctx.fillText(`Nyawa ${'✈'.repeat(Math.max(0, h.lives))}${'·'.repeat(Math.max(0, 3 - h.lives))} • Kombo x${h.combo}`, 372, 52);
  // Centre flight-path marker.
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.42, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W / 2, H * 0.42 - 15);
  ctx.lineTo(W / 2, H * 0.42 - 5);
  ctx.moveTo(W / 2 - 15, H * 0.42);
  ctx.lineTo(W / 2 - 5, H * 0.42);
  ctx.moveTo(W / 2 + 5, H * 0.42);
  ctx.lineTo(W / 2 + 15, H * 0.42);
  ctx.stroke();
  // Warnings and messages.
  const p = world.plane;
  ctx.textAlign = 'center';
  if (world.stall && p.airborne) {
    ctx.fillStyle = Math.floor(world.time * 4) % 2 === 0 ? '#ff5252' : '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('STALL — TURUNKAN HIDUNG', W / 2, 130);
  } else if (world.lowFuel && p.airborne) {
    ctx.fillStyle = '#ffb74d';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('BAHAN BAKAR RENDAH', W / 2, 130);
  } else if (p.airborne && p.altM < 60 && p.vsFtS < -6) {
    ctx.fillStyle = '#ff5252';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('TARIK KE ATAS!', W / 2, 130);
  }
  if (world.message && world.time - world.messageAt < 2.5) {
    ctx.fillStyle = 'rgba(12,16,22,0.75)';
    const mw = ctx.measureText(world.message).width + 36;
    ctx.beginPath();
    ctx.roundRect(W / 2 - mw / 2, 150, mw, 36, 10);
    ctx.fill();
    ctx.fillStyle = '#ffd27a';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(world.message, W / 2, 175);
  }
  // Next-target hint: distance and direction to the next ring or runway.
  // Past the threshold, a runway hint shows the runway left, not zero.
  const target = nextTarget(world);
  if (target && world.screen === 'play') {
    const dz = Math.max(0, Math.round(target.z - p.z));
    const dx = Math.round(target.x - p.x);
    const runwayLeft = Math.max(0, Math.round(LEGS[world.legIndex].to - p.z));
    const label = target.kind === 'ring' ? `Cincin ${dz} m ${dx >= 0 ? '→' : '←'} ${Math.abs(dx)} m` : `Landasan ${runwayLeft} m`;
    ctx.fillStyle = 'rgba(12,16,22,0.6)';
    const tw = ctx.measureText(label).width + 28;
    ctx.beginPath();
    ctx.roundRect(W / 2 - tw / 2, 100, tw, 26, 8);
    ctx.fill();
    ctx.fillStyle = '#cfe3f2';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(label, W / 2, 118);
  }
}

function slimBanner(ctx, title, sub, hint) {
  ctx.fillStyle = 'rgba(12,16,22,0.82)';
  ctx.fillRect(0, 0, W, 86);
  ctx.fillStyle = '#c62828';
  ctx.fillRect(0, 86, W, 4);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd27a';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText(title, 28, 48);
  ctx.fillStyle = '#ffffff';
  ctx.font = '16px sans-serif';
  ctx.fillText(sub, 28, 74);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#cfe3f2';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(hint, W - 28, 48);
}

function centreCard(ctx, title, lines, hint) {
  ctx.fillStyle = 'rgba(8,10,14,0.55)';
  ctx.fillRect(0, 0, W, H);
  const cw = 620;
  const ch = 150 + lines.length * 30;
  const x = (W - cw) / 2;
  const y = (H - ch) / 2;
  ctx.fillStyle = 'rgba(16,20,26,0.95)';
  ctx.beginPath();
  ctx.roundRect(x, y, cw, ch, 16);
  ctx.fill();
  ctx.strokeStyle = '#ffd27a';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd27a';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(title, W / 2, y + 52);
  ctx.fillStyle = '#ffffff';
  ctx.font = '17px sans-serif';
  lines.forEach((line, i) => ctx.fillText(line, W / 2, y + 92 + i * 30));
  ctx.fillStyle = '#cfe3f2';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(hint, W / 2, y + ch - 22);
}

/** Draw one frame of the game. `cockpit` toggles the chase/cockpit camera. */
export function draw(ctx, world, cockpit) {
  const p = world.plane;
  const leg = LEGS[world.legIndex];
  const pal = paletteFor(leg.dusk);
  const cam = { x: p.x, y: p.altM + CAM_UP, z: p.z - CAM_BACK };
  drawSky(ctx, world, pal);
  drawClouds(ctx, world, pal, cam);
  drawTerrain(ctx, world, pal, cam);
  drawVolcano(ctx, world, cam);
  drawObjects(ctx, world, cam);
  drawRings(ctx, world, cam);
  if (!cockpit) drawPlane(ctx, world);
  drawHud(ctx, world, world.screen !== 'title');
  drawInstruments(ctx, world, cockpit);
  if (cockpit) drawCockpitFrame(ctx);

  if (world.screen === 'title') {
    slimBanner(ctx, 'TERBANG NUSANTARA', 'Terbang antar pulau: lepas landas, lewati cincin, mendarat mulus.', 'Tekan Enter untuk terbang');
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '15px sans-serif';
    ctx.fillText('WASD / panah: terbang  •  Shift: gas  •  Ctrl: kurangi gas  •  Spasi: flap  •  C: kokpit  •  P: jeda', W / 2, H - 170);
    ctx.fillStyle = '#ffd27a';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('3 leg: Bintan → Batam → Karimun → Lombok  •  Skor terbaik tersimpan', W / 2, H - 146);
  } else if (world.screen === 'paused') {
    centreCard(ctx, 'Jeda', ['Penerbangan ditahan di udara.', ''], 'Tekan P untuk melanjutkan');
  } else if (world.screen === 'legdone') {
    const next = LEGS[world.legIndex + 1];
    centreCard(
      ctx,
      `${leg.name} selesai!`,
      [`Skor leg ini: ${world.legScore}`, `Total skor: ${world.score}`, `Kerusakan leg ini: ${world.legDamage}%`],
      next ? `Enter: ${next.name}` : 'Enter: lihat hasil akhir',
    );
  } else if (world.screen === 'over') {
    centreCard(
      ctx,
      'Penerbangan berakhir',
      [`Skor: ${world.score}`, `Skor terbaik: ${Math.max(world.best, world.score)}`, 'Semua pesawat cadangan habis.'],
      'Enter: terbang lagi',
    );
  } else if (world.screen === 'win') {
    centreCard(
      ctx,
      'Misi selesai — Nusantara dijelajahi!',
      [`Skor akhir: ${world.score}`, `Skor terbaik: ${Math.max(world.best, world.score)}`, `Cincin dilewati: ${world.ringsHit}/${world.ringsTotal}`],
      'Enter: terbang lagi',
    );
  }
}
