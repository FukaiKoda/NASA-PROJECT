let climateChart;
  const appState = { geo: null };
  let lastAgg = null; // آخر نتائج تجميع لتمريرها للذكاء الاصطناعي
  appState.lastSampleCount = 0;
  appState.lastRadiusKm = 0;
  appState.lastAiRaw = '';
  // Configure your OpenRouter API key here. Keep it private.
  const OPENROUTER_API_KEY = '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';
  const API_PARAMS = 'PRECTOTCORR,T2M,RH2M';
  let API_START = '20170101';
  let API_END   = '20241201';
  const CONCURRENCY = 5; // حد التوازي للطلبات
  const MAX_POINTS = 25; // الحد الأقصى لعدد نقاط العينة داخل الجهة
  const NEAREST_MAX_KM = 80; // أقصى مسافة لقبول أقرب جهة إذا كانت النقطة خارج الحدود
  const RADIUS_KM = 10; // نصف قطر العينة حول النقطة

    // Toasts
  function showToast(msg, type){
      const wrap = document.getElementById('toasts');
      if (!wrap) return;
      const el = document.createElement('div');
      el.className = 'toast '+(type||'');
      el.textContent = msg;
      wrap.appendChild(el);
      setTimeout(()=>{ el.style.opacity = '0'; el.style.transform = 'translateY(6px)'; }, 2200);
      setTimeout(()=>{ el.remove(); }, 2600);
    }
    // Button ripple
    document.addEventListener('click', (e)=>{
      const btn = e.target.closest('.btn');
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const span = document.createElement('span');
      const size = Math.max(rect.width, rect.height);
      span.className = 'ripple';
      span.style.width = span.style.height = size+'px';
      const x = e.clientX - rect.left - size/2;
      const y = e.clientY - rect.top - size/2;
      span.style.left = x+'px';
      span.style.top = y+'px';
      btn.appendChild(span);
      setTimeout(()=> span.remove(), 600);
    }, { passive: true });

    // Loading skeletons
  function setLoading(isLoading){
      const btn = document.querySelector('.card .card-body .row .btn');
      const chartSk = document.getElementById('chartSkeleton');
      const tableSk = document.getElementById('tableSkeleton');
      const bar = document.getElementById('progressBar');
      if (bar) bar.style.width = '0%';
  if (btn){ btn.classList.toggle('loading', !!isLoading); btn.textContent = isLoading ? 'Updating…' : 'Update data'; }
      if (chartSk) chartSk.style.display = isLoading ? '' : 'none';
      if (tableSk) tableSk.style.display = isLoading ? '' : 'none';
    }
    // KPI Count-up animation
    function animateCount(id, to, duration=600){
      const el = document.getElementById(id); if (!el) return;
      const from = parseFloat((el.textContent||'0').replace(/[^\d.\-]/g,'')) || 0;
      const start = performance.now();
      function frame(now){
        const t = Math.min(1, (now-start)/duration);
        const val = from + (to - from) * t;
        el.textContent = Math.round(val).toString();
        if (t < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

  // Fetch yearly stats for a single point
    async function fetchPointYearStats(longitude, latitude) {
      const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${API_PARAMS}&community=AG&longitude=${longitude}&latitude=${latitude}&start=${API_START}&end=${API_END}&format=JSON`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      const tempData = data?.properties?.parameter?.T2M || {};
      const humidityData = data?.properties?.parameter?.RH2M || {};
      const rainData = data?.properties?.parameter?.PRECTOTCORR || {};
  const yearStats = {}; // year -> { tAvg, hAvg, rTotal }
  // Group by year
      const perYear = {};
      for (const date in tempData) {
        const y = date.slice(0,4);
        if (!perYear[y]) perYear[y] = { t: [], h: [], r: 0 };
        perYear[y].t.push(Number(tempData[date]));
        perYear[y].h.push(Number(humidityData[date]));
        perYear[y].r += Number(rainData[date] || 0);
      }
      // Apply year range filter if selects are set
      let yStart = null, yEnd = null;
      try {
        const sEl = document.getElementById('startYear');
        const eEl = document.getElementById('endYear');
        if (sEl && eEl){ yStart = parseInt(sEl.value); yEnd = parseInt(eEl.value); if (!Number.isFinite(yStart)) yStart=null; if (!Number.isFinite(yEnd)) yEnd=null; }
      } catch {}
      for (const y in perYear) {
        const yNum = parseInt(y);
        if (Number.isFinite(yStart) && yNum < yStart) continue;
        if (Number.isFinite(yEnd) && yNum > yEnd) continue;
        const obj = perYear[y];
        const tAvg = obj.t.length ? obj.t.reduce((a,b)=>a+b,0)/obj.t.length : 0;
        const hAvg = obj.h.length ? obj.h.reduce((a,b)=>a+b,0)/obj.h.length : 0;
        yearStats[y] = { tAvg, hAvg, rTotal: obj.r };
      }
  return yearStats;
    }

  // Load regions and find the one containing the point
    async function loadGeo(){
      if (appState.geo) return appState.geo;
      const res = await fetch('maroc.geojson');
      if (!res.ok) throw new Error('تعذر تحميل ملف الجهات');
      const g = await res.json();
      appState.geo = g;
      return g;
    }
    function findRegion(lon, lat, geo){
      const pt = turf.point([lon, lat]);
      // 1) محاولة احتواء مباشر
      for (const f of geo.features){
        try {
          if (turf.booleanPointInPolygon(pt, f)){
            const name = f.properties?.region || f.properties?.name || f.properties?.NAME_1 || f.properties?.NAME_EN || f.properties?.NAME_FR || f.properties?.nom || 'منطقة غير معروفة';
            return { feature: f, name, method: 'inside', distanceKm: 0 };
          }
        } catch {}
      }
  // 2) If none contains the point, choose the nearest within a threshold
      let best = { d: Infinity, f: null };
      for (const f of geo.features){
        try {
          const line = turf.polygonToLine(f);
          const snapped = turf.nearestPointOnLine(line, pt, { units: 'kilometers' });
          const d = snapped ? turf.distance(pt, snapped, { units: 'kilometers' }) : turf.distance(pt, turf.centerOfMass(f), { units: 'kilometers' });
          if (d < best.d){ best = { d, f }; }
        } catch {}
      }
      if (best.f && best.d <= NEAREST_MAX_KM){
        const name = best.f.properties?.region || best.f.properties?.name || best.f.properties?.NAME_1 || best.f.properties?.NAME_EN || best.f.properties?.NAME_FR || best.f.properties?.nom || 'منطقة غير معروفة';
        return { feature: best.f, name, method: 'nearest', distanceKm: best.d };
      }
  return null;
    }
  // Sample points inside region feature
    function samplePointsInRegion(feature){
  // Cell size to get ~MAX_POINTS points
      const areaM2 = turf.area(feature);
      const areaKm2 = areaM2 / 1e6;
      let cellSide = Math.sqrt(Math.max(areaKm2, 1) / MAX_POINTS); // بالكيلومتر
      cellSide = Math.max(10/1000, Math.min(cellSide, 50)); // من 0.01 كم إلى 50 كم (قيمة منطقية)
      const bbox = turf.bbox(feature);
      const grid = turf.pointGrid(bbox, Math.max(cellSide, 1), { units: 'kilometers', mask: feature });
      let points = grid.features.map(f => f.geometry.coordinates);
  // Ensure at least one point: use center if grid fails
      if (!points.length){
        const c = turf.center(feature).geometry.coordinates;
        points = [c];
      }
  // Trim to max
      if (points.length > MAX_POINTS){
        const step = Math.ceil(points.length / MAX_POINTS);
        points = points.filter((_,i)=> i % step === 0).slice(0, MAX_POINTS);
      }
      return points;
    }

  // Sample points inside buffer circle around the point
    function samplePointsInBuffer(bufferPoly, maxPoints = MAX_POINTS){
      const areaM2 = turf.area(bufferPoly);
      const areaKm2 = areaM2 / 1e6;
      let cellSide = Math.sqrt(Math.max(areaKm2, 1) / maxPoints);
      cellSide = Math.max(0.25, Math.min(cellSide, 5)); // 0.25 كم إلى 5 كم لضبط كثافة الشبكة
      const bbox = turf.bbox(bufferPoly);
      const grid = turf.pointGrid(bbox, cellSide, { units: 'kilometers', mask: bufferPoly });
      let points = grid.features.map(f => f.geometry.coordinates);
      if (!points.length){
        const c = turf.center(bufferPoly).geometry.coordinates;
        points = [c];
      }
      if (points.length > maxPoints){
        const step = Math.ceil(points.length / maxPoints);
        points = points.filter((_,i)=> i % step === 0).slice(0, maxPoints);
      }
      return points;
    }

  // Run promises with limited concurrency
    async function runWithConcurrency(items, worker, limit){
      const results = new Array(items.length);
      let idx = 0; let active = 0;
      return new Promise((resolve, reject)=>{
        const next = ()=>{
          if (idx >= items.length && active === 0) return resolve(results);
          while (active < limit && idx < items.length){
            const cur = idx++; const val = items[cur]; active++;
            Promise.resolve(worker(val, cur)).then(r=>{ results[cur]=r; active--; next(); }).catch(e=>{ results[cur]=null; active--; next(); });
          }
        };
        next();
      });
    }

    function renderFromAggregated(agg){
      lastAgg = agg;
  const years = Object.keys(agg).sort();
  // Use numeric arrays for charts (formatting is handled in the table below)
  const avgTemp = years.map(y => +agg[y].tAvg);
  const avgHumidity = years.map(y => +agg[y].hAvg);
  const totalRain = years.map(y => +agg[y].rAvg);
  // Compute maxima to derive sensible axis bounds
  const tMax = Math.max(0, ...avgTemp);
  const hMax = Math.max(0, ...avgHumidity);
  const rMax = Math.max(0, ...totalRain);
      // Update KPI for years range
      try { document.getElementById('kpiYears').textContent = years.length ? `${years[0]}–${years[years.length-1]}` : '—'; } catch {}

      const tbody = document.getElementById("statsTable");
      tbody.innerHTML = '';
      for (const y of years){
        tbody.innerHTML += `
          <tr>
            <td>${y}</td>
            <td>${(+agg[y].tAvg).toFixed(2)}</td>
            <td>${(+agg[y].hAvg).toFixed(2)}</td>
            <td>${(+agg[y].rAvg).toFixed(2)}</td>
          </tr>
        `;
      }
      const chartSk = document.getElementById('chartSkeleton'); if (chartSk) chartSk.style.display='none';
      const tableSk = document.getElementById('tableSkeleton'); if (tableSk) tableSk.style.display='none';
      const ctx = document.getElementById("climateChart").getContext("2d");
      if (climateChart) climateChart.destroy();
      const gradient = ctx.createLinearGradient(0, 0, 0, 240);
      gradient.addColorStop(0, 'rgba(37,99,235,0.18)');
      gradient.addColorStop(1, 'rgba(37,99,235,0.02)');
      climateChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: years,
          datasets: [
            { label: "Avg temperature (°C)", data: avgTemp, borderColor: "#ef4444", backgroundColor: gradient, fill: true, tension: 0.25, yAxisID: 'yTemp', borderWidth: 2, pointRadius: 2, pointHoverRadius: 4, spanGaps: true },
            { label: "Avg humidity (%)", data: avgHumidity, borderColor: "#0ea5e9", backgroundColor: 'rgba(14,165,233,0.08)', fill: false, tension: 0.25, yAxisID: 'yHum', borderWidth: 2, pointRadius: 2, pointHoverRadius: 4, spanGaps: true },
            { label: "Avg total rainfall (mm)", data: totalRain, borderColor: "#10b981", backgroundColor: 'rgba(16,185,129,0.08)', fill: false, tension: 0.25, yAxisID: 'yRain', borderWidth: 2, pointRadius: 2, pointHoverRadius: 4, spanGaps: true }
          ]
        },
        options: {
          responsive: true,
          scales: {
            x: { grid: { color: 'rgba(0,0,0,0.05)' } },
            yTemp: {
              type: 'linear',
              position: 'left',
              title: { display: true, text: 'Temperature (°C)' },
              suggestedMin: Math.max(0, Math.floor((Math.min(...avgTemp) - 2) / 2) * 2),
              suggestedMax: Math.max(4, Math.ceil((tMax + 2) / 2) * 2),
              ticks: { stepSize: 2, callback: v => v + '°C' },
              grid: { color: 'rgba(0,0,0,0.05)' }
            },
            yHum: {
              type: 'linear',
              position: 'right',
              title: { display: true, text: 'Humidity (%)' },
              suggestedMin: Math.max(0, Math.floor((Math.min(...avgHumidity) - 10) / 10) * 10),
              suggestedMax: Math.max(100, Math.ceil(hMax / 20) * 20),
              ticks: { stepSize: 20, callback: v => v + '%' },
              grid: { drawOnChartArea: false }
            },
            yRain: {
              type: 'linear',
              position: 'right',
              offset: true,
              title: { display: true, text: 'Rainfall (mm)' },
              suggestedMin: Math.max(0, Math.floor((Math.min(...totalRain) - 50) / 50) * 50),
              suggestedMax: Math.max(100, Math.ceil(rMax / 100) * 100),
              ticks: { stepSize: 100, callback: v => v + ' mm' },
              grid: { drawOnChartArea: false }
            }
          },
          plugins: {
            legend: { position: "bottom" },
            tooltip: {
              mode: 'index',
              intersect: false,
              callbacks: {
                label: function(ctx){
                  const label = ctx.dataset.label || '';
                  const v = ctx.parsed.y;
                  if (ctx.dataset.yAxisID === 'yTemp') return `${label}: ${v.toFixed(2)} °C`;
                  if (ctx.dataset.yAxisID === 'yHum') return `${label}: ${v.toFixed(0)} %`;
                  if (ctx.dataset.yAxisID === 'yRain') return `${label}: ${v.toFixed(0)} mm`;
                  return `${label}: ${v}`;
                }
              }
            }
          },
          interaction: { intersect: false, mode: 'index' }
        }
      });
  const aiOut = document.getElementById('aiOutput');
  if (aiOut) aiOut.innerHTML = '<div class="ai-header"><div class="ai-title">AI analysis</div><div class="ai-tools"><button class="ai-tinybtn" data-action="copy-ai">Copy</button><button class="ai-tinybtn" data-action="toggle-raw">Raw</button></div></div><div class="ai-paragraph">Computed. Click "Analyze with AI" to get insights.</div>';
    }

    async function fetchRegionAverage(lon, lat){
      const statusEl = document.getElementById('status');
  statusEl.textContent = 'Finding region from coordinates...';
      const geo = await loadGeo();
      const region = findRegion(lon, lat, geo);
      if (!region){
  statusEl.textContent = 'No region found. Will show point-only data.';
        return null;
      }
      if (region.method === 'nearest' && region.distanceKm > 0){
  statusEl.textContent = `Point outside boundary • Nearest region: ${region.name} (≈${region.distanceKm.toFixed(1)} km) • Sampling points...`;
      } else {
  statusEl.textContent = `Region: ${region.name} • Sampling points...`;
      }
      const points = samplePointsInRegion(region.feature);
      if (region.method === 'nearest' && region.distanceKm > 0){
  statusEl.textContent = `Nearest region: ${region.name} • Sample points: ${points.length} • Fetching NASA data...`;
      } else {
  statusEl.textContent = `Region: ${region.name} • Sample points: ${points.length} • Fetching NASA data...`;
      }

      let done = 0; const total = points.length; const bar = document.getElementById('progressBar'); if (bar) bar.style.width = '0%';
      const results = await runWithConcurrency(points, async (p)=>{
        const [x,y] = p;
        try {
          const r = await fetchPointYearStats(x, y);
          done++; statusEl.textContent = `${region.method==='nearest'?'Nearest region':'Region'}: ${region.name} • Fetched ${done}/${points.length}`; if (bar) bar.style.width = `${Math.round((done/total)*20)}%`;
          return r;
  } catch { done++; statusEl.textContent = `${region.method==='nearest'?'Nearest region':'Region'}: ${region.name} • Fetched ${done}/${points.length}`; if (bar) bar.style.width = `${Math.round((done/total)*20)}%`; return null; }
      }, CONCURRENCY);

      // دمج النتائج (متوسط عبر النقاط)
      const agg = {}; // year -> { tSum, hSum, rSum, n }
      for (const stat of results){
        if (!stat) continue;
        for (const y in stat){
          if (!agg[y]) agg[y] = { tSum:0, hSum:0, rSum:0, n:0 };
          agg[y].tSum += stat[y].tAvg;
          agg[y].hSum += stat[y].hAvg;
          agg[y].rSum += stat[y].rTotal; // لاحقاً سنأخذ متوسط إجمالي الأمطار عبر النقاط
          agg[y].n += 1;
        }
      }
      const out = {};
      for (const y in agg){
        const a = agg[y];
        const n = Math.max(1, a.n);
        out[y] = { tAvg: a.tSum/n, hAvg: a.hSum/n, rAvg: a.rSum/n };
      }
  statusEl.textContent = `${region.method==='nearest'?'Nearest region':'Region'}: ${region.name} • Computed (regional average)`; if (bar) bar.style.width = '100%';
      return out;
    }

  // Compute average within a radius around the point
    async function fetchRadiusAverage(lon, lat, radiusKm = RADIUS_KM){
      const statusEl = document.getElementById('status');
  statusEl.textContent = `Radius ${radiusKm} km around point • Sampling points...`;
      const pt = turf.point([lon, lat]);
      const bufferPoly = turf.buffer(pt, radiusKm, { units: 'kilometers' });

      // نحاول تقييد النقاط داخل حدود المغرب إن أمكن، وإلا نستخدم الدائرة كما هي
      let points = samplePointsInBuffer(bufferPoly);
      try {
        const geo = await loadGeo();
        const filtered = [];
        for (const p of points){
          const ppt = turf.point(p);
          let inside = false;
          for (const f of geo.features){
            if (turf.booleanPointInPolygon(ppt, f)) { inside = true; break; }
          }
          if (inside) filtered.push(p);
        }
        if (filtered.length) points = filtered;
      } catch {}

  statusEl.textContent = `Radius ${radiusKm} km • Sample points: ${points.length} • Fetching NASA data...`;
  appState.lastSampleCount = points.length;
  appState.lastRadiusKm = radiusKm;
  try { animateCount('kpiSamples', points.length); } catch { try { document.getElementById('kpiSamples').textContent = String(points.length); } catch {} }
  try { animateCount('kpiRadius', radiusKm); } catch { try { document.getElementById('kpiRadius').textContent = String(radiusKm); } catch {} }

      let done = 0; const total = points.length; const bar = document.getElementById('progressBar'); if (bar) bar.style.width = '0%';
      const results = await runWithConcurrency(points, async (p)=>{
        const [x,y] = p;
        try {
          const r = await fetchPointYearStats(x, y);
          done++; statusEl.textContent = `Radius ${radiusKm} km • Fetched ${done}/${points.length}`; if (bar) bar.style.width = `${Math.round((done/total)*100)}%`;
          return r;
        } catch {
          done++; statusEl.textContent = `Radius ${radiusKm} km • Fetched ${done}/${points.length}`; if (bar) bar.style.width = `${Math.round((done/total)*100)}%`;
          return null;
        }
      }, CONCURRENCY);

      const agg = {}; // year -> { tSum, hSum, rSum, n }
      for (const stat of results){
        if (!stat) continue;
        for (const y in stat){
          if (!agg[y]) agg[y] = { tSum:0, hSum:0, rSum:0, n:0 };
          agg[y].tSum += stat[y].tAvg;
          agg[y].hSum += stat[y].hAvg;
          agg[y].rSum += stat[y].rTotal;
          agg[y].n += 1;
        }
      }
      const out = {};
      for (const y in agg){
        const a = agg[y];
        const n = Math.max(1, a.n);
        out[y] = { tAvg: a.tSum/n, hAvg: a.hSum/n, rAvg: a.rSum/n };
      }
  statusEl.textContent = `Radius ${radiusKm} km • Computed (local radius average)`; if (bar) bar.style.width = '100%';
      return out;
    }

    function updateData() {
      const coords = document.getElementById("coords").value.split(",");
      if (coords.length !== 2) {
  alert("⚠️ Please enter coordinates as: longitude, latitude");
        return;
      }
      const lon = parseFloat(coords[0].trim());
      const lat = parseFloat(coords[1].trim());
      // قراءة نصف القطر المختار
      let r = parseFloat((document.getElementById('radiusKm')?.value || '10').trim());
  if (!Number.isFinite(r) || r <= 0) { alert('⚠️ Please enter a positive radius in kilometers'); return; }
      r = Math.max(1, Math.min(r, 100));
      try { localStorage.setItem('radius_km', String(r)); } catch {}
      const slider = document.getElementById('radiusSlider'); if (slider) slider.value = String(r);
      // Build API start/end from selected years (if any)
      try {
        const sEl = document.getElementById('startYear');
        const eEl = document.getElementById('endYear');
        let sy = parseInt(sEl?.value || '');
        let ey = parseInt(eEl?.value || '');
        if (Number.isFinite(sy) && Number.isFinite(ey) && sy > ey){ const t=sy; sy=ey; ey=t; if (sEl) sEl.value = String(sy); if (eEl) eEl.value = String(ey); }
        const defStart = '20170101';
        const defEnd = '20241201';
        API_START = Number.isFinite(sy) ? `${sy}0101` : defStart;
        API_END   = Number.isFinite(ey) ? `${ey}1201` : defEnd;
      } catch { /* keep defaults */ }
      setLoading(true);
      // حساب متوسط ضمن نصف القطر المحدد حول النقطة
      fetchRadiusAverage(lon, lat, r)
        .then(async (agg)=>{
          if (agg){
            // Filter aggregated output by selected years if needed
            let filtered = agg;
            try {
              const sEl = document.getElementById('startYear');
              const eEl = document.getElementById('endYear');
              const sy = parseInt(sEl?.value || '');
              const ey = parseInt(eEl?.value || '');
              if (Number.isFinite(sy) || Number.isFinite(ey)){
                filtered = {};
                const minY = Number.isFinite(sy) ? sy : -Infinity;
                const maxY = Number.isFinite(ey) ? ey : Infinity;
                for (const y of Object.keys(agg)){
                  const yn = parseInt(y);
                  if (yn >= minY && yn <= maxY) filtered[y] = agg[y];
                }
              }
            } catch {}
            renderFromAggregated(filtered);
          } else {
            // fallback: نقطة واحدة
            const single = await fetchPointYearStats(lon, lat);
            // تحويل إلى تنسيق التجميع لسهولة الرسم
            const out = {};
            for (const y in single){ out[y] = { tAvg: single[y].tAvg, hAvg: single[y].hAvg, rAvg: single[y].rTotal }; }
            // Filter by years selection
            let filtered = out;
            try {
              const sEl = document.getElementById('startYear');
              const eEl = document.getElementById('endYear');
              const sy = parseInt(sEl?.value || '');
              const ey = parseInt(eEl?.value || '');
              if (Number.isFinite(sy) || Number.isFinite(ey)){
                filtered = {};
                const minY = Number.isFinite(sy) ? sy : -Infinity;
                const maxY = Number.isFinite(ey) ? ey : Infinity;
                for (const y of Object.keys(out)){
                  const yn = parseInt(y);
                  if (yn >= minY && yn <= maxY) filtered[y] = out[y];
                }
              }
            } catch {}
            renderFromAggregated(filtered);
          }
          setLoading(false);
          showToast('Data updated', 'success');
        })
        .catch(async (e)=>{
          console.error(e);
          const statusEl = document.getElementById('status');
          statusEl.textContent = 'Local computation failed. Showing point-only data.';
          const single = await fetchPointYearStats(lon, lat);
          const out = {};
          for (const y in single){ out[y] = { tAvg: single[y].tAvg, hAvg: single[y].hAvg, rAvg: single[y].rTotal }; }
          // Filter by years selection
          let filtered = out;
          try {
            const sEl = document.getElementById('startYear');
            const eEl = document.getElementById('endYear');
            const sy = parseInt(sEl?.value || '');
            const ey = parseInt(eEl?.value || '');
            if (Number.isFinite(sy) || Number.isFinite(ey)){
              filtered = {};
              const minY = Number.isFinite(sy) ? sy : -Infinity;
              const maxY = Number.isFinite(ey) ? ey : Infinity;
              for (const y of Object.keys(out)){
                const yn = parseInt(y);
                if (yn >= minY && yn <= maxY) filtered[y] = out[y];
              }
            }
          } catch {}
          renderFromAggregated(filtered);
          setLoading(false);
          showToast('Showing point-only data', 'warn');
        });
    }

  // تعبئة نصف القطر من التخزين المحلي إن وُجد، ثم جلب البيانات أول مرة
  try { const rv = localStorage.getItem('radius_km'); if (rv) document.getElementById('radiusKm').value = rv; } catch {}
  // Parse ?coords=lon,lat and ?radius= on load
  (function initFromQuery(){
    try {
      const params = new URLSearchParams(location.search);
      const c = params.get('coords');
      const r = params.get('radius');
      const ys = params.get('start');
      const ye = params.get('end');
      if (c){ document.getElementById('coords').value = c; }
      if (r){ document.getElementById('radiusKm').value = r; try { localStorage.setItem('radius_km', String(r)); } catch {} }
      if (ys){ const el = document.getElementById('startYear'); if (el) el.dataset.pref = ys; }
      if (ye){ const el = document.getElementById('endYear'); if (el) el.dataset.pref = ye; }
    } catch {}
  })();
  // Populate year selectors and wire Apply
  (function setupYearSelectors(){
    const sEl = document.getElementById('startYear');
    const eEl = document.getElementById('endYear');
    const apply = document.getElementById('applyYearBtn');
    if (!sEl || !eEl) return;
    // Determine available range from current defaults
    const defStartY = 2012; const defEndY = 2024; // derived from default API_START/END above
    const minY = defStartY; const maxY = defEndY;
    function fill(el){
      el.innerHTML = '';
      // empty option (auto)
      const opt0 = document.createElement('option'); opt0.value=''; opt0.textContent='Auto'; el.appendChild(opt0);
      for (let y = minY; y <= maxY; y++){
        const opt = document.createElement('option'); opt.value = String(y); opt.textContent = String(y); el.appendChild(opt);
      }
    }
    fill(sEl); fill(eEl);
    // restore from localStorage or query dataset
    try {
      const sv = sEl.dataset.pref || localStorage.getItem('year_start') || '';
      const ev = eEl.dataset.pref || localStorage.getItem('year_end') || '';
      if (sv) sEl.value = sv;
      if (ev) eEl.value = ev;
    } catch {}
    sEl.addEventListener('change', ()=>{ try { localStorage.setItem('year_start', sEl.value||''); } catch {} });
    eEl.addEventListener('change', ()=>{ try { localStorage.setItem('year_end', eEl.value||''); } catch {} });
    if (apply){ apply.addEventListener('click', ()=> updateData()); }
  })();
  updateData();

  // Cross-link to index.html with current coords & radius
  (function wireOpenMap(){
    const btn = document.getElementById('openMapBtn');
    if (!btn) return;
    btn.addEventListener('click', ()=>{
      const c = (document.getElementById('coords').value || '').trim();
      const r = (document.getElementById('radiusKm').value || '10').trim();
      const sy = (document.getElementById('startYear')?.value||'').trim();
      const ey = (document.getElementById('endYear')?.value||'').trim();
      const url = `map.html?coords=${encodeURIComponent(c)}&r=${encodeURIComponent(r)}&start=${encodeURIComponent(sy)}&end=${encodeURIComponent(ey)}`;
      window.open(url, '_blank');
    });
  })();
  // Enter to update
  (function wireEnter(){
    const coords = document.getElementById('coords');
    const r = document.getElementById('radiusKm');
    function onKey(e){ if (e.key === 'Enter'){ e.preventDefault(); updateData(); } }
    if (coords) coords.addEventListener('keydown', onKey);
    if (r) r.addEventListener('keydown', onKey);
  })();

  // Chips, slider, geolocation, export, copy link, chart download
  (function wireAdvancedControls(){
    // sync slider <-> number
    const num = document.getElementById('radiusKm');
    const slider = document.getElementById('radiusSlider');
    if (slider && num){
      try { slider.value = String(num.value || 10); } catch {}
      slider.addEventListener('input', ()=>{ num.value = slider.value; });
      slider.addEventListener('change', ()=>{ try { localStorage.setItem('radius_km', String(slider.value)); } catch {} });
      num.addEventListener('change', ()=>{ slider.value = String(num.value || 10); });
    }
    // location chips
    document.querySelectorAll('.chip[data-ll]')?.forEach(ch => {
      ch.addEventListener('click', ()=>{
        const v = ch.getAttribute('data-ll');
        const inp = document.getElementById('coords');
        if (v && inp){ inp.value = v; showToast('Selected: '+ch.textContent.trim(), 'success'); updateData(); }
      });
    });
    // geolocation
    const geoBtn = document.getElementById('geoBtn');
    if (geoBtn){
      geoBtn.addEventListener('click', ()=>{
  if (!navigator.geolocation){ showToast('Geolocation not supported', 'error'); return; }
        geoBtn.classList.add('loading');
        navigator.geolocation.getCurrentPosition(pos=>{
          geoBtn.classList.remove('loading');
          const { longitude:lon, latitude:lat } = pos.coords;
          const val = `${lon.toFixed(6)}, ${lat.toFixed(6)}`;
          const inp = document.getElementById('coords'); if (inp) inp.value = val;
          showToast('Location detected', 'success');
          updateData();
        }, err=>{
          geoBtn.classList.remove('loading');
          showToast('Failed to locate: '+(err?.message||''), 'error');
        }, { enableHighAccuracy:true, timeout:10000, maximumAge: 0 });
      });
    }
    // export CSV
    const csvBtn = document.getElementById('exportCsvBtn');
    if (csvBtn){ csvBtn.addEventListener('click', ()=>{
  if (!lastAgg){ showToast('No data to export', 'warn'); return; }
      const years = Object.keys(lastAgg).sort();
      const rows = [['year','temp_c_avg','humidity_pct_avg','rain_mm_avg']];
      for (const y of years){ const v = lastAgg[y]; rows.push([y, v.tAvg.toFixed(2), v.hAvg.toFixed(2), v.rAvg.toFixed(2)]); }
      const csv = rows.map(r=>r.join(',')).join('\n');
      const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
  const c = (document.getElementById('coords').value||'').replace(/\s+/g,'');
  const r = (document.getElementById('radiusKm').value||'10');
  const sy = (document.getElementById('startYear')?.value||'');
  const ey = (document.getElementById('endYear')?.value||'');
  const yr = (sy||ey) ? `_y${sy||'auto'}-${ey||'auto'}` : '';
  a.download = `climate_${c}_r${r}km${yr}.csv`;
      a.click();
      setTimeout(()=> URL.revokeObjectURL(a.href), 2000);
      showToast('CSV downloaded', 'success');
    }); }
    // copy link
    const copyBtn = document.getElementById('copyLinkBtn');
    if (copyBtn){ copyBtn.addEventListener('click', async ()=>{
      try {
        const c = (document.getElementById('coords').value||'').trim();
        const r = (document.getElementById('radiusKm').value||'10').trim();
        const sy = (document.getElementById('startYear')?.value||'').trim();
        const ey = (document.getElementById('endYear')?.value||'').trim();
        const url = new URL(location.href);
        url.searchParams.set('coords', c);
        url.searchParams.set('radius', r);
        if (sy) url.searchParams.set('start', sy);
        if (ey) url.searchParams.set('end', ey);
        await navigator.clipboard.writeText(url.toString());
        showToast('Share link copied', 'success');
      } catch(e){ showToast('Failed to copy to clipboard', 'error'); }
    }); }
    // download chart as PNG
    const pngBtn = document.getElementById('downloadPngBtn');
    if (pngBtn){ pngBtn.addEventListener('click', ()=>{
      if (!climateChart){ showToast('No chart yet', 'warn'); return; }
      const url = climateChart.toBase64Image('image/png', 1.0);
      const a = document.createElement('a'); a.href = url; a.download = 'climate_chart.png'; a.click();
    }); }
  })();

  // Theme toggle with persistence
  (function theme(){
    const root = document.documentElement;
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark') root.setAttribute('data-theme','dark');
    } catch {}
    const tBtn = document.getElementById('toggleTheme');
    if (tBtn){
      tBtn.addEventListener('click', ()=>{
        const dark = root.getAttribute('data-theme') === 'dark';
        if (dark){ root.removeAttribute('data-theme'); try { localStorage.setItem('theme','light'); } catch {} }
        else { root.setAttribute('data-theme','dark'); try { localStorage.setItem('theme','dark'); } catch {} }
      });
    }
  })();

  // ==== AI integration with OpenRouter ====
    function summarizeAgg(agg){
      // حساب المتوسطات عبر كل السنوات وأيضاً قيم آخر سنة
      const years = Object.keys(agg).map(y=>+y).sort((a,b)=>a-b);
      if (!years.length) return null;
      const lastY = years[years.length-1];
      const sums = { t:0, h:0, r:0 };
      for (const y of years){ sums.t += agg[y].tAvg; sums.h += agg[y].hAvg; sums.r += agg[y].rAvg; }
      const avgAll = { t: sums.t/years.length, h: sums.h/years.length, r: sums.r/years.length };
      const last = agg[lastY];
      return { years, lastY, avgAll, last };
    }
    // حساب الميل (اتجاه التغير) لسلسلة زمنية سنوية بسيطة
    function calcTrendFromAgg(agg, key){
      const years = Object.keys(agg).map(y=>+y).sort((a,b)=>a-b);
      const yvals = years.map(y => Number(agg[y][key] ?? 0));
      const n = years.length;
      if (n < 2) return { slope: 0, delta: 0, pct: 0, first: yvals[0]||0, last: yvals[n-1]||0 };
      // انحدار خطي بسيط على فهارس السنوات (0..n-1)
      const xs = years.map((_,i)=>i);
      const sumX = xs.reduce((a,b)=>a+b,0);
      const sumY = yvals.reduce((a,b)=>a+b,0);
      const sumXY = xs.reduce((a,b,i)=> a + b*yvals[i], 0);
      const sumX2 = xs.reduce((a,b)=> a + b*b, 0);
      const denom = n*sumX2 - sumX*sumX || 1;
      const slope = (n*sumXY - sumX*sumY) / denom; // لكل سنة تقريباً
      const first = yvals[0];
      const last = yvals[n-1];
      const delta = last - first;
      const pct = first !== 0 ? (delta/Math.abs(first))*100 : 0;
      return { slope, delta, pct, first, last };
    }
    function fmt(v, d=1){ return Number.isFinite(v) ? (+v).toFixed(d) : '—'; }
    function arrow(v, thr){ const t = Math.abs(v); return t < (thr||0.02) ? '≈' : (v>0 ? '↑' : '↓'); }
    function findExtremes(agg){
      const years = Object.keys(agg).map(y=>+y).sort((a,b)=>a-b);
      if (!years.length) return null;
      let driestY=years[0], wettestY=years[0], hottestY=years[0], coolestY=years[0];
      for (const y of years){
        if (agg[y].rAvg < agg[driestY].rAvg) driestY = y;
        if (agg[y].rAvg > agg[wettestY].rAvg) wettestY = y;
        if (agg[y].tAvg > agg[hottestY].tAvg) hottestY = y;
        if (agg[y].tAvg < agg[coolestY].tAvg) coolestY = y;
      }
      return { driestY, wettestY, hottestY, coolestY };
    }
    function buildAiPromptFromAgg(agg, lon, lat){
      const s = summarizeAgg(agg);
      const loc = `${(+lon).toFixed(4)}, ${(+lat).toFixed(4)}`;
      const radiusInfo = appState.lastRadiusKm || RADIUS_KM;
      const samplesInfo = appState.lastSampleCount || 0;
      const tTrend = calcTrendFromAgg(agg, 'tAvg');
      const rTrend = calcTrendFromAgg(agg, 'rAvg');
      const hTrend = calcTrendFromAgg(agg, 'hAvg');
      const ext = findExtremes(agg);
      const lines = [];
  lines.push(`Location: ${loc}`);
  lines.push(`Analysis radius: ${radiusInfo} km • Sample points: ${samplesInfo}`);
  lines.push(`Period: ${s.years[0]} - ${s.years[s.years.length-1]} (${s.years.length} years)`);
  lines.push(`Averages across all years — Temperature (°C): ${fmt(s.avgAll.t)}, Humidity (%): ${fmt(s.avgAll.h,0)}, Rainfall (mm/year): ${fmt(s.avgAll.r,0)}`);
  lines.push(`Last year (${s.lastY}) — Temperature (°C): ${fmt(s.last.tAvg)}, Humidity (%): ${fmt(s.last.hAvg,0)}, Rainfall (mm): ${fmt(s.last.rAvg,0)}`);
  lines.push(`Trends: Temperature ${arrow(tTrend.slope,0.02)} (slope ${fmt(tTrend.slope,2)} °C/yr, Δ ${fmt(tTrend.delta,1)} °C), Rainfall ${arrow(rTrend.slope,1)} (slope ${fmt(rTrend.slope,1)} mm/yr, Δ ${fmt(rTrend.delta,0)} mm), Humidity ${arrow(hTrend.slope,0.3)} (slope ${fmt(hTrend.slope,2)} %/yr)`);
      if (ext){
        lines.push(`سنوات قصوى: الأشد جفافاً ${ext.driestY} (${fmt(agg[ext.driestY].rAvg,0)} مم)، الأشد مطراً ${ext.wettestY} (${fmt(agg[ext.wettestY].rAvg,0)} مم)، الأشد حرارة ${ext.hottestY} (${fmt(agg[ext.hottestY].tAvg,1)}°C)، الأبرد ${ext.coolestY} (${fmt(agg[ext.coolestY].tAvg,1)}°C)`);
      }
  const dataBlock = lines.join('\n');
  return `Extracted climate data:
${dataBlock}

You are an environmental risk expert. Based only on the local climate data above (within radius = ${radiusInfo} km), identify exactly three (3) key environmental problems. Present them in order of priority, from the most critical problem to the least critical, based on the data.

For each problem, include:
1. A clear and concise problem title.
2. A direct and simple 1–2 line explanation grounded in numeric values or trends from the dataset.
3. One realistic solution in a single sentence. Solutions must be feasible for Morocco and reference proven approaches already applied there (e.g., drip irrigation, water harvesting, reforestation, dams, desalination, early warning systems, soil conservation, ecosystem restoration, sustainable agriculture). Each solution must stay directly connected to the identified problem.

Guidelines:
• Do not use bullet points or dashes in the final answer. 
• Keep explanations short, informative, and based on data trends.
• Focus only on water scarcity/drought, desertification/land degradation, heat stress on agriculture, ecosystem stress, and flood risk if supported by the data.
• Use multi-year averages, trends, and extreme years in reasoning.
• Keep the exact output format below.

Problems & Solutions:
1. [Concise problem title]
[Short explanation grounded in the data]
Solution: [One-sentence solution based on Morocco’s capabilities and past practices and the cost range of the price needed for this solution and a prediction between 2 nember (by MAD) (be deep in analyse the solution for the problem)]

2. [Concise problem title]
[Short explanation grounded in the data]
Solution: [One-sentence solution based on Morocco’s capabilities and past practices and the cost range of the price needed for this solution and a prediction between 2 nember (by MAD) (be deep in analyse the solution for the problem)]

3. [Concise problem title]
[Short explanation grounded in the data]
Solution: [One-sentence solution based on Morocco’s capabilities and past practices and the cost range of the price needed for this solution and a prediction between 2 nember (by MAD) (be deep in analyse the solution for the problem)]

Forecast for next year if trends continue:
Temperature: [simple direction + locally expected value]
Rainfall: [simple direction + locally expected value]
Humidity: [simple direction + locally expected value]

`;
    }
    async function callOpenRouter(prompt){
      const apiKey = (OPENROUTER_API_KEY || '').trim();
      if (!apiKey) throw new Error('Missing OpenRouter API key (set OPENROUTER_API_KEY in code)');
      const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Morocco Climate Stats'
      };
      try { if (/^https?:\/\//.test(location.origin)) headers['HTTP-Referer'] = location.origin; } catch {}
      async function requestOnce(maxTokens){
        const body = { model: 'openai/gpt-5-chat', max_tokens: maxTokens, temperature: 0.2, messages: [ { role: 'user', content: prompt } ] };
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok){ const txt = await res.text().catch(()=> ''); const err = new Error(`AI request failed (${res.status}) ${txt.slice(0,200)}`); err.status = res.status; err.details = txt; throw err; }
        const json = await res.json();
        const text = json?.choices?.[0]?.message?.content || '';
        return text.trim();
      }
      try {
        return await requestOnce(400);
      } catch (e){
        if (e?.status === 402){
          try { return await requestOnce(200); } catch {}
          throw new Error('Payment or token limit error. Try fewer tokens or add credits.');
        }
        throw e;
      }
    }
    function setAiOutput(msg){ const el = document.getElementById('aiOutput'); if (el) el.textContent = msg || '—'; }
    // Helpers to render AI output in a modern card layout
    function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
    function parseAiStructured(text){
      const lines = (text||'').split(/\r?\n/).map(l=>l.trim());
      const blocks = [];
      let forecast = { Temperature:'', Rainfall:'', Humidity:'' };
      let i=0;
      // find forecast start
      const fIdx = lines.findIndex(l => /^Forecast for next year/i.test(l));
      const mainEnd = fIdx >= 0 ? fIdx : lines.length;
      // parse numbered problems
      while (i < mainEnd){
        const m = lines[i].match(/^(\d{1,2})[\.)]\s+(.+)/);
        if (!m){ i++; continue; }
        const idx = Number(m[1]);
        const title = m[2].trim();
        i++;
        const descLines = [];
        let solution = '';
        while (i < mainEnd){
          const l = lines[i];
          if (/^(\d{1,2})[\.)]\s+/.test(l)) break;
          const sm = l.match(/^Solution\s*:\s*(.+)/i);
          if (sm){ solution = sm[1].trim(); i++; continue; }
          if (l) descLines.push(l);
          i++;
        }
        blocks.push({ idx, title, desc: descLines.join(' '), solution });
      }
      // parse forecast
      if (fIdx >= 0){
        for (let k=fIdx+1; k<lines.length; k++){
          const l = lines[k]; if (!l) continue;
          const mT = l.match(/^Temperature\s*:\s*(.+)/i);
          const mR = l.match(/^Rainfall\s*:\s*(.+)/i);
          const mH = l.match(/^Humidity\s*:\s*(.+)/i);
          if (mT) forecast.Temperature = mT[1].trim();
          else if (mR) forecast.Rainfall = mR[1].trim();
          else if (mH) forecast.Humidity = mH[1].trim();
        }
      }
      return { problems: blocks.sort((a,b)=>a.idx-b.idx), forecast };
    }
    function trendClassAndValue(s){
      const txt = (s||'').toLowerCase();
      if (/up|increase|warmer|higher|rise|rising|drier/.test(txt)) return { cls:'trend-up', arrow:'↑' };
      if (/down|decrease|cooler|lower|fall|falling|wetter/.test(txt)) return { cls:'trend-down', arrow:'↓' };
      return { cls:'trend-flat', arrow:'≈' };
    }
    function renderAiRichHtml(text){
      if (!text || text === '—') return '—';
      const data = parseAiStructured(text);
      const header = '<div class="ai-header"><div class="ai-title">AI analysis</div><div class="ai-tools"><button class="ai-tinybtn" data-action="copy-ai">Copy</button><button class="ai-tinybtn" data-action="toggle-raw">Raw</button></div></div>';
      if (!data.problems.length && !(data.forecast.Temperature||data.forecast.Rainfall||data.forecast.Humidity)){
        return header + '<div class="ai-paragraph">' + escapeHtml(text) + '</div>';
      }
      const cards = data.problems.map(p => {
        return `<div class="ai-card">
          <div class="ai-badge">Priority ${p.idx}</div>
          <h4>${escapeHtml(p.title)}</h4>
          <div class="ai-desc">${escapeHtml(p.desc)}</div>
          ${p.solution ? `<div class="ai-solution"><span class="label">Solution</span><span>${escapeHtml(p.solution)}</span></div>` : ''}
        </div>`;
      }).join('');
      const t = data.forecast.Temperature || '';
      const r = data.forecast.Rainfall || '';
      const h = data.forecast.Humidity || '';
      const tTrend = trendClassAndValue(t);
      const rTrend = trendClassAndValue(r);
      const hTrend = trendClassAndValue(h);
      const forecast = (t||r||h) ? `<div class="ai-forecast">
          <div class="f-card ${tTrend.cls}"><div class="f-title">Temperature</div><div class="f-value">${tTrend.arrow} ${escapeHtml(t)}</div></div>
          <div class="f-card ${rTrend.cls}"><div class="f-title">Rainfall</div><div class="f-value">${rTrend.arrow} ${escapeHtml(r)}</div></div>
          <div class="f-card ${hTrend.cls}"><div class="f-title">Humidity</div><div class="f-value">${hTrend.arrow} ${escapeHtml(h)}</div></div>
        </div>` : '';
      return header + `<div class="ai-grid">${cards}</div>` + forecast;
    }
    function setAiOutputHtml(msg){
      const el = document.getElementById('aiOutput');
      if (!el) return;
      if (appState.showRawAi){
        el.innerHTML = '<div class="ai-header"><div class="ai-title">AI analysis</div><div class="ai-tools"><button class="ai-tinybtn" data-action="copy-ai">Copy</button><button class="ai-tinybtn" data-action="toggle-raw">Pretty</button></div></div>' + `<div class="ai-raw">${escapeHtml(msg||'')}</div>`;
      } else {
        el.innerHTML = renderAiRichHtml(msg);
      }
    }
    // Delegate toolbar actions (copy / toggle raw)
    (function wireAiTools(){
      const box = document.getElementById('aiOutput');
      if (!box) return;
      box.addEventListener('click', async (e)=>{
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        if (action === 'copy-ai'){
          try { await navigator.clipboard.writeText(appState.lastAiRaw || ''); showToast('AI text copied','success'); } catch { showToast('Copy failed','error'); }
        } else if (action === 'toggle-raw'){
          appState.showRawAi = !appState.showRawAi; setAiOutputHtml(appState.lastAiRaw || '');
        }
      });
    })();
    // زر التحليل
    const aiBtn = document.getElementById('aiAnalyzeBtn');
    if (aiBtn){
      aiBtn.addEventListener('click', async ()=>{
        try {
          const coordStr = document.getElementById('coords').value.split(',');
          const lon = parseFloat(coordStr[0]);
          const lat = parseFloat(coordStr[1]);
          if (!lastAgg) { setAiOutput('No summarized data yet. Click "Update data" first.'); return; }
          document.getElementById('status').textContent = 'Running AI analysis...';
          const el = document.getElementById('aiOutput');
          if (el) el.innerHTML = '<div class="ai-header"><div class="ai-title">AI analysis</div><div class="ai-tools"><button class="ai-tinybtn" data-action="copy-ai">Copy</button><button class="ai-tinybtn" data-action="toggle-raw">Raw</button></div></div><div class="ai-skeleton"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>';
          const prompt = buildAiPromptFromAgg(lastAgg, lon, lat);
          const ans = await callOpenRouter(prompt);
          appState.lastAiRaw = ans || '';
          setAiOutputHtml(appState.lastAiRaw || 'No response');
          document.getElementById('status').textContent = 'Analysis complete.';
        } catch (e){
          console.error(e);
          setAiOutputHtml('Failed: ' + (e?.message || 'Unknown error'));
          document.getElementById('status').textContent = 'Analysis failed.';
        }
      });
    }
    // Note: API key is not collected from UI; set OPENROUTER_API_KEY above.