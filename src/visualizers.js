/**
 * visualizers.js — elegant audio visualizers
 * Each exported fn: (ctx, dataArray, bufferLength, canvas, opts)
 * opts: { colorScheme, sensitivity, bgImage, bgOpacity }
 */

// ── Color schemes ──────────────────────────────────────────────
const COLOR_SCHEMES = {
  neon: (i, total, amp) => {
    const hue = 200 + (i / total) * 140;
    return `hsl(${hue}, 100%, ${45 + amp * 30}%)`;
  },
  fire: (i, total, amp) => {
    const hue = (i / total) * 55;
    return `hsl(${hue}, 100%, ${35 + amp * 40}%)`;
  },
  ocean: (i, total, amp) => {
    const hue = 185 + (i / total) * 55;
    return `hsl(${hue}, 90%, ${30 + amp * 42}%)`;
  },
  aurora: (i, total, amp) => {
    const hue = 100 + (i / total) * 130;
    return `hsl(${hue}, 85%, ${30 + amp * 45}%)`;
  },
  sunset: (i, total, amp) => {
    // warm orange → magenta → cool blue
    const hue = 30 - (i / total) * 210;
    return `hsl(${((hue % 360) + 360) % 360}, 100%, ${38 + amp * 36}%)`;
  },
  white: (i, total, amp) => `rgba(255,255,255,${0.6 + amp * 0.4})`,
  rainbow: (i, total) => `hsl(${(i / total) * 360}, 100%, 60%)`,
};

function getColor(scheme, i, total, amp) {
  return (COLOR_SCHEMES[scheme] || COLOR_SCHEMES.neon)(i, total, amp);
}

// Slightly dimmer version for base/reflection gradient stops
function getDimColor(scheme, i, total) {
  return (COLOR_SCHEMES[scheme] || COLOR_SCHEMES.neon)(i, total, 0.05);
}

// ── Background ─────────────────────────────────────────────────
function drawBackground(ctx, canvas, bgImage, bgOpacity) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#080a10';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (bgImage) {
    ctx.globalAlpha = bgOpacity / 100;   // full slider range, no cap
    const scale = Math.max(canvas.width / bgImage.width, canvas.height / bgImage.height);
    const w = bgImage.width * scale, h = bgImage.height * scale;
    ctx.drawImage(bgImage, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    ctx.globalAlpha = 1;
  }

  // Lighter vignette — keeps edges dark without killing the background
  const vig = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, canvas.width * 0.1,
    canvas.width / 2, canvas.height / 2, canvas.width * 0.82
  );
  vig.addColorStop(0,   'rgba(0,0,0,0.10)');
  vig.addColorStop(0.5, 'rgba(0,0,0,0.38)');
  vig.addColorStop(1,   'rgba(0,0,0,0.75)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Dark "stage" band behind the visualizer so elements always pop
function drawStage(ctx, canvas, baseY, stageH) {
  const grad = ctx.createLinearGradient(0, baseY - stageH, 0, baseY + stageH * 0.5);
  grad.addColorStop(0,   'rgba(0,0,0,0)');
  grad.addColorStop(0.3, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0.72)');
  grad.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, baseY - stageH, canvas.width, stageH * 1.5);
}

