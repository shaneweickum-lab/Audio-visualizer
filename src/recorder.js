/**
 * recorder.js
 * Captures the canvas + audio and produces a downloadable video file.
 * Uses MediaRecorder API (WebM/VP8 natively; MP4 attempted via codec hint).
 */

window.Recorder = (function () {

  function getSupportedMimeType(preferMp4) {
    const candidates = preferMp4
      ? [
          'video/mp4;codecs=avc1',
          'video/mp4',
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm',
        ]
      : [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm',
          'video/mp4',
        ];

    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  }

  /**
   * Record the full audio track while rendering the canvas visualizer.
   *
   * @param {HTMLCanvasElement} canvas
   * @param {AudioBuffer} audioBuffer   - decoded audio data
   * @param {AudioContext} audioCtx
   * @param {Function} renderFrame      - renderFrame(analyser, dataArray, bufferLength)
   * @param {Object} opts               - { quality, preferMp4, onProgress }
   * @returns {Promise<{blob, ext}>}
   */
  async function record(canvas, audioBuffer, audioCtx, renderFrame, opts = {}) {
    const { quality = 'medium', preferMp4 = false, onProgress } = opts;

    // Resolution map
    const resMap = { high: [1920, 1080], medium: [1280, 720], low: [854, 480] };
    const [targetW, targetH] = resMap[quality] || resMap.medium;

    // Resize canvas for recording
    const origW = canvas.width;
    const origH = canvas.height;
    canvas.width = targetW;
    canvas.height = targetH;

    // Create offline audio graph to feed the analyser while also capturing audio
    const offlineCtx = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );

    // We need a real-time AudioContext for the MediaRecorder audio track
    const recCtx = new AudioContext({ sampleRate: audioBuffer.sampleRate });
    const source = recCtx.createBufferSource();
    source.buffer = audioBuffer;

    // Analyser for visuals during recording
    const analyser = recCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Destination node that gives us an audio stream for MediaRecorder
    const dest = recCtx.createMediaStreamDestination();
    source.connect(analyser);
    source.connect(dest);
    // do NOT connect to recCtx.destination so we don't hear it doubled

    const mimeType = getSupportedMimeType(preferMp4);
    const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';

    // Combine canvas stream + audio stream
    const canvasStream = canvas.captureStream(30);
    const audioTracks = dest.stream.getAudioTracks();
    audioTracks.forEach(t => canvasStream.addTrack(t));

    const recOptions = { mimeType, videoBitsPerSecond: quality === 'high' ? 8_000_000 : quality === 'medium' ? 4_000_000 : 2_000_000 };
    const mediaRecorder = new MediaRecorder(canvasStream, mimeType ? recOptions : {});

    const chunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    return new Promise((resolve, reject) => {
      const duration = audioBuffer.duration;
      let startTime;
      let animId;

      mediaRecorder.onstop = () => {
        cancelAnimationFrame(animId);
        recCtx.close();
        canvas.width = origW;
        canvas.height = origH;
        const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
        resolve({ blob, ext });
      };

      mediaRecorder.onerror = (e) => {
        cancelAnimationFrame(animId);
        recCtx.close();
        canvas.width = origW;
        canvas.height = origH;
        reject(e.error);
      };

      function loop(ts) {
        if (!startTime) startTime = ts;
        const elapsed = (ts - startTime) / 1000;

        if (elapsed >= duration + 0.1) {
          mediaRecorder.stop();
          source.stop();
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        renderFrame(analyser, dataArray, bufferLength, elapsed);

        if (onProgress) onProgress(Math.min(elapsed / duration, 1));
        animId = requestAnimationFrame(loop);
      }

      mediaRecorder.start(100); // collect data every 100ms
      source.start();
      animId = requestAnimationFrame(loop);
    });
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 1000);
  }

  /** Returns true if the browser supports sharing video files (iOS/Android) */
  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      return navigator.canShare({ files: [new File([''], 'test.mp4', { type: 'video/mp4' })] });
    } catch (_) {
      return false;
    }
  }

  /**
   * Share a file via the native OS share sheet (must be called from a direct user gesture).
   * On iOS this shows "Save Video" → Camera Roll. On Android shows gallery/share options.
   */
  async function shareFile(blob, filename) {
    const file = new File([blob], filename, { type: blob.type });
    await navigator.share({ files: [file], title: 'Audio Visualizer' });
  }

  return { record, download, canShareFiles, shareFile, getSupportedMimeType };
})();
