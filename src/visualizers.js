/**
 * visualizers.js
 * Each visualizer is a function(ctx, dataArray, bufferLength, canvas, options)
 * options: { colorScheme, sensitivity, bgImage, bgOpacity }
 */

const COLOR_SCHEMES = {
  neon: (i, total, amplitude) => {
    const hue = (i / total) * 240 + 180;
    return `hsl(${hue}, 100%, ${40 + amplitude * 30}%)`;
  },
  fire: (i, total, amplitude) => {
    const hue = amplitude * 60; // 0=red → 60=yellow
    return `hsl(${hue}, 100%, ${35 + amplitude * 35}%)`;
  },
  ocean: (i, total, amplitude) => {
    const hue = 180 + (i / total) * 60;
    return `hsl(${hue}, 90%, ${30 + amplitude * 40}%)`;
  },
  aurora: (i, total, amplitude) => {
    const hue = (i / total) * 120 + 100;
    return `hsl(${hue}, 80%, ${30 + amplitude * 45}%)`;
  },
  white: () => `rgba(255,255,255,0.9)`,
  rainbow: (i, total) => {
    const hue = (i / total) * 360;
    return `hsl(${hue}, 100%, 60%)`;
  },
};

function getColor(scheme, i, total, amplitude) {
  const fn = COLOR_SCHEMES[scheme] || COLOR_SCHEMES.neon;
  return fn(i, total, amplitude);
}

function drawBackground(ctx, canvas, bgImage, bgOpacity) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0a0c12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (bgImage) {
    ctx.globalAlpha = bgOpacity / 100;
    const scale = Math.max(canvas.width / bgImage.width, canvas.height / bgImage.height);
    const w = bgImage.width * scale;
    const h = bgImage.height * scale;
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;
    ctx.drawImage(bgImage, x, y, w, h);
    ctx.globalAlpha = 1;
    // Subtle dark vignette
    const grad = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, canvas.width * 0.2,
      canvas.width / 2, canvas.height / 2, canvas.width * 0.8
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

// ── 1. Bars ────────────────────────────────────────────────────
function drawBars(ctx, dataArray, bufferLength, canvas, opts) {
  const { colorScheme, sensitivity, bgImage, bgOpacity } = opts;
  drawBackground(ctx, canvas, bgImage, bgOpacity);

  const usable = Math.floor(bufferLength * 0.6);
  const barWidth = (canvas.width / usable) * 0.8;
  const gap = (canvas.width / usable) * 0.2;
  const baseY = canvas.height * 0.85;
  const maxH = canvas.height * 0.75;

  for (let i = 0; i < usable; i++) {
    const amplitude = (dataArray[i] / 255) * (sensitivity / 100);
    const barH = amplitude * maxH;
    const x = i * (barWidth + gap) + gap / 2;

    ctx.fillStyle = getColor(colorScheme, i, usable, amplitude);

    // Rounded top via arc
    const radius = Math.min(barWidth / 2, barH / 2, 6);
    if (barH > 0) {
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x, baseY - barH + radius);
      ctx.quadraticCurveTo(x, baseY - barH, x + radius, baseY - barH);
      ctx.lineTo(x + barWidth - radius, baseY - barH);
      ctx.quadraticCurveTo(x + barWidth, baseY - barH, x + barWidth, baseY - barH + radius);
      ctx.lineTo(x + barWidth, baseY);
      ctx.closePath();
      ctx.fill();
    }

    // Glow reflection
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = getColor(colorScheme, i, usable, amplitude);
    ctx.fillRect(x, baseY, barWidth, barH * 0.2);
    ctx.globalAlpha = 1;
  }
}

