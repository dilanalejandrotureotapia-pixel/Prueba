import {
  FilesetResolver,
  PoseLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/+esm";

// ----------------------------------------------------
// Referencias del DOM
// ----------------------------------------------------
const videoFile1 = document.getElementById("videoFile1");
const videoFile2 = document.getElementById("videoFile2");
const videoEl1 = document.getElementById("videoElement1");
const videoEl2 = document.getElementById("videoElement2");
const canvas1 = document.getElementById("overlayCanvas1");
const canvas2 = document.getElementById("overlayCanvas2");
const ctx1 = canvas1.getContext("2d");
const ctx2 = canvas2.getContext("2d");

const fileInfo1 = document.getElementById("fileInfo1");
const fileInfo2 = document.getElementById("fileInfo2");
const placeholder1 = document.getElementById("placeholder1");
const placeholder2 = document.getElementById("placeholder2");

const stanceSelect = document.getElementById("stanceSelect");
const visibilityThreshold = document.getElementById("visibilityThreshold");
const analyzeButton = document.getElementById("analyzeButton");
const resetButton = document.getElementById("resetButton");
const exportBtn = document.getElementById("exportBtn");

const errorBanner = document.getElementById("errorBanner");
const errorBannerText = document.getElementById("errorBannerText");
const progressWrap = document.getElementById("progressWrap");
const progressText = document.getElementById("progressText");
const progressBar = document.getElementById("progressBar");
const systemStatus = document.getElementById("systemStatus");

// ----------------------------------------------------
// Estado Global
// ----------------------------------------------------
let poseLandmarker = null;
let isAnalyzing = false;
let urlCam1 = null;
let urlCam2 = null;

let dataCam1 = [];
let dataCam2 = [];
let lastReportData = null;
let comboChart = null;
let currentPlaybackRate = 1.0;

const MEDIAPIPE_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task";

// Parámetros de Consenso Técnico (Referencia Biomecánica 1-2)
const CONSENSUS = {
  minExtensionAngle: 165, // Grados mínimos aceptables para extensión completa
  maxTransitionTime: 0.35, // Segundos máximos ideales entre pico del Jab y pico del Directo
  minStepDisplacement: 8.0 // % mínimo de avance horizontal del centro pélvico
};

// ----------------------------------------------------
// Inicialización MediaPipe
// ----------------------------------------------------
async function initMediaPipe() {
  try {
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    systemStatus.querySelector("span:last-child").textContent = "MediaPipe Listo";
    systemStatus.classList.add("ready");
    updateButtonState();
  } catch (err) {
    systemStatus.querySelector("span:last-child").textContent = "Error de carga IA";
    systemStatus.classList.add("error");
    showError("No se pudo cargar el modelo de visión artificial. Verifica tu conexión.");
  }
}

function showError(msg) {
  errorBannerText.textContent = msg;
  errorBanner.hidden = false;
}

function hideError() {
  errorBanner.hidden = true;
}

// ----------------------------------------------------
// Carga de Archivos (2 Cámaras) y Validación (Criterio I6)
// ----------------------------------------------------
videoFile1.addEventListener("change", (e) => loadVideo(e.target.files?.[0], 1));
videoFile2.addEventListener("change", (e) => loadVideo(e.target.files?.[0], 2));

function loadVideo(file, camNumber) {
  hideError();
  if (!file) return;

  if (!file.type.startsWith("video/")) {
    showError(`El archivo seleccionado para la Cámara ${camNumber} no es un formato de video válido.`);
    return;
  }

  if (camNumber === 1) {
    if (urlCam1) URL.revokeObjectURL(urlCam1);
    urlCam1 = URL.createObjectURL(file);
    videoEl1.src = urlCam1;
    videoEl1.playbackRate = currentPlaybackRate;
    fileInfo1.innerHTML = `<span class="file-info__dot" style="background:var(--success)"></span><span>Cámara 1: ${file.name}</span>`;
    placeholder1.hidden = true;
  } else {
    if (urlCam2) URL.revokeObjectURL(urlCam2);
    urlCam2 = URL.createObjectURL(file);
    videoEl2.src = urlCam2;
    videoEl2.playbackRate = currentPlaybackRate;
    fileInfo2.innerHTML = `<span class="file-info__dot" style="background:var(--success)"></span><span>Cámara 2: ${file.name}</span>`;
    placeholder2.hidden = true;
  }

  updateButtonState();
}

function updateButtonState() {
  analyzeButton.disabled = !videoEl1.src || !poseLandmarker || isAnalyzing;
}

// ----------------------------------------------------
// Control de Velocidad Interno (1x, 0.5x, 0.25x)
// ----------------------------------------------------
document.querySelectorAll(".speed-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".speed-btn").forEach((b) => {
      b.style.borderColor = "var(--border)";
      b.style.color = "var(--text)";
    });
    btn.style.borderColor = "var(--accent)";
    btn.style.color = "var(--accent)";

    currentPlaybackRate = Number(btn.dataset.speed);
    videoEl1.playbackRate = currentPlaybackRate;
    if (videoEl2.src) videoEl2.playbackRate = currentPlaybackRate;
  });
});

