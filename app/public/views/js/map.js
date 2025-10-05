 const paletteEl = document.getElementById('palette');
  const opacityEl = document.getElementById('opacity');
  const opacityValEl = document.getElementById('opacityVal');
  const strokeEl = document.getElementById('stroke');
  const strokeValEl = document.getElementById('strokeVal');
  const maskOutsideEl = document.getElementById('maskOutside');
  const resetBtn = document.getElementById('resetBtn');
  const loaderEl = document.getElementById('loaderOverlay');
  const toastsEl = document.getElementById('toasts');
  const hoverTipEl = document.getElementById('hoverTip');
  const fillHideEl = document.getElementById('fillHide');
  const darkThemeEl = document.getElementById('darkTheme');
  const baseLayerEl = document.getElementById('baseLayer');
  const wmsOptionsEl = document.getElementById('wmsOptions');
  const wmsUrlEl = document.getElementById('wmsUrl');
  const wmsLayersEl = document.getElementById('wmsLayers');
  const wmsApplyEl = document.getElementById('wmsApply');
  const wmsLoadEl = document.getElementById('wmsLoad');
  const wmsLayersSelectEl = document.getElementById('wmsLayersSelect');
  const searchInputEl = document.getElementById('searchInput');
  const searchBtnEl = document.getElementById('searchBtn');
  const selectionInfoEl = document.getElementById('selectionInfo');
  const measureToggleEl = document.getElementById('measureToggle');
  const measureClearEl = document.getElementById('measureClear');
  const screenshotBtnEl = document.getElementById('screenshotBtn');
  const togglePanelBtn = document.getElementById('togglePanelBtn');
  const searchSuggestionsEl = document.getElementById('searchSuggestions');
  const labelsToggleEl = document.getElementById('labelsToggle');
  const aiKeyEl = "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";
  // const aiKeyEl = document.getElementById('aiKey');
  const aiBtnEl = document.getElementById('aiAnalyzeBtn');
  const aiOutputEl = document.getElementById('aiOutput');
  const radiusKmEl = document.getElementById('radiusKm');
  const radiusSliderEl = document.getElementById('radiusSlider');
  const radiusValueEl = document.getElementById('radiusValue');
  // AI dock elements
  const aiDock = document.getElementById('aiDock');
  const toggleAiDockBtn = document.getElementById('toggleAiDockBtn');
  const closeAiDockBtn = document.getElementById('closeAiDock');
  const aiDockKeyEl = document.getElementById('aiDockKey');
  const aiDockAnalyzeEl = document.getElementById('aiDockAnalyze');
  const aiDockOutputEl = document.getElementById('aiDockOutput');
  // Stats mini card elements
  const statsMiniEl = document.getElementById('statsMini');
  const statsMiniCloseEl = document.getElementById('statsMiniClose');
  const statsMiniExpandEl = document.getElementById('statsMiniExpand');
  const miniProgressEl = document.getElementById('miniProgress');
  const kpiDaysEl = document.getElementById('kpiDays');
  const kpiRadiusEl = document.getElementById('kpiRadius');
  const kpiYearsEl = document.getElementById('kpiYears');
  const miniChartCanvas = document.getElementById('miniChart');
  const statsMiniCsvEl = document.getElementById('statsMiniCsv');
  const statsMiniPngEl = document.getElementById('statsMiniPng');
  const statsModalEl = document.getElementById('statsModal');
  const statsModalCloseEl = document.getElementById('statsModalClose');
  const bigChartCanvas = document.getElementById('bigChart');

  function showLoader(text='Loading...'){
    loaderEl.querySelector('.loader-text').textContent = text;
    loaderEl.classList.add('show');
  }
  function hideLoader(){ loaderEl.classList.remove('show'); }
  function showToast(msg, type){
    const wrap = toastsEl; if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'toast '+(type||'');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(6px)'; }, 2200);
    setTimeout(()=>{ el.remove(); }, 2600);
  }

  function pickFeatureName(props){
    return (
      props?.name || props?.NAME_1 || props?.NAME_EN || props?.NAME_FR ||
      props?.nom || props?.region || props?.admin || ''
    );
  }

  const styleState = {
    fillColor: '#2d6cdf',
    fillOpacity: 0.5,
    strokeColor: '#1f2937',
    strokeWidth: 1,
    maskOutside: true,
    dark: false,
    baseLayer: 'none', // 'none' | 'osm' | 'wms'
    labels: true,
    fillHidden: false
  };

  let map;
  let moroccoBbox; // [minX,minY,maxX,maxY]
  let hoveredId = null;
  let selectedId = null;
  let moroccoGeo = null;
  let featureIndex = []; // [{id, idx, name}]
  let lastPoint = null; // {lng, lat}
  // Radius circle state
  const radiusState = { km: 10, sourceId: 'radius-circle' };
  // Stats (merged test.html) state
  const statsState = {
    pending: false,
    lastKey: '', // lng,lat,radius
    series: null, // { years:[], t2mAvg:[], precipSum:[] }
    miniChart: null,
    bigChart: null
  };

  // Measure state
  const measure = {
    active: false,
    points: [], // [{lng,lat}]
    sourceId: 'measure'
  };

  // Minimal style with just a background
  const baseStyle = {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {},
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#eaf2ff' } }
    ]
  };

  function initMap(){
    // Optionally restore view from hash
    const hashView = parseHash();
    map = new maplibregl.Map({
      container: 'map',
      style: baseStyle,
      center: hashView?.center || [-7.5, 31.5],
      zoom: hashView?.zoom ?? 4,
      minZoom: 3,
      maxZoom: 24,
      attributionControl: true,
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: true
    });

  map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-left');
  map.addControl(new maplibregl.FullscreenControl(), 'top-left');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }));

    map.on('load', async () => {
  showLoader('Loading boundaries...');
      try {
        const geo = await fetch('js/ma.json').then(r => r.json());
        moroccoGeo = geo;
  moroccoBbox = turf.bbox(geo);
        // Constrain panning near Morocco
        const pad = 1.0; // degrees
        const mb = moroccoBbox;
        map.setMaxBounds([[mb[0]-pad, mb[1]-pad],[mb[2]+pad, mb[3]+pad]]);
        if (!hashView) {
          map.fitBounds([[mb[0], mb[1]], [mb[2], mb[3]]], { padding: 24, duration: 0 });
        }

        // Add source with generated feature ids for hover
        map.addSource('morocco', {
          type: 'geojson',
          data: geo,
          generateId: true
        });
        // Build feature index for search/selection
        featureIndex = geo.features.map((f, idx) => ({ id: idx, idx, name: (pickFeatureName(f.properties) || '').toLowerCase() }));

        // Fill layer
        map.addLayer({
          id: 'ma-fill',
          type: 'fill',
          source: 'morocco',
          paint: {
            'fill-color': styleState.fillColor,
            'fill-opacity': styleState.fillOpacity
          }
        });

        // Outline layer
        map.addLayer({
          id: 'ma-line',
          type: 'line',
          source: 'morocco',
          paint: {
            'line-color': styleState.strokeColor,
            'line-width': styleState.strokeWidth
          }
        });

        // Hover highlight (line)
        map.addLayer({
          id: 'ma-hover',
          type: 'line',
          source: 'morocco',
          paint: {
            'line-color': '#0ea5e9',
            'line-width': 2.5,
            'line-opacity': [
              'case', ['boolean', ['feature-state', 'hover'], false], 1, 0
            ]
          }
        });

        // Selected feature fill on top
        map.addLayer({
          id: 'ma-selected',
          type: 'fill',
          source: 'morocco',
          paint: {
            'fill-color': '#22d3ee',
            'fill-opacity': [
              'case', ['boolean', ['feature-state', 'selected'], false], 0.28, 0
            ]
          }
        });

        // Optional outside mask
        const maskFeature = buildOutsideMaskFeature(geo);
        map.addSource('mask', { type: 'geojson', data: maskFeature });
        map.addLayer({
          id: 'outside-mask',
          type: 'fill',
          source: 'mask',
          paint: {
            'fill-color': 'rgba(255,255,255,0.6)'
          },
          layout: {
            visibility: styleState.maskOutside ? 'visible' : 'none'
          }
        }, 'ma-fill'); // insert below fill for clarity

  // Basemap sources/layers (initially hidden)
  addBasemapLayers();
  // Prepare WMS holder (added on demand)

        // Measure layers
        addMeasureLayers();

        // Labels layer (symbol)
        map.addLayer({
          id: 'ma-labels',
          type: 'symbol',
          source: 'morocco',
          layout: {
            'text-field': ['coalesce', ['get','name'], ['get','NAME_1'], ['get','NAME_FR'], ['get','NAME_EN'], ['get','nom'], ['get','region'], ['get','admin'], ''],
            'text-size': [
              'interpolate', ['linear'], ['zoom'],
              4, 10,
              7, 12,
              10, 14
            ],
            'text-allow-overlap': false,
            'text-variable-anchor': ['center']
          },
          paint: {
            'text-color': styleState.dark ? '#e5f6ff' : '#0f172a',
            'text-halo-color': styleState.dark ? 'rgba(8,10,20,0.9)' : 'rgba(255,255,255,0.85)',
            'text-halo-width': 1.2
          }
        });
        map.setLayoutProperty('ma-labels', 'visibility', styleState.labels ? 'visible' : 'none');

        wireInteractions();
        wireControls();
    wireHashSync();
    // Enforce max zoom corresponding to ~120 km across viewport's longest side (even stricter)
    updateMaxZoomByKm(120, true);
    // Initialize minimap and coordinate readout overlays
    initMiniMap();
    initCoordsReadout();
        // Prepare radius circle layers
        addRadiusLayers();

      } catch (err) {
        console.error(err);
  showToast('Failed to load data');
      } finally {
        hideLoader();
      }
    });

    // Recompute max zoom on resize and after movements (latitude affects meters-per-pixel)
  map.on('resize', ()=> { updateMaxZoomByKm(500, true); syncMiniMap(); });
  map.on('moveend', ()=> { updateMaxZoomByKm(500, true); syncMiniMap(); });
  }

  // Limit zoom: ensure min viewport span ≈ km (shortest side)
  function updateMaxZoomByKm(km, useLongSide=false){
    if (!map) return;
    const container = map.getContainer();
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    const px = Math.max(1, useLongSide ? Math.max(w, h) : Math.min(w, h));
    const targetMeters = Math.max(100, km * 1000);
    const lat = Math.max(-85, Math.min(85, map.getCenter().lat));
    const metersPerPixelAtZoom0 = 156543.03392 * Math.cos(lat * Math.PI / 180);
    const metersPerPixelNeeded = targetMeters / px;
    let z = Math.log2(metersPerPixelAtZoom0 / metersPerPixelNeeded);
    if (!isFinite(z)) z = 22;
    const allowed = Math.max(0, Math.min(24, z));
    map.setMaxZoom(allowed);
    if (map.getZoom() > allowed){
      map.zoomTo(allowed, { duration: 0 });
    }
  }

  function buildOutsideMaskFeature(geo){
    // Build a big world ring (limited lat to avoid poles artifacts)
    const worldRing = [
      [-179.999, -85], [179.999, -85], [179.999, 85], [-179.999, 85], [-179.999, -85]
    ];
    // Collect outer rings of all polygons in the dataset as holes
    const holes = [];
    for (const f of geo.features){
      const g = f.geometry;
      if (!g) continue;
      if (g.type === 'Polygon'){
        if (g.coordinates[0]) holes.push(g.coordinates[0]);
      } else if (g.type === 'MultiPolygon'){
        for (const poly of g.coordinates){
          if (poly[0]) holes.push(poly[0]);
        }
      }
    }
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [worldRing, ...holes] }
      }]
    };
  }

  function wireControls(){
    // Tabs logic
    setupTabs();
    // Open climate stats page with current coords and stored radius
    const openStatsBtn = document.getElementById('openStatsBtn');
    if (openStatsBtn){
      openStatsBtn.addEventListener('click', ()=>{
        const c = lastPoint || map.getCenter();
        let radius = radiusState.km;
        try { const r = localStorage.getItem('radius_km'); if (r) radius = Math.max(1, Math.min(100, parseFloat(r))); } catch {}
        const url = `climate.html?coords=${encodeURIComponent(`${c.lng.toFixed(6)},${c.lat.toFixed(6)}`)}&radius=${radius}`;
        window.open(url, '_blank');
      });
    }
    // Radius input wiring
    if (radiusKmEl){
      try {
        const stored = localStorage.getItem('radius_km');
        if (stored){ radiusState.km = Math.max(1, Math.min(100, parseFloat(stored))); }
      } catch {}
      radiusKmEl.value = String(radiusState.km);
      radiusKmEl.addEventListener('change', ()=>{
        let v = parseFloat(radiusKmEl.value);
        if (!Number.isFinite(v)) v = radiusState.km;
        v = Math.max(1, Math.min(100, v));
        radiusState.km = v;
        radiusKmEl.value = String(v);
        if (radiusSliderEl) radiusSliderEl.value = String(v);
        if (radiusValueEl) radiusValueEl.textContent = `${v} km`;
        try { localStorage.setItem('radius_km', String(v)); } catch {}
        if (lastPoint){ updateRadiusCircle(lastPoint.lng, lastPoint.lat, v); }
      });
      if (radiusSliderEl){
        try { radiusSliderEl.value = String(radiusState.km); } catch {}
        // Update value display function
        const updateRadiusDisplay = (value) => {
          if (radiusValueEl) radiusValueEl.textContent = `${value} km`;
        };
        // Initialize display
        updateRadiusDisplay(radiusState.km);
        
        radiusSliderEl.addEventListener('input', ()=>{ 
          radiusKmEl.value = radiusSliderEl.value; 
          updateRadiusDisplay(radiusSliderEl.value);
        });
        radiusSliderEl.addEventListener('change', ()=>{
          const v = Math.max(1, Math.min(100, parseFloat(radiusSliderEl.value||'10')));
          radiusState.km = v; radiusKmEl.value = String(v);
          updateRadiusDisplay(v);
          try { localStorage.setItem('radius_km', String(v)); } catch {}
          if (lastPoint){ updateRadiusCircle(lastPoint.lng, lastPoint.lat, v); }
        });
      }
    }
    paletteEl.addEventListener('change', ()=>{
      styleState.fillColor = paletteEl.value;
      map.setPaintProperty('ma-fill', 'fill-color', styleState.fillColor);
    });
    opacityEl.addEventListener('input', ()=>{
      styleState.fillOpacity = Number(opacityEl.value);
      opacityValEl.textContent = styleState.fillOpacity.toFixed(2);
      map.setPaintProperty('ma-fill', 'fill-opacity', styleState.fillOpacity);
      savePrefs();
    });
    strokeEl.addEventListener('input', ()=>{
      styleState.strokeWidth = Number(strokeEl.value);
      strokeValEl.textContent = styleState.strokeWidth.toFixed(2);
      map.setPaintProperty('ma-line', 'line-width', styleState.strokeWidth);
      savePrefs();
    });
    maskOutsideEl.addEventListener('change', ()=>{
      styleState.maskOutside = maskOutsideEl.checked;
      map.setLayoutProperty('outside-mask', 'visibility', styleState.maskOutside ? 'visible' : 'none');
    });
    darkThemeEl.addEventListener('change', ()=>{
      styleState.dark = darkThemeEl.checked;
      document.documentElement.setAttribute('data-theme', styleState.dark ? 'dark' : '');
      map.setPaintProperty('background', 'background-color', styleState.dark ? '#0b1020' : '#eaf2ff');
      // Adjust labels halo/color for theme
      if (map.getLayer('ma-labels')){
        map.setPaintProperty('ma-labels', 'text-color', styleState.dark ? '#e5f6ff' : '#0f172a');
        map.setPaintProperty('ma-labels', 'text-halo-color', styleState.dark ? 'rgba(8,10,20,0.9)' : 'rgba(255,255,255,0.85)');
      }
      // Adjust outside mask tint in dark mode for softer look
      if (map.getLayer('outside-mask')){
        const col = styleState.dark ? 'rgba(8,10,20,0.55)' : 'rgba(255,255,255,0.6)';
        map.setPaintProperty('outside-mask', 'fill-color', col);
      }
    });
    baseLayerEl.addEventListener('change', ()=>{
      styleState.baseLayer = baseLayerEl.value;
      // Toggle WMS options visibility
      wmsOptionsEl.style.display = styleState.baseLayer === 'wms' ? 'block' : 'none';
      switchBaseLayer(styleState.baseLayer);
    });
    wmsApplyEl.addEventListener('click', ()=>{
      styleState.baseLayer = 'wms';
      baseLayerEl.value = 'wms';
      wmsOptionsEl.style.display = 'block';
      applyWms();
    });
    wmsLoadEl.addEventListener('click', async ()=>{
      try {
        const caps = await fetchWmsCapabilities((wmsUrlEl.value || '').trim());
        const layers = extractWmsLayerNames(caps);
        populateWmsSelect(layers);
  showToast(`Loaded ${layers.length} layer(s)`);
      } catch (err) {
        console.error(err);
  showToast('Failed to load WMS capabilities');
      }
    });
    resetBtn.addEventListener('click', ()=>{
      if (!moroccoBbox) return;
      map.easeTo({ bearing: 0, pitch: 0, duration: 0 });
      map.fitBounds([[moroccoBbox[0], moroccoBbox[1]],[moroccoBbox[2], moroccoBbox[3]]], { padding: 24, duration: 600 });
    });

    // Hide fill toggle
    fillHideEl.addEventListener('change', ()=>{
      styleState.fillHidden = fillHideEl.checked;
      map.setLayoutProperty('ma-fill', 'visibility', styleState.fillHidden ? 'none' : 'visible');
      opacityEl.disabled = styleState.fillHidden;
      savePrefs();
    });

    // Sidebar toggle (mobile)
    togglePanelBtn.addEventListener('click', ()=>{
      const open = document.body.classList.toggle('panel-open');
      localStorage.setItem('panel-open', open ? '1' : '0');
    });

    // Geolocation button
    const geoBtn = document.getElementById('geoBtn');
    if (geoBtn){
      geoBtn.addEventListener('click', ()=>{
        if (!navigator.geolocation){ showToast('Geolocation not supported','error'); return; }
        geoBtn.classList.add('loading');
        navigator.geolocation.getCurrentPosition(pos=>{
          geoBtn.classList.remove('loading');
          const { longitude:lng, latitude:lat } = pos.coords;
          lastPoint = { lng, lat };
          map.jumpTo({ center:[lng,lat], zoom: Math.max(map.getZoom(), 8) });
          updateRadiusCircle(lng, lat, radiusState.km);
          showToast('Centered on your location','success');
        }, err=>{
          geoBtn.classList.remove('loading');
          showToast('Failed to locate: '+(err?.message||''),'error');
        }, { enableHighAccuracy:true, timeout:10000, maximumAge:0 });
      });
    }

    // Location chips
    document.querySelectorAll('.chip[data-ll]')?.forEach(ch => {
      ch.addEventListener('click', ()=>{
        const v = ch.getAttribute('data-ll');
        if (!v) return;
        const parts = v.split(',');
        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (Number.isFinite(lng) && Number.isFinite(lat)){
          lastPoint = { lng, lat };
          map.easeTo({ center:[lng,lat], zoom: Math.max(map.getZoom(), 8), duration: 700 });
          updateRadiusCircle(lng, lat, radiusState.km);
          showToast('Jumped to '+ch.textContent.trim(),'success');
        }
      });
    });

    // Copy stats link
    const copyStatsBtn = document.getElementById('copyStatsLinkBtn');
    if (copyStatsBtn){
      copyStatsBtn.addEventListener('click', async ()=>{
        try {
          const c = lastPoint || map.getCenter();
          const url = new URL(location.origin + location.pathname.replace(/index\.html$/,'') + 'test.html', location.href);
          url.searchParams.set('coords', `${c.lng.toFixed(6)}, ${c.lat.toFixed(6)}`);
          url.searchParams.set('radius', String(radiusState.km));
          await navigator.clipboard.writeText(url.toString());
          showToast('Stats link copied','success');
        } catch { showToast('Failed to copy link','error'); }
      });
    }

    // Export radius circle GeoJSON
    const exportCircleBtn = document.getElementById('exportCircleBtn');
    if (exportCircleBtn){
      exportCircleBtn.addEventListener('click', ()=>{
        try {
          const src = map.getSource(radiusState.sourceId);
          const data = src && (src._data || src._options?.data || null);
          if (!data || !data.features?.length){ showToast('No circle to export','warn'); return; }
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `radius_${(lastPoint? `${lastPoint.lng.toFixed(4)}_${lastPoint.lat.toFixed(4)}` : 'map')}_${radiusState.km}km.geojson`;
          a.click();
          setTimeout(()=> URL.revokeObjectURL(a.href), 2000);
          showToast('GeoJSON downloaded','success');
        } catch { showToast('Export failed','error'); }
      });
    }

    // Search handlers
    function performSearch(){
      const q = (searchInputEl.value || '').trim().toLowerCase();
      if (!q || !moroccoGeo) return;
      const feats = moroccoGeo.features;
      const best = feats.find(f => matchName(f.properties).includes(q));
      if (best){
        selectFeature(best.id);
        const bb = turf.bbox(best);
        map.fitBounds([[bb[0], bb[1]],[bb[2], bb[3]]], { padding: 24, duration: 600 });
      } else {
  showToast('No results found');
      }
    }
    searchBtnEl.addEventListener('click', performSearch);
    searchInputEl.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') performSearch();
    });
    searchInputEl.addEventListener('input', ()=> updateSuggestions(searchInputEl.value));
    searchSuggestionsEl.addEventListener('click', (e)=>{
      const item = e.target.closest('.item');
      if (!item) return;
      const idx = Number(item.dataset.idx);
      const feat = moroccoGeo.features[idx];
      selectFeature(idx, feat.properties);
      const bb = turf.bbox(feat);
      map.fitBounds([[bb[0], bb[1]],[bb[2], bb[3]]], { padding: 24, duration: 600 });
      searchSuggestionsEl.style.display = 'none';
    });

    // Measure controls
    measureToggleEl.addEventListener('change', ()=>{
      measure.active = measureToggleEl.checked;
      map.getCanvas().style.cursor = measure.active ? 'crosshair' : '';
    });
    measureClearEl.addEventListener('click', ()=>{
      measure.points = [];
      updateMeasure();
    });

    // Screenshot
    screenshotBtnEl.addEventListener('click', ()=>{
      try {
        if (styleState.baseLayer !== 'none') {
          showToast('Note: Image export may fail due to CORS. Try disabling the base layer before saving.');
        }
        const data = map.getCanvas().toDataURL('image/png');
        const a = document.createElement('a');
        a.href = data;
        a.download = 'map.png';
        a.click();
      } catch (err) {
        console.error(err);
  showToast('Failed to save image');
      }
    });

    // Labels toggle
    labelsToggleEl.addEventListener('change', ()=>{
      styleState.labels = labelsToggleEl.checked;
      map.setLayoutProperty('ma-labels', 'visibility', styleState.labels ? 'visible' : 'none');
      savePrefs();
    });

    // 3D mode toggle (tilt/rotate enable)
    const mode3DEl = document.getElementById('mode3D');
    if (mode3DEl){
      mode3DEl.addEventListener('change', ()=>{
        const on = mode3DEl.checked;
        map.dragRotate.enable();
        map.keyboard.enableRotation();
        if (!on){
          map.easeTo({ pitch: 0, bearing: 0, duration: 300 });
          map.dragRotate.disable();
        } else {
          map.easeTo({ pitch: Math.min(55, map.getPitch() || 45), duration: 300 });
        }
      });
    }

    // Share link button
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn){
      shareBtn.addEventListener('click', async ()=>{
        try {
          const url = location.href;
          await navigator.clipboard.writeText(url);
          showToast('Link copied to clipboard');
        } catch {
          showToast('Failed to copy link');
        }
      });
    }

    // Load persisted preferences
    loadPrefs();
  }

  function setupTabs(){
    const settingsSelect = document.getElementById('settingsSelect');
    if (!settingsSelect) return;
    
    const panes = Array.from(document.querySelectorAll('.tab-pane'));
    
    function activate(name){
      panes.forEach(p => p.classList.toggle('active', p.dataset.tabpane === name));
      settingsSelect.value = name;
      try { localStorage.setItem('active_tab', name); } catch {}
    }
    
    settingsSelect.addEventListener('change', (e)=>{
      activate(e.target.value);
    });
    
    // Restore last selected tab
    let init = 'map';
    try { init = localStorage.getItem('active_tab') || init; } catch {}
    
    // Check if the stored tab exists in our options
    const validOptions = Array.from(settingsSelect.options).map(opt => opt.value);
    if (!validOptions.includes(init)) init = 'map';
    
    activate(init);
  }

  function switchBaseLayer(kind){
    // Ensure OSM layer exists (hidden by default)
    if (!map.getLayer('osm-raster')) addBasemapLayers();
    const setVis = (id, vis) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis); };
    if (kind === 'none'){
      setVis('osm-raster', 'none');
      setVis('wms-raster', 'none');
    } else if (kind === 'osm'){
      setVis('wms-raster', 'none');
      setVis('osm-raster', 'visible');
    } else if (kind === 'wms'){
      applyWms();
    }
  }

  // Radius circle layers and updates
  function addRadiusLayers(){
    try {
      if (!map.getSource(radiusState.sourceId)){
        map.addSource(radiusState.sourceId, { type:'geojson', data: { type:'FeatureCollection', features: [] } });
      }
      if (!map.getLayer('radius-fill')){
        map.addLayer({
          id:'radius-fill', type:'fill', source: radiusState.sourceId,
          paint:{ 'fill-color':'#f59e0b', 'fill-opacity': 0.15 }
        }, 'ma-selected');
      }
      if (!map.getLayer('radius-outline')){
        map.addLayer({
          id:'radius-outline', type:'line', source: radiusState.sourceId,
          paint:{ 'line-color':'#b45309', 'line-width': 2 }
        });
      }
    } catch {}
  }
  function updateRadiusCircle(lng, lat, km){
    try {
      if (!map || !map.getSource(radiusState.sourceId)) return;
      km = Math.max(0.1, Math.min(500, Number(km)));
      const pt = turf.point([lng, lat]);
      const poly = turf.buffer(pt, km, { units:'kilometers', steps: 128 });
      const fc = { type:'FeatureCollection', features: [poly] };
      map.getSource(radiusState.sourceId).setData(fc);
      // Trigger stats update (debounced)
      scheduleStatsUpdate(lng, lat, km);
    } catch {}
  }

  function applyWms(){
    const baseUrl = (wmsUrlEl.value || '').trim();
    const fromSelect = getSelectedWmsLayers();
    const layers = (fromSelect.length ? fromSelect.join(',') : (wmsLayersEl.value || '').trim());
    if (!baseUrl || !layers){
  showToast('Please enter WMS URL and layer names');
      return;
    }
    const url = buildWmsTilesUrl(baseUrl, layers);
    // Recreate source/layer to update tiles
    if (map.getLayer('wms-raster')) map.removeLayer('wms-raster');
    if (map.getSource('wms')) map.removeSource('wms');
    map.addSource('wms', { type:'raster', tiles:[url], tileSize:256, attribution:'WMS' });
    // Insert below polygons
    const beforeId = 'ma-fill';
    map.addLayer({ id:'wms-raster', type:'raster', source:'wms', layout:{ visibility:'visible' }, paint:{ 'raster-opacity': 1 } }, beforeId);
    // Hide OSM
    if (map.getLayer('osm-raster')) map.setLayoutProperty('osm-raster', 'visibility', 'none');
  }

  function buildWmsTilesUrl(baseUrl, layers){
    // Ensure no trailing question mark/ampersand duplication
    const u = baseUrl.replace(/\?$/, '');
    const params = [
      'service=WMS',
      'request=GetMap',
      'version=1.1.1',
      'layers=' + encodeURIComponent(layers),
      'styles=',
      'format=image/png',
      'transparent=true',
      'srs=EPSG:3857',
      'bbox={bbox-epsg-3857}',
      'width=256',
      'height=256'
    ].join('&');
    const sep = u.includes('?') ? '&' : '?';
    return u + sep + params;
  }

  // WMS Capabilities helpers
  async function fetchWmsCapabilities(baseUrl){
    const u = baseUrl.replace(/\?$/, '');
    const sep = u.includes('?') ? '&' : '?';
    const url = `${u}${sep}service=WMS&request=GetCapabilities`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Capabilities request failed');
    const text = await res.text();
    return new window.DOMParser().parseFromString(text, 'text/xml');
  }
  function extractWmsLayerNames(xml){
    const names = [];
    if (!xml) return names;
    // Prefer Capability>Layer>Layer elements
    const layers = xml.querySelectorAll('Capability > Layer > Layer');
    layers.forEach(el => {
      const name = el.querySelector('Name');
      const title = el.querySelector('Title');
      if (name && name.textContent){
        names.push({ name: name.textContent, title: title?.textContent || name.textContent });
      }
    });
    // Fallback for servers with flat Layer structure
    if (names.length === 0){
      const flat = xml.querySelectorAll('Layer Name');
      flat.forEach(n => names.push({ name: n.textContent, title: n.textContent }));
    }
    return names;
  }
  function populateWmsSelect(list){
    wmsLayersSelectEl.innerHTML = '';
    list.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.name;
      opt.textContent = `${item.title} (${item.name})`;
      wmsLayersSelectEl.appendChild(opt);
    });
  }
  function getSelectedWmsLayers(){
    return Array.from(wmsLayersSelectEl.selectedOptions || []).map(o => o.value);
  }

  function wireInteractions(){
    // Hover interactions on fill layer
  map.on('mousemove', 'ma-fill', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features && e.features[0];
      if (!f) return;
  const id = f.id ?? f.sourceLayer ?? 0; // ensure an id
      if (hoveredId !== null && hoveredId !== id){
        map.setFeatureState({ source: 'morocco', id: hoveredId }, { hover: false });
      }
      hoveredId = id;
      map.setFeatureState({ source: 'morocco', id: hoveredId }, { hover: true });

      // Tooltip
      const name = pickFeatureName(f.properties) || '';
      hoverTipEl.textContent = name;
      hoverTipEl.style.left = Math.round(e.originalEvent.clientX + 12) + 'px';
      hoverTipEl.style.top = Math.round(e.originalEvent.clientY + 12) + 'px';
      hoverTipEl.style.display = 'block';
    });

    map.on('mouseleave', 'ma-fill', () => {
      map.getCanvas().style.cursor = '';
      if (hoveredId !== null){
        map.setFeatureState({ source: 'morocco', id: hoveredId }, { hover: false });
      }
      hoveredId = null;
      hoverTipEl.style.display = 'none';
    });

    // Click on region -> select + name + coords
    map.on('click', 'ma-fill', (e) => {
      const f = e.features && e.features[0];
      if (!f) return;
      const id = f.id ?? f.sourceLayer ?? 0;
      selectFeature(id, f.properties);
      const { lng, lat } = e.lngLat;
      lastPoint = { lng, lat };
      updateRadiusCircle(lng, lat, radiusState.km);
      showToast(`${pickFeatureName(f.properties)} • ${lng.toFixed(3)}, ${lat.toFixed(3)}`);
    });

    // Click elsewhere -> outside
    map.on('click', (e) => {
      const feats = map.queryRenderedFeatures(e.point, { layers: ['ma-fill'] });
      if (!feats.length){
        const { lng, lat } = e.lngLat;
        lastPoint = { lng, lat };
        if (measure.active){
          // add measure point
          measure.points.push({ lng, lat });
          updateMeasure();
        } else {
          updateRadiusCircle(lng, lat, radiusState.km);
          showToast(`Outside boundary • ${lng.toFixed(3)}, ${lat.toFixed(3)}`);
        }
      }
    });
  }

  function matchName(props){
    const name = (pickFeatureName(props) || '').toLowerCase();
    return name;
  }

  function selectFeature(id, props){
    if (selectedId !== null){
      map.setFeatureState({ source: 'morocco', id: selectedId }, { selected: false });
    }
    selectedId = id;
    map.setFeatureState({ source: 'morocco', id: selectedId }, { selected: true });
    // Render info
    const f = findFeatureById(selectedId);
    if (f){
      const center = turf.center(f).geometry.coordinates;
      const info = {
        name: pickFeatureName(f.properties),
        center: { lng: +center[0].toFixed(5), lat: +center[1].toFixed(5) }
      };
      selectionInfoEl.textContent = JSON.stringify({ ...info, props: f.properties }, null, 2);
    }
    savePrefs();
  }

  function findFeatureById(id){
    if (!moroccoGeo) return null;
    // MapLibre generateId assigns 0..N-1; use index
    return moroccoGeo.features[id];
  }

  // Basemap
  function addBasemapLayers(){
    if (!map.getSource('osm')){
      map.addSource('osm', {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors'
      });
      map.addLayer({ id: 'osm-raster', type: 'raster', source: 'osm', layout: { visibility: 'none' }, paint: { 'raster-opacity': 1 } }, 'ma-fill');
    }
  }

  // Measurement layers and updates
  function addMeasureLayers(){
    map.addSource(measure.sourceId, { type: 'geojson', data: emptyMeasureFC() });
    map.addLayer({ id: 'measure-line', type: 'line', source: measure.sourceId, paint: { 'line-color': '#22d3ee', 'line-width': 2 } });
    map.addLayer({ id: 'measure-points', type: 'circle', source: measure.sourceId, paint: { 'circle-radius': 4, 'circle-color': '#0ea5e9', 'circle-stroke-width': 1, 'circle-stroke-color': '#083344' } });
  }
  function emptyMeasureFC(){ return { type:'FeatureCollection', features: [] }; }
  function updateMeasure(){
    const pts = measure.points.map(p => [p.lng, p.lat]);
    const fc = emptyMeasureFC();
    if (pts.length){
      fc.features.push({ type:'Feature', properties:{ kind:'line' }, geometry:{ type:'LineString', coordinates: pts } });
      pts.forEach((c,i)=> fc.features.push({ type:'Feature', properties:{ kind:'pt', idx:i }, geometry:{ type:'Point', coordinates: c } }));
    }
    const src = map.getSource(measure.sourceId);
    if (src) src.setData(fc);
    // distance
    let dist = 0;
    if (pts.length > 1){
      dist = turf.length({ type:'Feature', properties:{}, geometry:{ type:'LineString', coordinates: pts } }, { units:'kilometers' });
    }
    if (pts.length){
  showToast(`Length: ${dist.toFixed(2)} km (${pts.length} ${pts.length===1?'point':'points'})`);
    }
  }

  // URL hash sync
  function wireHashSync(){
    function updateHash(){
      const c = map.getCenter();
      const z = map.getZoom();
      const hash = `#${z.toFixed(2)}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}`;
      history.replaceState(null, '', hash);
    }
    map.on('moveend', updateHash);
    map.on('zoomend', updateHash);
  }
  function parseHash(){
    if (!location.hash) return null;
    const m = location.hash.match(/^#([0-9.]+)\/([-0-9.]+)\/([-0-9.]+)/);
    if (!m) return null;
    const z = parseFloat(m[1]);
    const lat = parseFloat(m[2]);
    const lng = parseFloat(m[3]);
    if (Number.isFinite(z) && Number.isFinite(lat) && Number.isFinite(lng)){
      return { zoom: z, center: [lng, lat] };
    }
    return null;
  }

  // Accept ?coords=lon,lat (and optional &z=) to center map on load
  function parseQueryCoords(){
    try {
      const params = new URLSearchParams(location.search);
      const c = params.get('coords');
      // Radius via r or radius
      const rStr = params.get('r') || params.get('radius');
      if (rStr){
        let rv = parseFloat(rStr);
        if (Number.isFinite(rv)){
          rv = Math.max(1, Math.min(100, rv));
          radiusState.km = rv;
          if (radiusKmEl) radiusKmEl.value = String(rv);
          try { localStorage.setItem('radius_km', String(rv)); } catch {}
        }
      } else {
        // Initialize from localStorage if available
        try { const stored = localStorage.getItem('radius_km'); if (stored){ const v = Math.max(1, Math.min(100, parseFloat(stored))); radiusState.km = v; if (radiusKmEl) radiusKmEl.value = String(v); } } catch {}
      }
      if (!c) return;
      const parts = c.split(',').map(s=>parseFloat(s.trim()));
      if (parts.length === 2 && parts.every(Number.isFinite)){
        const [lng, lat] = parts;
        map.jumpTo({ center: [lng, lat] });
        lastPoint = { lng, lat };
        // Draw circle at start if we have radius
        updateRadiusCircle(lng, lat, radiusState.km);
        const z = parseFloat(params.get('z'));
        if (Number.isFinite(z)) map.jumpTo({ zoom: z });
        showToast(`Centered on ${lng.toFixed(3)}, ${lat.toFixed(3)}`);
      }
    } catch {}
  }

  // Mini map and coordinates readout
  let miniMap;
  function initMiniMap(){
    try {
      if (miniMap) return;
      miniMap = new maplibregl.Map({
        container: 'minimap',
        style: baseStyle,
        center: map.getCenter(),
        zoom: Math.max(0, map.getZoom() - 3),
        interactive: false,
        attributionControl: false
      });
      // Add Morocco outline to minimap
      miniMap.on('load', ()=>{
        try {
          if (moroccoGeo){
            miniMap.addSource('morocco-mini', { type:'geojson', data: moroccoGeo });
            miniMap.addLayer({ id:'mini-fill', type:'fill', source:'morocco-mini', paint:{ 'fill-color':'#60a5fa', 'fill-opacity':0.15 } });
            miniMap.addLayer({ id:'mini-line', type:'line', source:'morocco-mini', paint:{ 'line-color':'#1e40af', 'line-width':1 } });
            // Viewbox overlay
            miniMap.addSource('viewbox', { type:'geojson', data:{ type:'FeatureCollection', features: [] } });
            miniMap.addLayer({ id:'viewbox-line', type:'line', source:'viewbox', paint:{ 'line-color':'#0ea5e9', 'line-width':2 } });
          }
        } catch {}
      });
    } catch {}
  }
  function syncMiniMap(){
    if (!miniMap) return;
    try {
      miniMap.jumpTo({ center: map.getCenter(), zoom: Math.max(0, map.getZoom() - 3), bearing: 0, pitch: 0 });
      // Update viewbox polygon
      const b = map.getBounds();
      const poly = { type:'Feature', properties:{}, geometry:{ type:'Polygon', coordinates: [[[b.getWest(), b.getSouth()],[b.getEast(), b.getSouth()],[b.getEast(), b.getNorth()],[b.getWest(), b.getNorth()],[b.getWest(), b.getSouth()]]] } };
      const fc = { type:'FeatureCollection', features:[poly] };
      const src = miniMap.getSource('viewbox'); if (src) src.setData(fc);
    } catch {}
  }
  function initCoordsReadout(){
    const el = document.getElementById('coords');
    if (!el) return;
    el.style.display = 'block';
    function update(){
      const c = map.getCenter();
      el.textContent = `${c.lng.toFixed(5)}, ${c.lat.toFixed(5)}`;
    }
    update();
    map.on('move', update);
    // Right click anywhere: copy clicked coordinates and remember point for AI
    map.on('contextmenu', async (e) => {
      try { e?.originalEvent?.preventDefault?.(); } catch {}
      const { lng, lat } = e.lngLat || map.getCenter();
      lastPoint = { lng, lat };
      const txt = `${lng.toFixed(6)}, ${lat.toFixed(6)}`;
      try {
        await navigator.clipboard.writeText(txt);
        showToast(`Copied: ${txt}`);
      } catch {
        showToast('Failed to copy');
      }
    });
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

  // Keyboard shortcuts
  document.addEventListener('keydown', (e)=>{
    const k = e.key.toLowerCase();
    if (k === '?'){ e.preventDefault(); const m = document.getElementById('shortcuts'); if (m) { m.style.display = (m.style.display==='flex'?'none':'flex'); if (m.style.display!=='none') m.style.display='flex'; } }
    if (k === 'f'){ if (moroccoBbox){ map.fitBounds([[moroccoBbox[0],moroccoBbox[1]],[moroccoBbox[2],moroccoBbox[3]]], { padding:24, duration:600 }); } }
    if (k === 'l'){ labelsToggleEl.checked = !labelsToggleEl.checked; labelsToggleEl.dispatchEvent(new Event('change')); }
    if (k === 'm'){ measureToggleEl.checked = !measureToggleEl.checked; measureToggleEl.dispatchEvent(new Event('change')); }
    if (k === 'r'){ maskOutsideEl.checked = !maskOutsideEl.checked; maskOutsideEl.dispatchEvent(new Event('change')); }
    if (k === '3'){ const el = document.getElementById('mode3D'); if (el){ el.checked = !el.checked; el.dispatchEvent(new Event('change')); } }
    if (k === 'g'){ darkThemeEl.checked = !darkThemeEl.checked; darkThemeEl.dispatchEvent(new Event('change')); }
  });

  // --- NASA + OpenRouter AI integration ---
  function yyyymmdd(d){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${y}${m}${dd}`;
  }
  function recentRange(days=365){
    const end = new Date();
    const start = new Date(end.getTime() - days*24*3600*1000);
    return { start: yyyymmdd(start), end: yyyymmdd(end) };
  }
  async function fetchNasaSummary(lon, lat){
    const { start, end } = recentRange(365);
    const params = ['PRECTOTCORR','T2M','T2M_MIN','T2M_MAX','RH2M','WS10M','ALLSKY_SFC_SW_DWN'];
    const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${encodeURIComponent(params.join(','))}&community=AG&longitude=${lon}&latitude=${lat}&start=${start}&end=${end}&format=JSON`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('NASA request failed');
    const data = await res.json();
    const p = data?.properties?.parameter || {};
    const keys = Object.keys(p[params[0]] || {});
    if (!keys.length) throw new Error('No NASA data');
    function meanOf(param){
      const obj = p[param] || {};
      const vals = keys.map(k => obj[k]).filter(v => Number.isFinite(v));
      if (!vals.length) return null;
      return vals.reduce((a,b)=>a+b,0)/vals.length;
    }
    function sumOf(param){
      const obj = p[param] || {};
      const vals = keys.map(k => obj[k]).filter(v => Number.isFinite(v));
      if (!vals.length) return null;
      return vals.reduce((a,b)=>a+b,0);
    }
    const totalPrecip = sumOf('PRECTOTCORR');
    const avgT = meanOf('T2M');
    const avgTmin = meanOf('T2M_MIN');
    const avgTmax = meanOf('T2M_MAX');
    const avgRH = meanOf('RH2M');
    const avgWind = meanOf('WS10M');
    const avgSolar = meanOf('ALLSKY_SFC_SW_DWN');
    // Dry days (< 1 mm)
    const dryDays = keys.reduce((acc,k)=> acc + ((p.PRECTOTCORR?.[k] ?? 0) < 1 ? 1 : 0), 0);
    return {
      lon:+(+lon).toFixed(4), lat:+(+lat).toFixed(4), start, end, days: keys.length,
      total_precip_mm: totalPrecip!=null? +totalPrecip.toFixed(1) : null,
      dry_days: dryDays,
      avg_temp_c: avgT!=null? +avgT.toFixed(1) : null,
      avg_temp_min_c: avgTmin!=null? +avgTmin.toFixed(1) : null,
      avg_temp_max_c: avgTmax!=null? +avgTmax.toFixed(1) : null,
      avg_rh_percent: avgRH!=null? +avgRH.toFixed(0) : null,
      avg_wind_mps: avgWind!=null? +avgWind.toFixed(1) : null,
      avg_solar_MJ_m2_day: avgSolar!=null? +avgSolar.toFixed(1) : null
    };
  }
  function buildAiPrompt(summary){
    const lines = [];
    lines.push(`Location: ${summary.lon}, ${summary.lat}`);
    lines.push(`Period: ${summary.start} to ${summary.end} (${summary.days} days)`);
    if (summary.total_precip_mm!=null) lines.push(`Total precipitation (mm): ${summary.total_precip_mm}`);
    if (summary.dry_days!=null) lines.push(`Dry days (<1mm): ${summary.dry_days}`);
    if (summary.avg_temp_c!=null) lines.push(`Avg T2M (°C): ${summary.avg_temp_c}`);
    if (summary.avg_temp_min_c!=null) lines.push(`Avg Tmin (°C): ${summary.avg_temp_min_c}`);
    if (summary.avg_temp_max_c!=null) lines.push(`Avg Tmax (°C): ${summary.avg_temp_max_c}`);
    if (summary.avg_rh_percent!=null) lines.push(`Avg RH (%): ${summary.avg_rh_percent}`);
    if (summary.avg_wind_mps!=null) lines.push(`Avg wind (m/s): ${summary.avg_wind_mps}`);
    if (summary.avg_solar_MJ_m2_day!=null) lines.push(`Avg solar (MJ/m²/day): ${summary.avg_solar_MJ_m2_day}`);
    const dataBlock = lines.join('\n');
    return `You are a hydrology and land degradation expert. Stay strictly on-topic.
Given the climate summary below for a place in Morocco, state the likely environmental problem(s) affecting this location.
- Focus on: water scarcity/drought, desertification/land degradation, heat stress, flood risk, wind erosion (only if supported by data).
- Be concise: 3–5 short bullet points, then one single-sentence recommendation.
- Do not add unrelated content, caveats, or external context.

Data:\n${dataBlock}`;
  }
  async function callOpenRouter(prompt){
    const apiKey = (aiKeyEl.value || localStorage.getItem('openrouter_key') || '').trim();
    if (!apiKey) throw new Error('Missing OpenRouter API key');
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'Morocco Water Analysis'
    };
    try {
      if (typeof location?.origin === 'string' && /^https?:\/\//.test(location.origin)){
        headers['HTTP-Referer'] = location.origin;
      }
    } catch {}
    async function requestOnce(maxTokens){
      const body = {
        model: 'openai/gpt-5-chat',
        max_tokens: maxTokens,
        temperature: 0.2,
        messages: [ { role: 'user', content: prompt } ]
      };
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', headers, body: JSON.stringify(body)
      });
      if (!res.ok){
        const status = res.status;
        let errText = '';
        try { errText = await res.text(); } catch {}
        const msg = `AI request failed (${status}) ${errText?.slice(0,200)}`;
        const e = new Error(msg); e.status = status; e.details = errText; throw e;
      }
      const json = await res.json();
      const text = json?.choices?.[0]?.message?.content || '';
      return text.trim();
    }
    try {
      return await requestOnce(400);
    } catch (e){
      // Retry with fewer tokens if credit/limit error (402)
      if (e?.status === 402){
        try { return await requestOnce(200); } catch {}
        throw new Error('Payment or token limit error. Try fewer tokens or add credits.');
      }
      throw e;
    }
  }
  function setAiOutput(msg){ aiOutputEl.textContent = msg || '—'; }

  // Wire AI button
  if (aiBtnEl){
    aiBtnEl.addEventListener('click', async ()=>{
      try {
        const c = lastPoint || map.getCenter();
        if (!c){ setAiOutput('Pick a point on the map.'); return; }
        showLoader('Fetching climate data...');
        const sum = await fetchNasaSummary(c.lng, c.lat);
        hideLoader();
        setAiOutput('Analyzing with AI...');
        // Persist key locally if provided
        try { if (aiKeyEl.value) localStorage.setItem('openrouter_key', aiKeyEl.value); } catch {}
        showLoader('Analyzing with AI...');
        const prompt = buildAiPrompt(sum);
        const ans = await callOpenRouter(prompt);
        hideLoader();
        setAiOutput(ans || 'No response');
      } catch (err){
        console.error(err);
        hideLoader();
        setAiOutput('Failed: ' + (err?.message || 'Unknown error'));
        showToast('AI analysis failed');
      }
    });
  }

  // Prefill AI key from localStorage if present
  try {
    const storedKey = localStorage.getItem('openrouter_key');
    if (storedKey && aiKeyEl) aiKeyEl.value = storedKey;
  } catch {}

  function updateSuggestions(q){
    q = (q || '').trim().toLowerCase();
    if (!q){ searchSuggestionsEl.style.display = 'none'; searchSuggestionsEl.innerHTML=''; return; }
    const matches = featureIndex.filter(it => it.name.includes(q)).slice(0, 12);
    if (!matches.length){ searchSuggestionsEl.style.display = 'none'; searchSuggestionsEl.innerHTML=''; return; }
    searchSuggestionsEl.innerHTML = matches.map(it => `<div class="item" data-idx="${it.idx}">${escapeHtml(it.name)}</div>`).join('');
    searchSuggestionsEl.style.display = 'block';
  }
  function escapeHtml(s){ return s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  // Preferences persistence
  function savePrefs(){
    try {
      const prefs = {
        dark: styleState.dark,
        palette: styleState.fillColor,
        fillOpacity: styleState.fillOpacity,
        strokeWidth: styleState.strokeWidth,
        baseLayer: styleState.baseLayer,
        labels: styleState.labels,
        panelOpen: document.body.classList.contains('panel-open'),
        fillHidden: styleState.fillHidden
      };
      localStorage.setItem('prefs', JSON.stringify(prefs));
    } catch {}
  }
  function loadPrefs(){
    try {
      const raw = localStorage.getItem('prefs');
      if (!raw) return;
      const p = JSON.parse(raw);
      styleState.dark = !!p.dark; darkThemeEl.checked = styleState.dark; document.documentElement.setAttribute('data-theme', styleState.dark ? 'dark' : '');
      styleState.fillColor = p.palette || styleState.fillColor; paletteEl.value = styleState.fillColor; map.setPaintProperty('ma-fill', 'fill-color', styleState.fillColor);
      styleState.fillOpacity = Number.isFinite(p.fillOpacity) ? p.fillOpacity : styleState.fillOpacity; opacityEl.value = styleState.fillOpacity; opacityValEl.textContent = styleState.fillOpacity.toFixed(2); map.setPaintProperty('ma-fill','fill-opacity', styleState.fillOpacity);
      styleState.strokeWidth = Number.isFinite(p.strokeWidth) ? p.strokeWidth : styleState.strokeWidth; strokeEl.value = styleState.strokeWidth; strokeValEl.textContent = styleState.strokeWidth.toFixed(2); map.setPaintProperty('ma-line','line-width', styleState.strokeWidth);
      styleState.baseLayer = p.baseLayer || 'none'; baseLayerEl.value = styleState.baseLayer; switchBaseLayer(styleState.baseLayer);
      styleState.labels = !!p.labels; labelsToggleEl.checked = styleState.labels; map.setLayoutProperty('ma-labels','visibility', styleState.labels ? 'visible' : 'none');
      styleState.fillHidden = !!p.fillHidden; fillHideEl.checked = styleState.fillHidden; map.setLayoutProperty('ma-fill', 'visibility', styleState.fillHidden ? 'none' : 'visible'); opacityEl.disabled = styleState.fillHidden;
      if (p.panelOpen){ document.body.classList.add('panel-open'); }
    } catch {}
  }

  // Boot
  initMap();
  // After map init, when style is ready, apply query coords if present
  (function waitForMap(){
    if (map && map.isStyleLoaded && map.isStyleLoaded()) { parseQueryCoords(); }
    else setTimeout(waitForMap, 120);
  })();

  // -------------- Single-page merge: AI dock + mini stats --------------
  // AI dock toggle wiring
  if (toggleAiDockBtn){ toggleAiDockBtn.addEventListener('click', ()=> aiDock.classList.toggle('open')); }
  if (closeAiDockBtn){ closeAiDockBtn.addEventListener('click', ()=> aiDock.classList.remove('open')); }
  // Prefill key
  try { const k = localStorage.getItem('openrouter_key'); if (k && aiDockKeyEl) aiDockKeyEl.value = k; } catch {}
  // AI dock analyze button
  if (aiDockAnalyzeEl){
    aiDockAnalyzeEl.addEventListener('click', async ()=>{
      try {
        const c = lastPoint || map.getCenter();
        if (!c){ aiDockOutputEl.textContent = 'Pick a point on the map.'; return; }
        showLoader('Fetching climate data...');
        const sum = await fetchNasaSummary(c.lng, c.lat);
        hideLoader();
        // Persist key
        try { if (aiDockKeyEl.value) localStorage.setItem('openrouter_key', aiDockKeyEl.value); } catch {}
        showLoader('Analyzing with AI...');
        const prompt = buildAiPrompt(sum);
        // Temporarily mirror key into main aiKeyEl for callOpenRouter reuse
        if (aiKeyEl && aiDockKeyEl) aiKeyEl.value = aiDockKeyEl.value;
        const ans = await callOpenRouter(prompt);
        hideLoader();
        aiDockOutputEl.textContent = ans || 'No response';
      } catch (err){ hideLoader(); aiDockOutputEl.textContent = 'Failed: ' + (err?.message||'Unknown'); showToast('AI analysis failed'); }
    });
  }

  // Mini stats: data fetch and render using Chart.js
  function setMiniProgress(frac){ try { miniProgressEl.style.width = Math.max(0, Math.min(1, frac))*100 + '%'; } catch {} }
  function showStatsMini(show){ statsMiniEl.classList.toggle('show', !!show); }
  function animateCount(el, to){ if (!el) return; const start = +el.textContent.replace(/[^0-9.\-]/g,'') || 0; const diff = to - start; const steps = 18; let i=0; const t = setInterval(()=>{ i++; el.textContent = (start + diff*(i/steps)).toFixed(0); if (i>=steps) { el.textContent = String(Math.round(to)); clearInterval(t); } }, 18); }

  async function fetchNasaDaily(lon, lat, startYear, endYear){
    const start = `${startYear}0101`; const end = `${endYear}1231`;
    const params = ['PRECTOTCORR','T2M'];
    const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${encodeURIComponent(params.join(','))}&community=AG&longitude=${lon}&latitude=${lat}&start=${start}&end=${end}&format=JSON`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('NASA daily request failed');
    const data = await res.json();
    const p = data?.properties?.parameter || {};
    const any = p['T2M'] || p['PRECTOTCORR'] || {};
    const days = Object.keys(any);
    return { params: p, days };
  }
  function aggregateYearly(daily){
    const out = { years:[], t2mAvg:[], precipSum:[], daysByYear:{} };
    const t2 = daily.params['T2M'] || {}; const pr = daily.params['PRECTOTCORR'] || {};
    const map = new Map();
    for (const d of daily.days){
      const y = d.slice(0,4);
      let e = map.get(y); if (!e){ e={ t:[], p:[] }; map.set(y,e); }
      const tv = t2[d];
      const pv = pr[d];
      // NASA missing/sentinel filtering and sanity bounds
      if (Number.isFinite(tv) && tv > -90 && tv < 70) e.t.push(tv);
      if (Number.isFinite(pv) && pv >= 0 && pv < 500) e.p.push(pv);
    }
    for (const [y,e] of Array.from(map.entries()).sort((a,b)=>a[0]-b[0])){
      const tAvg = e.t.length ? e.t.reduce((a,b)=>a+b,0)/e.t.length : null;
      const pSum = e.p.length ? e.p.reduce((a,b)=>a+b,0) : null;
      out.years.push(y); out.t2mAvg.push(tAvg!=null? +tAvg.toFixed(2): null); out.precipSum.push(pSum!=null? +pSum.toFixed(1): null); out.daysByYear[y] = e.t.length || e.p.length || 0;
    }
    return out;
  }
  function renderMiniChart(data){
    if (!miniChartCanvas) return; const ctx = miniChartCanvas.getContext('2d'); miniChartCanvas.style.height = '100px';
    const labels = data.years;
    const ds = [{ label:'Avg T (°C)', data: data.t2mAvg, borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,0.2)', tension:.35, fill:true, spanGaps:true, pointRadius:0 }];
    if (statsState.miniChart){ statsState.miniChart.data.labels = labels; statsState.miniChart.data.datasets = ds; statsState.miniChart.update(); return; }
    statsState.miniChart = new Chart(ctx, { type:'line', data:{ labels, datasets: ds }, options:{ responsive:true, maintainAspectRatio:false, animation:{ duration: 250 }, plugins:{ legend:{ display:false }, tooltip:{ enabled:true } }, scales:{ x:{ display:false }, y:{ display:false } } } });
  }
  function renderBigChart(data){
    if (!bigChartCanvas) return; const ctx = bigChartCanvas.getContext('2d');
    const labels = data.years;
    const ds = [
      { label:'Avg T (°C)', data: data.t2mAvg, borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,0.18)', tension:.35, fill:true, spanGaps:true },
      { label:'Total precip (mm)', data: data.precipSum, yAxisID:'y1', borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,0.18)', tension:.35, fill:true, spanGaps:true }
    ];
    const options = { responsive:true, maintainAspectRatio:false, interaction:{ mode:'index', intersect:false }, plugins:{ legend:{ position:'bottom' } }, scales:{ y:{ type:'linear', position:'left' }, y1:{ type:'linear', position:'right', grid:{ drawOnChartArea:false } } } };
    if (statsState.bigChart){ statsState.bigChart.data.labels = labels; statsState.bigChart.data.datasets = ds; statsState.bigChart.update(); return; }
    statsState.bigChart = new Chart(ctx, { type:'line', data:{ labels, datasets: ds }, options });
  }
  function buildCsv(data){
    const rows = [['year','avg_temp_c','total_precip_mm']];
    for (let i=0;i<data.years.length;i++){ rows.push([data.years[i], data.t2mAvg[i] ?? '', data.precipSum[i] ?? '']); }
    return rows.map(r => r.join(',')).join('\n');
  }
  // Helpers: sampling, concurrency, averaging
  function samplePointsInCircle(lng, lat, km, count=7){
    const pts = [[lng, lat]]; // center
    const r = Math.max(0.5, km) * 0.7; // 70% radius to stay inside
    for (let i=0;i<count-1;i++){
      const bearing = (360/(count-1))*i;
      const dest = turf.destination([lng,lat], r, bearing, { units:'kilometers' });
      pts.push(dest.geometry.coordinates);
    }
    return pts;
  }
  async function runWithConcurrency(items, worker, max=3, onProgress){
    let idx=0, done=0; const out = new Array(items.length);
    return await new Promise((resolve, reject)=>{
      let active=0, rejected=false;
      function next(){
        if (rejected) return;
        while(active<max && idx<items.length){
          const cur = idx++; const val = items[cur]; active++;
          Promise.resolve(worker(val, cur)).then(res=>{ out[cur]=res; done++; active--; if (onProgress) onProgress(done/items.length); (done===items.length)? resolve(out): next(); }).catch(err=>{ rejected=true; reject(err); });
        }
      }
      next();
    });
  }
  function averageYearlies(list){
    if (!list?.length) return null;
    // Build union of years
    const yearSet = new Set();
    list.forEach(a => a.years.forEach(y => yearSet.add(y)));
    const years = Array.from(yearSet).sort();
    const t2mAvg = []; const precipSum = []; const daysByYear = {};
    for (const y of years){
      let tSum=0, tCnt=0, pSum=0, pCnt=0, dCnt=0, dSamples=0;
      for (const a of list){
        const idx = a.years.indexOf(y);
        if (idx>=0){
          const t = a.t2mAvg[idx]; if (t!=null){ tSum+=t; tCnt++; }
          const p = a.precipSum[idx]; if (p!=null){ pSum+=p; pCnt++; }
          const d = a.daysByYear[y]; if (Number.isFinite(d)){ dCnt+=d; dSamples++; }
        }
      }
      t2mAvg.push(tCnt? +(tSum/tCnt).toFixed(2) : null);
      precipSum.push(pCnt? +(pSum/pCnt).toFixed(1) : null);
      daysByYear[y] = dSamples? Math.round(dCnt/dSamples) : 0;
    }
    return { years, t2mAvg, precipSum, daysByYear };
  }
  function scheduleStatsUpdate(lng, lat, km){
    const key = `${lng.toFixed(4)},${lat.toFixed(4)}:${Math.round(km)}`;
    statsState.lastKey = key;
    if (statsState.pending) return;
    statsState.pending = true;
    setMiniProgress(0.05);
    showStatsMini(true);
    kpiRadiusEl.textContent = String(Math.round(km));
    (async ()=>{
      try {
        const endYear = new Date().getFullYear();
        const startYear = Math.max(2005, endYear - 14); // last ~15y
        const pts = samplePointsInCircle(lng, lat, km, 7);
        const results = await runWithConcurrency(pts, async (coord)=>{
          const [x,y] = coord; const daily = await fetchNasaDaily(x, y, startYear, endYear); return aggregateYearly(daily);
        }, 3, (frac)=> setMiniProgress(0.05 + 0.9*frac));
        // Guard against stale
        if (key !== statsState.lastKey) return;
        const list = results.filter(Boolean);
        if (!list.length){ setMiniProgress(0); showToast('No climate data','warn'); return; }
        const agg = averageYearlies(list);
        if (!agg || !agg.years?.length){ setMiniProgress(0); showToast('No climate data','warn'); return; }
        statsState.series = agg;
        const totalDays = Object.values(agg.daysByYear).reduce((a,b)=>a+b,0);
        animateCount(kpiDaysEl, totalDays);
        kpiYearsEl.textContent = `${agg.years[0]}–${agg.years[agg.years.length-1]}`;
        renderMiniChart(agg);
        setMiniProgress(1);
      } catch (e){ console.error(e); showToast('Failed to load stats','error'); setMiniProgress(0); }
      finally { statsState.pending = false; }
    })();
  }
  // Mini card actions
  if (statsMiniCloseEl){ statsMiniCloseEl.addEventListener('click', ()=> showStatsMini(false)); }
  if (statsMiniExpandEl){ statsMiniExpandEl.addEventListener('click', ()=> { statsModalEl.style.display='flex'; if (statsState.series) renderBigChart(statsState.series); }); }
  if (statsModalCloseEl){ statsModalCloseEl.addEventListener('click', ()=> { statsModalEl.style.display='none'; }); }
  if (statsMiniCsvEl){ statsMiniCsvEl.addEventListener('click', ()=>{ try { if (!statsState.series) { showToast('No data','warn'); return; } const blob = new Blob([buildCsv(statsState.series)], { type:'text/csv' }); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='climate_stats.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000); } catch { showToast('Export failed','error'); } }); }
  if (statsMiniPngEl){ statsMiniPngEl.addEventListener('click', ()=>{ try { const c = statsState.miniChart?.canvas; if (!c) { showToast('No chart','warn'); return; } const a=document.createElement('a'); a.href=c.toDataURL('image/png'); a.download='climate_sparkline.png'; a.click(); } catch { showToast('PNG export failed','error'); } }); }
