// ── State ─
let currentFarm = FARMS[0];
let currentAgg = '15m';
const PLOTLY_CFG = { responsive: true, displayModeBar: 'hover', displaylogo: false };

const LAYOUT_BASE = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { family: 'Inter, sans-serif', color: '#8b949e', size: 12 },
  margin: { t: 10, r: 20, b: 40, l: 60 },
  xaxis: { gridcolor: '#21262d', showgrid: true, zeroline: false, tickfont: { size: 11 }, linecolor: '#30363d' },
  yaxis: { gridcolor: '#21262d', showgrid: true, zeroline: false, tickfont: { size: 11 }, linecolor: '#30363d', ticksuffix: ' MW' },
  hoverlabel: { bgcolor: '#161b22', bordercolor: '#30363d', font: { family: 'Inter', color: '#e6edf3' } },
};

// ── Leaflet mini-map (OSM + Esri satellite, no API key needed) ──────────
let leafletMap = null;
let leafletFarm = null;
let leafletMarkers = {};
let activeTile = 'street';
let pendingFarm = null;  // farm to highlight once map is ready

const TILE_DEFS = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: 'Tiles &copy; Esri',
    maxZoom: 17,
  },
};

let tileLayers = {};

function initLeafletMap() {
  if (leafletMap) return true;
  if (typeof L === 'undefined') return false;

  try {
    const el = document.getElementById('miniMapLeaflet');
    if (!el) return false;
    // Ensure the container has explicit pixel dimensions Leaflet can see
    el.style.width = '100%';
    el.style.height = '480px';
    el.style.display = 'block';

    leafletMap = L.map(el, {
      center: [40.0, -3.5], zoom: 6,
      zoomControl: true, attributionControl: true,
      preferCanvas: true,
    });

    // Add tile layers
    Object.entries(TILE_DEFS).forEach(([k, d]) => {
      tileLayers[k] = L.tileLayer(d.url, { attribution: d.attr, maxZoom: d.maxZoom });
    });
    tileLayers.street.addTo(leafletMap);
    L.control.scale({ imperial: false }).addTo(leafletMap);

    // Farm markers
    ALL_NAMES.forEach((f, i) => {
      leafletMarkers[f] = L.circleMarker([ALL_LATS[i], ALL_LONS[i]], {
        radius: 5, fillColor: '#6b7280', color: '#ffffff',
        weight: 0.8, fillOpacity: 0.7, opacity: 0.5,
      }).addTo(leafletMap).bindTooltip(f, { permanent: false, direction: 'top', offset: [0, -6] });
    });

    // Critical: force Leaflet to recalculate container size
    setTimeout(() => {
      leafletMap.invalidateSize();
      // Highlight whatever farm was selected while map was initializing
      if (pendingFarm) { applyFarmHighlight(pendingFarm); pendingFarm = null; }
    }, 50);

    return true;
  } catch (e) {
    console.error('Leaflet init error:', e);
    leafletMap = null;
    return false;
  }
}

function applyFarmHighlight(farm) {
  if (!leafletMap) return;
  const m = META[farm] || {};

  // Reset previous
  if (leafletFarm && leafletMarkers[leafletFarm]) {
    leafletMarkers[leafletFarm].setStyle({
      radius: 5, fillColor: '#6b7280', color: '#ffffff',
      weight: 0.8, fillOpacity: 0.7, opacity: 0.5,
    });
  }

  // Highlight selected
  if (leafletMarkers[farm]) {
    leafletMarkers[farm].setStyle({
      radius: 11, fillColor: '#f7aa17', color: '#ffffff',
      weight: 2.5, fillOpacity: 1, opacity: 1,
    }).bringToFront();
  }

  leafletFarm = farm;

  if (m.lat != null && m.lon != null) {
    leafletMap.flyTo([m.lat, m.lon], 13, { duration: 1.0, easeLinearity: 0.4 });
  } else {
    leafletMap.setView([40.0, -3.5], 6);
  }
}