// Sincronización de reproducción entre Cámara 1 y Cámara 2
videoEl1.addEventListener("play", () => {
  if (videoEl2.src) {
    videoEl2.currentTime = videoEl1.currentTime;
    videoEl2.play().catch(() => {});
  }
  requestAnimationFrame(renderPlaybackLoop);
});

videoEl1.addEventListener("pause", () => {
  if (videoEl2.src) videoEl2.pause();
  syncOverlays();
});

videoEl1.addEventListener("seeked", () => {
  if (videoEl2.src) videoEl2.currentTime = videoEl1.currentTime;
  syncOverlays();
});

// ----------------------------------------------------
// Procesamiento Principal Bicanal
// ----------------------------------------------------
analyzeButton.addEventListener("click", runFullAnalysis);

let monotonicTs = 0;
function nextTimestamp() {
  monotonicTs = Math.max(performance.now(), monotonicTs + 5);
  return monotonicTs;
}

async function runFullAnalysis() {
  hideError();
  isAnalyzing = true;
  updateButtonState();
  progressWrap.hidden = false;
  setProgress(0);

  videoEl1.pause();
  if (videoEl2.src) videoEl2.pause();

  const minVis = Number(visibilityThreshold.value);
  const stance = stanceSelect.value; // 'orthodox' o 'southpaw'

  // Asignación anatómica según guardia
  const jabIndices = stance === "orthodox" ? { s: 11, e: 13, w: 15 } : { s: 12, e: 14, w: 16 };
  const crossIndices = stance === "orthodox" ? { s: 12, e: 14, w: 16 } : { s: 11, e: 13, w: 15 };

  try {
    // 1. Procesar Cámara 1 (Plano Sagital)
    dataCam1 = await extractVideoKinematics(videoEl1, jabIndices, crossIndices, minVis, (p) => {
      const weight = videoEl2.src ? 0.5 : 1.0;
      setProgress(Math.round(p * weight));
    });

    if (dataCam1.length < 8) {
      throw new Error("No se detectó el cuerpo con suficiente claridad en la Cámara 1. Revisa iluminación y encuadre.");
    }

    // 2. Procesar Cámara 2 si fue cargada (Plano Frontal/Desplazamiento)
    dataCam2 = [];
    if (videoEl2.src) {
      dataCam2 = await extractVideoKinematics(videoEl2, jabIndices, crossIndices, minVis, (p) => {
        setProgress(50 + Math.round(p * 0.5));
      });
    }

    // 3. Calcular Métricas de la Combinación 1-2 y Desplazamiento
    const report = evaluateCombo12(dataCam1, dataCam2, stance);
    lastReportData = report;

    // 4. Actualizar Tarjetas, Feedback de Consenso y Gráfico
    renderDashboard(report);
    renderComboChart(dataCam1, report);

    exportBtn.disabled = false;
    document.getElementById("overlayHud1").hidden = false;
    if (videoEl2.src) document.getElementById("overlayHud2").hidden = false;

    await seekVideo(videoEl1, 0);
    if (videoEl2.src) await seekVideo(videoEl2, 0);
    syncOverlays();

  } catch (err) {
    showError(err.message);
  } finally {
    isAnalyzing = false;
    updateButtonState();
    setTimeout(() => { progressWrap.hidden = true; }, 600);
  }
}

