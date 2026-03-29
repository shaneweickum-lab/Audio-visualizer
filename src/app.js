/**
 * app.js — main application controller
 */
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────
  let bgImage = null;
  let audioBuffer = null;
  let audioCtx = null;
  let sourceNode = null;
  let analyserNode = null;
  let dataArray = null;
  let bufferLength = 0;
  let isPlaying = false;
  let startTime = 0;       // audioCtx.currentTime when playback started
  let startOffset = 0;     // offset into audio where we started from
  let animFrameId = null;
  let currentViz = 'bars';

  // ── DOM refs ───────────────────────────────────────────────────
  const canvas = document.getElementById('visualizerCanvas');
  const ctx = canvas.getContext('2d');
  const canvasOverlay = document.getElementById('canvasOverlay');

  const imageInput = document.getElementById('imageInput');
  const imageUploadZone = document.getElementById('imageUploadZone');
  const imagePlaceholder = document.getElementById('imagePlaceholder');
  const imagePreview = document.getElementById('imagePreview');

  const audioInput = document.getElementById('audioInput');
  const audioUploadZone = document.getElementById('audioUploadZone');
  const audioPlaceholder = document.getElementById('audioPlaceholder');
  const audioInfo = document.getElementById('audioInfo');
  const audioFileName = document.getElementById('audioFileName');

  const vizButtons = document.querySelectorAll('.viz-btn');
  const colorSchemeSelect = document.getElementById('colorScheme');
  const bgOpacitySlider = document.getElementById('bgOpacity');
  const bgOpacityValue = document.getElementById('bgOpacityValue');
  const sensitivitySlider = document.getElementById('sensitivity');
  const sensitivityValue = document.getElementById('sensitivityValue');
  const smoothingSlider = document.getElementById('smoothing');
  const smoothingValue = document.getElementById('smoothingValue');

  const playPauseBtn = document.getElementById('playPauseBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');
  const currentTimeEl = document.getElementById('currentTime');
  const totalTimeEl = document.getElementById('totalTime');
  const volumeSlider = document.getElementById('volumeSlider');

  const recordBtn = document.getElementById('recordBtn');
  const recordStatus = document.getElementById('recordStatus');
  const videoQualitySelect = document.getElementById('videoQuality');
  const videoFormatSelect = document.getElementById('videoFormat');

  // ── Canvas sizing ──────────────────────────────────────────────
  function resizeCanvas() {
    const wrapper = canvas.parentElement;
    const rect = wrapper.getBoundingClientRect();
    // 16:9 within available space
    const maxW = rect.width - 32;
    const maxH = rect.height - 32;
    let w = maxW;
    let h = w * (9 / 16);
    if (h > maxH) { h = maxH; w = h * (16 / 9); }
    canvas.width = Math.floor(w);
    canvas.height = Math.floor(h);
    if (!isPlaying) drawIdleFrame();
  }

  function drawIdleFrame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0a0c12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (bgImage) {
      ctx.globalAlpha = parseInt(bgOpacitySlider.value) / 100;
      const scale = Math.max(canvas.width / bgImage.width, canvas.height / bgImage.height);
      const w = bgImage.width * scale, h = bgImage.height * scale;
      ctx.drawImage(bgImage, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      ctx.globalAlpha = 1;
    }
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // ── Image upload ───────────────────────────────────────────────
  function setupDropZone(zone, input, onFile) {
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    });
    input.addEventListener('change', () => { if (input.files[0]) onFile(input.files[0]); });
  }

  setupDropZone(imageUploadZone, imageInput, (file) => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      bgImage = img;
      imagePreview.src = url;
      imagePreview.style.display = 'block';
      imagePlaceholder.style.display = 'none';
      drawIdleFrame();
      updateReadyState();
    };
    img.src = url;
  });

  setupDropZone(audioUploadZone, audioInput, async (file) => {
    if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|ogg|flac|aac|m4a)$/i)) return;

    audioFileName.textContent = file.name;
    audioInfo.style.display = 'flex';
    audioPlaceholder.style.display = 'none';

    const arrayBuffer = await file.arrayBuffer();
    if (!audioCtx) audioCtx = new AudioContext();
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    totalTimeEl.textContent = formatTime(audioBuffer.duration);
    stopPlayback();
    updateReadyState();
  });

  // ── Playback ───────────────────────────────────────────────────
  function createAnalyser() {
    if (!analyserNode) {
      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 2048;
    }
    analyserNode.smoothingTimeConstant = parseInt(smoothingSlider.value) / 100;
    bufferLength = analyserNode.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
  }

  function startPlayback(offset = 0) {
    if (!audioBuffer) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    createAnalyser();

    sourceNode = audioCtx.createBufferSource();
    sourceNode.buffer = audioBuffer;

    const gainNode = audioCtx.createGain();
    gainNode.gain.value = parseInt(volumeSlider.value) / 100;

    sourceNode.connect(analyserNode);
    analyserNode.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    startOffset = offset;
    startTime = audioCtx.currentTime;
    sourceNode.start(0, offset);
    isPlaying = true;

    sourceNode.onended = () => {
      if (isPlaying) stopPlayback(true);
    };

    playIcon.style.display = 'none';
    pauseIcon.style.display = 'block';

    drawLoop();
  }

  function pausePlayback() {
    if (!isPlaying) return;
    startOffset += audioCtx.currentTime - startTime;
    sourceNode.stop();
    sourceNode.disconnect();
    sourceNode = null;
    isPlaying = false;
    cancelAnimationFrame(animFrameId);
    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';
  }

  function stopPlayback(ended = false) {
    if (sourceNode) {
      try { sourceNode.stop(); } catch (_) {}
      sourceNode.disconnect();
      sourceNode = null;
    }
    isPlaying = false;
    cancelAnimationFrame(animFrameId);
    if (ended) {
      startOffset = 0;
      progressFill.style.width = '0%';
      currentTimeEl.textContent = '0:00';
    }
    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';
    drawIdleFrame();
  }

  playPauseBtn.addEventListener('click', () => {
    if (!audioBuffer) return;
    if (isPlaying) pausePlayback();
    else startPlayback(startOffset);
  });

  volumeSlider.addEventListener('input', () => {
    // Volume is applied at next playback start; for live control we'd need a persistent GainNode
  });

  // Progress bar seeking
  progressBar.addEventListener('click', (e) => {
    if (!audioBuffer) return;
    const rect = progressBar.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const newOffset = ratio * audioBuffer.duration;
    if (isPlaying) {
      pausePlayback();
      startOffset = newOffset;
      startPlayback(newOffset);
    } else {
      startOffset = newOffset;
      progressFill.style.width = (ratio * 100) + '%';
      currentTimeEl.textContent = formatTime(newOffset);
    }
  });

  // ── Draw loop ──────────────────────────────────────────────────
  function drawLoop() {
    animFrameId = requestAnimationFrame(drawLoop);
    if (!analyserNode) return;

    analyserNode.getByteFrequencyData(dataArray);

    const elapsed = startOffset + (audioCtx.currentTime - startTime);
    const progress = Math.min(elapsed / audioBuffer.duration, 1);
    progressFill.style.width = (progress * 100) + '%';
    currentTimeEl.textContent = formatTime(elapsed);

    const vizFn = Visualizers[currentViz];
    if (vizFn) {
      vizFn(ctx, dataArray, bufferLength, canvas, {
        colorScheme: colorSchemeSelect.value,
        sensitivity: parseInt(sensitivitySlider.value),
        bgImage,
        bgOpacity: parseInt(bgOpacitySlider.value),
      });
    }
  }

  // ── Viz selector ───────────────────────────────────────────────
  vizButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      vizButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentViz = btn.dataset.viz;
    });
  });

  // ── Settings sliders ───────────────────────────────────────────
  bgOpacitySlider.addEventListener('input', () => {
    bgOpacityValue.textContent = bgOpacitySlider.value + '%';
    if (!isPlaying) drawIdleFrame();
  });

  sensitivitySlider.addEventListener('input', () => {
    sensitivityValue.textContent = sensitivitySlider.value + '%';
  });

  smoothingSlider.addEventListener('input', () => {
    smoothingValue.textContent = smoothingSlider.value + '%';
    if (analyserNode) analyserNode.smoothingTimeConstant = parseInt(smoothingSlider.value) / 100;
  });

  // ── Ready state ────────────────────────────────────────────────
  function updateReadyState() {
    const ready = !!audioBuffer;
    playPauseBtn.disabled = !ready;
    recordBtn.disabled = !ready;
    if (ready) canvasOverlay.style.display = 'none';
  }

  // ── Recording ─────────────────────────────────────────────────
  recordBtn.addEventListener('click', async () => {
    if (!audioBuffer) return;

    // Stop any live playback first
    if (isPlaying) stopPlayback();

    const quality = videoQualitySelect.value;
    const preferMp4 = videoFormatSelect.value === 'mp4';

    // Show overlay
    const overlay = createDownloadOverlay();
    document.body.appendChild(overlay);

    recordBtn.disabled = true;
    recordBtn.classList.add('recording');

    try {
      const { blob, ext } = await Recorder.record(
        canvas,
        audioBuffer,
        audioCtx,
        (analyser, dArray, bLen) => {
          const vizFn = Visualizers[currentViz];
          if (vizFn) {
            vizFn(ctx, dArray, bLen, canvas, {
              colorScheme: colorSchemeSelect.value,
              sensitivity: parseInt(sensitivitySlider.value),
              bgImage,
              bgOpacity: parseInt(bgOpacitySlider.value),
            });
          }
        },
        {
          quality,
          preferMp4,
          onProgress: (p) => {
            const fill = overlay.querySelector('.download-progress-fill');
            const timer = overlay.querySelector('.download-timer');
            if (fill) fill.style.width = (p * 100).toFixed(1) + '%';
            if (timer) timer.textContent = (p * 100).toFixed(0) + '%';
          }
        }
      );

      Recorder.download(blob, `audio-visualizer.${ext}`);

      recordStatus.textContent = `Exported as ${ext.toUpperCase()} — saved to Downloads`;
      recordStatus.style.display = 'block';
    } catch (err) {
      console.error('Recording error:', err);
      recordStatus.textContent = 'Export failed: ' + err.message;
      recordStatus.style.display = 'block';
    } finally {
      document.body.removeChild(overlay);
      recordBtn.disabled = false;
      recordBtn.classList.remove('recording');
      resizeCanvas();
      drawIdleFrame();
    }
  });

  function createDownloadOverlay() {
    const div = document.createElement('div');
    div.className = 'download-overlay';
    div.innerHTML = `
      <div class="download-card">
        <h3>Rendering Video…</h3>
        <p>Please wait. The full audio track is being rendered.</p>
        <div class="download-progress-bar">
          <div class="download-progress-fill"></div>
        </div>
        <div class="download-timer">0%</div>
      </div>`;
    return div;
  }

  // ── Helpers ────────────────────────────────────────────────────
  function formatTime(seconds) {
    const s = Math.floor(seconds) || 0;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem.toString().padStart(2, '0')}`;
  }

})();