function drawMiniMap(farm) {
  try {
    if (!initLeafletMap()) {
      // Map not ready — remember farm and retry in 500 ms
      pendingFarm = farm;
      setTimeout(() => { if (!leafletMap && initLeafletMap()) applyFarmHighlight(pendingFarm); }, 500);
      return;
    }
    applyFarmHighlight(farm);
  } catch (e) {
    console.warn('drawMiniMap error:', e);
  }
}

function switchTile(type) {
  if (!leafletMap || type === activeTile) return;
  tileLayers[activeTile].remove();
  tileLayers[type].addTo(leafletMap);
  activeTile = type;
  document.querySelectorAll('.tile-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tile-' + type).classList.add('active');
}

// ── Metadata panel update ──────────────────────────────────────────────────
function updateMeta(farm) {
  const m = META[farm] || {};
  const s = STATS[farm] || {};

  document.getElementById('metaName').textContent = farm;
  document.getElementById('metaProvince').textContent = m.province || '—';

  // Technology badge
  const badge = document.getElementById('metaTechBadge');
  badge.textContent = m.technology || '—';
  badge.className = 'meta-tech-badge';
  if ((m.technology || '').includes('tracker')) {
    badge.innerHTML = '🔄 ' + m.technology;
    badge.classList.add('tech-tracker');
  } else if ((m.technology || '').includes('Fixed')) {
    badge.innerHTML = '⬜ ' + m.technology;
    badge.classList.add('tech-fixed');
  } else {
    badge.classList.add('tech-unknown');
  }

  document.getElementById('metaMwp').textContent = m.mwp != null ? m.mwp.toFixed(1) : '—';
  document.getElementById('metaMwGrid').textContent = m.mw_grid != null ? m.mw_grid.toFixed(1) : '—';
  document.getElementById('metaArea').textContent = m.area_ha != null ? Math.round(m.area_ha) : '—';
  document.getElementById('metaObsPeak').textContent = s.peak != null ? s.peak.toFixed(1) : '—';

  const fg = document.getElementById('metaFirstGen');
  if (m.first_gen) {
    const d = new Date(m.first_gen);
    fg.textContent = d.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  } else {
    fg.textContent = 'No data in dataset';
  }

  const coords = document.getElementById('metaCoords');
  coords.textContent = (m.lat != null && m.lon != null)
    ? m.lat.toFixed(4) + '° N,  ' + m.lon.toFixed(4) + '° E'
    : '—';

  // Notes
  const notesEl = document.getElementById('metaNotes');
  if (m.notes && m.notes.length > 10) {
    notesEl.textContent = m.notes;
    notesEl.style.display = '';
  } else {
    notesEl.style.display = 'none';
  }

  // EIC / ESIOS code badges
  const codesEl = document.getElementById('metaCodes');
  if (codesEl) {
    codesEl.innerHTML = '';
    const _lbl = (txt) => `<span style="opacity:0.55;font-size:9px;font-family:'Inter',sans-serif;margin-right:3px;font-weight:700;letter-spacing:0.5px;">${txt}</span>`;
    if (m.eic_code) codesEl.innerHTML += `<span class="code-badge eic-badge"   title="ENTSO-E EIC Resource Code">${_lbl('EIC:')}<span>${m.eic_code}</span></span>`;
    if (m.display_name) codesEl.innerHTML += `<span class="code-badge esios-badge" title="ESIOS unit short name">${_lbl('ESIOS:')}<span>${m.display_name}</span></span>`;
    if (m.unit_name_gu && m.unit_name_gu !== m.display_name) codesEl.innerHTML += `<span class="code-badge pu-badge" title="ESIOS unit full name">${_lbl('Unit:')}<span>${m.unit_name_gu}</span></span>`;
  }

  // DC/AC ratio
  document.getElementById('metaDcAc').textContent = m.dc_ac_ratio != null ? m.dc_ac_ratio.toFixed(2) + '×' : '—';

  // Clipping / curtailment proxy
  const clipEl = document.getElementById('metaClip');
  if (clipEl) {
    if (m.clipping_pct != null) {
      clipEl.textContent = m.clipping_pct.toFixed(1) + '%';
      const hrs = m.clipping_hrs != null ? ` (~${m.clipping_hrs.toLocaleString()} h total)` : '';
      clipEl.title = 'Intervals at/above 92% of grid capacity' + hrs;
      clipEl.style.color = m.clipping_pct > 20 ? '#f7aa17' : m.clipping_pct > 8 ? '#38bdf8' : '#8b949e';
    } else { clipEl.textContent = '—'; clipEl.style.color = ''; }
  }

  document.getElementById('metaMapBadge') && (document.getElementById('metaMapBadge').textContent = '📍 ' + (m.province || 'Spain'));

  drawMiniMap(farm);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function getDateRange() {
  return {
    from: document.getElementById('dateFrom').value,
    to: document.getElementById('dateTo').value
  };
}

function filterData(farm) {
  const r = getDateRange();
  const ts = DATA[farm].timestamps, vs = DATA[farm].values, ds = DATA[farm].durations;
  const out = { ts: [], vs: [], ds: [] };
  for (let i = 0; i < ts.length; i++) {
    const d = ts[i].slice(0, 10);
    if (d >= r.from && d <= r.to) { out.ts.push(ts[i]); out.vs.push(vs[i]); out.ds.push(ds[i]); }
  }
  return out;
}

function aggregate(ts, vs, agg) {
  if (agg === '15m') return { ts, vs };
  const buckets = {};
  ts.forEach((t, i) => {
    const key = agg === '1h' ? t.slice(0, 13) + ':00' : t.slice(0, 10);
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(vs[i]);
  });
  const out = { ts: [], vs: [] };
  Object.keys(buckets).sort().forEach(k => {
    out.ts.push(k);
    out.vs.push(buckets[k].reduce((a, b) => a + b, 0) / buckets[k].length);
  });
  return out;
}

function toMWh(vs, ds) {
  let sum = 0;
  for (let i = 0; i < vs.length; i++) sum += vs[i] * ds[i];
  return sum;
}

function fmtNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toFixed(1);
}