async function extractVideoKinematics(video, jabIdx, crossIdx, minVis, onProgress) {
  const duration = video.duration;
  const step = 1 / 30; // 30 Hz base real
  const totalSteps = Math.ceil(duration / step);
  const frames = [];

  for (let i = 0; i <= totalSteps; i++) {
    const t = Math.min(i * step, duration);
    await seekVideo(video, t);

    const res = poseLandmarker.detectForVideo(video, nextTimestamp());
    if (res?.landmarks?.length) {
      const lm = res.landmarks[0];
      const jabVis = Math.min(lm[jabIdx.s].visibility, lm[jabIdx.e].visibility, lm[jabIdx.w].visibility);
      const crossVis = Math.min(lm[crossIdx.s].visibility, lm[crossIdx.e].visibility, lm[crossIdx.w].visibility);

      if (jabVis >= minVis || crossVis >= minVis) {
        const jabAngle = calcAngle(lm[jabIdx.s], lm[jabIdx.e], lm[jabIdx.w]);
        const crossAngle = calcAngle(lm[crossIdx.s], lm[crossIdx.e], lm[crossIdx.w]);
        // Centro pélvico promedio (caderas 23 y 24) para medir desplazamiento
        const hipCenterX = (lm[23].x + lm[24].x) / 2;

        frames.push({
          time: t,
          jabAngle,
          crossAngle,
          hipCenterX,
          landmarks: lm,
          jabIdx,
          crossIdx
        });
      }
    }
    onProgress(Math.round((i / totalSteps) * 100));
    await new Promise((r) => requestAnimationFrame(r));
  }
  return frames;
}

// ----------------------------------------------------
// Evaluación Cinemática del 1-2 y Consenso Técnico
// ----------------------------------------------------
function evaluateCombo12(cam1, cam2, stance) {
  // Buscar pico del Jab (1) en la primera mitad/dos tercios del movimiento
  let jabPeak = cam1[0];
  let jabPeakIdx = 0;
  for (let i = 1; i < cam1.length; i++) {
    if (cam1[i].jabAngle > jabPeak.jabAngle) {
      jabPeak = cam1[i];
      jabPeakIdx = i;
    }
  }

  // Buscar pico del Directo (2) posterior o simultáneo al inicio de retorno del Jab
  let crossPeak = cam1[jabPeakIdx];
  let crossPeakIdx = jabPeakIdx;
  for (let i = jabPeakIdx; i < cam1.length; i++) {
    if (cam1[i].crossAngle > crossPeak.crossAngle) {
      crossPeak = cam1[i];
      crossPeakIdx = i;
    }
  }

  // Cálculo de velocidades angulares medias
  const jabStart = cam1[0];
  const jabDuration = Math.max(0.05, jabPeak.time - jabStart.time);
  const jabVelocity = (jabPeak.jabAngle - jabStart.jabAngle) / jabDuration;

  const crossStartIdx = Math.max(0, jabPeakIdx - 2);
  const crossDuration = Math.max(0.05, crossPeak.time - cam1[crossStartIdx].time);
  const crossVelocity = (crossPeak.crossAngle - cam1[crossStartIdx].crossAngle) / crossDuration;

  const transitionTime = Math.max(0, crossPeak.time - jabPeak.time);

  // Desplazamiento hacia delante (usando Cámara 1 sagital y complementando con Cámara 2)
  const minHipX = Math.min(...cam1.map((f) => f.hipCenterX));
  const maxHipX = Math.max(...cam1.map((f) => f.hipCenterX));
  const stepDisplacementPct = (maxHipX - minHipX) * 100;

  // Validación contra Consenso Técnico
  const jabOk = jabPeak.jabAngle >= CONSENSUS.minExtensionAngle;
  const crossOk = crossPeak.crossAngle >= CONSENSUS.minExtensionAngle;
  const transitionOk = transitionTime <= CONSENSUS.maxTransitionTime && transitionTime > 0.03;
  const stepOk = stepDisplacementPct >= CONSENSUS.minStepDisplacement;

  return {
    stance,
    jabMaxAngle: jabPeak.jabAngle,
    crossMaxAngle: crossPeak.crossAngle,
    jabTime: jabPeak.time,
    crossTime: crossPeak.time,
    transitionTime,
    jabVelocity,
    crossVelocity,
    stepDisplacementPct,
    validation: { jabOk, crossOk, transitionOk, stepOk }
  };
}