// ── 2. Waveform ────────────────────────────────────────────────
function drawWaveform(ctx, dataArray, bufferLength, canvas, opts) {
  const { colorScheme, sensitivity, bgImage, bgOpacity } = opts;
  drawBackground(ctx, canvas, bgImage, bgOpacity);

  const sliceWidth = canvas.width / bufferLength;
  const midY = canvas.height / 2;
  const amp = canvas.height * 0.4 * (sensitivity / 100);

  // Glow effect
  ctx.shadowColor = getColor(colorScheme, 0, 1, 0.8);
  ctx.shadowBlur = 12;

  ctx.beginPath();
  ctx.lineWidth = 2.5;
  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  grad.addColorStop(0, getColor(colorScheme, 0, 10, 0.8));
  grad.addColorStop(0.5, getColor(colorScheme, 5, 10, 1));
  grad.addColorStop(1, getColor(colorScheme, 9, 10, 0.8));
  ctx.strokeStyle = grad;

  for (let i = 0; i < bufferLength; i++) {
    const v = (dataArray[i] / 128) - 1;
    const y = midY + v * amp;
    const x = i * sliceWidth;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Mirror line below
  ctx.beginPath();
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.3;
  for (let i = 0; i < bufferLength; i++) {
    const v = (dataArray[i] / 128) - 1;
    const y = midY - v * amp * 0.5 + amp * 0.6;
    const x = i * sliceWidth;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ── 3. Circular ────────────────────────────────────────────────
function drawCircular(ctx, dataArray, bufferLength, canvas, opts) {
  const { colorScheme, sensitivity, bgImage, bgOpacity } = opts;
  drawBackground(ctx, canvas, bgImage, bgOpacity);

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const minDim = Math.min(canvas.width, canvas.height);
  const innerR = minDim * 0.18;
  const maxSpike = minDim * 0.28;
  const usable = Math.min(bufferLength, 256);

  for (let i = 0; i < usable; i++) {
    const amplitude = (dataArray[i] / 255) * (sensitivity / 100);
    const angle = (i / usable) * Math.PI * 2 - Math.PI / 2;
    const spikeLen = amplitude * maxSpike;

    const x1 = cx + Math.cos(angle) * innerR;
    const y1 = cy + Math.sin(angle) * innerR;
    const x2 = cx + Math.cos(angle) * (innerR + spikeLen);
    const y2 = cy + Math.sin(angle) * (innerR + spikeLen);

    ctx.strokeStyle = getColor(colorScheme, i, usable, amplitude);
    ctx.lineWidth = 2;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // Inner circle
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.strokeStyle = getColor(colorScheme, 0, 1, 0.6);
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ── 4. Particles ───────────────────────────────────────────────
const particlePool = [];
let lastParticleTime = 0;

function spawnParticles(dataArray, bufferLength, canvas, opts) {
  const avgAmplitude = dataArray.reduce((a, b) => a + b, 0) / bufferLength / 255;
  const count = Math.floor(avgAmplitude * opts.sensitivity / 100 * 4);

  for (let i = 0; i < count; i++) {
    if (particlePool.length > 600) break;
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 3 * avgAmplitude * (opts.sensitivity / 100);
    particlePool.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.4,
      y: canvas.height / 2 + (Math.random() - 0.5) * canvas.height * 0.4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.5,
      life: 1,
      decay: 0.012 + Math.random() * 0.018,
      size: 1.5 + Math.random() * 3,
      hue: Math.floor(Math.random() * 360),
    });
  }
}

function drawParticles(ctx, dataArray, bufferLength, canvas, opts) {
  const { colorScheme, sensitivity, bgImage, bgOpacity } = opts;
  drawBackground(ctx, canvas, bgImage, bgOpacity);

  spawnParticles(dataArray, bufferLength, canvas, opts);

  for (let i = particlePool.length - 1; i >= 0; i--) {
    const p = particlePool[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy -= 0.05; // slight float up
    p.life -= p.decay;

    if (p.life <= 0) {
      particlePool.splice(i, 1);
      continue;
    }

    ctx.globalAlpha = p.life;
    if (colorScheme === 'rainbow') {
      ctx.fillStyle = `hsl(${p.hue}, 100%, 65%)`;
    } else {
      ctx.fillStyle = getColor(colorScheme, i, particlePool.length, p.life);
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ── 5. Mirror Bars ─────────────────────────────────────────────
function drawMirror(ctx, dataArray, bufferLength, canvas, opts) {
  const { colorScheme, sensitivity, bgImage, bgOpacity } = opts;
  drawBackground(ctx, canvas, bgImage, bgOpacity);

  const usable = Math.floor(bufferLength * 0.6);
  const barWidth = (canvas.width / usable) * 0.8;
  const gap = (canvas.width / usable) * 0.2;
  const midY = canvas.height / 2;
  const maxH = canvas.height * 0.44;

  // Center line
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(canvas.width, midY);
  ctx.stroke();

  for (let i = 0; i < usable; i++) {
    const amplitude = (dataArray[i] / 255) * (sensitivity / 100);
    const barH = amplitude * maxH;
    const x = i * (barWidth + gap) + gap / 2;
    const color = getColor(colorScheme, i, usable, amplitude);

    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;

    // Top
    ctx.fillRect(x, midY - barH, barWidth, barH);
    // Bottom mirror
    ctx.fillRect(x, midY, barWidth, barH);
  }
  ctx.shadowBlur = 0;
}

// ── 6. Spectrum ────────────────────────────────────────────────
function drawSpectrum(ctx, dataArray, bufferLength, canvas, opts) {
  const { colorScheme, sensitivity, bgImage, bgOpacity } = opts;
  drawBackground(ctx, canvas, bgImage, bgOpacity);

  const usable = Math.floor(bufferLength * 0.7);
  const sliceW = canvas.width / usable;
  const maxH = canvas.height;

  // Draw filled area
  ctx.beginPath();
  ctx.moveTo(0, canvas.height);
  for (let i = 0; i < usable; i++) {
    const amplitude = (dataArray[i] / 255) * (sensitivity / 100);
    const h = amplitude * maxH;
    ctx.lineTo(i * sliceW, canvas.height - h);
  }
  ctx.lineTo(canvas.width, canvas.height);
  ctx.closePath();

  const fillGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  const steps = 6;
  for (let s = 0; s <= steps; s++) {
    const amp = (dataArray[Math.floor((s / steps) * usable)] || 0) / 255;
    fillGrad.addColorStop(s / steps, getColor(colorScheme, s, steps, amp));
  }
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = fillGrad;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Draw outline on top
  ctx.beginPath();
  for (let i = 0; i < usable; i++) {
    const amplitude = (dataArray[i] / 255) * (sensitivity / 100);
    const h = amplitude * maxH;
    i === 0 ? ctx.moveTo(0, canvas.height - h) : ctx.lineTo(i * sliceW, canvas.height - h);
  }
  const lineGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  for (let s = 0; s <= steps; s++) {
    const amp = (dataArray[Math.floor((s / steps) * usable)] || 0) / 255;
    lineGrad.addColorStop(s / steps, getColor(colorScheme, s, steps, amp));
  }
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(255,255,255,0.3)';
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

// ── Dispatcher ─────────────────────────────────────────────────
window.Visualizers = {
  bars: drawBars,
  waveform: drawWaveform,
  circular: drawCircular,
  particles: drawParticles,
  mirror: drawMirror,
  spectrum: drawSpectrum,
};