// ── KPIs ──────────────────────────────────────────────────────────────────
function updateKPIs(ts, vs, ds) {
  const total = toMWh(vs, ds);
  const peak = Math.max(...vs, 0);
  const dayVs = vs.filter(v => v > 0);
  const avg = dayVs.length ? dayVs.reduce((a, b) => a + b, 0) / dayVs.length : 0;
  const cf = peak > 0 ? (avg / peak * 100) : 0;

  // New KPIs
  const co2Avoided = total * 0.2; // 0.2 tons CO2eq per MWh approx
  const days = ts.length > 0 ? (new Date(ts[ts.length - 1]) - new Date(ts[0])) / (1000 * 60 * 60 * 24) : 0;
  const periodDays = Math.max(1, days);
  const households = (total / periodDays) / (3.3 / 365); // 3.3 MWh per year

  document.getElementById('kpiMwh').textContent = total > 0 ? fmtNum(total) : '—';
  document.getElementById('kpiPeak').textContent = peak > 0 ? fmtNum(peak) : '—';
  document.getElementById('kpiAvg').textContent = avg > 0 ? fmtNum(avg) : '—';
  document.getElementById('kpiCF').textContent = cf > 0 ? cf.toFixed(1) + '%' : '—';
  document.getElementById('kpiCo2').textContent = total > 0 ? fmtNum(co2Avoided) : '—';
  document.getElementById('kpiHouses').textContent = total > 0 ? fmtNum(households) : '—';
}