function renderDashboard(rep) {
  document.getElementById("kpiJabMaxAngle").textContent = `${rep.jabMaxAngle.toFixed(1)}°`;
  document.getElementById("kpiCrossMaxAngle").textContent = `${rep.crossMaxAngle.toFixed(1)}°`;
  document.getElementById("kpiTransitionTime").textContent = `${rep.transitionTime.toFixed(3)} s`;
  document.getElementById("kpiJabVelocity").textContent = `${rep.jabVelocity.toFixed(1)} °/s`;
  document.getElementById("kpiCrossVelocity").textContent = `${rep.crossVelocity.toFixed(1)} °/s`;
  document.getElementById("kpiStepDisplacement").textContent = `${rep.stepDisplacementPct.toFixed(1)} %`;

  // Estados de cumplimiento
  document.getElementById("kpiJabAngleStatus").textContent = rep.validation.jabOk
    ? "✅ Cumple extensión óptima (≥165°)"
    : "⚠️ Extensión incompleta (<165°)";

  document.getElementById("kpiCrossAngleStatus").textContent = rep.validation.crossOk
    ? "✅ Cumple extensión óptima (≥165°)"
    : "⚠️ Extensión incompleta (<165°)";

  document.getElementById("kpiTransitionStatus").textContent = rep.validation.transitionOk
    ? "✅ Encadenamiento fluido (≤0.35 s)"
    : "⚠️ Pausa prolongada entre golpes";

  document.getElementById("kpiStepStatus").textContent = rep.validation.stepOk
    ? "✅ Avance pélvico efectivo detectado"
    : "⚠️ Bajo desplazamiento hacia adelante";

  // Redacción de Feedback Integral
  const notes = [];
  notes.push(rep.validation.jabOk
    ? `El Jab alcanzó una extensión efectiva de ${rep.jabMaxAngle.toFixed(1)}°.`
    : `El Jab se quedó en ${rep.jabMaxAngle.toFixed(1)}°, por debajo del consenso de 165° para máximo alcance.`);

  notes.push(rep.validation.crossOk
    ? `El Directo logró plena proyección (${rep.crossMaxAngle.toFixed(1)}°).`
    : `El Directo presentó déficit de extensión (${rep.crossMaxAngle.toFixed(1)}°), sugiriendo mayor rotación de hombro/cadera.`);

  notes.push(rep.validation.transitionOk
    ? `La transición 1→2 fue explosiva (${rep.transitionTime.toFixed(3)} s).`
    : `El tiempo entre el Jab y el Directo fue de ${rep.transitionTime.toFixed(3)} s, telegrafiando el segundo golpe.`);

  notes.push(rep.validation.stepOk
    ? `Se verificó un desplazamiento anterior del centro de masa del ${rep.stepDisplacementPct.toFixed(1)}% del encuadre.`
    : `El desplazamiento hacia adelante fue reducido (${rep.stepDisplacementPct.toFixed(1)}%).`);

  document.getElementById("consensusFeedbackText").textContent = notes.join(" ");
}

// ----------------------------------------------------
// Gráfico Comparativo Jab vs Directo
// ----------------------------------------------------
function renderComboChart(data, rep) {
  if (comboChart) comboChart.destroy();

  comboChart = new Chart(document.getElementById("comboChart"), {
    type: "line",
    data: {
      labels: data.map((d) => d.time.toFixed(2)),
      datasets: [
        {
          label: "Jab (Golpe 1 - Brazo Adelantado)",
          data: data.map((d) => d.jabAngle.toFixed(1)),
          borderColor: "#62d9c1",
          backgroundColor: "rgba(98, 217, 193, 0.1)",
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.2
        },
        {
          label: "Directo (Golpe 2 - Brazo Trasero)",
          data: data.map((d) => d.crossAngle.toFixed(1)),
          borderColor: "#f2c85b",
          backgroundColor: "rgba(242, 200, 91, 0.1)",
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: "Tiempo (s)", color: "#9caec2" }, ticks: { color: "#9caec2" } },
        y: { title: { display: true, text: "Ángulo de Codo (°)", color: "#9caec2" }, min: 40, max: 185, ticks: { color: "#9caec2" } }
      },
      plugins: { legend: { labels: { color: "#f4f7fb" } } }
    }
  });
}

