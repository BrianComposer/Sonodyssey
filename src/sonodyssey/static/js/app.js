const statusPill = document.getElementById("statusPill");
const detailTitle = document.getElementById("detailTitle");
const detailSubtitle = document.getElementById("detailSubtitle");
const metricsGrid = document.getElementById("metricsGrid");
const audioPlayer = document.getElementById("audioPlayer");
const refreshButton = document.getElementById("refreshButton");
const clearSelectionButton = document.getElementById("clearSelectionButton");
const detailStack = document.getElementById("detailStack");
const emptyHint = document.getElementById("emptyHint");
const metricsPanel = document.getElementById("metricsPanel");
const constellationPanel = document.getElementById("constellationPanel");
const constellationCanvas = document.getElementById("constellationCanvas");
const ctx = constellationCanvas.getContext("2d");
const projectionChart = document.getElementById("projectionChart");

let pointIndex = new Map();
let orderedPoints = [];
let selectedTrackId = null;
let baseAxisRanges = null;
let currentSelectionState = {
  selectedId: null,
  firstOrderIds: [],
  secondOrderIds: [],
  connectionSegments: [],
};

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json();
}

async function bootstrap() {
  try {
    statusPill.textContent = "Loading index…";
    const [projection, tracks] = await Promise.all([
      fetchJson("/api/projection"),
      fetchJson("/api/tracks"),
    ]);

    orderedPoints = Array.isArray(projection.points) ? projection.points : [];
    pointIndex = new Map(tracks.map((track) => [track.id, track]));
    selectedTrackId = null;
    currentSelectionState = {
      selectedId: null,
      firstOrderIds: [],
      secondOrderIds: [],
      connectionSegments: [],
    };

    renderProjection(orderedPoints);
    resetDetailPanel();
    statusPill.textContent = `${tracks.length} tracks indexed`;
  } catch (error) {
    console.error(error);
    statusPill.textContent = "Failed to load";
    detailTitle.textContent = "Index unavailable";
    detailSubtitle.textContent = "Add WAV files to data/wav and rebuild the index.";
    resetDetailPanel();
  }
}

