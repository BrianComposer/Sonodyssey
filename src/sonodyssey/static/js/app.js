const statusPill = document.getElementById("statusPill");
const detailTitle = document.getElementById("detailTitle");
const detailSubtitle = document.getElementById("detailSubtitle");
const metricsGrid = document.getElementById("metricsGrid");
const neighborsList = document.getElementById("neighborsList");
const audioPlayer = document.getElementById("audioPlayer");
const refreshButton = document.getElementById("refreshButton");
const constellationCanvas = document.getElementById("constellationCanvas");
const ctx = constellationCanvas.getContext("2d");

let pointIndex = new Map();

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

    pointIndex = new Map(tracks.map((track) => [track.id, track]));
    renderProjection(projection.points);
    statusPill.textContent = `${tracks.length} tracks indexed`;
    if (tracks.length > 0) {
      await selectTrack(tracks[0].id);
    }
  } catch (error) {
    console.error(error);
    statusPill.textContent = "Failed to load";
    detailSubtitle.textContent = "Add WAV files to data/wav and rebuild the index.";
  }
}

function renderProjection(points) {
  const trace = {
    x: points.map((point) => point.x),
    y: points.map((point) => point.y),
    text: points.map((point) => `${point.title}<br>${point.file_name}`),
    customdata: points.map((point) => point.id),
    mode: "markers",
    type: "scattergl",
    marker: {
      size: 16,
      opacity: 0.88,
      line: {
        width: 1.2,
        color: "rgba(255,255,255,0.25)",
      },
      color: points.map((_, index) => index),
      colorscale: "Viridis",
    },
    hovertemplate: "%{text}<extra></extra>",
  };

  const layout = {
    margin: { l: 30, r: 10, b: 30, t: 10 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    xaxis: {
      title: "Projection X",
      gridcolor: "rgba(255,255,255,0.08)",
      zerolinecolor: "rgba(255,255,255,0.12)",
      color: "#d9e2ff",
    },
    yaxis: {
      title: "Projection Y",
      gridcolor: "rgba(255,255,255,0.08)",
      zerolinecolor: "rgba(255,255,255,0.12)",
      color: "#d9e2ff",
    },
    hoverlabel: {
      bgcolor: "#10172d",
      bordercolor: "rgba(255,255,255,0.15)",
      font: { color: "#eef2ff" },
    },
  };

  Plotly.newPlot("projectionChart", [trace], layout, { responsive: true, displayModeBar: false });
  const chart = document.getElementById("projectionChart");
  chart.on("plotly_click", async (event) => {
    const trackId = event.points?.[0]?.customdata;
    if (trackId) {
      await selectTrack(trackId);
    }
  });
}

async function selectTrack(trackId) {
  const track = await fetchJson(`/api/tracks/${trackId}`);
  detailTitle.textContent = track.title;
  detailSubtitle.textContent = `${track.file_name} · ${track.duration_seconds.toFixed(2)}s · ${track.sample_rate} Hz`;
  audioPlayer.src = `/api/audio/${encodeURIComponent(track.file_name)}`;
  renderMetrics(track.metrics);
  renderNeighbors(track.nearest_neighbors);
  renderConstellation(track.peaks_preview);
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
    const card = document.createElement("div");
    card.className = "metric-card";
    card.innerHTML = `
      <span class="metric-label">${formatKey(key)}</span>
      <span class="metric-value">${Number(value).toFixed(3)}</span>
    `;
    metricsGrid.appendChild(card);
  }
}

function renderNeighbors(neighbors) {
  neighborsList.innerHTML = "";
  if (!neighbors.length) {
    neighborsList.className = "neighbors-list empty-state";
    neighborsList.textContent = "No neighbors found.";
    return;
  }

  neighborsList.className = "neighbors-list";
  for (const neighbor of neighbors) {
    const card = document.createElement("button");
    card.className = "neighbor-card";
    card.type = "button";
    card.innerHTML = `
      <div>
        <div class="neighbor-title">${neighbor.title}</div>
        <div class="neighbor-file">${neighbor.file_name}</div>
      </div>
      <div class="neighbor-distance">d = ${neighbor.distance.toFixed(3)}</div>
    `;
    card.addEventListener("click", () => selectTrack(neighbor.id));
    neighborsList.appendChild(card);
  }
}

function renderConstellation(points) {
  const { width, height } = constellationCanvas;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "rgba(7, 12, 26, 1)";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i += 1) {
    const y = (height / 5) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  if (!points.length) {
    ctx.fillStyle = "rgba(154,164,199,0.9)";
    ctx.font = "16px Inter, sans-serif";
    ctx.fillText("No constellation peaks available.", 20, 30);
    return;
  }

  const maxTime = Math.max(...points.map((point) => point[0]), 1);
  const maxFreq = Math.max(...points.map((point) => point[1]), 1);

  for (const [time, freq] of points) {
    const x = 20 + (time / maxTime) * (width - 40);
    const y = height - 20 - (freq / maxFreq) * (height - 40);
    ctx.beginPath();
    ctx.fillStyle = "rgba(124, 156, 255, 0.82)";
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
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

bootstrap();