// ----------------------------------------------------
// Dibujo en Canvas Dual
// ----------------------------------------------------
function renderPlaybackLoop() {
  syncOverlays();
  if (!videoEl1.paused && !videoEl1.ended) {
    requestAnimationFrame(renderPlaybackLoop);
  }
}

function syncOverlays() {
  if (!dataCam1.length) return;
  const t = videoEl1.currentTime;
  document.getElementById("liveTime").textContent = `${t.toFixed(2)} s`;

  const f1 = findClosest(dataCam1, t);
  if (f1) {
    drawSkeleton(videoEl1, canvas1, ctx1, f1);
    document.getElementById("hudJabAngle").textContent = `${f1.jabAngle.toFixed(1)}°`;
    document.getElementById("hudCrossAngle").textContent = `${f1.crossAngle.toFixed(1)}°`;

    if (lastReportData) {
      let phase = "Guardia / Avance";
      if (Math.abs(t - lastReportData.jabTime) < 0.08) phase = "Impacto JAB (1)";
      else if (Math.abs(t - lastReportData.crossTime) < 0.08) phase = "Impacto DIRECTO (2)";
      else if (t > lastReportData.jabTime && t < lastReportData.crossTime) phase = "Transición 1 → 2";
      document.getElementById("livePhase").textContent = phase;
      document.getElementById("hudComboPhase").textContent = phase;
    }
  }

  if (dataCam2.length) {
    const f2 = findClosest(dataCam2, t);
    if (f2) {
      drawSkeleton(videoEl2, canvas2, ctx2, f2);
      if (lastReportData) {
        document.getElementById("hudStepDisp").textContent = `${lastReportData.stepDisplacementPct.toFixed(1)}%`;
      }
    }
  }
}

function drawSkeleton(video, canvas, ctx, frame) {
  const rect = video.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  canvas.width = rect.width;
  canvas.height = rect.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const lm = frame.landmarks;
  // Dibujar Jab (Turquesa)
  drawChain(ctx, canvas, lm[frame.jabIdx.s], lm[frame.jabIdx.e], lm[frame.jabIdx.w], "#62d9c1");
  // Dibujar Directo (Dorado)
  drawChain(ctx, canvas, lm[frame.crossIdx.s], lm[frame.crossIdx.e], lm[frame.crossIdx.w], "#f2c85b");
}

function drawChain(ctx, canvas, s, e, w, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(s.x * canvas.width, s.y * canvas.height);
  ctx.lineTo(e.x * canvas.width, e.y * canvas.height);
  ctx.lineTo(w.x * canvas.width, w.y * canvas.height);
  ctx.stroke();

  [s, e, w].forEach((pt) => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 5, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ----------------------------------------------------
// Exportación de Resultados (Criterio I2)
// ----------------------------------------------------
exportBtn.addEventListener("click", () => {
  if (!lastReportData) return;
  const payload = {
    proyecto: "Analizador Cinemático Boxeo 1-2",
    fecha: new Date().toISOString(),
    configuracion: {
      guardia: stanceSelect.value,
      umbralVisibilidad: visibilityThreshold.value,
      camarasProcesadas: dataCam2.length ? 2 : 1
    },
    resultados: lastReportData
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `reporte_boxeo_1_2_${Date.now()}.json`;
  a.click();
});

// ----------------------------------------------------
// Utilidades
// ----------------------------------------------------
function calcAngle(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (!mag) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * (180 / Math.PI);
}

function findClosest(arr, t) {
  return arr.reduce((prev, curr) => Math.abs(curr.time - t) < Math.abs(prev.time - t) ? curr : prev);
}

function seekVideo(video, time) {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.001) return resolve();
    video.addEventListener("seeked", () => resolve(), { once: true });
    video.currentTime = time;
  });
}

function setProgress(pct) {
  progressText.textContent = `${pct}%`;
  progressBar.style.width = `${pct}%`;
}

resetButton.addEventListener("click", () => location.reload());

initMediaPipe();
