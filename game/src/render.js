// Everything the pilot sees: the sky, the bay, the runway, the rings, the
// plane itself and the instruments. The world is drawn with a simple
// perspective projection from the chase camera behind the plane; the HUD is
// drawn flat on top so it reads at a glance in a screenshot.
import { PLANE, RUNWAY, VIEW, WORLD } from './config.js';
import { feetToMetres } from './terrain.js';
import { headingDegrees } from './physics.js';

const TAU = Math.PI * 2;
const FOCAL = 760;
const CAMERA_LIFT = 10; // metres the chase camera sits above the plane

/** Project a world point into screen space; null when behind the camera. */
export function project(state, x, z, altitudeFeet, canvas) {
  const dx = x - state.x;
  const dz = z - state.z;
  const forward = dx * Math.sin(state.heading) + dz * Math.cos(state.heading);
  if (forward < 8) return null;
  const right = dx * Math.cos(state.heading) - dz * Math.sin(state.heading);
  const up = feetToMetres(altitudeFeet - state.altitude) - CAMERA_LIFT;
  const horizonY = canvas.height * VIEW.horizon + state.pitch * canvas.height * 0.4;
  const scale = FOCAL / forward;
  return {
    x: canvas.width / 2 + right * scale,
    y: horizonY - up * scale,
    scale,
    forward,
  };
}

function skyGradient(ctx, canvas, dusk, horizonY) {
  const g = ctx.createLinearGradient(0, 0, 0, horizonY);
  if (dusk) {
    g.addColorStop(0, '#2b3a6e');
    g.addColorStop(0.55, '#c96a4a');
    g.addColorStop(1, '#f7b267');
  } else {
    g.addColorStop(0, '#2f6fd0');
    g.addColorStop(0.6, '#7db4e8');
    g.addColorStop(1, '#cfe8f7');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, horizonY + 2);
}

function drawSun(ctx, canvas, state, dusk) {
  const sunAngle = state.heading + 0.9;
  const sx = canvas.width / 2 + Math.sin(sunAngle) * canvas.width * 0.42;
  const sy = canvas.height * 0.16 - state.pitch * canvas.height * 0.2;
  const r = dusk ? 46 : 34;
  const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, r * 3.2);
  glow.addColorStop(0, dusk ? 'rgba(255, 190, 110, 0.95)' : 'rgba(255, 244, 200, 0.95)');
  glow.addColorStop(1, 'rgba(255, 190, 110, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - r * 3.2, sy - r * 3.2, r * 6.4, r * 6.4);
  ctx.fillStyle = dusk ? '#ffcf8a' : '#fff3c4';
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, TAU);
  ctx.fill();
}