// ── Text overlay ───────────────────────────────────────────────
// opts: { title, artist, currentLine, titlePosition }
function drawTextOverlay(ctx, canvas, opts) {
  const { title, artist, currentLine, titlePosition } = opts;
  if (!title && !artist && !currentLine) return;

  const W  = canvas.width;
  const H  = canvas.height;
  // Scale font sizes proportionally to canvas width (reference: 1280px)
  const sc = W / 1280;

  ctx.save();
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  // ── Pill background helper ──
  function drawPill(x, y, w, h, alpha = 0.52) {
    const r = h / 2;
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  const atBottom = titlePosition === 'bottom';

  // ── Title ──
  if (title) {
    const fs   = Math.max(Math.round(36 * sc), 14);
    ctx.font   = `700 ${fs}px 'Segoe UI', system-ui, sans-serif`;
    const tw   = ctx.measureText(title).width;
    const ph   = fs * 1.7;
    const pw   = tw + 40 * sc;
    const py   = atBottom ? H * 0.82 - ph / 2 : H * 0.07;
    const px   = W / 2 - pw / 2;
    drawPill(px, py, pw, ph);
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur  = 10;
    ctx.fillStyle   = 'rgba(255,255,255,0.97)';
    ctx.fillText(title, W / 2, py + ph / 2);
    ctx.shadowBlur  = 0;
  }

  // ── Artist ──
  if (artist) {
    const titleFs = Math.max(Math.round(36 * sc), 14);
    const fs   = Math.max(Math.round(22 * sc), 11);
    ctx.font   = `400 ${fs}px 'Segoe UI', system-ui, sans-serif`;
    const tw   = ctx.measureText(artist).width;
    const ph   = fs * 1.65;
    const pw   = tw + 32 * sc;
    const titleH = title ? titleFs * 1.7 : 0;
    const titleGap = title ? 6 * sc : 0;
    const py = atBottom
      ? H * 0.82 - titleH - ph / 2 - titleGap
      : H * 0.07 + titleH + titleGap;
    const px = W / 2 - pw / 2;
    drawPill(px, py, pw, ph, 0.42);
    ctx.fillStyle = 'rgba(210,215,235,0.90)';
    ctx.fillText(artist, W / 2, py + ph / 2);
  }

  // ── Caption line ──
  const line = currentLine || '';
  if (line) {
    {
      const fs   = Math.max(Math.round(28 * sc), 12);
      ctx.font   = `600 ${fs}px 'Segoe UI', system-ui, sans-serif`;
      const tw   = ctx.measureText(line).width;
      const ph   = fs * 1.75;
      const pw   = Math.min(tw + 44 * sc, W * 0.9);
      const py   = H * 0.88 - ph / 2;
      const px   = W / 2 - pw / 2;
      drawPill(px, py, pw, ph, 0.58);
      ctx.shadowColor = 'rgba(0,0,0,0.95)';
      ctx.shadowBlur  = 12;
      ctx.fillStyle   = 'rgba(255,255,255,0.97)';
      // Truncate text that overflows the pill
      let text = line;
      while (ctx.measureText(text).width > pw - 44 * sc && text.length > 1) {
        text = text.slice(0, -1);
      }
      if (text !== line) text = text.trimEnd() + '…';
      ctx.fillText(text, W / 2, py + ph / 2);
      ctx.shadowBlur  = 0;
    }
  }

  ctx.restore();
}

// ── Shared helpers ─────────────────────────────────────────────

// Gaussian bell curve: returns 0→1 based on position along [0,total]
function gaussian(i, total, sigma = 0.28) {
  const x = (i / (total - 1)) - 0.5;
  return Math.exp(-(x * x) / (2 * sigma * sigma));
}

// Smoothed catmull-rom path for waveforms
function smoothPath(ctx, points) {
  if (points.length < 2) return;
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    ctx.bezierCurveTo(mx, points[i].y, mx, points[i + 1].y, points[i + 1].x, points[i + 1].y);
  }
}

// Falling-peak tracker
const _peaks = {};
function trackPeak(key, barH, decay = 0.965) {
  const prev = _peaks[key] || 0;
  _peaks[key] = barH > prev ? barH : prev * decay;
  return _peaks[key];
}

// Floor-reflection gradient helper
function reflectionGrad(ctx, x, baseY, barW, barH, color) {
  const g = ctx.createLinearGradient(x, baseY, x, baseY + barH * 0.45);
  g.addColorStop(0, color.replace(/[\d.]+\)$/, '0.28)').replace(/hsl\(/, 'hsla(').replace(/\)$/, ',0.28)'));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  return g;
}