// ── Time-series ───────────────────────────────────────────────────────────
function drawTimeSeries(ts, vs) {
  const noData = document.getElementById('noData');
  const chartEl = document.getElementById('tsChart');
  if (ts.length === 0) { noData.style.display = 'flex'; chartEl.style.display = 'none'; return; }
  noData.style.display = 'none'; chartEl.style.display = '';

  const m = META[currentFarm] || {};
  const capShapes = getWeekendShapes(ts);
  const capAnnot = [];

  // Grid access capacity reference line
  if (m.mw_grid) {
    capShapes.push({
      type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1,
      y0: m.mw_grid, y1: m.mw_grid,
      line: { color: 'rgba(56,189,248,0.6)', width: 1.5, dash: 'dash' }
    });
    capAnnot.push({
      xref: 'paper', yref: 'y', x: 1, y: m.mw_grid,
      text: `Grid ${m.mw_grid} MW`, showarrow: false,
      font: { size: 10, color: '#38bdf8' }, xanchor: 'right', yanchor: 'bottom'
    });
  }
  // Installed MWp reference line
  if (m.mwp && m.mwp !== m.mw_grid) {
    capShapes.push({
      type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1,
      y0: m.mwp, y1: m.mwp,
      line: { color: 'rgba(167,139,250,0.45)', width: 1, dash: 'dot' }
    });
    capAnnot.push({
      xref: 'paper', yref: 'y', x: 1, y: m.mwp,
      text: `Installed ${m.mwp} MWp`, showarrow: false,
      font: { size: 10, color: '#a78bfa' }, xanchor: 'right', yanchor: 'bottom'
    });
  }

  Plotly.react('tsChart', [{
    x: ts, y: vs, type: 'scatter', mode: 'lines', name: currentFarm,
    line: { color: '#f7aa17', width: 1.5, shape: 'spline', smoothing: 0.3 },
    fill: 'tozeroy', fillcolor: 'rgba(247,170,23,0.08)',
    hovertemplate: '<b>%{x}</b><br>%{y:.1f} MW<extra></extra>',
  }], {
    ...LAYOUT_BASE,
    yaxis: { ...LAYOUT_BASE.yaxis, ticksuffix: ' MW', rangemode: 'nonnegative' },
    shapes: capShapes,
    annotations: capAnnot,
  }, PLOTLY_CFG);
}

// ── Daily totals ──────────────────────────────────────────────────────────
function drawDaily(ts, vs, ds) {
  const daily = {};
  ts.forEach((t, i) => { const d = t.slice(0, 10); daily[d] = (daily[d] || 0) + vs[i] * ds[i]; });
  const days = Object.keys(daily).sort();
  const mwhs = days.map(d => daily[d]);
  const max = Math.max(...mwhs);
  const colors = mwhs.map(v => {
    const f = max ? v / max : 0;
    return `rgba(247,${Math.round(170 - f * 60)},${Math.round(23 * (1 - f) + 92 * f)},0.85)`;
  });
  // Theoretical max energy per day from grid capacity
  const m2 = META[currentFarm] || {};
  const dayShapes = [], dayAnnot = [];
  const daylightHours = 8;  // conservative daylight hours reference
  if (m2.mw_grid) {
    const refMwh = m2.mw_grid * daylightHours;
    dayShapes.push({
      type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1,
      y0: refMwh, y1: refMwh,
      line: { color: 'rgba(56,189,248,0.5)', width: 1.5, dash: 'dash' }
    });
    dayAnnot.push({
      xref: 'paper', yref: 'y', x: 1, y: refMwh,
      text: `Grid cap. ×8h = ${refMwh} MWh`, showarrow: false,
      font: { size: 9, color: '#38bdf8' }, xanchor: 'right', yanchor: 'bottom'
    });
  }

  Plotly.react('dailyChart', [{
    x: days, y: mwhs, type: 'bar',
    marker: { color: colors, line: { width: 0 } },
    hovertemplate: '<b>%{x}</b><br>%{y:.0f} MWh<extra></extra>',
  }], {
    ...LAYOUT_BASE, yaxis: { ...LAYOUT_BASE.yaxis, ticksuffix: ' MWh' },
    bargap: 0.2, shapes: dayShapes, annotations: dayAnnot
  }, PLOTLY_CFG);
}