function drawClouds(ctx, canvas, state) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * TAU + 0.35;
    const dist = 5200 + (i % 4) * 1600;
    const cx = state.x + Math.sin(angle) * dist;
    const cz = state.z + Math.cos(angle) * dist;
    const p = project(state, cx, cz, 2600 + (i % 3) * 500, canvas);
    if (!p || p.x < -160 || p.x > canvas.width + 160) continue;
    const s = Math.max(18, 90000 / p.forward);
    ctx.globalAlpha = Math.min(0.9, 2600 / p.forward);
    for (let b = 0; b < 4; b += 1) {
      ctx.beginPath();
      ctx.ellipse(p.x + (b - 1.5) * s * 0.55, p.y + (b % 2) * s * 0.12, s * 0.62, s * 0.3, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/** The sea with a perspective grid that rushes past as the plane flies. */
function drawSea(ctx, canvas, state, horizonY) {
  const g = ctx.createLinearGradient(0, horizonY, 0, canvas.height);
  g.addColorStop(0, '#2e7f9e');
  g.addColorStop(0.5, '#1d6a8a');
  g.addColorStop(1, '#14506e');
  ctx.fillStyle = g;
  ctx.fillRect(0, horizonY, canvas.width, canvas.height - horizonY);

  const camHeight = Math.max(CAMERA_LIFT + 2, feetToMetres(state.altitude) + CAMERA_LIFT);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1;
  // Horizontal swell lines, spaced by perspective depth.
  for (let d = 120; d < 9000; d *= 1.55) {
    const y = horizonY + (camHeight * FOCAL) / d;
    if (y > canvas.height + 4) break;
    ctx.globalAlpha = Math.min(0.5, 420 / d + 0.06);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  // Converging longitude lines.
  ctx.globalAlpha = 0.1;
  for (let lane = -6; lane <= 6; lane += 1) {
    const nearX = canvas.width / 2 + lane * 260;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 + lane * 14, horizonY);
    ctx.lineTo(nearX, canvas.height);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawIslands(ctx, canvas, state) {
  // Terrain never paints above the horizon: a beach ellipse drawn for a
  // nearby island would otherwise flood the sky with flat green.
  const horizonY = canvas.height * VIEW.horizon + state.pitch * canvas.height * 0.4;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, horizonY, canvas.width, canvas.height - horizonY);
  ctx.clip();
  const far = [...state.islands].sort((a, b) => {
    const da = (a.x - state.x) ** 2 + (a.z - state.z) ** 2;
    const db = (b.x - state.x) ** 2 + (b.z - state.z) ** 2;
    return db - da;
  });
  for (const island of far) {
    const p = project(state, island.x, island.z, island.peak * 0.55, canvas);
    if (!p) continue;
    const r = island.radius * p.scale;
    if (r < 3 || p.x < -r - 80 || p.x > canvas.width + r + 80) continue;
    const baseY = project(state, island.x, island.z, 0, canvas);
    const groundY = baseY ? baseY.y : canvas.height;
    const topY = p.y;
    // Beach ring, then green hill, then a shaded peak.
    ctx.fillStyle = '#e8d49a';
    ctx.beginPath();
    ctx.ellipse(p.x, groundY, r, Math.max(4, r * 0.16), 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = island.home ? '#5da24a' : '#4c8f43';
    ctx.beginPath();
    ctx.ellipse(p.x, groundY - (groundY - topY) * 0.12, r * 0.92, Math.max(4, r * 0.15), 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = island.home ? '#6fb457' : '#57a04e';
    ctx.beginPath();
    ctx.moveTo(p.x - r * 0.85, groundY);
    ctx.quadraticCurveTo(p.x - r * 0.3, topY, p.x, topY);
    ctx.quadraticCurveTo(p.x + r * 0.3, topY, p.x + r * 0.85, groundY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x - r * 0.18, topY + (groundY - topY) * 0.28, r * 0.2, Math.max(3, r * 0.05), 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawRunway(ctx, canvas, state) {
  const half = RUNWAY.length / 2;
  const hw = RUNWAY.width / 2;
  const corners = [
    [RUNWAY.x - hw, RUNWAY.z - half],
    [RUNWAY.x + hw, RUNWAY.z - half],
    [RUNWAY.x + hw, RUNWAY.z + half],
    [RUNWAY.x - hw, RUNWAY.z + half],
  ];
  const pts = corners.map(([x, z]) => project(state, x, z, 2, canvas));
  if (pts.some((p) => p === null)) {
    // The plane sits on or beside the strip, so a corner is behind the
    // camera: draw the strip as a trapezoid from just ahead of the nose to
    // its vanishing point on the horizon.
    const dirX = Math.sin(RUNWAY.heading);
    const dirZ = Math.cos(RUNWAY.heading);
    const near = project(state, state.x + dirX * 25, state.z + dirZ * 25, 2, canvas);
    const far = project(state, RUNWAY.x + dirX * 4000, RUNWAY.z + dirZ * 4000, 2, canvas);
    if (near && far) {
      const wNear = (RUNWAY.width / 2) * near.scale;
      const wFar = Math.max(2, (RUNWAY.width / 2) * far.scale);
      ctx.fillStyle = '#3c4148';
      ctx.beginPath();
      ctx.moveTo(near.x - wNear, near.y);
      ctx.lineTo(far.x - wFar, far.y);
      ctx.lineTo(far.x + wFar, far.y);
      ctx.lineTo(near.x + wNear, near.y);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }
  ctx.fillStyle = '#3c4148';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < 4; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
  // Centreline dashes and threshold bars.
  ctx.strokeStyle = '#f5f5f0';
  ctx.lineWidth = Math.max(1.5, 3 * pts[0].scale);
  ctx.setLineDash([26 * pts[0].scale, 22 * pts[0].scale]);
  const a = project(state, RUNWAY.x, RUNWAY.z - half + 40, 3, canvas);
  const b = project(state, RUNWAY.x, RUNWAY.z + half - 40, 3, canvas);
  if (a && b) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = '#f5f5f0';
  for (const end of [-1, 1]) {
    const c = project(state, RUNWAY.x, RUNWAY.z + end * (half - 14), 3, canvas);
    if (c) ctx.fillRect(c.x - 34 * c.scale, c.y - 2, 68 * c.scale, 4);
  }
}

function drawRings(ctx, canvas, state, now) {
  for (let i = 0; i < state.rings.length; i += 1) {
    const ring = state.rings[i];
    if (ring.passed) continue;
    const p = project(state, ring.x, ring.z, ring.altitude, canvas);
    if (!p || p.x < -120 || p.x > canvas.width + 120 || p.y < -80 || p.y > canvas.height + 80) continue;
    const r = WORLD.ringRadius * p.scale;
    if (r < 2) continue;
    const isNext = i === state.ringsPassed;
    const pulse = 0.75 + 0.25 * Math.sin(now * 4 + i);
    ctx.save();
    ctx.globalAlpha = isNext ? 0.95 : 0.45;
    ctx.strokeStyle = isNext ? '#ffb020' : '#7fd4ff';
    ctx.lineWidth = Math.max(2, r * 0.09);
    ctx.shadowColor = isNext ? '#ffb020' : '#7fd4ff';
    ctx.shadowBlur = 18 * pulse;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = isNext ? 0.9 : 0.4;
    ctx.fillStyle = isNext ? '#fff3d0' : '#dff4ff';
    ctx.font = `bold ${Math.max(13, Math.round(r * 0.42))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), p.x, p.y);
    ctx.restore();
  }
}

/** The plane, drawn from the chase camera: banked by the roll, nose by pitch. */
function drawPlane(ctx, canvas, state, now) {
  const cx = canvas.width / 2;
  const cy = canvas.height * 0.66;
  const size = 1 + Math.min(0.25, state.speed / 900);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(state.roll * 0.55);
  ctx.scale(size, size);
  const bob = Math.sin(now * 2.2) * 1.5;
  ctx.translate(0, bob);
  // Wings.
  ctx.fillStyle = '#d8433c';
  ctx.beginPath();
  ctx.moveTo(-118, 6);
  ctx.quadraticCurveTo(-70, -12, -16, -4);
  ctx.lineTo(16, -4);
  ctx.quadraticCurveTo(70, -12, 118, 6);
  ctx.quadraticCurveTo(70, 14, 14, 12);
  ctx.lineTo(-14, 12);
  ctx.quadraticCurveTo(-70, 14, -118, 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f2f2ee';
  ctx.fillRect(-118, 2, 236, 3);
  // Fuselage, nose away from the camera.
  const body = ctx.createLinearGradient(0, -64, 0, 52);
  body.addColorStop(0, '#b8322c');
  body.addColorStop(0.55, '#e0493f');
  body.addColorStop(1, '#8f2a24');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -72);
  ctx.quadraticCurveTo(15, -58, 17, -20);
  ctx.quadraticCurveTo(18, 18, 12, 48);
  ctx.quadraticCurveTo(0, 58, -12, 48);
  ctx.quadraticCurveTo(-18, 18, -17, -20);
  ctx.quadraticCurveTo(-15, -58, 0, -72);
  ctx.closePath();
  ctx.fill();
  // Canopy glint.
  ctx.fillStyle = 'rgba(190, 230, 255, 0.9)';
  ctx.beginPath();
  ctx.ellipse(0, -30, 9, 20, 0, 0, TAU);
  ctx.fill();
  // Tailplane and fin.
  ctx.fillStyle = '#d8433c';
  ctx.beginPath();
  ctx.moveTo(-42, 44);
  ctx.lineTo(42, 44);
  ctx.lineTo(30, 56);
  ctx.lineTo(-30, 56);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 30);
  ctx.lineTo(10, 58);
  ctx.lineTo(-10, 58);
  ctx.closePath();
  ctx.fill();
  // Navigation lights: red port, green starboard, white strobe blinking.
  ctx.fillStyle = '#ff2e2e';
  ctx.beginPath();
  ctx.arc(-118, 6, 4, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2eff5e';
  ctx.beginPath();
  ctx.arc(118, 6, 4, 0, TAU);
  ctx.fill();
  if (Math.sin(now * 6) > 0) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 56, 3.5, 0, TAU);
    ctx.fill();
  }
  // Propeller blur ahead of the nose.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, -72, 26, 5, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(8, 18, 32, 0.72)';
  ctx.strokeStyle = 'rgba(140, 220, 255, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
}

function litText(ctx, text, x, y, size, color = '#eaf6ff', align = 'left') {
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

function drawCompass(ctx, canvas, state) {
  const cx = canvas.width / 2;
  const y = 26;
  const hdg = headingDegrees(state);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 170, 8, 340, 44);
  ctx.clip();
  for (let deg = -60; deg <= 60; deg += 5) {
    const d = Math.round((hdg + deg) / 5) * 5;
    const shown = ((d % 360) + 360) % 360;
    const x = cx + deg * 2.6;
    const major = shown % 30 === 0;
    ctx.strokeStyle = major ? '#eaf6ff' : 'rgba(234, 246, 255, 0.5)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 8);
    ctx.lineTo(x, y + (major ? 22 : 16));
    ctx.stroke();
    if (major) {
      const label = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[shown] ?? String(shown / 10);
      ctx.fillStyle = '#eaf6ff';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, y + 36);
    }
  }
  ctx.restore();
  ctx.fillStyle = '#ffb020';
  ctx.beginPath();
  ctx.moveTo(cx - 7, 8);
  ctx.lineTo(cx + 7, 8);
  ctx.lineTo(cx, 20);
  ctx.closePath();
  ctx.fill();
  litText(ctx, `${String(Math.round(hdg)).padStart(3, '0')}°`, cx, 68, 15, '#ffb020', 'center');
}

function drawHud(ctx, canvas, state) {
  const pad = 16;
  // Left: the lit instruments.
  panel(ctx, pad, 56, 218, 148);
  litText(ctx, 'ALT', pad + 16, 84, 12, '#8cd8ff');
  litText(ctx, `${Math.round(state.altitude)} ft`, pad + 16, 110, 24);
  litText(ctx, 'SPD', pad + 16, 138, 12, '#8cd8ff');
  litText(ctx, `${Math.round(state.speed)} kt`, pad + 16, 164, 24);
  const vsi = Math.round(state.verticalSpeed * 60);
  litText(ctx, `VSI ${vsi >= 0 ? '+' : ''}${vsi} fpm`, pad + 16, 190, 13, vsi >= 0 ? '#7dff9e' : '#ff9d7d');
  drawCompass(ctx, canvas, state);

  // Right: fuel, throttle, score, rings, time.
  panel(ctx, canvas.width - 234, 56, 218, 148);
  litText(ctx, 'FUEL', canvas.width - 218, 84, 12, '#8cd8ff');
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(canvas.width - 218, 92, 186, 12);
  ctx.fillStyle = state.fuel < 20 ? '#ff5a4e' : '#37d67a';
  ctx.fillRect(canvas.width - 218, 92, 186 * (state.fuel / 100), 12);
  litText(ctx, `${Math.round(state.fuel)}%`, canvas.width - 32, 104, 12, '#eaf6ff', 'right');
  litText(ctx, 'THR', canvas.width - 218, 128, 12, '#8cd8ff');
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(canvas.width - 218, 136, 186, 12);
  ctx.fillStyle = '#ffb020';
  ctx.fillRect(canvas.width - 218, 136, 186 * state.throttle, 12);
  litText(ctx, `SCORE ${state.score}`, canvas.width - 218, 176, 16);
  litText(ctx, `RINGS ${state.ringsPassed}/${state.rings.length}`, canvas.width - 218, 196, 13, '#8cd8ff');
  const t = Math.max(0, Math.ceil(state.timeLeft));
  litText(ctx, `TIME ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, canvas.width - 32, 196, 13, t < 30 ? '#ff5a4e' : '#eaf6ff', 'right');

  // Bottom centre: attitude ball.
  const ax = canvas.width / 2;
  const ay = canvas.height - 58;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, ay, 34, 0, TAU);
  ctx.clip();
  ctx.fillStyle = '#3d7ac2';
  ctx.fillRect(ax - 34, ay - 34, 68, 34 + state.pitch * 40);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(ax - 34, ay + state.pitch * 40, 68, 68);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ax - 34, ay + state.pitch * 40);
  ctx.lineTo(ax + 34, ay + state.pitch * 40);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(234, 246, 255, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ax, ay, 34, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#ffb020';
  ctx.beginPath();
  ctx.moveTo(ax - 12, ay - state.roll * 8);
  ctx.lineTo(ax + 12, ay - state.roll * 8);
  ctx.lineTo(ax, ay - state.roll * 8 + 6);
  ctx.closePath();
  ctx.fill();

  if (state.message && state.messageTime > 0) {
    litText(ctx, state.message, canvas.width / 2, 108, 20, '#ffe9a8', 'center');
  }
  if (state.speed < PLANE.stallSpeed && state.altitude > 50) {
    litText(ctx, 'STALL — NOSE DOWN, THROTTLE UP', canvas.width / 2, canvas.height - 110, 18, '#ff5a4e', 'center');
  }
}

function drawTitle(ctx, canvas, missions, selected, best) {
  ctx.fillStyle = 'rgba(6, 14, 28, 0.48)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  litText(ctx, 'SOLARA BAY', canvas.width / 2, 150, 54, '#ffffff', 'center');
  litText(ctx, 'A I R   R A L L Y', canvas.width / 2, 196, 24, '#ffb020', 'center');
  litText(ctx, 'Fly the rings. Mind the fuel. Bring her home.', canvas.width / 2, 232, 16, '#cfe8f7', 'center');
  missions.forEach((m, i) => {
    const y = 300 + i * 74;
    const sel = i === selected;
    ctx.fillStyle = sel ? 'rgba(255, 176, 32, 0.22)' : 'rgba(8, 18, 32, 0.6)';
    ctx.strokeStyle = sel ? '#ffb020' : 'rgba(140, 220, 255, 0.4)';
    ctx.lineWidth = sel ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.roundRect(canvas.width / 2 - 300, y, 600, 62, 10);
    ctx.fill();
    ctx.stroke();
    litText(ctx, `${i + 1}. ${m.name}`, canvas.width / 2 - 282, y + 26, 19, sel ? '#ffe9a8' : '#eaf6ff');
    litText(ctx, m.blurb, canvas.width / 2 - 282, y + 48, 13, '#9fc6e2');
    const b = best[m.id];
    if (b !== undefined) litText(ctx, `BEST ${b}`, canvas.width / 2 + 282, y + 26, 14, '#7dff9e', 'right');
  });
  litText(ctx, 'Arrows / WASD fly · W/S throttle · mouse steers too · P pause · M mute · Enter start', canvas.width / 2, 560, 15, '#cfe8f7', 'center');
  litText(ctx, 'An original game: code, art and sound made for this bounty. No network, no libraries.', canvas.width / 2, 588, 13, '#8fb4cc', 'center');
}

function drawEnd(ctx, canvas, state, title, lines) {
  ctx.fillStyle = 'rgba(6, 14, 28, 0.62)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  litText(ctx, title, canvas.width / 2, 220, 44, '#ffffff', 'center');
  lines.forEach((line, i) => {
    litText(ctx, line, canvas.width / 2, 280 + i * 30, 18, i === 0 ? '#ffe9a8' : '#cfe8f7', 'center');
  });
  litText(ctx, 'Enter — fly again · T — title screen', canvas.width / 2, 280 + lines.length * 30 + 26, 15, '#8fb4cc', 'center');
}

/** Draw one frame. `screen` is title | play | paused | over. */
export function render(ctx, canvas, state, screen, ui, now) {
  const dusk = state.mission.id === 'storm-run';
  const horizonY = canvas.height * VIEW.horizon + state.pitch * canvas.height * 0.4;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  // The world banks gently with the plane; the HUD stays level.
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-state.roll * 0.05);
  ctx.translate(-canvas.width / 2, -canvas.height / 2);
  skyGradient(ctx, canvas, dusk, horizonY);
  drawSun(ctx, canvas, state, dusk);
  drawClouds(ctx, canvas, state);
  drawSea(ctx, canvas, state, horizonY);
  drawIslands(ctx, canvas, state);
  drawRunway(ctx, canvas, state);
  drawRings(ctx, canvas, state, now);
  ctx.restore();

  if (screen === 'play' || screen === 'paused') {
    drawPlane(ctx, canvas, state, now);
    drawHud(ctx, canvas, state);
    if (screen === 'paused') {
      ctx.fillStyle = 'rgba(6, 14, 28, 0.55)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      litText(ctx, 'PAUSED', canvas.width / 2, canvas.height / 2 - 10, 44, '#ffffff', 'center');
      litText(ctx, 'P to resume · T for the title screen', canvas.width / 2, canvas.height / 2 + 30, 16, '#cfe8f7', 'center');
    }
  } else if (screen === 'title') {
    drawPlane(ctx, canvas, state, now);
    drawTitle(ctx, canvas, ui.missions, ui.selected, ui.best);
  } else if (screen === 'over') {
    drawPlane(ctx, canvas, state, now);
    drawHud(ctx, canvas, state);
    if (state.status === 'landed') {
      drawEnd(ctx, canvas, state, 'MISSION COMPLETE', [
        `${state.mission.name} — score ${state.score}`,
        `Rings ${state.ringsPassed}/${state.rings.length} · fuel ${Math.round(state.fuel)}% left · ${Math.round(state.timeLeft)}s to spare`,
      ]);
    } else if (state.status === 'out-of-fuel') {
      drawEnd(ctx, canvas, state, 'OUT OF FUEL', [
        state.message,
        `Score ${state.score} · rings ${state.ringsPassed}/${state.rings.length}`,
      ]);
    } else if (state.status === 'timeout') {
      drawEnd(ctx, canvas, state, 'TIME UP', [
        state.message,
        `Score ${state.score} · rings ${state.ringsPassed}/${state.rings.length}`,
      ]);
    } else {
      drawEnd(ctx, canvas, state, 'CRASHED', [
        state.message,
        `Score ${state.score} · rings ${state.ringsPassed}/${state.rings.length}`,
      ]);
    }
  }
}