function renderProjection(points) {
  const bounds = computeExpandedBounds(points);
  baseAxisRanges = bounds;

  const baseTrace = {
    x: points.map((point) => point.x),
    y: points.map((point) => point.y),
    text: points.map((point) => `${point.title}<br>${point.file_name}`),
    customdata: points.map((point) => point.id),
    mode: "markers",
    type: "scattergl",
    marker: {
      size: points.map(() => 6.5),
      opacity: points.map(() => 0.88),
      color: points.map((_, index) => index),
      colorscale: [
        [0, "#66e3ff"],
        [0.45, "#7c9cff"],
        [0.75, "#9e7dff"],
        [1, "#42d392"],
      ],
      line: {
        width: 0.9,
        color: "rgba(255,255,255,0.35)",
      },
    },
    hovertemplate: "%{text}<extra></extra>",
  };

  const glowTrace = {
    x: points.map((point) => point.x),
    y: points.map((point) => point.y),
    customdata: points.map((point) => point.id),
    mode: "markers",
    type: "scattergl",
    hoverinfo: "skip",
    marker: {
      size: points.map(() => 13),
      opacity: points.map(() => 0.12),
      color: points.map((_, index) => index),
      colorscale: [
        [0, "rgba(102,227,255,0.95)"],
        [0.45, "rgba(124,156,255,0.95)"],
        [0.75, "rgba(167,117,255,0.95)"],
        [1, "rgba(66,211,146,0.95)"],
      ],
      line: {
        width: 0,
      },
    },
  };

  const firstOrderLines = buildLineTrace([], "first-order");
  const secondOrderLines = buildLineTrace([], "second-order");
  const firstOrderGlow = buildHighlightTrace([], "first-order-glow");
  const secondOrderGlow = buildHighlightTrace([], "second-order-glow");
  const selectedGlow = buildHighlightTrace([], "selected-glow");
  const selectedCore = buildHighlightTrace([], "selected-core");

  const layout = {
    margin: { l: 8, r: 8, b: 8, t: 8 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    dragmode: "pan",
    showlegend: false,
    hovermode: "closest",
    transition: {
      duration: 260,
      easing: "cubic-in-out",
    },
    xaxis: {
      visible: false,
      showgrid: false,
      zeroline: false,
      showticklabels: false,
      fixedrange: false,
      range: [bounds.xMin, bounds.xMax],
    },
    yaxis: {
      visible: false,
      showgrid: false,
      zeroline: false,
      showticklabels: false,
      fixedrange: false,
      scaleanchor: "x",
      scaleratio: 1,
      range: [bounds.yMin, bounds.yMax],
    },
    hoverlabel: {
      bgcolor: "#0c1430",
      bordercolor: "rgba(255,255,255,0.12)",
      font: { color: "#eef2ff" },
    },
  };

  const config = {
    responsive: true,
    displayModeBar: false,
    scrollZoom: true,
    doubleClick: false,
  };

  Plotly.newPlot(
    projectionChart,
    [firstOrderLines, secondOrderLines, glowTrace, baseTrace, secondOrderGlow, firstOrderGlow, selectedGlow, selectedCore],
    layout,
    config,
  );

  projectionChart.removeAllListeners?.("plotly_click");
  projectionChart.removeAllListeners?.("plotly_doubleclick");
  projectionChart.removeAllListeners?.("plotly_relayout");

  projectionChart.on("plotly_click", async (event) => {
    const trackId = event.points?.find((point) => point.customdata)?.customdata;
    if (!trackId) {
      return;
    }
    if (trackId === selectedTrackId) {
      clearSelection();
      return;
    }
    await selectTrack(trackId);
  });

  projectionChart.on("plotly_doubleclick", () => {
    clearSelection();
    return false;
  });

  applySelectionVisuals();
}

function computeExpandedBounds(points) {
  if (!points.length) {
    return { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };
  }

  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const padX = spanX * 0.14 + 0.04;
  const padY = spanY * 0.14 + 0.04;
  return {
    xMin: minX - padX,
    xMax: maxX + padX,
    yMin: minY - padY,
    yMax: maxY + padY,
  };
}

function buildLineTrace(segments, kind) {
  const isFirstOrder = kind === "first-order";
  return {
    x: segments.flatMap((segment) => [segment.x1, segment.x2, null]),
    y: segments.flatMap((segment) => [segment.y1, segment.y2, null]),
    mode: "lines",
    type: "scattergl",
    hoverinfo: "skip",
    line: {
      width: isFirstOrder ? 1.8 : 1.2,
      color: isFirstOrder ? "rgba(102,227,255,0.78)" : "rgba(167,117,255,0.42)",
      dash: isFirstOrder ? "solid" : "dot",
    },
    opacity: isFirstOrder ? 0.95 : 0.78,
  };
}

function buildHighlightTrace(points, kind) {
  const definitions = {
    "selected-glow": {
      size: 28,
      opacity: 0.34,
      color: "rgba(102,227,255,0.92)",
      lineWidth: 0,
    },
    "selected-core": {
      size: 10,
      opacity: 1,
      color: "rgba(255,255,255,0.98)",
      lineWidth: 1.2,
      lineColor: "rgba(102,227,255,0.95)",
    },
    "first-order-glow": {
      size: 19,
      opacity: 0.24,
      color: "rgba(102,227,255,0.76)",
      lineWidth: 0,
    },
    "second-order-glow": {
      size: 15,
      opacity: 0.14,
      color: "rgba(167,117,255,0.72)",
      lineWidth: 0,
    },
  };

  const definition = definitions[kind];
  return {
    x: points.map((point) => point.x),
    y: points.map((point) => point.y),
    mode: "markers",
    type: "scattergl",
    hoverinfo: "skip",
    marker: {
      size: definition.size,
      opacity: definition.opacity,
      color: definition.color,
      line: {
        width: definition.lineWidth,
        color: definition.lineColor || "rgba(255,255,255,0)",
      },
    },
  };
}

async function selectTrack(trackId) {
  try {
    const track = await fetchJson(`/api/tracks/${trackId}`);
    const selectionState = await buildSelectionState(track);
    selectedTrackId = trackId;
    currentSelectionState = selectionState;

    detailTitle.textContent = track.title;
    detailSubtitle.textContent = `${track.file_name} · ${track.duration_seconds.toFixed(2)}s · ${track.sample_rate} Hz`;

    audioPlayer.src = `/api/audio/${encodeURIComponent(track.file_name)}`;
    audioPlayer.currentTime = 0;
    try {
      await audioPlayer.play();
    } catch (audioError) {
      console.warn("Audio autoplay was blocked by the browser.", audioError);
    }

    renderMetrics(track.metrics || {});
    renderConstellation(track.peaks_preview || []);
    openDetailPanel();
    applySelectionVisuals();
  } catch (error) {
    console.error(error);
    statusPill.textContent = "Selection failed";
  }
}

async function buildSelectionState(track) {
  const selectedPoint = getPointById(track.id);
  const firstOrderIds = uniqueIds((track.nearest_neighbors || []).map((neighbor) => neighbor.id)).slice(0, 4);
  const firstOrderPoints = firstOrderIds.map(getPointById).filter(Boolean);

  const neighborTracks = await Promise.all(
    firstOrderIds.map(async (neighborId) => {
      try {
        return await fetchJson(`/api/tracks/${neighborId}`);
      } catch (error) {
        console.warn(`Failed to load neighbor ${neighborId}`, error);
        return null;
      }
    }),
  );

  const secondOrderIds = uniqueIds(
    neighborTracks
      .filter(Boolean)
      .flatMap((neighborTrack) => (neighborTrack.nearest_neighbors || []).map((neighbor) => neighbor.id))
      .filter((neighborId) => neighborId !== track.id && !firstOrderIds.includes(neighborId)),
  ).slice(0, 12);

  const secondOrderPoints = secondOrderIds.map(getPointById).filter(Boolean);

  const firstOrderSegments = firstOrderPoints.map((point) => createSegment(selectedPoint, point));
  const secondOrderSegments = [];

  for (const neighborTrack of neighborTracks.filter(Boolean)) {
    const sourcePoint = getPointById(neighborTrack.id);
    if (!sourcePoint) {
      continue;
    }
    for (const neighbor of neighborTrack.nearest_neighbors || []) {
      if (!secondOrderIds.includes(neighbor.id)) {
        continue;
      }
      const targetPoint = getPointById(neighbor.id);
      if (!targetPoint) {
        continue;
      }
      secondOrderSegments.push(createSegment(sourcePoint, targetPoint));
    }
  }

  return {
    selectedId: track.id,
    firstOrderIds,
    secondOrderIds,
    connectionSegments: {
      firstOrder: dedupeSegments(firstOrderSegments),
      secondOrder: dedupeSegments(secondOrderSegments),
    },
    points: {
      selected: selectedPoint ? [selectedPoint] : [],
      firstOrder: firstOrderPoints,
      secondOrder: secondOrderPoints,
    },
  };
}

function createSegment(fromPoint, toPoint) {
  return {
    key: [fromPoint.id, toPoint.id].sort().join("::"),
    x1: fromPoint.x,
    y1: fromPoint.y,
    x2: toPoint.x,
    y2: toPoint.y,
  };
}

function dedupeSegments(segments) {
  const unique = new Map();
  for (const segment of segments) {
    unique.set(segment.key, segment);
  }
  return [...unique.values()];
}

function uniqueIds(ids) {
  return [...new Set(ids.filter(Boolean))];
}

function getPointById(trackId) {
  return orderedPoints.find((point) => point.id === trackId) || null;
}

function applySelectionVisuals() {
  if (!projectionChart.data?.length) {
    return;
  }

  const glowTraceIndex = 2;
  const baseTraceIndex = 3;
  const secondOrderGlowIndex = 4;
  const firstOrderGlowIndex = 5;
  const selectedGlowIndex = 6;
  const selectedCoreIndex = 7;

  const firstOrderIds = new Set(currentSelectionState.firstOrderIds || []);
  const secondOrderIds = new Set(currentSelectionState.secondOrderIds || []);
  const selectedId = currentSelectionState.selectedId;

  const baseSizes = [];
  const baseOpacities = [];
  const glowSizes = [];
  const glowOpacities = [];

  for (const point of orderedPoints) {
    if (!selectedId) {
      baseSizes.push(6.5);
      baseOpacities.push(0.88);
      glowSizes.push(13);
      glowOpacities.push(0.12);
      continue;
    }

    if (point.id === selectedId) {
      baseSizes.push(8.2);
      baseOpacities.push(1);
      glowSizes.push(17);
      glowOpacities.push(0.28);
    } else if (firstOrderIds.has(point.id)) {
      baseSizes.push(7.1);
      baseOpacities.push(0.98);
      glowSizes.push(15.5);
      glowOpacities.push(0.22);
    } else if (secondOrderIds.has(point.id)) {
      baseSizes.push(6.3);
      baseOpacities.push(0.62);
      glowSizes.push(13.8);
      glowOpacities.push(0.14);
    } else {
      baseSizes.push(4.5);
      baseOpacities.push(0.12);
      glowSizes.push(9.5);
      glowOpacities.push(0.03);
    }
  }

  const selectedPoints = currentSelectionState.points?.selected || [];
  const firstOrderPoints = currentSelectionState.points?.firstOrder || [];
  const secondOrderPoints = currentSelectionState.points?.secondOrder || [];
  const firstOrderSegments = currentSelectionState.connectionSegments?.firstOrder || [];
  const secondOrderSegments = currentSelectionState.connectionSegments?.secondOrder || [];

  Plotly.restyle(projectionChart, {
    x: [firstOrderSegments.flatMap((segment) => [segment.x1, segment.x2, null])],
    y: [firstOrderSegments.flatMap((segment) => [segment.y1, segment.y2, null])],
  }, [0]);

  Plotly.restyle(projectionChart, {
    x: [secondOrderSegments.flatMap((segment) => [segment.x1, segment.x2, null])],
    y: [secondOrderSegments.flatMap((segment) => [segment.y1, segment.y2, null])],
  }, [1]);

  Plotly.restyle(projectionChart, {
    "marker.size": [glowSizes],
    "marker.opacity": [glowOpacities],
  }, [glowTraceIndex]);

  Plotly.restyle(projectionChart, {
    "marker.size": [baseSizes],
    "marker.opacity": [baseOpacities],
  }, [baseTraceIndex]);

  Plotly.restyle(projectionChart, {
    x: [secondOrderPoints.map((point) => point.x)],
    y: [secondOrderPoints.map((point) => point.y)],
  }, [secondOrderGlowIndex]);

  Plotly.restyle(projectionChart, {
    x: [firstOrderPoints.map((point) => point.x)],
    y: [firstOrderPoints.map((point) => point.y)],
  }, [firstOrderGlowIndex]);

  Plotly.restyle(projectionChart, {
    x: [selectedPoints.map((point) => point.x)],
    y: [selectedPoints.map((point) => point.y)],
  }, [selectedGlowIndex]);

  Plotly.restyle(projectionChart, {
    x: [selectedPoints.map((point) => point.x)],
    y: [selectedPoints.map((point) => point.y)],
  }, [selectedCoreIndex]);
}

function openDetailPanel() {
  detailStack.classList.remove("is-hidden");
  detailStack.setAttribute("aria-hidden", "false");
  emptyHint.style.display = "none";
  metricsPanel.open = true;
  constellationPanel.open = true;
  clearSelectionButton.disabled = false;
}

function resetDetailPanel() {
  detailTitle.textContent = "Exploration standby";
  detailSubtitle.textContent = "Select a star to open its dynamic detail panel, play the audio automatically, and reveal its constellation.";
  metricsGrid.className = "metrics-grid empty-state";
  metricsGrid.textContent = "No track selected yet.";
  detailStack.classList.add("is-hidden");
  detailStack.setAttribute("aria-hidden", "true");
  emptyHint.style.display = "block";
  clearSelectionButton.disabled = true;
  metricsPanel.open = false;
  constellationPanel.open = false;
  audioPlayer.pause();
  audioPlayer.removeAttribute("src");
  audioPlayer.load();
  renderConstellation([]);
}

function clearSelection() {
  selectedTrackId = null;
  currentSelectionState = {
    selectedId: null,
    firstOrderIds: [],
    secondOrderIds: [],
    connectionSegments: {
      firstOrder: [],
      secondOrder: [],
    },
    points: {
      selected: [],
      firstOrder: [],
      secondOrder: [],
    },
  };
  resetDetailPanel();
  applySelectionVisuals();
}

function renderMetrics(metrics) {
  metricsGrid.innerHTML = "";
  const entries = Object.entries(metrics);
  if (entries.length === 0) {
    metricsGrid.className = "metrics-grid empty-state";
    metricsGrid.textContent = "No metrics available.";
    return;
  }

  metricsGrid.className = "metrics-grid";
  for (const [key, value] of entries) {
    const numericValue = typeof value === "number" ? value : Number(value);
    const card = document.createElement("div");
    card.className = "metric-card";
    card.innerHTML = `
      <span class="metric-label">${formatKey(key)}</span>
      <span class="metric-value">${Number.isFinite(numericValue) ? numericValue.toFixed(3) : value}</span>
    `;
    metricsGrid.appendChild(card);
  }
}

function renderConstellation(points) {
  const { width, height } = constellationCanvas;
  ctx.clearRect(0, 0, width, height);

  const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
  backgroundGradient.addColorStop(0, "rgba(3, 8, 20, 1)");
  backgroundGradient.addColorStop(1, "rgba(8, 15, 31, 1)");
  ctx.fillStyle = backgroundGradient;
  ctx.fillRect(0, 0, width, height);

  const halo = ctx.createRadialGradient(width * 0.5, height * 0.5, 8, width * 0.5, height * 0.5, width * 0.55);
  halo.addColorStop(0, "rgba(102, 227, 255, 0.08)");
  halo.addColorStop(0.5, "rgba(124, 156, 255, 0.06)");
  halo.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 48; i += 1) {
    const x = (i * 97) % width;
    const y = (i * 37) % height;
    const radius = i % 5 === 0 ? 1.2 : 0.7;
    ctx.beginPath();
    ctx.fillStyle = i % 3 === 0 ? "rgba(102, 227, 255, 0.18)" : "rgba(255, 255, 255, 0.12)";
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!points.length) {
    ctx.fillStyle = "rgba(154,164,199,0.88)";
    ctx.font = "16px Inter, sans-serif";
    ctx.fillText("No constellation peaks available.", 20, 32);
    return;
  }

  const maxTime = Math.max(...points.map((point) => point[0]), 1);
  const maxFreq = Math.max(...points.map((point) => point[1]), 1);

  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i += 1) {
    const y = (height / 5) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  for (const [time, freq] of points) {
    const x = 20 + (time / maxTime) * (width - 40);
    const y = height - 20 - (freq / maxFreq) * (height - 40);

    ctx.beginPath();
    ctx.fillStyle = "rgba(102, 227, 255, 0.12)";
    ctx.arc(x, y, 6.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = "rgba(124, 156, 255, 0.82)";
    ctx.arc(x, y, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function formatKey(key) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

refreshButton.addEventListener("click", async () => {
  try {
    refreshButton.disabled = true;
    refreshButton.textContent = "Rebuilding…";
    const result = await fetchJson("/api/rebuild", { method: "POST" });
    statusPill.textContent = `${result.indexed_tracks} tracks indexed`;
    await bootstrap();
  } catch (error) {
    console.error(error);
    statusPill.textContent = "Rebuild failed";
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Rebuild Index";
  }
});

clearSelectionButton.addEventListener("click", () => {
  clearSelection();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && selectedTrackId) {
    clearSelection();
  }
});

bootstrap();