// ── Heatmap ───────────────────────────────────────────────────────────────
function drawHeatmap(ts, vs) {
  const cell = {};
  ts.forEach((t, i) => {
    const key = t.slice(0, 10) + '_' + parseInt(t.slice(11, 13));
    if (!cell[key]) cell[key] = [];
    cell[key].push(vs[i]);
  });
  const dates = [...new Set(ts.map(t => t.slice(0, 10)))].sort();
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const z = hours.map(h => dates.map(d => {
    const k = d + '_' + h; return cell[k] ? cell[k].reduce((a, b) => a + b, 0) / cell[k].length : 0;
  }));
  Plotly.react('heatmapChart', [{
    z, x: dates,
    y: hours.map(h => String(h).padStart(2, '0') + ':00'),
    type: 'heatmap',
    colorscale: [[0, '#0d1117'], [0.01, '#1a2a0a'], [0.3, '#2d5a1b'], [0.6, '#f7aa17'], [0.85, '#ff7c5c'], [1, '#ffffff']],
    showscale: true,
    colorbar: { outlinewidth: 0, bgcolor: 'rgba(0,0,0,0)', tickfont: { color: '#8b949e', size: 11 }, ticksuffix: ' MW', thickness: 14, len: 0.9 },
    hovertemplate: '<b>%{x} %{y}</b><br>%{z:.1f} MW<extra></extra>',
    zmin: 0,
  }], {
    ...LAYOUT_BASE, margin: { t: 10, r: 80, b: 50, l: 55 },
    yaxis: { ...LAYOUT_BASE.yaxis, ticksuffix: '', autorange: 'reversed' },
  }, PLOTLY_CFG);
}

// ── Monthly totals ─────────────────────────────────────────────────────────
function drawMonthly(ts, vs, ds) {
  // 1. Historical Data (for scatter dots & seasonality ratio)
  const fullTs = DATA[currentFarm].timestamps;
  const fullVs = DATA[currentFarm].values;
  const fullDs = DATA[currentFarm].durations;
  const fullYm = {};
  for (let i = 0; i < fullTs.length; i++) {
    const ym = fullTs[i].slice(0, 7);
    fullYm[ym] = (fullYm[ym] || 0) + (fullVs[i] * fullDs[i]) / 1000;
  }

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dotX = [], dotY = [], dotHover = [];
  const histSums = {}, histCounts = {};

  for (const ym in fullYm) {
    const yyyy = ym.slice(0, 4);
    const m = parseInt(ym.slice(5, 7), 10);
    const gwh = fullYm[ym];

    dotX.push(monthNames[m - 1]);
    dotY.push(gwh);
    dotHover.push(`${gwh.toLocaleString(undefined, { maximumFractionDigits: 2 })} GWh (${yyyy} total)`);

    histSums[m] = (histSums[m] || 0) + gwh;
    histCounts[m] = (histCounts[m] || 0) + 1;
  }

  const histAvgs = [];
  for (let m = 1; m <= 12; m++) {
    histAvgs.push(histCounts[m] ? histSums[m] / histCounts[m] : 0);
  }

  // 2. Seasonality logic (based on historical data)
  let summerSum = 0, winterSum = 0;
  [6, 7, 8].forEach(m => summerSum += histAvgs[m - 1] || 0);
  [12, 1, 2].forEach(m => winterSum += histAvgs[m - 1] || 0);

  const subEl = document.getElementById('monthlySub');
  if (subEl) {
    if (winterSum > 0 && summerSum > 0) {
      const ratio = (summerSum / winterSum).toFixed(2);
      subEl.innerHTML = `Average generation per month (GWh) &nbsp;•&nbsp; <span style="color:#f7aa17;">Summer vs Winter ratio: <b>${ratio}x</b></span>`;
    } else {
      subEl.textContent = 'Average generation per month (GWh)';
    }
  }

  // 3. Current Selection Data (for bars)
  const selYm = {};
  for (let i = 0; i < ts.length; i++) {
    const ym = ts[i].slice(0, 7);
    selYm[ym] = (selYm[ym] || 0) + (vs[i] * ds[i]) / 1000;
  }
  const selSums = {}, selCounts = {};
  for (const ym in selYm) {
    const m = parseInt(ym.slice(5, 7), 10);
    selSums[m] = (selSums[m] || 0) + selYm[ym];
    selCounts[m] = (selCounts[m] || 0) + 1;
  }
  const selAvgs = [];
  for (let m = 1; m <= 12; m++) {
    selAvgs.push(selCounts[m] ? selSums[m] / selCounts[m] : 0);
  }

  // If no data selected at all, handle gracefully by emptying chart
  if (selAvgs.every(v => v === 0) && dotY.length === 0) {
    Plotly.purge('monthlyChart');
    return;
  }

  // 4. Plotly 
  const barHover = selAvgs.map(v => v ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' GWh (Selected avg)' : 'No data in selection for this month');

  const traceBars = {
    x: monthNames,
    y: selAvgs,
    name: 'Selected Period Avg',
    type: 'bar',
    marker: { color: 'rgba(247, 170, 23, 0.65)', line: { color: '#f7aa17', width: 1.5 } },
    customdata: barHover,
    hovertemplate: '<b>%{x}</b><br>%{customdata}<extra></extra>',
  };

  const traceDots = {
    x: dotX,
    y: dotY,
    name: 'Historical Monthly Totals',
    type: 'scatter',
    mode: 'markers',
    marker: { color: '#ffffff', size: 6, line: { color: '#000000', width: 1.5 }, opacity: 0.9 },
    customdata: dotHover,
    hovertemplate: '<b>%{x}</b><br>%{customdata}<extra></extra>',
  };

  Plotly.react('monthlyChart', [traceBars, traceDots], {
    ...LAYOUT_BASE,
    margin: { t: 10, r: 20, b: 20, l: 60 },
    yaxis: { ...LAYOUT_BASE.yaxis, ticksuffix: ' GWh', rangemode: 'nonnegative' },
    xaxis: { ...LAYOUT_BASE.xaxis, fixedrange: true, type: 'category' },
    showlegend: false,
    barmode: 'overlay',
    hovermode: 'closest'
  }, PLOTLY_CFG);
}