// ══════════════════════════════════════════════════════════════
// 1. ELEGANT BARS — gaussian envelope, gradient fill, glow, peaks
// ══════════════════════════════════════════════════════════════
function drawBars(ctx, dataArray, bufferLength, canvas, opts) {
  const { colorScheme, sensitivity, bgImage, bgOpacity } = opts;
  drawBackground(ctx, canvas, bgImage, bgOpacity);

  const usable  = Math.floor(bufferLength * 0.55);
  const totalW  = canvas.width * 0.76;
  const startX  = (canvas.width - totalW) / 2;
  const slot    = totalW / usable;
  const barW    = slot * 0.72;
  const gap     = slot * 0.28;
  const baseY   = canvas.height * 0.80;
  const maxH    = canvas.height * 0.70;

  drawStage(ctx, canvas, baseY, maxH * 1.1);

  for (let i = 0; i < usable; i++) {
    const env     = gaussian(i, usable, 0.30);
    const rawAmp  = Math.min((dataArray[i] / 255) * (sensitivity / 100), 1);
    const amp     = rawAmp * (0.35 + env * 0.65);  // envelope lifts center bars
    const barH    = amp * maxH;
    const x       = startX + i * slot;
    const color   = getColor(colorScheme, i, usable, rawAmp);

    if (barH < 1) continue;

    // ── Main bar with vertical gradient ──
    const grad = ctx.createLinearGradient(x, baseY - barH, x, baseY);
    grad.addColorStop(0, color);
    grad.addColorStop(0.6, color.replace(/[\d.]+%\)/, v => `${Math.max(parseFloat(v) - 10, 15)}%)`));
    grad.addColorStop(1, 'rgba(0,0,0,0.05)');

    ctx.shadowColor = color;
    ctx.shadowBlur  = 18 + amp * 36;
    ctx.fillStyle   = grad;

    const r = Math.min(barW / 2, 3);
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, baseY - barH + r);
    ctx.arcTo(x, baseY - barH, x + r, baseY - barH, r);
    ctx.lineTo(x + barW - r, baseY - barH);
    ctx.arcTo(x + barW, baseY - barH, x + barW, baseY - barH + r, r);
    ctx.lineTo(x + barW, baseY);
    ctx.closePath();
    ctx.fill();

    // ── Peak marker ──
    const peakH = trackPeak(`bars_${i}`, barH);
    if (peakH > 4) {
      ctx.shadowBlur  = 6;
      ctx.fillStyle   = color;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(x, baseY - peakH - 1, barW, 2);
      ctx.globalAlpha = 1;
    }

    // ── Floor reflection ──
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 0.22 * amp;
    ctx.fillStyle   = color;
    ctx.save();
    ctx.translate(x + barW / 2, baseY);
    ctx.scale(1, -0.4);
    ctx.translate(-(x + barW / 2), -baseY);
    ctx.fillRect(x, baseY - barH, barW, barH);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  ctx.shadowBlur = 0;
}

// ══════════════════════════════════════════════════════════════
// 2. WAVEFORM — smooth bezier, filled glow area, dual line
// ══════════════════════════════════════════════════════════════
function drawWaveform(ctx, dataArray, bufferLength, canvas, opts) {
  const { colorScheme, sensitivity, bgImage, bgOpacity } = opts;
  drawBackground(ctx, canvas, bgImage, bgOpacity);

  const margin  = canvas.width * 0.08;
  const drawW   = canvas.width - margin * 2;
  const midY    = canvas.height * 0.50;
  const amp     = canvas.height * 0.38 * (sensitivity / 100);
  const step    = Math.max(1, Math.floor(bufferLength / 180));
  const pts     = [];

  drawStage(ctx, canvas, midY, canvas.height * 0.42);

  for (let i = 0; i < bufferLength; i += step) {
    const v = (dataArray[i] / 128) - 1;
    pts.push({ x: margin + (i / bufferLength) * drawW, y: midY + v * amp });
  }

  if (pts.length < 2) return;

  // ── Filled glow area beneath ──
  const fillGrad = ctx.createLinearGradient(0, midY - amp, 0, midY + amp * 0.8);
  fillGrad.addColorStop(0, getColor(colorScheme, 3, 6, 0.9).replace(/hsl/, 'hsla').replace(/\)$/, ',0.28)'));
  fillGrad.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.beginPath();
  smoothPath(ctx, pts);
  ctx.lineTo(pts[pts.length - 1].x, midY);
  ctx.lineTo(pts[0].x, midY);
  ctx.closePath();
  ctx.fillStyle = fillGrad;
  ctx.fill();

  // ── Main glow line ──
  const lineGrad = ctx.createLinearGradient(margin, 0, margin + drawW, 0);
  for (let s = 0; s <= 6; s++) {
    lineGrad.addColorStop(s / 6, getColor(colorScheme, s, 6, 0.9));
  }
  ctx.beginPath();
  smoothPath(ctx, pts);
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth   = 3;
  ctx.shadowColor = getColor(colorScheme, 3, 6, 1);
  ctx.shadowBlur  = 28;
  ctx.lineJoin    = 'round';
  ctx.stroke();
  // Second pass for extra brightness
  ctx.lineWidth  = 1.2;
  ctx.shadowBlur = 8;
  ctx.globalAlpha = 0.7;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // ── Thin secondary line (echo) ──
  ctx.globalAlpha = 0.35;
  ctx.lineWidth   = 1;
  ctx.shadowBlur  = 0;
  const echo = pts.map(p => ({ x: p.x, y: midY + (p.y - midY) * 0.5 + canvas.height * 0.18 }));
  ctx.beginPath();
  smoothPath(ctx, echo);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
}

