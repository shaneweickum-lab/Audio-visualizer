/**
 * app.js — main application controller
 */
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────
  let bgImage        = null;
  let audioBuffer    = null;
  let audioCtx       = null;
  let sourceNode     = null;
  let analyserNode   = null;
  let gainNode       = null;   // persistent so volume changes take effect live
  let dataArray      = null;
  let bufferLength   = 0;
  let isPlaying      = false;
  let startTime      = 0;      // audioCtx.currentTime when playback started
  let startOffset    = 0;      // position in track we resumed from
  let animFrameId    = null;
  let currentViz     = 'bars';
  let currentColor   = 'neon';

  // ── DOM refs ───────────────────────────────────────────────────
  const canvas        = document.getElementById('visualizerCanvas');
  const ctx           = canvas.getContext('2d');
  const canvasOverlay = document.getElementById('canvasOverlay');

  const imageInput       = document.getElementById('imageInput');
  const imageUploadZone  = document.getElementById('imageUploadZone');
  const imagePlaceholder = document.getElementById('imagePlaceholder');
  const imagePreview     = document.getElementById('imagePreview');

  const audioInput       = document.getElementById('audioInput');
  const audioUploadZone  = document.getElementById('audioUploadZone');
  const audioPlaceholder = document.getElementById('audioPlaceholder');
  const audioInfo        = document.getElementById('audioInfo');
  const audioFileName    = document.getElementById('audioFileName');

  const vizButtons   = document.querySelectorAll('.viz-btn');
  const colorButtons = document.querySelectorAll('.color-btn');

  const bgOpacitySlider   = document.getElementById('bgOpacity');
  const bgOpacityValue    = document.getElementById('bgOpacityValue');
  const sensitivitySlider = document.getElementById('sensitivity');
  const sensitivityValue  = document.getElementById('sensitivityValue');
  const smoothingSlider   = document.getElementById('smoothing');
  const smoothingValue    = document.getElementById('smoothingValue');

  // Two volume sliders: one in the playback bar (desktop), one in Settings panel (mobile)
  const volumeSliderBar   = document.getElementById('volumeSlider');
  const volumeSliderPanel = document.getElementById('volumeSliderPanel');
  const volumeValue       = document.getElementById('volumeValue');

  const playPauseBtn  = document.getElementById('playPauseBtn');
  const playIcon      = document.getElementById('playIcon');
  const pauseIcon     = document.getElementById('pauseIcon');
  const progressBar   = document.getElementById('progressBar');
  const progressFill  = document.getElementById('progressFill');
  const currentTimeEl = document.getElementById('currentTime');
  const totalTimeEl   = document.getElementById('totalTime');

  const recordBtn          = document.getElementById('recordBtn');
  const fabExport          = document.getElementById('fabExport');
  const recordStatus       = document.getElementById('recordStatus');
  const videoQualitySelect = document.getElementById('videoQuality');
  const videoFormatSelect  = document.getElementById('videoFormat');

  // ── Mobile tabs ────────────────────────────────────────────────
  const tabBtns = document.querySelectorAll('.tab-btn');

  function setActiveTab(tab) {
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.control-section').forEach(s => {
      s.classList.toggle('mob-active', s.dataset.tab === tab);
    });
  }

  tabBtns.forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));
  setActiveTab('upload'); // default; CSS only hides on mobile

  // ── Canvas sizing ──────────────────────────────────────────────
  function resizeCanvas() {
    const wrapper = canvas.parentElement;
    const rect    = wrapper.getBoundingClientRect();
    const maxW    = rect.width;
    const maxH    = rect.height;
    let w = maxW;
    let h = w * (9 / 16);
    if (h > maxH) { h = maxH; w = h * (16 / 9); }
    canvas.width  = Math.max(Math.floor(w), 1);
    canvas.height = Math.max(Math.floor(h), 1);
    if (!isPlaying) drawIdleFrame();
  }

  function drawIdleFrame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0a0c12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (bgImage) {
      ctx.globalAlpha = parseInt(bgOpacitySlider.value) / 100;
      const scale = Math.max(canvas.width / bgImage.width, canvas.height / bgImage.height);
      const w = bgImage.width * scale;
      const h = bgImage.height * scale;
      ctx.drawImage(bgImage, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      ctx.globalAlpha = 1;
    }
  }

  window.addEventListener('resize', () => {
    resizeCanvas();
  });

  // Defer first sizing until layout is painted
  requestAnimationFrame(() => resizeCanvas());

  // ── Upload helpers ─────────────────────────────────────────────
  function setupDropZone(zone, input, onFile) {
    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    });

    input.addEventListener('change', () => {
      if (input.files[0]) onFile(input.files[0]);
      // Reset so the same file can be re-selected
      input.value = '';
    });
  }

  // ── Image upload ───────────────────────────────────────────────
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
    img.onerror = () => showError('Could not load image.');
    img.src = url;
  });

  // ── Audio upload ───────────────────────────────────────────────
  // Accept: all audio/* types plus explicit extensions for iOS/Android
  const AUDIO_EXTS = /\.(mp3|wav|wave|ogg|oga|opus|flac|aac|m4a|weba|webm)$/i;

  setupDropZone(audioUploadZone, audioInput, async (file) => {
    const isAudio = file.type.startsWith('audio/') ||
                    file.type === 'video/webm' ||   // some .webm audio files
                    AUDIO_EXTS.test(file.name);
    if (!isAudio) {
      showError('Please upload an audio file (MP3, WAV, OGG, FLAC, AAC, M4A…)');
      return;
    }

    // Show loading state
    audioPlaceholder.style.display = 'none';
    audioInfo.style.display = 'flex';
    audioFileName.textContent = 'Loading…';

    try {
      // AudioContext must be created (or resumed) from a user gesture; file
      // input change counts as one on all major browsers.
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      const arrayBuffer = await file.arrayBuffer();
      audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      audioFileName.textContent = file.name;
      totalTimeEl.textContent   = formatTime(audioBuffer.duration);
      stopPlayback();
      updateReadyState();

      // Auto-switch to Style tab on mobile after upload so the user can pick a viz
      const isMobile = window.matchMedia('(max-width: 640px)').matches;
      if (isMobile) setActiveTab('style');

    } catch (err) {
      console.error('Audio decode error:', err);
      audioFileName.textContent = '';
      audioInfo.style.display   = 'none';
      audioPlaceholder.style.display = 'flex';
      showError('Could not decode audio. Try MP3 or WAV format.');
    }
  });

  // ── AudioContext graph ─────────────────────────────────────────
  function ensureAudioGraph() {
    if (!audioCtx) return;

    if (!analyserNode) {
      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 2048;
    }
    analyserNode.smoothingTimeConstant = parseInt(smoothingSlider.value) / 100;

    if (!gainNode) {
      gainNode = audioCtx.createGain();
      gainNode.connect(audioCtx.destination);
    }
    gainNode.gain.value = getVolume();

    bufferLength = analyserNode.frequencyBinCount;
    dataArray    = new Uint8Array(bufferLength);
  }

  // ── Volume ─────────────────────────────────────────────────────
  function getVolume() {
    // Use panel slider on mobile (it's the one visible); bar slider on desktop
    const isMobile = window.matchMedia('(max-width: 640px)').matches;
    return (isMobile ? parseInt(volumeSliderPanel.value) : parseInt(volumeSliderBar.value)) / 100;
  }

  function syncVolume(value) {
    volumeSliderBar.value   = value;
    volumeSliderPanel.value = value;
    volumeValue.textContent = value + '%';
    if (gainNode) gainNode.gain.value = value / 100;
  }

  volumeSliderBar.addEventListener('input', () => syncVolume(volumeSliderBar.value));
  volumeSliderPanel.addEventListener('input', () => syncVolume(volumeSliderPanel.value));

  // ── Playback ───────────────────────────────────────────────────
  function startPlayback(offset = 0) {
    if (!audioBuffer || !audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    ensureAudioGraph();

    sourceNode = audioCtx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(analyserNode);
    analyserNode.connect(gainNode);

    startOffset = offset;
    startTime   = audioCtx.currentTime;
    sourceNode.start(0, Math.max(0, offset));
    isPlaying = true;

    sourceNode.onended = () => {
      if (isPlaying) stopPlayback(true);
    };

    playIcon.style.display  = 'none';
    pauseIcon.style.display = 'block';
    drawLoop();
  }

  function pausePlayback() {
    if (!isPlaying) return;
    startOffset += audioCtx.currentTime - startTime;
    try { sourceNode.stop(); } catch (_) {}
    sourceNode.disconnect();
    sourceNode  = null;
    isPlaying   = false;
    cancelAnimationFrame(animFrameId);
    playIcon.style.display  = 'block';
    pauseIcon.style.display = 'none';
  }

  function stopPlayback(ended = false) {
    if (sourceNode) {
      try { sourceNode.stop(); } catch (_) {}
      try { sourceNode.disconnect(); } catch (_) {}
      sourceNode = null;
    }
    isPlaying = false;
    cancelAnimationFrame(animFrameId);
    if (ended) {
      startOffset = 0;
      progressFill.style.width   = '0%';
      currentTimeEl.textContent  = '0:00';
    }
    playIcon.style.display  = 'block';
    pauseIcon.style.display = 'none';
    drawIdleFrame();
  }

  playPauseBtn.addEventListener('click', () => {
    if (!audioBuffer) return;
    if (isPlaying) pausePlayback();
    else startPlayback(startOffset);
  });

  // ── Progress bar seeking (mouse + touch) ───────────────────────
  function seekToRatio(ratio) {
    if (!audioBuffer) return;
    ratio = Math.max(0, Math.min(1, ratio));
    const newOffset = ratio * audioBuffer.duration;
    if (isPlaying) {
      pausePlayback();
      startOffset = newOffset;
      startPlayback(newOffset);
    } else {
      startOffset = newOffset;
      progressFill.style.width  = (ratio * 100) + '%';
      currentTimeEl.textContent = formatTime(newOffset);
    }
  }

  function ratioFromEvent(e) {
    const rect = progressBar.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return (clientX - rect.left) / rect.width;
  }

  progressBar.addEventListener('click',      e => seekToRatio(ratioFromEvent(e)));
  progressBar.addEventListener('touchstart', e => { e.preventDefault(); seekToRatio(ratioFromEvent(e)); }, { passive: false });
  progressBar.addEventListener('touchmove',  e => { e.preventDefault(); seekToRatio(ratioFromEvent(e)); }, { passive: false });

  // ── Draw loop ──────────────────────────────────────────────────
  function drawLoop() {
    animFrameId = requestAnimationFrame(drawLoop);
    if (!analyserNode || !audioBuffer) return;

    analyserNode.getByteFrequencyData(dataArray);

    const elapsed  = startOffset + (audioCtx.currentTime - startTime);
    const progress = Math.min(elapsed / audioBuffer.duration, 1);
    progressFill.style.width  = (progress * 100) + '%';
    currentTimeEl.textContent = formatTime(elapsed);

    const vizFn = Visualizers[currentViz];
    if (vizFn) {
      vizFn(ctx, dataArray, bufferLength, canvas, {
        colorScheme: currentColor,
        sensitivity: parseInt(sensitivitySlider.value),
        bgImage,
        bgOpacity: parseInt(bgOpacitySlider.value),
      });
    }
  }

  // ── Viz buttons ────────────────────────────────────────────────
  vizButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      vizButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentViz = btn.dataset.viz;
    });
  });

  // ── Color buttons ──────────────────────────────────────────────
  colorButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      colorButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentColor = btn.dataset.color;
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
    recordBtn.disabled    = !ready;
    fabExport.disabled    = !ready;
    if (ready) canvasOverlay.style.display = 'none';
  }

  // ── FAB taps: navigate to export tab then trigger ──────────────
  fabExport.addEventListener('click', () => {
    // On mobile, switch to export tab so user can see quality options.
    // If already on export tab (or they tap again quickly), just record.
    const isMobile = window.matchMedia('(max-width: 640px)').matches;
    if (isMobile) {
      const exportTab = document.querySelector('.tab-btn[data-tab="export"]');
      const alreadyOnExport = exportTab && exportTab.classList.contains('active');
      if (!alreadyOnExport) {
        setActiveTab('export');
        return; // let user see settings first; they tap FAB again to record
      }
    }
    recordBtn.click();
  });

  // ── Recording / export ─────────────────────────────────────────
  recordBtn.addEventListener('click', async () => {
    if (!audioBuffer) return;
    if (isPlaying) stopPlayback();

    const quality   = videoQualitySelect.value;
    const preferMp4 = videoFormatSelect.value === 'mp4';

    const overlay = createDownloadOverlay();
    document.body.appendChild(overlay);
    recordBtn.disabled = true;
    fabExport.disabled = true;
    recordBtn.classList.add('recording');
    fabExport.classList.add('recording');
    recordStatus.style.display = 'none';

    try {
      const { blob, ext } = await Recorder.record(
        canvas,
        audioBuffer,
        audioCtx,
        (analyser, dArray, bLen) => {
          const vizFn = Visualizers[currentViz];
          if (vizFn) {
            vizFn(ctx, dArray, bLen, canvas, {
              colorScheme: currentColor,
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
            const fill  = overlay.querySelector('.download-progress-fill');
            const timer = overlay.querySelector('.download-timer');
            if (fill)  fill.style.width   = (p * 100).toFixed(1) + '%';
            if (timer) timer.textContent  = (p * 100).toFixed(0) + '%';
          }
        }
      );

      // Remove progress overlay first, then show save options modal
      document.body.removeChild(overlay);
      showSaveModal(blob, `audio-visualizer.${ext}`);

    } catch (err) {
      console.error('Recording error:', err);
      document.body.removeChild(overlay);
      recordStatus.textContent   = 'Export failed: ' + (err.message || err);
      recordStatus.style.display = 'block';
    } finally {
      recordBtn.disabled = false;
      fabExport.disabled = !audioBuffer;
      recordBtn.classList.remove('recording');
      fabExport.classList.remove('recording');
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
        <p>Please keep this tab open.<br>The full track is being rendered in real time.</p>
        <div class="download-progress-bar">
          <div class="download-progress-fill"></div>
        </div>
        <div class="download-timer">0%</div>
      </div>`;
    return div;
  }

  // ── Save modal (shown after export) ───────────────────────────
  function showSaveModal(blob, filename) {
    const canShare = Recorder.canShareFiles();
    const ext      = filename.split('.').pop().toUpperCase();

    const modal = document.createElement('div');
    modal.className = 'save-modal-overlay';
    modal.innerHTML = `
      <div class="save-modal">
        <div class="save-modal-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <h3>Video Ready!</h3>
        <p>Your ${ext} visualization is rendered and ready to save.</p>
        <div class="save-modal-actions">
          ${canShare ? `
          <button class="btn btn-camera-roll" id="btnCameraRoll">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            Save to Camera Roll
          </button>` : ''}
          <button class="btn btn-download-file" id="btnDownloadFile">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download File
          </button>
        </div>
        <button class="save-modal-close" id="btnSaveClose">Dismiss</button>
      </div>`;

    document.body.appendChild(modal);

    // Camera roll — must be called from this direct tap gesture
    if (canShare) {
      modal.querySelector('#btnCameraRoll').addEventListener('click', async () => {
        try {
          await Recorder.shareFile(blob, filename);
          // User saved (or shared) — close modal
          document.body.removeChild(modal);
        } catch (err) {
          if (err.name === 'AbortError') return; // user cancelled share sheet — keep modal open
          // Share unexpectedly failed — fall back to download
          Recorder.download(blob, filename);
          document.body.removeChild(modal);
        }
      });
    }

    modal.querySelector('#btnDownloadFile').addEventListener('click', () => {
      Recorder.download(blob, filename);
      document.body.removeChild(modal);
    });

    modal.querySelector('#btnSaveClose').addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    // Tap backdrop to dismiss
    modal.addEventListener('click', e => {
      if (e.target === modal) document.body.removeChild(modal);
    });
  }

  // ── Error toast ────────────────────────────────────────────────
  function showError(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
      background:#c0392b; color:#fff; padding:10px 18px; border-radius:8px;
      font-size:0.82rem; z-index:300; max-width:90vw; text-align:center;
      box-shadow:0 4px 16px rgba(0,0,0,0.4);`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => document.body.removeChild(toast), 4000);
  }

  // ── Helpers ────────────────────────────────────────────────────
  function formatTime(seconds) {
    const s   = Math.max(0, Math.floor(seconds || 0));
    const m   = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem.toString().padStart(2, '0')}`;
  }

})();