// ── Compare all farms ──────────────────────────────────────────────────────
function drawCompare() {
  const r = getDateRange();
  const traces = FARMS.map(farm => {
    const ts = DATA[farm].timestamps, vs = DATA[farm].values, ds = DATA[farm].durations;
    const daily = {};
    for (let i = 0; i < ts.length; i++) {
      const d = ts[i].slice(0, 10);
      if (d >= r.from && d <= r.to) daily[d] = (daily[d] || 0) + vs[i] * ds[i];
    }
    const days = Object.keys(daily).sort();
    if (!days.length) return null;
    return {
      x: days, y: days.map(d => daily[d]), name: farm, type: 'bar',
      hovertemplate: `<b>${farm}</b><br>%{x}<br>%{y:.0f} MWh<extra></extra>`
    };
  }).filter(Boolean);
  Plotly.react('compareChart', traces, {
    ...LAYOUT_BASE, yaxis: { ...LAYOUT_BASE.yaxis, ticksuffix: ' MWh' },
    barmode: 'group', bargap: 0.15, bargroupgap: 0.05,
    showlegend: true, legend: { bgcolor: 'rgba(0,0,0,0)', font: { size: 11 } },
  }, PLOTLY_CFG);
}

// ── Weekend shading ────────────────────────────────────────────────────────
function getWeekendShapes(ts) {
  const shapes = [], seen = new Set();
  ts.forEach(t => {
    const d = t.slice(0, 10); if (seen.has(d)) return; seen.add(d);
    const day = new Date(d).getDay();
    if (day === 0 || day === 6) shapes.push({ type: 'rect', xref: 'x', yref: 'paper', x0: d + 'T00:00', x1: d + 'T23:59', y0: 0, y1: 1, fillcolor: 'rgba(255,255,255,0.03)', line: { width: 0 } });
  });
  return shapes;
}