// ══════════════════════════════════════════════════════════════
// 3. CIRCULAR — double ring, inner pulse, glow spikes
// ══════════════════════════════════════════════════════════════
function drawCircular(ctx, dataArray, bufferLength, canvas, opts) {
  const { colorScheme, sensitivity, bgImage, bgOpacity } = opts;
  drawBackground(ctx, canvas, bgImage, bgOpacity);

  const cx      = canvas.width / 2;
  const cy      = canvas.height / 2;
  const minDim  = Math.min(canvas.width, canvas.height);
  const innerR  = minDim * 0.17;
  const maxSpike = minDim * 0.30;
  const usable  = Math.min(bufferLength, 200);
  const avgAmp  = dataArray.slice(0, usable).reduce((s, v) => s + v, 0) / usable / 255;

  // Inner glow circle
  const igr = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR * 0.9);
  const innerColor = getColor(colorScheme, Math.floor(usable / 2), usable, avgAmp);
  igr.addColorStop(0, innerColor.replace(/hsl/, 'hsla').replace(/\)$/, `,${0.2 + avgAmp * 0.35})`));
  igr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = igr;
  ctx.beginPath();
  ctx.arc(cx, cy, innerR * 0.9, 0, Math.PI * 2);
  ctx.fill();

  // Spikes
  for (let i = 0; i < usable; i++) {
    const amp    = Math.min((dataArray[i] / 255) * (sensitivity / 100), 1);
    const angle  = (i / usable) * Math.PI * 2 - Math.PI / 2;
    const spike  = amp * maxSpike;
    const color  = getColor(colorScheme, i, usable, amp);

    const x1 = cx + Math.cos(angle) * innerR;
    const y1 = cy + Math.sin(angle) * innerR;
    const x2 = cx + Math.cos(angle) * (innerR + spike);
    const y2 = cy + Math.sin(angle) * (innerR + spike);

    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.2 + amp * 1.8;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 16 + amp * 32;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Outer ring
  ctx.shadowBlur  = 4;
  ctx.strokeStyle = getColor(colorScheme, 0, 1, 0.5);
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.stroke();

  // Inner ring
  ctx.strokeStyle = getColor(colorScheme, Math.floor(usable * 0.7), usable, avgAmp * 0.6);
  ctx.lineWidth   = 0.5;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.arc(cx, cy, innerR * 0.6, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
}

// ══════════════════════════════════════════════════════════════
// 4. PARTICLES — spawns from bar positions, floats + fades
// ══════════════════════════════════════════════════════════════
const _particles = [];

function drawParticles(ctx, dataArray, bufferLength, canvas, opts) {
  const { colorScheme, sensitivity, bgImage, bgOpacity } = opts;
  drawBackground(ctx, canvas, bgImage, bgOpacity);

  const usable  = Math.floor(bufferLength * 0.55);
  const totalW  = canvas.width * 0.76;
  const startX  = (canvas.width - totalW) / 2;
  const slot    = totalW / usable;
  const baseY   = canvas.height * 0.80;
  const maxH    = canvas.height * 0.65;
  const sens    = sensitivity / 100;

  // Spawn from bar tips
  for (let i = 0; i < usable; i += 2) {
    const amp  = Math.min((dataArray[i] / 255) * sens, 1);
    if (amp < 0.15 || _particles.length > 700) continue;
    const env  = gaussian(i, usable, 0.30);
    const barH = amp * (0.35 + env * 0.65) * maxH;
    const x    = startX + i * slot + slot * 0.35;

    _particles.push({
      x,
      y: baseY - barH,
      vx: (Math.random() - 0.5) * 1.2,
      vy: -(0.5 + Math.random() * 2.5 * amp),
      life: 1,
      decay: 0.014 + Math.random() * 0.02,
      size: 1 + Math.random() * 2.5 * amp,
      color: getColor(colorScheme, i, usable, amp),
    });
  }

  // Draw and update
  for (let i = _particles.length - 1; i >= 0; i--) {
    const p = _particles[i];
    p.x  += p.vx;
    p.y  += p.vy;
    p.vy += 0.03;       // gentle gravity
    p.vx *= 0.995;
    p.life -= p.decay;

    if (p.life <= 0) { _particles.splice(i, 1); continue; }

    ctx.globalAlpha = p.life * p.life;
    ctx.shadowColor = p.color;
    ctx.shadowBlur  = 6;
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
}

// ══════════════════════════════════════════════════════════════
// 5. MIRROR — symmetric bars, gradient fill, glow, centered
// ══════════════════════════════════════════════════════════════
function drawMirror(ctx, dataArray, bufferLength, canvas, opts) {
  const { colorScheme, sensitivity, bgImage, bgOpacity } = opts;
  drawBackground(ctx, canvas, bgImage, bgOpacity);

  const usable  = Math.floor(bufferLength * 0.55);
  const totalW  = canvas.width * 0.76;
  const startX  = (canvas.width - totalW) / 2;
  const slot    = totalW / usable;
  const barW    = slot * 0.72;
  const midY    = canvas.height * 0.50;
  const maxH    = canvas.height * 0.40;

  drawStage(ctx, canvas, midY, maxH * 1.15);

  // Center divider
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(startX, midY);
  ctx.lineTo(startX + totalW, midY);
  ctx.stroke();

  for (let i = 0; i < usable; i++) {
    const env    = gaussian(i, usable, 0.32);
    const rawAmp = Math.min((dataArray[i] / 255) * (sensitivity / 100), 1);
    const amp    = rawAmp * (0.3 + env * 0.7);
    const barH   = amp * maxH;
    const x      = startX + i * slot;
    const color  = getColor(colorScheme, i, usable, rawAmp);

    if (barH < 1) continue;

    ctx.shadowColor = color;
    ctx.shadowBlur  = 18 + amp * 30;

    // Up gradient
    const gradUp = ctx.createLinearGradient(x, midY - barH, x, midY);
    gradUp.addColorStop(0, color);
    gradUp.addColorStop(1, 'rgba(0,0,0,0.05)');
    ctx.fillStyle = gradUp;
    ctx.fillRect(x, midY - barH, barW, barH);

    // Down gradient (mirror)
    const gradDn = ctx.createLinearGradient(x, midY, x, midY + barH);
    gradDn.addColorStop(0, color);
    gradDn.addColorStop(1, 'rgba(0,0,0,0.05)');
    ctx.fillStyle = gradDn;
    ctx.fillRect(x, midY, barW, barH);
  }

  ctx.shadowBlur = 0;
}

// ══════════════════════════════════════════════════════════════
// 6. SPECTRUM — smooth filled mountain, glowing ridge line
// ══════════════════════════════════════════════════════════════
function drawSpectrum(ctx, dataArray, bufferLength, canvas, opts) {
  const { colorScheme, sensitivity, bgImage, bgOpacity } = opts;
  drawBackground(ctx, canvas, bgImage, bgOpacity);

  const margin  = canvas.width * 0.06;
  const drawW   = canvas.width - margin * 2;
  const baseY   = canvas.height;
  const maxH    = canvas.height * 0.82;

  drawStage(ctx, canvas, canvas.height * 0.5, canvas.height * 0.55);
  const usable  = Math.floor(bufferLength * 0.65);
  const step    = Math.max(1, Math.floor(usable / 160));
  const pts     = [];

  for (let i = 0; i < usable; i += step) {
    const amp = Math.min((dataArray[i] / 255) * (sensitivity / 100), 1);
    pts.push({ x: margin + (i / usable) * drawW, y: baseY - amp * maxH });
  }
  if (pts.length < 2) return;

  // ── Filled area ──
  ctx.beginPath();
  ctx.moveTo(pts[0].x, baseY);
  smoothPath(ctx, pts);
  ctx.lineTo(pts[pts.length - 1].x, baseY);
  ctx.closePath();

  const fillGrad = ctx.createLinearGradient(margin, 0, margin + drawW, 0);
  for (let s = 0; s <= 8; s++) {
    fillGrad.addColorStop(s / 8, getColor(colorScheme, s, 8, 0.7)
      .replace(/hsl\(/, 'hsla(').replace(/\)$/, ',0.38)'));
  }
  ctx.fillStyle = fillGrad;
  ctx.fill();

  // ── Ridge line ──
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  smoothPath(ctx, pts.slice(1));

  const lineGrad = ctx.createLinearGradient(margin, 0, margin + drawW, 0);
  for (let s = 0; s <= 8; s++) {
    lineGrad.addColorStop(s / 8, getColor(colorScheme, s, 8, 1));
  }
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth   = 3;
  ctx.lineJoin    = 'round';
  ctx.shadowColor = getColor(colorScheme, 4, 8, 1);
  ctx.shadowBlur  = 30;
  ctx.stroke();

  // ── Second pass: brighter thin overlay ──
  ctx.lineWidth   = 1.2;
  ctx.shadowBlur  = 8;
  ctx.globalAlpha = 0.75;
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
}

// ══════════════════════════════════════════════════════════════
// 7. GLOW 3D — perspective-tilted bars like the reference image
//    Draws bars front-to-back using painter's algorithm so the
//    center (tallest) bars appear to be "closer" / in front.
// ══════════════════════════════════════════════════════════════
function drawGlow3D(ctx, dataArray, bufferLength, canvas, opts) {
  const { colorScheme, sensitivity, bgImage, bgOpacity } = opts;
  drawBackground(ctx, canvas, bgImage, bgOpacity);

  const usable  = Math.floor(bufferLength * 0.55);
  const totalW  = canvas.width * 0.80;
  const startX  = (canvas.width - totalW) / 2;
  const slot    = totalW / usable;
  const barW    = slot * 0.78;
  const baseY   = canvas.height * 0.76;
  const maxH    = canvas.height * 0.68;

  drawStage(ctx, canvas, baseY, maxH * 1.05);

  // Apply perspective shear — makes bars look like they're on a tilted plane
  ctx.save();
  const cx = canvas.width / 2;
  const cy = canvas.height * 0.76;
  ctx.translate(cx, cy);
  ctx.transform(1, -0.06, 0, 0.92, 0, 0);
  ctx.translate(-cx, -cy);

  // Draw outside bars first (painter's algorithm → center drawn on top)
  const order = [];
  for (let i = 0; i < usable; i++) order.push(i);
  order.sort((a, b) => Math.abs(a - usable / 2) - Math.abs(b - usable / 2));
  // This sorts from outside (far) to center (near)
  order.reverse(); // near first... actually we want far first so center overlaps
  // Re-sort: far from center first
  order.sort((a, b) => Math.abs(b - usable / 2) - Math.abs(a - usable / 2));

  for (const i of order) {
    const env    = gaussian(i, usable, 0.26);
    const rawAmp = Math.min((dataArray[i] / 255) * (sensitivity / 100), 1);
    const amp    = rawAmp * (0.18 + env * 0.82);
    const barH   = amp * maxH;
    const x      = startX + i * slot;
    const color  = getColor(colorScheme, i, usable, rawAmp);

    if (barH < 2) continue;

    // Strong glow increases near center
    const glowStr = 22 + amp * 45 + env * 28;
    ctx.shadowColor = color;
    ctx.shadowBlur  = glowStr;

    // Bar gradient: bright top → almost invisible base
    const grad = ctx.createLinearGradient(x, baseY - barH, x, baseY);
    grad.addColorStop(0.0, color);
    grad.addColorStop(0.55, color.replace(/(\d+)%\)/, (_, l) => `${Math.max(+l - 20, 8)}%)`));
    grad.addColorStop(1.0, 'rgba(0,0,0,0)');

    ctx.fillStyle = grad;
    const r = Math.min(barW / 2, 4);
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, baseY - barH + r);
    ctx.arcTo(x, baseY - barH, x + r, baseY - barH, r);
    ctx.lineTo(x + barW - r, baseY - barH);
    ctx.arcTo(x + barW, baseY - barH, x + barW, baseY - barH + r, r);
    ctx.lineTo(x + barW, baseY);
    ctx.closePath();
    ctx.fill();

    // Bright tip cap
    if (amp > 0.08) {
      ctx.shadowBlur  = glowStr * 1.4;
      ctx.fillStyle   = 'rgba(255,255,255,0.6)';
      ctx.globalAlpha = amp * env;
      ctx.fillRect(x + barW * 0.1, baseY - barH - 1, barW * 0.8, 3);
      ctx.globalAlpha = 1;
    }

    // Floor reflection (compressed below base)
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 0.18 * amp * env;
    ctx.fillStyle   = color;
    ctx.save();
    ctx.translate(x + barW / 2, baseY);
    ctx.scale(1, -0.35);
    ctx.translate(-(x + barW / 2), -baseY);
    ctx.fillRect(x, baseY - barH * 0.7, barW, barH * 0.7);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  ctx.restore(); // pop perspective transform
  ctx.shadowBlur = 0;

  // Floating spark particles at bar tips
  const avgAmp = dataArray.slice(0, usable).reduce((s, v) => s + v, 0) / usable / 255;
  if (avgAmp > 0.12 && _particles.length < 500) {
    const sparkI = Math.floor(Math.random() * usable);
    const sEnv   = gaussian(sparkI, usable, 0.26);
    const sAmp   = Math.min((dataArray[sparkI] / 255) * (sensitivity / 100), 1);
    const sBarH  = sAmp * (0.18 + sEnv * 0.82) * maxH;
    const sx     = startX + sparkI * slot + barW / 2;
    // Project through perspective (approximate)
    _particles.push({
      x:     sx,
      y:     baseY - sBarH,
      vx:    (Math.random() - 0.5) * 1.5,
      vy:    -(0.3 + Math.random() * 2),
      life:  1,
      decay: 0.018 + Math.random() * 0.022,
      size:  0.8 + Math.random() * 2,
      color: getColor(colorScheme, sparkI, usable, sAmp),
    });
  }

  // Render any carried-over particles from particle pool
  for (let i = _particles.length - 1; i >= 0; i--) {
    const p = _particles[i];
    p.x  += p.vx;
    p.y  += p.vy;
    p.vy += 0.04;
    p.life -= p.decay;
    if (p.life <= 0) { _particles.splice(i, 1); continue; }
    ctx.globalAlpha = p.life * p.life;
    ctx.shadowColor = p.color;
    ctx.shadowBlur  = 5;
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
}

// ── Dispatcher ─────────────────────────────────────────────────
// Each viz is wrapped so text overlay is always drawn last (on top).
function withOverlay(fn) {
  return function (ctx, dataArray, bufferLength, canvas, opts) {
    fn(ctx, dataArray, bufferLength, canvas, opts);
    drawTextOverlay(ctx, canvas, opts);
  };
}

window.Visualizers = {
  bars:      withOverlay(drawBars),
  waveform:  withOverlay(drawWaveform),
  circular:  withOverlay(drawCircular),
  particles: withOverlay(drawParticles),
  mirror:    withOverlay(drawMirror),
  spectrum:  withOverlay(drawSpectrum),
  glow3d:    withOverlay(drawGlow3D),
};