// ── Farm tags ──────────────────────────────────────────────────────────────
function buildFarmTags() {
  const wrap = document.getElementById('farmTags');
  wrap.innerHTML = '';
  FARMS.forEach(farm => {
    const tag = document.createElement('div');
    tag.className = 'farm-tag' + (farm === currentFarm ? ' selected' : '');
    tag.innerHTML = `<span class="dot"></span>${farm}`;
    tag.onclick = () => { document.getElementById('farmSelect').value = farm; updateAll(); };
    tag.id = 'tag-' + farm.replace(/[^a-zA-Z0-9]/g, '_');
    wrap.appendChild(tag);
  });
}

function updateFarmTags() {
  document.querySelectorAll('.farm-tag').forEach(t => t.classList.remove('selected'));
  const el = document.getElementById('tag-' + currentFarm.replace(/[^a-zA-Z0-9]/g, '_'));
  if (el) el.classList.add('selected');
}

// ── Aggregation & range ────────────────────────────────────────────────────
function setAgg(agg) {
  currentAgg = agg;
  ['15m', '1h', '1d'].forEach(a => {
    const id = a === '15m' ? 'btn15m' : a === '1h' ? 'btnHour' : 'btnDay';
    document.getElementById(id).classList.toggle('active', a === agg);
  });
  updateAll();
}

function setRange(days) {
  const maxDateVal = document.getElementById('dateTo').getAttribute('max');
  const to = new Date(maxDateVal), from = new Date(maxDateVal);
  from.setDate(to.getDate() - days + 1);
  const fmt = d => d.toISOString().slice(0, 10);
  document.getElementById('dateFrom').value = fmt(from);
  document.getElementById('dateTo').value = fmt(to);
  document.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  updateAll();
}

function setRangeAll() {
  const maxDateVal = document.getElementById('dateTo').getAttribute('max');
  const minDateVal = document.getElementById('dateFrom').getAttribute('min');
  document.getElementById('dateFrom').value = minDateVal;
  document.getElementById('dateTo').value = maxDateVal;
  document.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  updateAll();
}

// ── Master update ──────────────────────────────────────────────────────────
function updateAll() {
  currentFarm = document.getElementById('farmSelect').value;
  updateFarmTags();
  // Defer metadata/map update so any Leaflet error never blocks chart rendering
  const _farm = currentFarm;
  setTimeout(() => { try { updateMeta(_farm); } catch (e) { console.warn('meta update error:', e); } }, 0);
  document.getElementById('chartTitle').textContent = currentFarm + ' — Generation Profile';
  document.getElementById('chartSub').textContent =
    currentAgg === '15m' ? '15-minute actual generation (MW)' :
      currentAgg === '1h' ? 'Hourly average generation (MW)' : 'Daily average generation (MW)';
  const raw = filterData(currentFarm);
  const agg = aggregate(raw.ts, raw.vs, currentAgg);
  updateKPIs(raw.ts, raw.vs, raw.ds);
  drawMonthly(raw.ts, raw.vs, raw.ds);
  drawTimeSeries(agg.ts, agg.vs);
  drawDaily(raw.ts, raw.vs, raw.ds);
  drawHeatmap(raw.ts, raw.vs);
  drawCompare();
}

// ── Init ───────────────────────────────────────────────────────────────────
(function init() {
  const sel = document.getElementById('farmSelect');
  FARMS.forEach(f => { const o = document.createElement('option'); o.value = f; o.textContent = f; sel.appendChild(o); });
  sel.addEventListener('change', updateAll);
  document.getElementById('dateFrom').addEventListener('change', updateAll);
  document.getElementById('dateTo').addEventListener('change', updateAll);
  buildFarmTags();
  updateAll();

  // Initialize Leaflet AFTER page fully renders (300ms ensures CSS grid gives container real dimensions)
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (initLeafletMap()) applyFarmHighlight(currentFarm);
    }, 300);
  });
})();