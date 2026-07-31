// ============================================================
// app.js - Lógica completa de la aplicación
// (CON EL FILTRO DE TAMAÑO CORREGIDO)
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
  "use strict";

  // ============================================================
  // 1. DECLARACIONES Y UTILIDADES
  // ============================================================
  const DEBUG = false;
  const log = (...a) => { if (DEBUG) console.log(...a); };
  const warn = (...a) => { if (DEBUG) console.warn(...a); };

  function toast(msg, tipo, duracionMs) {
    tipo = tipo || 'info';
    duracionMs = duracionMs || 3500;
    const cont = document.getElementById('toastContainer');
    if (!cont) { console.warn(msg); return; }
    const icono = tipo === 'error' ? 'fa-circle-exclamation' : tipo === 'success' ? 'fa-circle-check' : 'fa-circle-info';
    const el = document.createElement('div');
    el.className = 'toast toast-' + tipo;
    el.innerHTML = '<i class="fas ' + icono + '"></i><span></span>';
    el.querySelector('span').textContent = msg;
    cont.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, duracionMs);
  }

  function leerArrayGuardado(raw) {
    if (!raw) return null;
    const i = raw.indexOf('=');
    if (i === -1) return null;
    let json = raw.slice(i + 1).trim();
    if (json.endsWith(';')) json = json.slice(0, -1);
    try { return JSON.parse(json); } catch (e) { return null; }
  }

  function normalizarTexto(str) {
    return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  const ANCLA_MORELIA  = { nombre: "Morelia",  lat: 19.70480534245386, lon: -101.24479193126763, color: '#004D99' };
  const ANCLA_TOTOTLAN = { nombre: "Tototlán", lat: 20.534806, lon: -102.782470, color: '#FF6B35' };
  const ANCLAS = [ANCLA_MORELIA, ANCLA_TOTOTLAN];
  const ANCLA = ANCLA_MORELIA;

  function distanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371, rad = Math.PI/180;
    const dLat = (lat2-lat1)*rad, dLon = (lon2-lon1)*rad;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.sqrt(a));
  }

  function deduplicate(data) {
    const seen = new Set();
    return data.filter(e => {
      const latRound = Math.round(e.lat * 1e5) / 1e5;
      const lonRound = Math.round(e.lon * 1e5) / 1e5;
      const key = `${latRound}|${lonRound}|${e.nombre.trim()}`;
      if (!seen.has(key)) { seen.add(key); return true; }
      return false;
    });
  }

  function getDistRange(km) {
    if (km <= 50) return { label: '0 – 50 km',   key: 'very-low', color: '#10b981' };
    if (km <= 100) return { label: '50 – 100 km', key: 'low',     color: '#34d399' };
    if (km <= 150) return { label: '100 – 150 km', key: 'mid',    color: '#fbbf24' };
    if (km <= 190) return { label: '150 – 190 km', key: 'high',   color: '#fb923c' };
    return { label: '> 190 km', key: 'no-price', color: '#94a3b8' };
  }

  // ============================================================
  // 2. CARGA DE CLIENTES
  // ============================================================
  let rawClientes = Array.isArray(window.CLIENTES_POTENCIALES) ? window.CLIENTES_POTENCIALES : [];

  const clientesGuardado = localStorage.getItem('CLIENTES_JS');
  if (clientesGuardado) {
    const arr = leerArrayGuardado(clientesGuardado);
    if (arr && Array.isArray(arr)) {
      rawClientes = arr;
      log('Clientes cargados desde localStorage');
    } else {
      warn('CLIENTES_JS no se pudo interpretar; se usa ClientesPotenciales.js');
    }
  }

  function actualizarEstadoCarga(n, porAncla) {
    const el = document.getElementById('statusText');
    if (!el) return;
    if (!n) {
      el.textContent = '⚠️ No se detectó ningún cliente. Revisa que ClientesPotenciales.js esté junto al index.html';
    } else {
      el.textContent = `✅ ${n.toLocaleString()} clientes · más cerca de Morelia: ${porAncla.morelia.toLocaleString()} · de Tototlán: ${porAncla.tototlan.toLocaleString()}`;
    }
  }

  function enriquecer(lista) {
    for (const s of lista) {
      const dM = distanciaKm(ANCLA_MORELIA.lat,  ANCLA_MORELIA.lon,  s.lat, s.lon);
      const dT = distanciaKm(ANCLA_TOTOTLAN.lat, ANCLA_TOTOTLAN.lon, s.lat, s.lon);
      s.distMorelia  = dM;
      s.distTototlan = dT;
      s.ancla  = dM <= dT ? 'Morelia' : 'Tototlán';
      s.origen = dM <= dT ? 'morelia' : 'tototlan';
      s.distKm = Math.min(dM, dT);
      const r = getDistRange(s.distKm);
      s.priceKey = r.key;
      s.priceColor = r.color;
      s.priceLabel = r.label;
      s.direccion = s.direccion || '';
      s.estado = s.estado || '';
      s.tamano = s.tamano || '';
      s.telefono = s.telefono || '';
    }
    return lista;
  }

  function filtrarPorRadio190(lista) {
    return lista.filter(s => s.distMorelia <= 190 || s.distTototlan <= 190);
  }

  let stations = filtrarPorRadio190(enriquecer(deduplicate(rawClientes)));

  function contarPorAncla(lista) {
    let morelia = 0, tototlan = 0;
    for (const s of lista) (s.origen === 'morelia' ? morelia++ : tototlan++);
    return { morelia, tototlan };
  }
  actualizarEstadoCarga(stations.length, contarPorAncla(stations));
  log(`Clientes tras filtro geográfico: ${stations.length}`);

  // ============================================================
  // 3. MAPA, CÍRCULOS, CLUSTER, ANCLAS, ICONOS
  // ============================================================
  const map = L.map('map', { zoomControl: true });

  const ANCLAS_BOUNDS = L.latLngBounds(ANCLAS.map(a => [a.lat, a.lon]));
  function verAmbasAnclas(animar) {
    map.flyToBounds(ANCLAS_BOUNDS, { padding: [80, 80], maxZoom: 9, duration: animar === false ? 0 : 1 });
  }
  map.fitBounds(ANCLAS_BOUNDS, { padding: [80, 80], maxZoom: 9 });

  const baseLayers = {
    "Calles": L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap · © CARTO', subdomains: 'abcd', maxZoom: 19
    }),
    "Satélite": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles © Esri', maxZoom: 19
    }),
    "Oscuro": L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap · © CARTO', subdomains: 'abcd', maxZoom: 19
    })
  };
  baseLayers["Calles"].addTo(map);
  L.control.layers(baseLayers).addTo(map);
  L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(map);

  const circulosLayer = L.layerGroup().addTo(map);
  const circulos = {};
  function crearCirculo(ancla, radioKm, color) {
    return L.circle([ancla.lat, ancla.lon], {
      radius: radioKm * 1000, color: color, fillColor: color,
      fillOpacity: radioKm === 150 ? 0.08 : 0.06, weight: 2, dashArray: '6 6', opacity: 0.7
    }).bindPopup(`${radioKm} km desde ${ancla.nombre}`);
  }
  [['Morelia', ANCLA_MORELIA], ['Tototlan', ANCLA_TOTOTLAN]].forEach(([suf, a]) => {
    circulos['150' + suf] = { capa: crearCirculo(a, 150, '#10b981'), visible: false };
    circulos['190' + suf] = { capa: crearCirculo(a, 190, '#ef4444'), visible: false };
  });

  let activeCircleFilters = new Set();
  let miUbicacionCoords = null;

  function datosCirculo(id) {
    if (id === 'cercaDeMi') {
      return { centro: { lat: miUbicacionCoords.lat, lon: miUbicacionCoords.lon, nombre: 'tu ubicación' }, radio: 1 };
    }
    const centro = id.includes('Morelia') ? ANCLA_MORELIA : ANCLA_TOTOTLAN;
    const radio = parseInt(id, 10);
    return { centro, radio };
  }

  function actualizarCirculoCercaDeMi(lat, lon) {
    const yaVisible = circulos.cercaDeMi ? circulos.cercaDeMi.visible : false;
    if (circulos.cercaDeMi && yaVisible) circulosLayer.removeLayer(circulos.cercaDeMi.capa);
    const capa = L.circle([lat, lon], {
      radius: 1000, color: '#38bdf8', fillColor: '#38bdf8',
      fillOpacity: 0.1, weight: 2, dashArray: '6 6', opacity: 0.8
    }).bindPopup('1 km alrededor de tu ubicación');
    circulos.cercaDeMi = { capa, visible: false };
    if (yaVisible) { circulosLayer.addLayer(capa); circulos.cercaDeMi.visible = true; }
  }

  function actualizarEtiquetaCirculos() {
    const label = document.getElementById('circulosLabel');
    const btn = document.getElementById('circulosToggleBtn');
    const badge = document.getElementById('circulosBadge');
    const n = activeCircleFilters.size;
    if (btn) {
      btn.classList.toggle('is-empty', n === 0);
      btn.classList.toggle('is-active', n > 0);
    }
    if (badge) {
      if (n > 1) { badge.hidden = false; badge.textContent = n; }
      else { badge.hidden = true; }
    }
    if (!label) return;
    if (n === 0) { label.textContent = 'Círculos de radio'; return; }
    if (n === 1) {
      const id = [...activeCircleFilters][0];
      const { centro, radio } = datosCirculo(id);
      label.textContent = `${radio} km · ${centro.nombre}`;
      return;
    }
    label.textContent = 'Círculos activos';
  }

  function activarCirculoId(id) {
    const c = circulos[id];
    if (!c || activeCircleFilters.has(id)) return;
    activeCircleFilters.add(id);
    circulosLayer.addLayer(c.capa);
    c.visible = true;
    const btn = document.getElementById('btnCirculo' + id);
    if (btn) btn.classList.add('active');
  }

  function desactivarCirculoId(id) {
    const c = circulos[id];
    if (!c || !activeCircleFilters.has(id)) return;
    activeCircleFilters.delete(id);
    circulosLayer.removeLayer(c.capa);
    c.visible = false;
    const btn = document.getElementById('btnCirculo' + id);
    if (btn) btn.classList.remove('active');
  }

  function toggleCirculo(id) {
    const c = circulos[id];
    if (!c) return;

    if (activeCircleFilters.has(id)) {
      desactivarCirculoId(id);
      actualizarEtiquetaCirculos();
      const visibles = applyFilters();
      if (activeCircleFilters.size) encuadrarClientes(visibles);
      else verAmbasAnclas();
      return;
    }

    activarCirculoId(id);
    actualizarEtiquetaCirculos();
    const visibles = applyFilters();
    encuadrarClientes(visibles);
  }

  function activarAncla(centro) {
    const id = '190' + (centro === 'morelia' ? 'Morelia' : 'Tototlan');
    toggleCirculo(id);
  }

  function activarCercaDeMi() {
    if (!miUbicacionCoords) return;
    [...activeCircleFilters].forEach(id => desactivarCirculoId(id));
    activarCirculoId('cercaDeMi');
    actualizarEtiquetaCirculos();
    const visibles = applyFilters();
    map.flyTo([miUbicacionCoords.lat, miUbicacionCoords.lon], 15, { duration: 1.2 });
    toast(
      visibles.length
        ? `${visibles.length} cliente(s) a menos de 1 km de tu ubicación.`
        : 'No hay clientes a menos de 1 km de tu ubicación.',
      visibles.length ? 'success' : 'info'
    );
  }

  function toggleCercaDeMi() {
    if (!miUbicacionCoords) return;
    if (!activeCircleFilters.has('cercaDeMi')) { activarCercaDeMi(); return; }

    desactivarCirculoId('cercaDeMi');

    const dM = distanciaKm(miUbicacionCoords.lat, miUbicacionCoords.lon, ANCLA_MORELIA.lat,  ANCLA_MORELIA.lon);
    const dT = distanciaKm(miUbicacionCoords.lat, miUbicacionCoords.lon, ANCLA_TOTOTLAN.lat, ANCLA_TOTOTLAN.lon);

    const enRango = [];
    if (dM <= 190) enRango.push({ ancla: 'Morelia',  dist: dM });
    if (dT <= 190) enRango.push({ ancla: 'Tototlan', dist: dT });
    enRango.sort((a, b) => a.dist - b.dist);

    if (enRango.length) {
      const elegido = enRango[0];
      const radio = elegido.dist <= 150 ? '150' : '190';
      activarCirculoId(radio + elegido.ancla);
      actualizarEtiquetaCirculos();
      const visibles = applyFilters();
      encuadrarClientes(visibles);
      const nombre = elegido.ancla === 'Morelia' ? 'Morelia' : 'Tototlán';
      toast(`Dentro del rango de ${radio} km · ${nombre}: ${visibles.length.toLocaleString()} cliente(s).`, 'info');
    } else {
      activarCirculoId('190Morelia');
      activarCirculoId('190Tototlan');
      actualizarEtiquetaCirculos();
      const visibles = applyFilters();
      if (activeCircleFilters.size) encuadrarClientes(visibles); else verAmbasAnclas();
      toast(`Estás fuera del alcance de ambas anclas. Mostrando todos (${visibles.length.toLocaleString()}).`, 'info');
    }
  }

  const cluster = L.markerClusterGroup({
    chunkedLoading: true,
    removeOutsideVisibleBounds: true,
    maxClusterRadius: 50,
    iconCreateFunction: function(c) {
      const n = c.getChildCount();
      const size = n < 10 ? 44 : n < 50 ? 52 : 60;
      const fontSize = n < 100 ? 16 : 14;
      return L.divIcon({
        html: `<div class="cluster-bubble" style="width:${size}px;height:${size}px;font-size:${fontSize}px;">${n}</div>`,
        className: 'my-cluster',
        iconSize: [size, size]
      });
    },
    zoomToBoundsOnClick: true,
    spiderfyOnMaxZoom: true
  });
  map.addLayer(cluster);
  const markerMap = new Map();

  function anclaIcon(ancla) {
    const color = ancla.color;
    const filtroId = 'anclaShadow-' + (ancla.nombre === 'Morelia' ? 'morelia' : 'tototlan');
    const destello = 'M0,-7 Q3.2,0 0,9 Q-3.2,0 0,-7 Z';
    const svg = `
      <svg width="56" height="56" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="${filtroId}" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.35"/>
          </filter>
        </defs>
        <g filter="url(#${filtroId})">
          <path d="${destello}" fill="${color}" opacity="0.55" transform="translate(49.68,14.32) rotate(45)"/>
          <path d="${destello}" fill="${color}" opacity="0.55" transform="translate(14.32,14.32) rotate(-45)"/>
          <path d="${destello}" fill="${color}" opacity="0.55" transform="translate(49.68,49.68) rotate(135)"/>
          <path d="${destello}" fill="${color}" opacity="0.55" transform="translate(14.32,49.68) rotate(225)"/>
          <path d="M32.00,15.00 L36.11,26.34 L48.17,26.75 L38.66,34.16 L41.99,45.75 L32.00,39.00 L22.01,45.75 L25.34,34.16 L15.83,26.75 L27.89,26.34 Z"
                fill="${color}" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
        </g>
      </svg>
    `;
    return L.divIcon({
      className: '',
      html: svg,
      iconSize: [56, 56],
      iconAnchor: [28, 28]
    });
  }

  ANCLAS.forEach(a => {
    const centro = a === ANCLA_MORELIA ? 'morelia' : 'tototlan';
    L.marker([a.lat, a.lon], {
      icon: anclaIcon(a),
      zIndexOffset: 1000,
      title: a.nombre
    }).addTo(map).bindPopup(
      `<strong style="color:${a.color};">⭐ ${a.nombre}</strong><br>` +
      `<span style="font-size:.8rem;color:#64748b;">Ancla de referencia para distancias</span>`
    ).on('click', () => activarAncla(centro));
  });

  const iconCache = new Map();
  
  function pinSVG(color, ringColor, resaltado) {
    if (resaltado) {
      return `<svg width="40" height="52" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 4px 8px rgba(0,0,0,0.4));">
        <circle cx="20" cy="20" r="12.5" fill="none" stroke="var(--bg-panel)" stroke-width="4" style="filter:drop-shadow(0 0 8px rgba(0,0,0,0.5));"/>
        <circle cx="20" cy="20" r="11" fill="none" stroke="${color}" stroke-width="2" opacity="0.5"/>
        <path d="M20 2 C12.27 2 6 8.27 6 16 C6 26.5 20 42 20 42 S34 26.5 34 16 C34 8.27 27.73 2 20 2 Z" fill="${color}" stroke="var(--bg-panel)" stroke-width="2"/>
        ${ringColor ? `<circle cx="20" cy="20" r="10" fill="none" stroke="${ringColor}" stroke-width="2.4" opacity="0.95"/>` : ''}
        <circle cx="20" cy="20" r="6" fill="var(--bg-panel)" stroke="var(--border)" stroke-width="1.2"/>
      </svg>`;
    }
    const ring = ringColor
      ? `<circle cx="14" cy="14" r="7.5" fill="none" stroke="var(--text-main)" stroke-width="2.2" opacity="0.95"/>`
      : '';
    return `<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 5px rgba(0,0,0,0.28));">
      <path d="M15 1 C7.27 1 1 7.27 1 15 C1 25.5 15 41 15 41 S29 25.5 29 15 C29 7.27 22.73 1 15 1 Z" fill="${color}" stroke="var(--border)" stroke-width="1.3"/>
      ${ring}
      <circle cx="15" cy="15" r="4.5" fill="var(--bg-panel)" stroke="var(--border)" stroke-width="1"/>
    </svg>`;
  }

  function iconoPin(color, ringColor, resaltado) {
    const key = color + '|' + (ringColor || '') + '|' + (resaltado ? 'hl' : '');
    let ic = iconCache.get(key);
    if (!ic) {
      const size = resaltado ? [40, 52] : [30, 42];
      const anchor = resaltado ? [20, 52] : [15, 42];
      ic = L.divIcon({
        className: resaltado ? 'marker-pop-in marker-resaltado' : 'marker-pop-in',
        html: pinSVG(color, ringColor, resaltado),
        iconSize: size, iconAnchor: anchor, popupAnchor: [0, -size[1] + 6]
      });
      iconCache.set(key, ic);
    }
    return ic;
  }

  function colorPorTamano(s) {
    const raw = (s && s.tamano) ? String(s.tamano).toLowerCase() : '';
    if (!raw)                                   return null;
    if (/grande|industri/.test(raw))            return '#ef4444';
    if (/mediana|parque industrial|central/.test(raw)) return '#f59e0b';
    if (/pequeñ|micro|base/.test(raw))          return '#10b981';
    return null;
  }

  function iconoCombiSVG() {
    return `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 4px rgba(0,0,0,0.2));">
      <rect x="4" y="12" width="20" height="12" rx="2" fill="#f59e0b" stroke="var(--border)" stroke-width="1"/>
      <path d="M4 14 L10 7 L18 7 L24 14 Z" fill="#f59e0b" stroke="var(--border)" stroke-width="1"/>
      <rect x="11" y="8" width="3" height="4" fill="var(--bg-panel)" stroke="var(--border)" stroke-width="0.5"/>
      <rect x="15" y="8" width="3" height="4" fill="var(--bg-panel)" stroke="var(--border)" stroke-width="0.5"/>
      <circle cx="8" cy="26" r="3" fill="var(--text-main)" stroke="var(--border)" stroke-width="1"/>
      <circle cx="20" cy="26" r="3" fill="var(--text-main)" stroke="var(--border)" stroke-width="1"/>
    </svg>`;
  }
  function iconoTaxiSVG() {
    return `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 4px rgba(0,0,0,0.2));">
      <rect x="3" y="15" width="22" height="10" rx="3" fill="#facc15" stroke="var(--border)" stroke-width="1"/>
      <path d="M5 15 L7 10 L21 10 L23 15 Z" fill="#facc15" stroke="var(--border)" stroke-width="1"/>
      <rect x="8" y="11" width="4" height="3" fill="var(--bg-panel)" stroke="var(--border)" stroke-width="0.5"/>
      <rect x="15" y="11" width="4" height="3" fill="var(--bg-panel)" stroke="var(--border)" stroke-width="0.5"/>
      <rect x="11" y="7" width="6" height="3" rx="1" fill="#facc15" stroke="var(--border)" stroke-width="0.5"/>
      <text x="14" y="9.5" font-size="2.5" font-family="sans-serif" font-weight="bold" fill="var(--text-main)" text-anchor="middle">TAXI</text>
      <circle cx="8" cy="27" r="3" fill="var(--text-main)" stroke="var(--border)" stroke-width="1"/>
      <circle cx="20" cy="27" r="3" fill="var(--text-main)" stroke="var(--border)" stroke-width="1"/>
    </svg>`;
  }
  function iconoParqueIndustrialSVG() {
    return `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 4px rgba(0,0,0,0.2));">
      <rect x="4" y="14" width="20" height="14" fill="#3b82f6" stroke="var(--border)" stroke-width="1"/>
      <path d="M2 14 L14 4 L26 14 Z" fill="#3b82f6" stroke="var(--border)" stroke-width="1"/>
      <rect x="18" y="5" width="4" height="8" fill="var(--text-muted)" stroke="var(--border)" stroke-width="1"/>
      <rect x="17" y="3" width="6" height="2" fill="var(--text-muted)" stroke="var(--border)" stroke-width="1"/>
      <rect x="8" y="18" width="4" height="4" fill="var(--bg-panel)" stroke="var(--border)" stroke-width="0.5"/>
      <rect x="16" y="18" width="4" height="4" fill="var(--bg-panel)" stroke="var(--border)" stroke-width="0.5"/>
      <rect x="11" y="24" width="6" height="4" fill="var(--primary)" stroke="var(--border)" stroke-width="0.5"/>
    </svg>`;
  }
  const CAT_COMBI = 'Base de Combis';
  const CAT_TAXI  = 'Estaciones de Taxis';
  window.CAT_COMBI = CAT_COMBI;
  window.CAT_TAXI  = CAT_TAXI;

  function categoriaEspecial(s) {
    const t = normalizarTexto(s.tamano || '');
    const n = normalizarTexto(s.nombre || '');
    if (t === 'base de combis' || n.includes('combis')) return 'combi';
    if (t.includes('taxi') || n.includes('taxi')) return 'taxi';
    if (t === 'parque industrial' || n.includes('parque industrial')) return 'industrial';
    return null;
  }

  function obtenerIconoEspecial(s) {
    const divIcon = html => L.divIcon({ className: '', html, iconSize: [28,40], iconAnchor: [14,40], popupAnchor: [0,-37] });
    switch (categoriaEspecial(s)) {
      case 'combi':      return divIcon(iconoCombiSVG());
      case 'taxi':       return divIcon(iconoTaxiSVG());
      case 'industrial': return divIcon(iconoParqueIndustrialSVG());
      default:           return null;
    }
  }

  // ============================================================
  // 🚀 Lógica de resaltado de pines
  // ============================================================
  let marcadorResaltado = null;

  function limpiarResaltado() {
    if (marcadorResaltado) {
      if (marcadorResaltado._iconoOriginal) {
        marcadorResaltado.setIcon(marcadorResaltado._iconoOriginal);
      }
      marcadorResaltado = null;
    }
  }

  function resaltarMarcador(marker, cliente) {
    limpiarResaltado();
    if (!marker || !cliente) return;
    if (!marker._iconoOriginal) {
      marker._iconoOriginal = marker.getIcon();
    }
    const color = cliente._matchColor || cliente.priceColor || '#1F5CA9';
    const ringColor = colorPorTamano(cliente);
    const iconoResaltado = iconoPin(color, ringColor, true);
    marker.setIcon(iconoResaltado);
    marcadorResaltado = marker;
  }

  // ============================================================
  // 4. TARJETA LATERAL Y DETALLE DE CLIENTE
  // ============================================================
  let clienteEnEdicion = null;

  function abrirDetalle(cliente) {
    if (!cliente) return;
    const entry = markerMap.get(cliente);
    if (entry) {
      resaltarMarcador(entry.marker, cliente);
    }
    const d = cliente._matchDist < 10 ? cliente._matchDist.toFixed(1) : Math.round(cliente._matchDist || 0);
    const esM = cliente._matchAncla === 'Morelia';
    const dcHead = document.querySelector('.dc-head');
    dcHead.style.setProperty('--dc-a', esM ? '#004D99' : '#F97316');
    dcHead.style.setProperty('--dc-b', esM ? '#1F5CA9' : '#FF6B35');
    const emoji = (function(){
      const t = (cliente.tamano||'').toLowerCase();
      if (/taxi/.test(t))           return '🚕';
      if (/combi/.test(t))          return '🚐';
      if (/industr|parque/.test(t)) return '🏭';
      if (/grande/.test(t))         return '🏢';
      return '📍';
    })();
    document.getElementById('dcBadge').textContent = emoji + ' ' + (cliente.tamano || 'Cliente');
    document.getElementById('dcTitle').textContent = cliente.nombre || 'Sin nombre';
    document.getElementById('dcSubtitle').innerHTML = '<i class="fas fa-map-marker-alt"></i> ' + (cliente.estado || 'Sin estado');
    document.getElementById('dcBody').innerHTML = `
      <div class="dc-stat-row">
        <div class="dc-stat"><div class="lbl">Distancia</div><div class="val">${d}<small>km</small></div></div>
        <div class="dc-stat"><div class="lbl">Ancla</div><div class="val" style="font-size:0.9rem;">${cliente._matchAncla || '—'}</div></div>
      </div>
      <div class="dc-stat-row">
        <div class="dc-stat"><div class="lbl">A Morelia</div><div class="val">${Math.round(cliente.distMorelia)}<small>km</small></div></div>
        <div class="dc-stat"><div class="lbl">A Tototlán</div><div class="val">${Math.round(cliente.distTototlan)}<small>km</small></div></div>
      </div>
      ${cliente.direccion ? `<div class="dc-field"><i class="fas fa-location-dot"></i> ${cliente.direccion}</div>` : ''}
      ${cliente.telefono  ? `<div class="dc-field"><i class="fas fa-phone"></i> ${cliente.telefono}</div>` : ''}
      <div class="dc-field subtle"><i class="fas fa-hashtag"></i> Coords: ${cliente.lat.toFixed(5)}, ${cliente.lon.toFixed(5)}</div>
    `;
    const sinDir = !cliente.direccion;
    document.getElementById('dcActions').innerHTML = `
      <a class="popup-btn btn-maps" href="https://www.google.com/maps?q=${cliente.lat},${cliente.lon}" target="_blank">🗺️ Maps</a>
      <button class="popup-btn btn-route" data-lat="${cliente.lat}" data-lon="${cliente.lon}">🚗 Ruta</button>
      <button class="popup-btn btn-route-prospeccion wide" data-lat="${cliente.lat}" data-lon="${cliente.lon}">🧭 Prospección</button>
      ${sinDir ? `<button class="popup-btn btn-geocode wide" data-lat="${cliente.lat}" data-lon="${cliente.lon}" data-nombre="${cliente.nombre}">📍 Obtener dirección</button>` : ''}
      <button class="popup-btn btn-edit-client wide" data-lat="${cliente.lat}" data-lon="${cliente.lon}" data-nombre="${cliente.nombre}">✏️ Editar cliente</button>
      <button class="popup-btn btn-delete-client wide" data-lat="${cliente.lat}" data-lon="${cliente.lon}" data-nombre="${cliente.nombre}">🗑️ Eliminar cliente</button>
    `;
    document.getElementById('detailCard').classList.add('open');
    document.getElementById('detailCard').setAttribute('aria-hidden', 'false');
    clienteEnEdicion = cliente;
  }

  function cerrarDetalle() {
    limpiarResaltado();
    document.getElementById('detailCard').classList.remove('open');
    document.getElementById('detailCard').setAttribute('aria-hidden', 'true');
  }
  document.getElementById('dcClose').addEventListener('click', cerrarDetalle);

  map.on('click', function(e) {
    if (!addingClientMode && !addingPinMode) {
      limpiarResaltado();
      cerrarDetalle();
    }
  });

  // ============================================================
  // 5. EDICIÓN DE CLIENTES
  // ============================================================
  const editModalOverlay = document.getElementById('editClientModalOverlay');
  const editNombre = document.getElementById('editNombre');
  const editEstado = document.getElementById('editEstado');
  const editTamano = document.getElementById('editTamano');
  const editDireccion = document.getElementById('editDireccion');
  const editTelefono = document.getElementById('editTelefono');
  const editLat = document.getElementById('editLat');
  const editLon = document.getElementById('editLon');

  function abrirModalEditarCliente(cliente) {
    if (!cliente) return;
    clienteEnEdicion = cliente;
    editNombre.value = cliente.nombre || '';
    editEstado.value = cliente.estado || '';
    editTamano.value = cliente.tamano || '';
    editDireccion.value = cliente.direccion || '';
    editTelefono.value = cliente.telefono || '';
    editLat.value = cliente.lat.toFixed(6);
    editLon.value = cliente.lon.toFixed(6);
    document.getElementById('editClientTitle').textContent = '✏️ Editar cliente';
    editModalOverlay.classList.add('open');
  }

  function cerrarModalEditar() {
    editModalOverlay.classList.remove('open');
    clienteEnEdicion = null;
  }

  document.getElementById('editCancelBtn').addEventListener('click', cerrarModalEditar);
  document.getElementById('editSaveBtn').addEventListener('click', function() {
    if (!clienteEnEdicion) return;
    const nombre = editNombre.value.trim();
    if (!nombre) { toast('El nombre es obligatorio.', 'error'); return; }
    const lat = parseFloat(editLat.value.trim());
    const lon = parseFloat(editLon.value.trim());
    if (isNaN(lat) || isNaN(lon)) { toast('Coordenadas inválidas.', 'error'); return; }

    clienteEnEdicion.nombre = nombre;
    clienteEnEdicion.estado = editEstado.value.trim();
    clienteEnEdicion.tamano = editTamano.value.trim();
    clienteEnEdicion.direccion = editDireccion.value.trim();
    clienteEnEdicion.telefono = editTelefono.value.trim();
    clienteEnEdicion.lat = Math.round(lat * 1e6) / 1e6;
    clienteEnEdicion.lon = Math.round(lon * 1e6) / 1e6;
    enriquecer([clienteEnEdicion]);

    try {
      localStorage.setItem('CLIENTES_JS', `window.CLIENTES_POTENCIALES = ${JSON.stringify(stations)};`);
      localStorage.setItem('CLIENTES_ACTUALIZADO', Date.now().toString());
    } catch (e) { if(e.name === 'QuotaExceededError') toast('Almacenamiento lleno, no se pudo guardar.', 'error'); }

    reconstruirMarcadoresClientes();
    actualizarSelectTamano();
    applyFilters();
    cerrarModalEditar();
    toast('Cliente actualizado correctamente.', 'success');
    if (document.getElementById('detailCard').classList.contains('open')) {
      abrirDetalle(clienteEnEdicion);
    }
  });

  document.addEventListener('click', function(e) {
    const btn = e.target.closest('.btn-edit-client');
    if (btn) {
      const lat = parseFloat(btn.dataset.lat);
      const lon = parseFloat(btn.dataset.lon);
      const nombre = btn.dataset.nombre;
      const cliente = stations.find(s => s.lat === lat && s.lon === lon && s.nombre === nombre);
      if (cliente) abrirModalEditarCliente(cliente);
    }
  });

  // ============================================================
  // 6. RECONSTRUIR MARCADORES
  // ============================================================
  function reconstruirMarcadoresClientes() {
    cluster.clearLayers();
    markerMap.clear();
    stations.forEach(s => {
      const iconoEspecial = obtenerIconoEspecial(s);
      const iconoNormal = iconoEspecial || iconoPin(s.priceColor, colorPorTamano(s), false);
      const marker = L.marker([s.lat, s.lon], {
        icon: iconoNormal,
        title: s.nombre
      });
      marker._iconoOriginal = iconoNormal;
      marker.on('click', function() {
        abrirDetalle(s);
      });
      marker.data = s;
      markerMap.set(s, { marker, data: s });
    });
    document.getElementById('rTotal').textContent = stations.length;
    log(`Marcadores reconstruidos: ${stations.length}`);
  }

  // ============================================================
  // 7. RUTAS Y NAVEGACIÓN
  // ============================================================
  let rutaLayer = null;
  let rutaMarcador = null;
  let rutaActiva = false;

  async function calcularRuta(origenLat, origenLon, destinoLat, destinoLon) {
    const url = `https://router.project-osrm.org/route/v1/driving/${origenLon},${origenLat};${destinoLon},${destinoLat}?overview=full&geometries=geojson`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('Error en OSRM');
      const data = await resp.json();
      if (data.code !== 'Ok') throw new Error('Ruta no encontrada');
      const ruta = data.routes[0];
      return { distanciaKm: ruta.distance / 1000, duracionMin: ruta.duration / 60, geometria: ruta.geometry.coordinates };
    } catch (e) { console.error('Error calculando ruta:', e); return null; }
  }

  function limpiarRuta() {
    if (rutaLayer) { map.removeLayer(rutaLayer); rutaLayer = null; }
    if (rutaMarcador) { map.removeLayer(rutaMarcador); rutaMarcador = null; }
    if (rutaActiva) {
      rutaActiva = false;
      if (!map.hasLayer(cluster)) map.addLayer(cluster);
      activeCircleFilters.forEach(id => {
        const c = circulos[id];
        if (c && c.visible && !map.hasLayer(c.capa)) map.addLayer(c.capa);
      });
      applyFilters();
      map.invalidateSize();
    } else {
      if (!map.hasLayer(cluster)) map.addLayer(cluster);
      activeCircleFilters.forEach(id => {
        const c = circulos[id];
        if (c && c.visible && !map.hasLayer(c.capa)) map.addLayer(c.capa);
      });
      applyFilters();
    }
  }

  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('btn-route')) {
      const lat = parseFloat(e.target.dataset.lat);
      const lon = parseFloat(e.target.dataset.lon);
      mostrarRuta(lat, lon);
    } else if (e.target.classList.contains('btn-route-prospeccion')) {
      const lat = parseFloat(e.target.dataset.lat);
      const lon = parseFloat(e.target.dataset.lon);
      mostrarRutaProspeccion(lat, lon);
    }
  });

  async function dibujarRuta(origen, destLat, destLon, color) {
    if (rutaActiva) limpiarRuta();
    color = color || '#1F5CA9';

    const resultado = await calcularRuta(origen.lat, origen.lon, destLat, destLon);
    if (!resultado) { toast('No se pudo calcular la ruta.', 'error'); return; }
    const coords = resultado.geometria.map(c => [c[1], c[0]]);

    if (map.hasLayer(cluster)) map.removeLayer(cluster);
    activeCircleFilters.forEach(id => {
      const c = circulos[id];
      if (c && c.visible && map.hasLayer(c.capa)) map.removeLayer(c.capa);
    });

    const casing = L.polyline(coords, { color: '#ffffff', weight: 9, opacity: 0.95, className: 'route-casing' });
    const main   = L.polyline(coords, { color, weight: 5, opacity: 0.95, className: 'route-main' });
    rutaLayer = L.layerGroup([casing, main]).addTo(map);
    map.fitBounds(rutaLayer.getBounds(), { padding: [50,50], duration: 1.2 });
    rutaMarcador = L.marker([destLat, destLon], {
      icon: L.divIcon({ className: '', html: `<i class="fas fa-flag-checkered" style="font-size:28px;color:${color};filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));"></i>`, iconSize: [28,28] })
    }).addTo(map);
    rutaMarcador.bindPopup(`<strong>Ruta desde ${origen.nombre}</strong><br>Distancia: ${resultado.distanciaKm.toFixed(1)} km<br>Tiempo: ${Math.round(resultado.duracionMin)} min`).openPopup();
    rutaActiva = true;
  }

  async function mostrarRuta(destLat, destLon) {
    const dM = distanciaKm(ANCLA_MORELIA.lat,  ANCLA_MORELIA.lon,  destLat, destLon);
    const dT = distanciaKm(ANCLA_TOTOTLAN.lat, ANCLA_TOTOTLAN.lon, destLat, destLon);
    const origen = dM <= dT ? ANCLA_MORELIA : ANCLA_TOTOTLAN;
    await dibujarRuta(origen, destLat, destLon);
  }

  async function mostrarRutaProspeccion(destLat, destLon) {
    if (!miUbicacionCoords) {
      toast('Primero obtén tu ubicación con el botón "Mi ubicación".', 'info');
      return;
    }
    const origen = { lat: miUbicacionCoords.lat, lon: miUbicacionCoords.lon, nombre: 'tu ubicación' };
    await dibujarRuta(origen, destLat, destLon, '#059669');
  }

  // ============================================================
  // 8. CLUSTER POPUP
  // ============================================================
  cluster.on('clustermouseover', function(e) {
    if (clusterTimer) clearTimeout(clusterTimer);
    const layer = e.layer;
    const markers = layer.getAllChildMarkers().sort((a,b)=>a.data.nombre.localeCompare(b.data.nombre));
    let totalDist = 0;
    markers.forEach(m => totalDist += m.data._matchDist);
    const avgDist = (totalDist / markers.length).toFixed(1);
    let html = `<div class="cluster-popup-title">
      <span>📍 ${markers.length} clientes</span>
      <span style="font-weight:400;font-size:0.75rem;">📏 ${avgDist} km promedio</span>
    </div><div class="cluster-popup-list">`;
    markers.forEach((m, idx) => {
      html += `<div class="item" data-lat="${m.data.lat}" data-lon="${m.data.lon}" style="cursor:pointer;" title="Ver detalle de ${m.data.nombre}"><span class="name">${m.data.nombre}</span><span class="state">${m.data.estado || ''}</span></div>`;
    });
    html += '</div>';
    layer.bindPopup(html, { className: 'cluster-popup', maxWidth: 320, maxHeight: 280 }).openPopup();
  });

  document.addEventListener('click', function(e) {
    const item = e.target.closest('.cluster-popup-list .item');
    if (!item) return;
    const lat = parseFloat(item.dataset.lat);
    const lon = parseFloat(item.dataset.lon);
    if (isNaN(lat) || isNaN(lon)) return;
    const cliente = stations.find(s => Math.abs(s.lat - lat) < 1e-6 && Math.abs(s.lon - lon) < 1e-6);
    if (!cliente) return;
    map.closePopup();
    map.flyTo([cliente.lat, cliente.lon], 15, { duration: 1.0 });
    abrirDetalle(cliente);
    const entry = markerMap.get(cliente);
    if (entry) {
      const el = entry.marker.getElement();
      if (el) { el.classList.remove('marker-bounce'); void el.offsetWidth; el.classList.add('marker-bounce'); }
    }
  });

  let clusterTimer = null;
  cluster.on('clustermouseout', function(e) {
    clusterTimer = setTimeout(() => e.layer.closePopup(), 1500);
  });

  // ============================================================
  // 9. LEYENDA DE PRECIOS / DISTANCIAS
  // ============================================================
  const legendControl = L.control({ position: 'bottomright' });
  legendControl.onAdd = function() {
    const div = L.DomUtil.create('div', 'price-legend dash');
    div.innerHTML = `<div class="title"><span class="legend-title-text">Clientes por distancia</span><span class="legend-btns"><button class="clear-btn" id="legendClearBtn" title="Quitar resaltado">✕</button><button class="minimize-btn" id="legendMinBtn" title="Minimizar">–</button></span></div>`;
    if (localStorage.getItem('leyendaMin') === '1') div.classList.add('minimized');
    const ranges = [
      { label: '0 – 50 km',   key: 'very-low', color: '#10b981' },
      { label: '50 – 100 km', key: 'low',     color: '#34d399' },
      { label: '100 – 150 km', key: 'mid',    color: '#fbbf24' },
      { label: '150 – 190 km', key: 'high',   color: '#fb923c' },
      { label: '> 190 km',    key: 'no-price', color: '#94a3b8' }
    ];
    div.innerHTML += ranges.map(r => `<div class="row" data-key="${r.key}" style="color:${r.color};">
        <span class="color-dot" style="background:${r.color};"></span>
        <span class="rowbody">
          <span class="label"><span>${r.label}</span></span>
          <span class="bar-track"><span class="bar-fill"></span></span>
        </span>
        <span class="count">0</span>
      </div>`).join('');
    
    function actualizarConteos(visibles) {
      const conteo = new Map();
      (visibles || []).forEach(s => conteo.set(s._matchKey, (conteo.get(s._matchKey) || 0) + 1));
      let total = 0;
      ranges.forEach(r => { total += (conteo.get(r.key) || 0); });
      const max = Math.max(1, ...ranges.map(r => conteo.get(r.key) || 0));
      div.querySelectorAll('.row').forEach(row => {
        const key = row.dataset.key;
        const count = conteo.get(key) || 0;
        const span = row.querySelector('.count');
        if (span) span.textContent = count;
        const bar = row.querySelector('.bar-fill');
        if (bar) bar.style.width = (count / max * 100).toFixed(1) + '%';
      });
    }
    
    setTimeout(actualizarConteos, 100);
    div._actualizarConteos = actualizarConteos;

    div.querySelectorAll('.row').forEach(row => {
      row.addEventListener('click', function() {
        const key = this.dataset.key;
        if (activePrice === key) {
          activePrice = null;
        } else {
          activePrice = key;
        }
        updateLegendUI();
        applyFilters();
      });
    });

    div.querySelector('#legendClearBtn').addEventListener('click', function() {
        activePrice = null;
        updateLegendUI();
        applyFilters();
    });

    div.querySelector('#legendMinBtn').addEventListener('click', function() {
        div.classList.toggle('minimized');
        localStorage.setItem('leyendaMin', div.classList.contains('minimized') ? '1' : '0');
    });

    return div;
  };
  legendControl.addTo(map);

  function actualizarPistaMapa() {
    const hint = document.getElementById('mapHint');
    if (!hint) return;
    hint.classList.toggle('hidden', activeCircleFilters.size > 0);
  }

  // ============================================================
  // 10. FILTROS Y APLICACIÓN
  // ============================================================
  let activePrice = null, activeTamano = 'all', searchTerm = '', maxDist = 190;
  window.activeNoAddress = false;

  function mejorCoincidenciaCirculo(s) {
    let mejor = null;
    for (const id of activeCircleFilters) {
      const { centro, radio } = datosCirculo(id);
      const limite = Math.min(radio, maxDist);
      const d = distanciaKm(centro.lat, centro.lon, s.lat, s.lon);
      if (d <= limite && (!mejor || d < mejor.dist)) {
        mejor = { dist: d, anclaNombre: centro.nombre };
      }
    }
    return mejor;
  }

  function applyFilters() {
    if (rutaActiva) return [];

    const term = searchTerm;
    const selectedTam = document.getElementById('tamanoFilter').value;

    let visible = [];
    for (const s of stations) {
      if (!activeCircleFilters.size) break;
      if (term !== '' && !normalizarTexto(s.nombre).includes(term)) continue;
      if (selectedTam !== 'all') {
        if (selectedTam === CAT_COMBI)      { if (categoriaEspecial(s) !== 'combi') continue; }
        else if (selectedTam === CAT_TAXI)  { if (categoriaEspecial(s) !== 'taxi')  continue; }
        else if (s.tamano !== selectedTam) continue;
      }
      const match = mejorCoincidenciaCirculo(s);
      if (!match) continue;
      const rango = getDistRange(match.dist);
      if (activePrice !== null && rango.key !== activePrice) continue;
      s._matchDist = match.dist;
      s._matchAncla = match.anclaNombre;
      s._matchColor = rango.color;
      s._matchKey = rango.key;
      visible.push(s);
    }

    if (window.activeNoAddress) {
      visible = visible.filter(s => !s.direccion);
    }

    visible.forEach(s => {
      const entry = markerMap.get(s);
      if (entry) {
        const iconoEspecial = obtenerIconoEspecial(s);
        const nuevoIcono = iconoEspecial || iconoPin(s._matchColor, colorPorTamano(s), false);
        if (entry.marker !== marcadorResaltado) {
          entry.marker.setIcon(nuevoIcono);
          entry.marker._iconoOriginal = nuevoIcono;
        } else {
          entry.marker._iconoOriginal = nuevoIcono;
        }
      }
    });

    cluster.clearLayers();
    cluster.addLayers(visible.map(s => markerMap.get(s).marker));
    document.getElementById('rMatch').textContent = visible.length;
    document.getElementById('listCnt').textContent = visible.length;
    renderList(visible);
    updateLegendUI();
    updateStats(visible);
    document.getElementById('clearAllBtn').classList.toggle('hidden', !(activePrice || selectedTam !== 'all' || term || maxDist < 190 || window.activeNoAddress || activeCircleFilters.size > 0));
    const legendDiv = document.querySelector('.price-legend');
    if (legendDiv && legendDiv._actualizarConteos) legendDiv._actualizarConteos(visible);
    actualizarPistaMapa();

    return visible;
  }

  function updateLegendUI() {
    document.querySelectorAll('.price-legend .row').forEach(row => {
      row.classList.toggle('active', row.dataset.key === activePrice);
    });
  }

  function updateStats(items) {
    const statsEl = document.getElementById('stats');
    if (items.length === 0) { statsEl.innerHTML = ''; return; }
    const dists = items.map(s => s._matchDist);
    const min = Math.min(...dists);
    const max = Math.max(...dists);
    const avg = dists.reduce((a,b) => a+b, 0) / dists.length;
    const closest = items.find(s => s._matchDist === min);
    const closestName = closest ? ` (${closest.nombre})` : '';
    let minDisplay = min.toFixed(1) + ' km';
    if (min < 0.01) minDisplay = `0.0 km (Mismo punto que ${closest ? closest._matchAncla : 'el ancla'})`;
    statsEl.innerHTML = `
      <span class="stat">📏 Más cercano: ${minDisplay}${closestName}</span>
      <span class="stat">📏 Más lejano: ${max.toFixed(1)} km</span>
      <span class="stat">📊 Promedio: ${avg.toFixed(1)} km</span>
    `;
  }

  function encuadrarClientes(lista) {
    if (!lista || !lista.length) { verAmbasAnclas(); return; }
    const b = L.latLngBounds(lista.map(s => [s.lat, s.lon]));
    ANCLAS.forEach(a => b.extend([a.lat, a.lon]));
    map.flyToBounds(b, { padding: [60, 60], duration: 1.2, maxZoom: 12 });
  }

  // ============================================================
  // 11. ORDENAMIENTO Y LISTA
  // ============================================================
  let sortMode = 'dist';

  function highlightMatch(texto, term) {
    if (!term) return texto;
    const lower = texto.toLowerCase();
    const idx = lower.indexOf(term);
    if (idx === -1) return texto;
    return texto.slice(0, idx) + '<mark>' + texto.slice(idx, idx + term.length) + '</mark>' + texto.slice(idx + term.length);
  }

  function crearItemLista(s) {
    const li = document.createElement('li');
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `Ver ${s.nombre} en el mapa`);
    li.style.setProperty('--strip-color', s._matchColor || 'var(--primary)');

    const strip = document.createElement('span');
    strip.className = 'card-color-strip';

    const body = document.createElement('div');
    body.className = 'card-body';

    const nombreEl = document.createElement('div');
    nombreEl.className = 'name';
    nombreEl.innerHTML = highlightMatch(s.nombre, searchTerm);

    const meta = document.createElement('div');
    meta.className = 'meta';
    if (s.estado) {
      const st = document.createElement('span');
      st.className = 'state-tag';
      st.textContent = s.estado;
      meta.appendChild(st);
    }
    if (s.tamano) {
      const tg = document.createElement('span');
      tg.textContent = s.tamano;
      meta.appendChild(tg);
    }

    body.appendChild(nombreEl);
    body.appendChild(meta);

    const dist = document.createElement('div');
    dist.className = 'card-dist';
    const dNum = document.createElement('span');
    dNum.textContent = s._matchDist < 10 ? s._matchDist.toFixed(1) : Math.round(s._matchDist);
    const dUnit = document.createElement('span');
    dUnit.className = 'dist-unit';
    dUnit.textContent = 'km · ' + (s._matchAncla || '');
    dist.appendChild(dNum);
    dist.appendChild(dUnit);

    li.appendChild(strip);
    li.appendChild(body);
    li.appendChild(dist);

    const activar = () => {
      map.flyTo([s.lat, s.lon], 14, { duration: 1.2 });
      abrirDetalle(s);
      const entry = markerMap.get(s);
      if (entry) {
        const el = entry.marker.getElement();
        if (el) { el.classList.remove('marker-bounce'); void el.offsetWidth; el.classList.add('marker-bounce'); }
      }
    };
    li.addEventListener('click', activar);
    li.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activar(); }
    });
    return li;
  }

  function mensajeSinResultados() {
    const li = document.createElement('li');
    li.className = 'empty';
    if (activeCircleFilters.size === 0) {
      const p1 = document.createElement('div');
      p1.textContent = 'Selecciona uno o más "Círculos de radio" para ver los clientes.';
      li.appendChild(p1);
      return li;
    }
    const sugerencias = [];
    if (searchTerm) sugerencias.push('revisa lo que escribiste en el buscador');
    if (activePrice) sugerencias.push('quita el filtro de distancia por color en la leyenda');
    if (document.getElementById('tamanoFilter').value !== 'all') sugerencias.push('quita el filtro de tamaño de empresa');
    if (maxDist < 190) sugerencias.push('amplía el máximo de distancia');
    if (window.activeNoAddress) sugerencias.push('quita el filtro "Sin dirección"');
    const p1 = document.createElement('div');
    p1.textContent = 'No hay clientes que coincidan.';
    li.appendChild(p1);
    if (sugerencias.length) {
      const p2 = document.createElement('div');
      p2.style.fontSize = '0.75rem';
      p2.style.marginTop = '0.4rem';
      p2.textContent = 'Prueba: ' + sugerencias.join(', ') + '.';
      li.appendChild(p2);
    }
    return li;
  }

  function renderList(items) {
    const ul = document.getElementById('list');
    ul.innerHTML = '';
    if (!items.length) { ul.appendChild(mensajeSinResultados()); return; }
    const frag = document.createDocumentFragment();
    if (sortMode === 'dist') {
      [...items].sort((a,b) => a._matchDist - b._matchDist).forEach(s => frag.appendChild(crearItemLista(s)));
    } else if (sortMode === 'name') {
      [...items].sort((a,b) => a.nombre.localeCompare(b.nombre)).forEach(s => frag.appendChild(crearItemLista(s)));
    } else {
      const grouped = items.reduce((acc, s) => {
        const state = s.estado || 'Sin estado';
        if (!acc[state]) acc[state] = [];
        acc[state].push(s);
        return acc;
      }, {});
      Object.keys(grouped).sort().forEach(state => {
        const header = document.createElement('li');
        header.className = 'group-header';
        header.textContent = `${state} (${grouped[state].length})`;
        frag.appendChild(header);
        grouped[state].sort((a,b) => a.nombre.localeCompare(b.nombre)).forEach(s => frag.appendChild(crearItemLista(s)));
      });
    }
    ul.appendChild(frag);
  }

  function marcarSortActivo(modo) {
    ['sortDist','sortState','sortName'].forEach(id => {
      document.getElementById(id).classList.toggle('active', id === modo);
    });
  }
  document.getElementById('sortDist').addEventListener('click', function() { sortMode = 'dist'; marcarSortActivo('sortDist'); applyFilters(); });
  document.getElementById('sortState').addEventListener('click', function() { sortMode = 'state'; marcarSortActivo('sortState'); applyFilters(); });
  document.getElementById('sortName').addEventListener('click', function() { sortMode = 'name'; marcarSortActivo('sortName'); applyFilters(); });

  // ============================================================
  // 🟢 CONTROL GLOBAL DEL MODO OSCURO
  // ============================================================
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIcon = document.getElementById('themeIcon');
  const themeLabel = document.getElementById('themeLabel');

  function aplicarTemaGlobal(tema) {
    document.documentElement.setAttribute('data-theme', tema);
    if (tema === 'dark') {
      themeIcon.className = 'fas fa-sun';
      themeLabel.textContent = 'Modo día';
      themeToggleBtn.title = 'Cambiar a modo día';
    } else {
      themeIcon.className = 'fas fa-moon';
      themeLabel.textContent = 'Modo oscuro';
      themeToggleBtn.title = 'Cambiar a modo oscuro';
    }
    try { localStorage.setItem('tema', tema); } catch (e) {}
  }

  const temaActual = document.documentElement.getAttribute('data-theme') || 'light';
  aplicarTemaGlobal(temaActual);

  themeToggleBtn.addEventListener('click', function() {
    const actual = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    aplicarTemaGlobal(actual === 'dark' ? 'light' : 'dark');
  });

  // ============================================================
  // 12. MENÚS DESPLEGABLES
  // ============================================================
  const masMenu = document.getElementById('masMenu');
  const moreToggleBtn = document.getElementById('moreToggleBtn');
  moreToggleBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    const abierto = masMenu.classList.toggle('open');
    this.classList.toggle('open', abierto);
    this.setAttribute('aria-expanded', abierto ? 'true' : 'false');
  });
  masMenu.addEventListener('click', function(e) {
    if (e.target.closest('.menu-action')) {
      masMenu.classList.remove('open');
      moreToggleBtn.classList.remove('open');
      moreToggleBtn.setAttribute('aria-expanded', 'false');
    }
  });

  document.getElementById('resetBtn').addEventListener('click', () => verAmbasAnclas());
  document.getElementById('centerMoreliaBtn').addEventListener('click', () => { limpiarRuta(); activarAncla('morelia'); });
  document.getElementById('centerTototlanBtn').addEventListener('click', () => { limpiarRuta(); activarAncla('tototlan'); });
  document.getElementById('clearRouteBtn').addEventListener('click', limpiarRuta);

  document.getElementById('gotoClosestBtn').addEventListener('click', function() {
    const visible = applyFilters();
    if (!visible.length) {
      toast(activeCircleFilters.size === 0 ? 'Primero selecciona un círculo de radio.' : 'No hay clientes visibles con los filtros actuales.', 'info');
      return;
    }
    const closest = visible.reduce((a, b) => a._matchDist < b._matchDist ? a : b);
    map.flyTo([closest.lat, closest.lon], 14, { duration: 1.2 });
    abrirDetalle(closest);
  });

  document.getElementById('toggleRailBtn').addEventListener('click', () => {
    const rail = document.getElementById('railPanel');
    rail.classList.toggle('hidden');
    document.getElementById('railToggleIcon').className = rail.classList.contains('hidden') ? 'fas fa-chevron-left' : 'fas fa-chevron-right';
    setTimeout(() => map.invalidateSize(), 350);
  });

  ['150Morelia','190Morelia','150Tototlan','190Tototlan'].forEach(id => {
    const b = document.getElementById('btnCirculo' + id);
    if (b) b.addEventListener('click', () => toggleCirculo(id));
  });

  const circulosToggleBtn = document.getElementById('circulosToggleBtn');
  const circulosMenu = document.getElementById('circulosMenu');
  circulosToggleBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    const abierto = circulosMenu.classList.toggle('open');
    circulosToggleBtn.setAttribute('aria-expanded', abierto ? 'true' : 'false');
  });
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#circulosDropdown')) { circulosMenu.classList.remove('open'); circulosToggleBtn.setAttribute('aria-expanded', 'false'); }
    if (!e.target.closest('#masDropdown')) { masMenu.classList.remove('open'); moreToggleBtn.classList.remove('open'); moreToggleBtn.setAttribute('aria-expanded', 'false'); }
    if (!e.target.closest('#rutasDropdown')) { document.getElementById('rutasMenu').classList.remove('open'); document.getElementById('rutasToggleBtn').setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      circulosMenu.classList.remove('open'); circulosToggleBtn.setAttribute('aria-expanded', 'false');
      masMenu.classList.remove('open'); moreToggleBtn.classList.remove('open'); moreToggleBtn.setAttribute('aria-expanded', 'false');
      document.getElementById('rutasMenu').classList.remove('open'); document.getElementById('rutasToggleBtn').setAttribute('aria-expanded', 'false');
    }
  });

  document.getElementById('noAddressBtn').addEventListener('click', function() {
    window.activeNoAddress = !window.activeNoAddress;
    this.classList.toggle('active', window.activeNoAddress);
    applyFilters();
  });

  // ============================================================
  // 13. AGREGAR CLIENTE
  // ============================================================
  let addingClientMode = false;
  const addClientBtn = document.getElementById('addClientBtn');
  const modalOverlay = document.getElementById('addClientModalOverlay');
  const addLat = document.getElementById('addLat');
  const addLon = document.getElementById('addLon');
  const addNombre = document.getElementById('addNombre');
  const addEstado = document.getElementById('addEstado');
  const addTamano = document.getElementById('addTamano');
  const addDireccion = document.getElementById('addDireccion');
  const addTelefono = document.getElementById('addTelefono');
  let tempCoords = null;

  function updateAddMethodUI() {
    const sel = document.querySelector('input[name="addMethod"]:checked');
    const isManual = sel && sel.value === 'manual';
    addLat.readOnly = !isManual;
    addLon.readOnly = !isManual;
    document.getElementById('pickOnMapBtn').style.display = isManual ? 'none' : 'inline-flex';
  }
  document.getElementsByName('addMethod').forEach(r => r.addEventListener('change', updateAddMethodUI));

  function abrirModalAgregar() {
    addingClientMode = false;
    addingPinMode = false;
    map.getContainer().style.cursor = '';
    tempCoords = null;
    addLat.value = ''; addLon.value = ''; addNombre.value = ''; addEstado.value = ''; addTamano.value = ''; addDireccion.value = ''; addTelefono.value = '';
    const mapRadio = document.querySelector('input[name="addMethod"][value="map"]');
    if (mapRadio) mapRadio.checked = true;
    updateAddMethodUI();
    modalOverlay.classList.add('open');
  }

  addClientBtn.addEventListener('click', abrirModalAgregar);

  document.getElementById('pickOnMapBtn').addEventListener('click', () => {
    modalOverlay.classList.remove('open');
    addingClientMode = true;
    addingPinMode = false;
    map.getContainer().style.cursor = 'crosshair';
    toast('Haz clic en el mapa para colocar el cliente.', 'info');
  });

  map.on('click', function(e) {
    if (addingClientMode) {
      addingClientMode = false;
      map.getContainer().style.cursor = '';
      tempCoords = { lat: e.latlng.lat, lng: e.latlng.lng };
      addLat.value = tempCoords.lat.toFixed(6);
      addLon.value = tempCoords.lng.toFixed(6);
      modalOverlay.classList.add('open');
      return;
    }
    if (addingPinMode) {
      setPinMode(false);
      tempPinCoords = { lat: e.latlng.lat, lon: e.latlng.lng };
      pinTipoSel = 'interes';
      pinNota.value = '';
      pinTipoChips.querySelectorAll('.tipo-chip').forEach(ch => ch.classList.toggle('selected', ch.dataset.tipo === pinTipoSel));
      pinModalOverlay.classList.add('open');
      setTimeout(() => pinNota.focus(), 50);
      return;
    }
    cluster.closePopup();
  });

  document.getElementById('addCancelBtn').addEventListener('click', () => {
    modalOverlay.classList.remove('open');
    if (addingClientMode) { addingClientMode = false; map.getContainer().style.cursor = ''; }
    tempCoords = null;
  });

  document.getElementById('addSaveBtn').addEventListener('click', () => {
    const nombre = addNombre.value.trim();
    if (!nombre) { toast('El nombre es obligatorio.', 'error'); return; }
    const lat = parseFloat(addLat.value.trim());
    const lon = parseFloat(addLon.value.trim());
    if (isNaN(lat) || isNaN(lon)) { toast('Coordenadas inválidas. Elige un punto en el mapa o escríbelas.', 'error'); return; }
    const nuevo = {
      nombre, lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6,
      estado: addEstado.value.trim(), tamano: addTamano.value.trim(),
      direccion: addDireccion.value.trim(), telefono: addTelefono.value.trim()
    };
    enriquecer([nuevo]);
    stations.push(nuevo);
    reconstruirMarcadoresClientes();
    actualizarSelectTamano();
    applyFilters();
    try {
      localStorage.setItem('CLIENTES_JS', `window.CLIENTES_POTENCIALES = ${JSON.stringify(stations)};`);
      localStorage.setItem('CLIENTES_ACTUALIZADO', Date.now().toString());
    } catch (e) { if(e.name === 'QuotaExceededError') toast('Almacenamiento lleno, no se pudo guardar.', 'error'); }
    modalOverlay.classList.remove('open');
    tempCoords = null;
    toast(`Cliente "${nombre}" agregado correctamente.`, 'success');
  });

  // ============================================================
  // 14. ELIMINAR CLIENTE
  // ============================================================
  const NIP_ELIMINAR = '1723';
  let clienteAEliminar = null;
  const deleteModalOverlay = document.getElementById('deleteClientModalOverlay');
  const deleteStepPin = document.getElementById('deleteStepPin');
  const deleteStepConfirm = document.getElementById('deleteStepConfirm');
  const deletePinInput = document.getElementById('deletePinInput');

  function abrirModalEliminar(cliente) {
    clienteAEliminar = cliente;
    document.getElementById('deleteClientName').textContent = cliente.nombre;
    document.getElementById('deleteClientNameConfirm').textContent = cliente.nombre;
    deletePinInput.value = '';
    deleteStepPin.style.display = 'block';
    deleteStepConfirm.style.display = 'none';
    deleteModalOverlay.classList.add('open');
    setTimeout(() => deletePinInput.focus(), 50);
  }
  function cerrarModalEliminar() { deleteModalOverlay.classList.remove('open'); clienteAEliminar = null; }
  document.getElementById('deletePinCancelBtn').addEventListener('click', cerrarModalEliminar);
  document.getElementById('deleteConfirmCancelBtn').addEventListener('click', cerrarModalEliminar);
  document.getElementById('deletePinConfirmBtn').addEventListener('click', () => {
    if (deletePinInput.value.trim() !== NIP_ELIMINAR) { toast('NIP incorrecto.', 'error'); deletePinInput.value = ''; deletePinInput.focus(); return; }
    deleteStepPin.style.display = 'none'; deleteStepConfirm.style.display = 'block';
  });
  deletePinInput.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('deletePinConfirmBtn').click(); });
  document.getElementById('deleteConfirmOkBtn').addEventListener('click', () => {
    if (!clienteAEliminar) return;
    const nombre = clienteAEliminar.nombre;
    const idx = stations.indexOf(clienteAEliminar);
    if (idx !== -1) stations.splice(idx, 1);
    map.closePopup();
    reconstruirMarcadoresClientes();
    actualizarSelectTamano();
    applyFilters();
    try { localStorage.setItem('CLIENTES_JS', `window.CLIENTES_POTENCIALES = ${JSON.stringify(stations)};`); localStorage.setItem('CLIENTES_ACTUALIZADO', Date.now().toString()); } catch (e) { if(e.name === 'QuotaExceededError') toast('Almacenamiento lleno.', 'error'); }
    cerrarModalEliminar();
    toast(`Cliente "${nombre}" eliminado.`, 'success');
  });
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('.btn-delete-client');
    if (!btn) return;
    const lat = parseFloat(btn.dataset.lat), lon = parseFloat(btn.dataset.lon), nombre = btn.dataset.nombre;
    const cliente = stations.find(s => s.lat === lat && s.lon === lon && s.nombre === nombre);
    if (cliente) abrirModalEliminar(cliente);
  });

  // ============================================================
  // 15. MARCADORES (PINES)
  // ============================================================
  const MARCADOR_TIPOS = {
    interes: { label: 'Punto de interés', color: '#8b5cf6', emoji: '⭐' },
    posible: { label: 'Posible cliente', color: '#f59e0b', emoji: '❓' },
    llegada: { label: 'Punto de llegada', color: '#059669', emoji: '🏁' },
    nota: { label: 'Nota / recordatorio', color: '#0ea5e9', emoji: '📌' }
  };
  let marcadores = [];
  const marcadorMarkers = new Map();
  const marcadoresLayer = L.layerGroup().addTo(map);
  let marcadoresVisibles = true;
  let editandoMarcadorId = null;

  try { const guardados = JSON.parse(localStorage.getItem('MARCADORES_USUARIO') || '[]'); if (Array.isArray(guardados)) marcadores = guardados; } catch (e) {}

  function guardarMarcadores() { try { localStorage.setItem('MARCADORES_USUARIO', JSON.stringify(marcadores)); } catch (e) {} }
  function marcadorIcon(tipo) {
    const t = MARCADOR_TIPOS[tipo] || MARCADOR_TIPOS.nota;
    return L.divIcon({ className: '', html: `<svg width="34" height="46"><path d="M17 0C7.6 0 0 7.6 0 17c0 12.75 17 29 17 29s17-16.25 17-29C34 7.6 26.4 0 17 0z" fill="${t.color}" stroke="var(--border)" stroke-width="2"/><circle cx="17" cy="16.5" r="10" fill="var(--bg-panel)"/><text x="17" y="16.5" font-size="12" text-anchor="middle">${t.emoji}</text></svg>`, iconSize: [34,46], iconAnchor: [17,46], popupAnchor: [0,-42] });
  }

  function popupMarcador(m) {
    const t = MARCADOR_TIPOS[m.tipo] || MARCADOR_TIPOS.nota;
    const fecha = m.fecha ? new Date(m.fecha).toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' }) : '';
    const nota = m.nota ? `<div style="font-size:0.82rem;margin-top:4px;">${String(m.nota).replace(/</g,'&lt;')}</div>` : '';
    return `<div class="marcador-popup">
      <strong style="color:${t.color};">${t.emoji} ${t.label}</strong>
      ${nota}
      ${fecha?`<div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">Guardado el ${fecha}</div>`:''}
      <div class="popup-actions">
        <a class="popup-btn btn-maps" href="https://www.google.com/maps?q=${m.lat},${m.lon}" target="_blank">🗺️ Maps</a>
        <button class="popup-btn btn-route-prospeccion" data-lat="${m.lat}" data-lon="${m.lon}">🧭 Cómo llegar</button>
        <button class="popup-btn btn-edit-marcador" data-id="${m.id}">✏️ Editar</button>
        <button class="popup-btn btn-delete-marcador" data-id="${m.id}">🗑️ Quitar</button>
      </div>
    </div>`;
  }

  function crearMarcadorEnMapa(m) {
    const marker = L.marker([m.lat, m.lon], { icon: marcadorIcon(m.tipo) });
    marker.bindPopup(() => popupMarcador(m), { maxWidth: 360, minWidth: 280 });
    marcadoresLayer.addLayer(marker);
    marcadorMarkers.set(m.id, marker);
  }
  function reconstruirMarcadores() { marcadoresLayer.clearLayers(); marcadorMarkers.clear(); if (marcadoresVisibles) marcadores.forEach(crearMarcadorEnMapa); }
  reconstruirMarcadores();

  function abrirModalEditarMarcador(id) {
    const marcador = marcadores.find(m => m.id === id);
    if (!marcador) return;
    editandoMarcadorId = id;
    pinTipoSel = marcador.tipo;
    pinNota.value = marcador.nota || '';
    pinTipoChips.querySelectorAll('.tipo-chip').forEach(ch => {
      ch.classList.toggle('selected', ch.dataset.tipo === pinTipoSel);
    });
    tempPinCoords = { lat: marcador.lat, lon: marcador.lon };
    document.getElementById('pinModalTitle').textContent = '✏️ Editar marcador';
    pinModalOverlay.classList.add('open');
    setTimeout(() => pinNota.focus(), 50);
  }

  let addingPinMode = false;
  let tempPinCoords = null;
  let pinTipoSel = 'interes';
  const pinModalOverlay = document.getElementById('addPinModalOverlay');
  const pinNota = document.getElementById('pinNota');
  const pinTipoChips = document.getElementById('pinTipoChips');

  function setPinMode(on) {
    addingPinMode = on;
    if (on) {
      if (addingClientMode) { addingClientMode = false; addClientBtn.classList.remove('active'); }
      map.getContainer().style.cursor = 'crosshair';
      for (const key in circulos) {
        const c = circulos[key];
        if (c.capa && c.capa.getPopup) {
          const popup = c.capa.getPopup();
          if (popup) {
            c._popupContent = popup.getContent();
            c.capa.unbindPopup();
          }
        }
      }
      map.closePopup();
    } else {
      map.getContainer().style.cursor = '';
      for (const key in circulos) {
        const c = circulos[key];
        if (c.capa && c._popupContent) {
          c.capa.bindPopup(c._popupContent);
          c._popupContent = null;
        }
      }
    }
  }

  document.getElementById('addPinBtn').addEventListener('click', () => setPinMode(true));

  pinTipoChips.addEventListener('click', function(e) {
    const chip = e.target.closest('.tipo-chip'); if (!chip) return;
    pinTipoSel = chip.dataset.tipo;
    pinTipoChips.querySelectorAll('.tipo-chip').forEach(ch => ch.classList.toggle('selected', ch === chip));
  });

  document.getElementById('pinCancelBtn').addEventListener('click', () => {
    pinModalOverlay.classList.remove('open');
    tempPinCoords = null;
    editandoMarcadorId = null;
    document.getElementById('pinModalTitle').textContent = '📍 Nuevo marcador';
  });

  document.getElementById('pinSaveBtn').addEventListener('click', () => {
    if (!tempPinCoords) return;
    const nota = pinNota.value.trim();
    if (editandoMarcadorId) {
      const idx = marcadores.findIndex(m => m.id === editandoMarcadorId);
      if (idx !== -1) {
        marcadores[idx].tipo = pinTipoSel;
        marcadores[idx].nota = nota;
        marcadores[idx].lat = Math.round(tempPinCoords.lat * 1e6) / 1e6;
        marcadores[idx].lon = Math.round(tempPinCoords.lon * 1e6) / 1e6;
        marcadores[idx].fecha = Date.now();
        guardarMarcadores();
        const oldMarker = marcadorMarkers.get(editandoMarcadorId);
        if (oldMarker) {
          marcadoresLayer.removeLayer(oldMarker);
          marcadorMarkers.delete(editandoMarcadorId);
        }
        crearMarcadorEnMapa(marcadores[idx]);
        toast(`Marcador actualizado.`, 'success');
      }
      editandoMarcadorId = null;
      document.getElementById('pinModalTitle').textContent = '📍 Nuevo marcador';
    } else {
      const nuevo = {
        id: 'm' + Date.now() + Math.floor(Math.random() * 1000),
        lat: Math.round(tempPinCoords.lat * 1e6) / 1e6,
        lon: Math.round(tempPinCoords.lon * 1e6) / 1e6,
        tipo: pinTipoSel,
        nota: nota,
        fecha: Date.now()
      };
      marcadores.push(nuevo);
      guardarMarcadores();
      if (!marcadoresVisibles) {
        marcadoresVisibles = true;
        reconstruirMarcadores();
      } else {
        crearMarcadorEnMapa(nuevo);
      }
      toast(`Marcador "${MARCADOR_TIPOS[nuevo.tipo].label}" guardado.`, 'success');
    }
    pinModalOverlay.classList.remove('open');
    tempPinCoords = null;
  });

  document.addEventListener('click', function(e) {
    const btn = e.target.closest('.btn-delete-marcador');
    if (!btn) return;
    const id = btn.dataset.id;
    const idx = marcadores.findIndex(m => m.id === id);
    if (idx === -1) return;
    marcadores.splice(idx,1);
    guardarMarcadores();
    const marker = marcadorMarkers.get(id);
    if (marker) { marcadoresLayer.removeLayer(marker); marcadorMarkers.delete(id); }
    map.closePopup();
    toast('Marcador eliminado.', 'success');
  });

  document.addEventListener('click', function(e) {
    const editBtn = e.target.closest('.btn-edit-marcador');
    if (editBtn) {
      const id = editBtn.dataset.id;
      abrirModalEditarMarcador(id);
      map.closePopup();
    }
  });

  document.getElementById('toggleMarcadoresBtn').addEventListener('click', function() {
    marcadoresVisibles = !marcadoresVisibles;
    reconstruirMarcadores();
    this.querySelector('.dropdown-item-label').innerHTML = marcadoresVisibles ? '<i class="fas fa-eye"></i> Ocultar marcadores' : '<i class="fas fa-eye-slash"></i> Mostrar marcadores';
    toast(marcadoresVisibles ? 'Marcadores visibles.' : 'Marcadores ocultos.', 'info');
  });

  // ============================================================
  // 16. RUTAS DE TRANSPORTE
  // ============================================================
  const rutasLayer = L.layerGroup().addTo(map);
  let rutasData = [], rutasSeleccionadas = new Set(), rutasCargadas = false, rutasCargando = false;
  const rutaLineas = new Map();
  const rutasToggleBtn = document.getElementById('rutasToggleBtn'), rutasMenu = document.getElementById('rutasMenu'), rutasListEl = document.getElementById('rutasList'), rutasSearchEl = document.getElementById('rutasSearch');

  function actualizarBadgeRutas() {
    const n = rutasSeleccionadas.size, badge = document.getElementById('rutasBadge'), label = document.getElementById('rutasLabel');
    rutasToggleBtn.classList.toggle('is-active', n > 0);
    if (badge) { if (n > 0) { badge.hidden = false; badge.textContent = n; } else badge.hidden = true; }
    if (label) label.textContent = n === 0 ? 'Rutas' : (n === 1 ? '1 ruta' : n + ' rutas');
  }

  function dibujarRutaGeo(f) {
    const latlngs = f.geometry.coordinates.map(c => [c[1], c[0]]);
    const p = f.properties, color = p.color || '#e11d48', nombre = p.nombre || 'Ruta', tipo = p.tipo || '';
    const icono = tipo === 'Combi' ? '🚐' : '🚌';
    const linea = L.polyline(latlngs, { color, weight: 4, opacity: 0.9 });
    linea.bindPopup(`<strong style="color:${color};">${icono} ${nombre}</strong><br><span style="font-size:0.75rem;">Transporte público de Morelia</span>`);
    linea.on('mouseover', () => linea.setStyle({ weight: 7 })).on('mouseout', () => linea.setStyle({ weight: 4 }));
    rutasLayer.addLayer(linea);
    rutaLineas.set(p.id, linea);
    return linea;
  }

  function toggleRuta(id, encuadrar) {
    const f = rutasData.find(x => x.properties.id === id); if (!f) return;
    if (rutasSeleccionadas.has(id)) {
      rutasSeleccionadas.delete(id); const l = rutaLineas.get(id); if (l) { rutasLayer.removeLayer(l); rutaLineas.delete(id); }
    } else {
      rutasSeleccionadas.add(id); const l = dibujarRutaGeo(f);
      if (encuadrar && l.getBounds) map.flyToBounds(l.getBounds(), { padding: [50,50], duration: 1 });
    }
    const row = rutasListEl.querySelector(`.ruta-item[data-id="${id}"]`); if (row) row.classList.toggle('active', rutasSeleccionadas.has(id));
    actualizarBadgeRutas();
  }

  function renderListaRutas(filtro) {
    const term = normalizarTexto(filtro || ''); rutasListEl.innerHTML = '';
    const visibles = rutasData.filter(f => !term || normalizarTexto(f.properties.nombre).includes(term));
    if (!visibles.length) { rutasListEl.innerHTML = '<div class="rutas-empty">Sin coincidencias.</div>'; return; }
    const frag = document.createDocumentFragment();
    visibles.forEach(f => {
      const p = f.properties, row = document.createElement('div');
      row.className = 'ruta-item' + (rutasSeleccionadas.has(p.id) ? ' active' : ''); row.dataset.id = p.id;
      row.innerHTML = `<span class="ruta-dot" style="background:${p.color};"></span><span class="ruta-nombre">${p.nombre}</span><span class="ruta-tipo">${p.tipo||''}</span><i class="fas fa-check ruta-check"></i>`;
      row.addEventListener('click', () => toggleRuta(p.id, true)); frag.appendChild(row);
    });
    rutasListEl.appendChild(frag);
  }

  function cargarRutas() {
    if (rutasCargadas || rutasCargando) return Promise.resolve();
    rutasCargando = true; rutasListEl.innerHTML = '<div class="rutas-empty"><i class="fas fa-circle-notch fa-spin"></i> Cargando rutas…</div>';
    return fetch('rutas_morelia.geojson').then(r => r.json()).then(fc => {
      rutasData = (fc.features || []).filter(f => f.geometry && f.geometry.type === 'LineString').sort((a,b) => a.properties.nombre.localeCompare(b.properties.nombre));
      rutasCargadas = true; rutasCargando = false; renderListaRutas('');
    }).catch(err => {
      rutasCargando = false;
      rutasListEl.innerHTML = '<div class="rutas-empty">🚧 Archivo de rutas no disponible.</div>';
    });
  }

  rutasToggleBtn.addEventListener('click', function(e) {
    e.stopPropagation(); const abierto = rutasMenu.classList.toggle('open'); this.setAttribute('aria-expanded', abierto);
    if (abierto) { cargarRutas(); setTimeout(() => rutasSearchEl.focus(), 50); }
  });
  rutasMenu.addEventListener('click', e => e.stopPropagation());
  rutasSearchEl.addEventListener('input', function() { renderListaRutas(this.value); });
  document.getElementById('rutasNinguna').addEventListener('click', () => {
    [...rutasSeleccionadas].forEach(id => { const l = rutaLineas.get(id); if (l) rutasLayer.removeLayer(l); });
    rutasSeleccionadas.clear(); rutaLineas.clear(); rutasListEl.querySelectorAll('.ruta-item.active').forEach(r => r.classList.remove('active'));
    actualizarBadgeRutas();
  });
  document.getElementById('rutasTodas').addEventListener('click', () => {
    rutasData.forEach(f => { if (!rutasSeleccionadas.has(f.properties.id)) { rutasSeleccionadas.add(f.properties.id); dibujarRutaGeo(f); } });
    rutasListEl.querySelectorAll('.ruta-item').forEach(r => r.classList.add('active')); actualizarBadgeRutas();
  });

  // ============================================================
  // 17. BASES DE RUTAS
  // ============================================================
  const basesLayer = L.layerGroup().addTo(map); let basesCargadas = false, basesCargando = false;
  function baseIcon(count) {
    const size = count >= 5 ? 34 : count >= 3 ? 28 : count >= 2 ? 24 : 16;
    const color = count >= 5 ? '#7c2d12' : count >= 3 ? '#b45309' : count >= 2 ? '#0e7490' : '#475569';
    return L.divIcon({ className: '', html: `<div class="base-pin" style="width:${size}px;height:${size}px;background:${color};">${count>1?count:''}</div>`, iconSize: [size,size], iconAnchor: [size/2,size/2] });
  }
  function pintarBases(fc) {
    (fc.features || []).forEach(f => {
      const c = f.geometry.coordinates, p = f.properties;
      const m = L.marker([c[1], c[0]], { icon: baseIcon(p.count), zIndexOffset: 500 });
      m.bindPopup(`<strong>🚏 ${p.count>1?'Terminal · '+p.count+' rutas':'Base de 1 ruta'}</strong><ul style="margin:0;padding-left:1.1rem;font-size:0.76rem;max-height:180px;overflow:auto;">${(p.rutas||[]).map(r=>`<li>${r}</li>`).join('')}</ul>`, {maxWidth:260});
      basesLayer.addLayer(m);
    });
  }
  document.getElementById('basesToggle').addEventListener('change', function() {
    if (this.checked) {
      if (basesCargadas) { basesLayer.addTo(map); return; }
      if (basesCargando) return;
      basesCargando = true;
      fetch('bases_morelia.geojson').then(r => r.json()).then(fc => { pintarBases(fc); basesCargadas = true; basesCargando = false; basesLayer.addTo(map); }).catch(() => { basesCargando = false; this.checked = false; toast('Archivo de bases no disponible.', 'info'); });
    } else map.removeLayer(basesLayer);
  });

  // ============================================================
  // 18. EXPORTAR E IMPORTAR CSV
  // ============================================================
  document.getElementById('exportCsvBtn').addEventListener('click', () => {
    if (!stations.length) return toast('No hay clientes.', 'info');
    let csv = 'nombre,lat,lon,estado,tamano,direccion,telefono\n';
    stations.forEach(s => csv += `"${s.nombre}",${s.lat},${s.lon},"${s.estado||''}","${s.tamano||''}","${s.direccion||''}","${s.telefono||''}"\n`);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv'})); a.download = 'clientes.csv'; a.click();
  });

  function parsearCSV(csvText) {
    const lines = csvText.split(/\r?\n/).filter(l => l.trim()); if (lines.length < 2) return [];
    const h0 = lines[0]; const cuenta = {',': (h0.match(/,/g)||[]).length,';':(h0.match(/;/g)||[]).length,'\t':(h0.match(/\t/g)||[]).length};
    const sep = Object.keys(cuenta).reduce((a,b) => cuenta[b] > cuenta[a] ? b : a, ',');
    function partir(linea) {
      if (sep === ',') return (linea.match(/("([^"]|"")*"|[^,]*)(,|$)/g)||[]).map(v => v.replace(/,$/,'').trim().replace(/^"|"$/g,'').replace(/""/g,'"'));
      return linea.split(sep).map(v => v.trim().replace(/^"|"$/g,'').replace(/""/g,'"'));
    }
    const header = partir(lines[0]).map(c => normalizarTexto(c));
    const idx = alias => { for (const a of alias) { const i = header.indexOf(a); if (i !== -1) return i; } return -1; };
    const iN = idx(['nombre','nombre comercial','razon social']), iLa = idx(['lat','latitud']), iLo = idx(['lon','longitud','lng']);
    if (iN===-1||iLa===-1||iLo===-1) return toast('Faltan columnas: nombre, lat, lon.', 'error');
    const iE = idx(['estado','entidad']), iT = idx(['tamano','categoria']), iD = idx(['direccion','domicilio']), iTe = idx(['telefono','tel']);
    const num = v => parseFloat(String(v||'').trim().replace(',','.'));
    const clientes = [];
    for (let i=1; i<lines.length; i++) {
      const vals = partir(lines[i]);
      const nombre = (vals[iN]||'').trim(), lat = num(vals[iLa]), lon = num(vals[iLo]);
      if (!nombre || isNaN(lat) || isNaN(lon)) continue;
      clientes.push({ nombre, lat, lon, estado: iE!==-1?vals[iE]||'':'', tamano: iT!==-1?vals[iT]||'':'', direccion: iD!==-1?vals[iD]||'':'', telefono: iTe!==-1?vals[iTe]||'':'' });
    }
    return clientes;
  }

  document.getElementById('importCsvBtn').addEventListener('click', () => document.getElementById('csvFileInput').click());
  document.getElementById('csvFileInput').addEventListener('change', function() {
    const file = this.files[0]; if (!file) return;
    const reader = new FileReader();
    function decodificarCSV(buffer) {
      const bytes = new Uint8Array(buffer);
      try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch (e) {
        const win = new TextDecoder('windows-1252').decode(bytes);
        const reps = [['\u00C3\u00A1','á'],['\u00C3\u00A9','é'],['\u00C3\u00AD','í'],['\u00C3\u00B3','ó'],['\u00C3\u00BA','ú'],['\u00C3\u00B1','ñ']];
        return reps.reduce((s, [a,b]) => s.split(a).join(b), win);
      }
    }
    reader.onload = ev => {
      let nuevos = parsearCSV(decodificarCSV(ev.target.result));
      if (!nuevos || !nuevos.length) return toast('CSV sin datos válidos.', 'error');
      nuevos = deduplicate(nuevos);
      const claves = new Set(stations.map(s => `${Math.round(s.lat*1e5)/1e5}|${Math.round(s.lon*1e5)/1e5}|${s.nombre.trim()}`));
      const agregados = nuevos.filter(c => !claves.has(`${Math.round(c.lat*1e5)/1e5}|${Math.round(c.lon*1e5)/1e5}|${c.nombre.trim()}`));
      if (!agregados.length) return toast('Todos los clientes del CSV ya existen.', 'info');
      enriquecer(agregados);
      stations.push(...agregados);
      reconstruirMarcadoresClientes(); actualizarSelectTamano(); applyFilters();
      document.getElementById('rTotal').textContent = stations.length;
      try { localStorage.setItem('CLIENTES_JS', `window.CLIENTES_POTENCIALES = ${JSON.stringify(stations)};`); localStorage.setItem('CLIENTES_ACTUALIZADO', Date.now().toString()); } catch (e) { if(e.name === 'QuotaExceededError') toast('Almacenamiento lleno.', 'error'); }
      toast(`${agregados.length} cliente(s) importado(s).`, 'success');
      const list = document.getElementById('importResultList');
      list.innerHTML = agregados.map(c => `<div style="padding:4px 0;border-bottom:1px solid var(--border);"><strong>${c.nombre}</strong> <span style="color:var(--text-muted);font-size:0.7rem;">(${c.lat.toFixed(5)}, ${c.lon.toFixed(5)})</span></div>`).join('');
      document.getElementById('importResultTitle').textContent = `📥 ${agregados.length} cliente(s) importado(s)`;
      document.getElementById('importResultModalOverlay').classList.add('open');
    };
    reader.onerror = () => toast('Error al leer archivo.', 'error');
    reader.readAsArrayBuffer(file);
    this.value = '';
  });
  document.getElementById('importResultCloseBtn').addEventListener('click', () => document.getElementById('importResultModalOverlay').classList.remove('open'));

  // ============================================================
  // 19. GEOCODIFICACIÓN
  // ============================================================
  async function geocodeCliente(cliente) {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${cliente.lat}&lon=${cliente.lon}&format=json&zoom=16&addressdetails=1`;
    try {
      const resp = await fetch(url, { headers: { 'User-Agent': 'ClientesPotencialesMap/1.0' } });
      if (!resp.ok) return null;
      const data = await resp.json();
      return data?.display_name ? { direccion: data.display_name, estado: data.address?.state || '' } : null;
    } catch (e) { return null; }
  }

  let geocodeCancelado = false;
  async function geocodeClientesVisibles() {
    const visible = applyFilters(); if (!visible.length) return toast('Primero selecciona un círculo de radio.', 'info');
    const sinDir = visible.filter(s => !s.direccion); if (!sinDir.length) return toast('Todos ya tienen dirección.', 'info');
    geocodeCancelado = false; document.getElementById('geocodeBtn').disabled = true;
    const progress = document.getElementById('geocodeProgress'), status = document.getElementById('geoStatus'), count = document.getElementById('geoCount'), fill = document.getElementById('geoFill');
    progress.style.display = 'block'; let procesados = 0;
    for (const s of sinDir) {
      if (geocodeCancelado) break;
      status.textContent = `Dirección para: ${s.nombre}`; count.textContent = `${procesados+1}/${sinDir.length}`; fill.style.width = `${(procesados/sinDir.length)*100}%`;
      const result = await geocodeCliente(s); if (result) { s.direccion = result.direccion; s.estado = result.estado || s.estado; }
      procesados++; fill.style.width = `${(procesados/sinDir.length)*100}%`; await new Promise(r => setTimeout(r, 200));
    }
    document.getElementById('geocodeBtn').disabled = false;
    if (geocodeCancelado) { status.textContent = 'Cancelado.'; toast(`Cancelado: ${procesados}/${sinDir.length}.`, 'info'); }
    else { status.textContent = 'Completado.'; toast(`Direcciones para ${sinDir.length} cliente(s).`, 'success'); }
    setTimeout(() => { progress.style.display = 'none'; }, 2000);
    try { localStorage.setItem('CLIENTES_JS', `window.CLIENTES_POTENCIALES = ${JSON.stringify(stations)};`); localStorage.setItem('CLIENTES_ACTUALIZADO', Date.now().toString()); } catch (e) { if(e.name === 'QuotaExceededError') toast('Almacenamiento lleno.', 'error'); }
    applyFilters();
  }
  document.getElementById('geocodeBtn').addEventListener('click', geocodeClientesVisibles);
  document.getElementById('cancelGeoBtn').addEventListener('click', () => { geocodeCancelado = true; });

  document.addEventListener('click', async function(e) {
    if (!e.target.classList.contains('btn-geocode')) return;
    const lat = parseFloat(e.target.dataset.lat), lon = parseFloat(e.target.dataset.lon), nombre = e.target.dataset.nombre;
    const cliente = stations.find(s => s.lat === lat && s.lon === lon && s.nombre === nombre);
    if (!cliente || cliente.direccion) return;
    const result = await geocodeCliente(cliente);
    if (result) {
      cliente.direccion = result.direccion; cliente.estado = result.estado || cliente.estado;
      if (document.getElementById('detailCard').classList.contains('open')) abrirDetalle(cliente);
      try { localStorage.setItem('CLIENTES_JS', `window.CLIENTES_POTENCIALES = ${JSON.stringify(stations)};`); localStorage.setItem('CLIENTES_ACTUALIZADO', Date.now().toString()); } catch (e) { if(e.name === 'QuotaExceededError') toast('Almacenamiento lleno.', 'error'); }
      applyFilters();
    } else toast('No se pudo obtener la dirección.', 'error');
  });

  function actualizarSelectTamano() {
    const select = document.getElementById('tamanoFilter'), currentVal = select.value;
    while (select.options.length > 1) select.remove(1);
    const tamanos = [...new Set(stations.map(s => s.tamano).filter(Boolean))].sort();
    let hayCombi = false, hayTaxi = false;
    for (const s of stations) { const c = categoriaEspecial(s); if (c==='combi') hayCombi = true; else if (c==='taxi') hayTaxi = true; if (hayCombi && hayTaxi) break; }
    const opciones = [...tamanos]; if (hayCombi && !opciones.includes(CAT_COMBI)) opciones.push(CAT_COMBI); if (hayTaxi && !opciones.includes(CAT_TAXI)) opciones.push(CAT_TAXI);
    opciones.forEach(t => { const opt = document.createElement('option'); opt.value = t; opt.textContent = t; select.appendChild(opt); });
    select.value = [...select.options].some(o => o.value === currentVal) ? currentVal : 'all';
  }

  function recargarClientes() {
    const nuevoJS = localStorage.getItem('CLIENTES_JS'); if (!nuevoJS) return;
    try {
      const nuevos = leerArrayGuardado(nuevoJS); if (!nuevos || !Array.isArray(nuevos)) return;
      stations.length = 0; stations.push(...filtrarPorRadio190(enriquecer(deduplicate(nuevos))));
      reconstruirMarcadoresClientes(); actualizarSelectTamano(); applyFilters();
      actualizarEstadoCarga(stations.length, contarPorAncla(stations));
    } catch (e) {}
  }
  window.addEventListener('storage', function(e) { if (e.key === 'CLIENTES_ACTUALIZADO') recargarClientes(); });

  // ============================================================
  // 20. MI UBICACIÓN
  // ============================================================
  let miUbicacionMarker = null;
  function miUbicacionIcon() {
    return L.divIcon({ className: '', html: `<svg width="32" height="44"><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-14C28 6.27 22.73 0 14 0z" fill="#FFA000" stroke="var(--border)" stroke-width="1.2"/><circle cx="14" cy="14" r="7.2" fill="white"/><circle cx="14" cy="10.4" r="2.3" fill="#FFA000"/><path d="M9.3 19.4c0-4.4 1.7-6.4 4.7-6.4s4.7 2 4.7 6.4z" fill="#FFA000"/></svg>`, iconSize:[32,44], iconAnchor:[16,44], popupAnchor:[0,-40] });
  }

  document.getElementById('locBtn').addEventListener('click', function() {
    const btn = this; if (btn.classList.contains('loading')) return;
    if (!navigator.geolocation) return toast('Geolocalización no soportada.', 'error');
    btn.classList.add('loading');
    navigator.geolocation.getCurrentPosition(pos => {
      btn.classList.remove('loading');
      const { latitude: lat, longitude: lon } = pos.coords;
      miUbicacionCoords = { lat, lon }; actualizarCirculoCercaDeMi(lat, lon);
      if (miUbicacionMarker) map.removeLayer(miUbicacionMarker);
      miUbicacionMarker = L.marker([lat, lon], { icon: miUbicacionIcon(), zIndexOffset: 2000 }).addTo(map)
        .bindPopup('📍 Estás aquí · clic para mostrar/ocultar clientes a 1 km').on('click', toggleCercaDeMi).openPopup();
      activarCercaDeMi();
    }, err => {
      btn.classList.remove('loading');
      const msg = err.code === err.PERMISSION_DENIED ? 'Permiso de ubicación denegado.' : 'Error al obtener ubicación.';
      toast(msg, 'error');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });

  // ============================================================
  // 21. PATCHES: FILTROS RÁPIDOS, ATAJOS, KPIs, DASHBOARD, PRESENTACIÓN, BOTTOM SHEET
  // ============================================================
  (function() {
    const strip = document.getElementById('quickFilters');
    if (!strip) return;
    const tamFilter = document.getElementById('tamanoFilter');

    function classifyQF(s) {
      const t = (s.tamano || '').toLowerCase();
      const n = (s.nombre || '').toLowerCase();
      const tags = [];
      if (/taxi/.test(t) || /taxi/.test(n))          tags.push('taxis');
      if (/combi/.test(t) || /combi/.test(n))        tags.push('combis');
      if (/industr|parque/.test(t))                  tags.push('industria');
      if (/grande/.test(t))                          tags.push('grandes');
      if (!s.direccion)                              tags.push('sindir');
      return tags;
    }

    function refreshCounts() {
      const cnts = { all: stations.length, taxis:0, combis:0, industria:0, grandes:0, sindir:0, marcadores:0 };
      stations.forEach(s => classifyQF(s).forEach(k => { if (cnts[k] !== undefined) cnts[k]++; }));
      cnts.marcadores = marcadores.length;
      Object.keys(cnts).forEach(k => {
        const el = document.getElementById('qfCount-' + k);
        if (el) el.textContent = cnts[k];
      });
    }
    refreshCounts();
    setInterval(refreshCounts, 4000);

    strip.addEventListener('click', function(e) {
      const btn = e.target.closest('.qf-chip');
      if (!btn) return;
      strip.querySelectorAll('.qf-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const kind = btn.dataset.qf;

      const noAddrBtn = document.getElementById('noAddressBtn');
      window.activeNoAddress = false;
      if (noAddrBtn) noAddrBtn.classList.remove('active');
      if (tamFilter) tamFilter.value = 'all';

      try {
        if (kind === 'all') {
          // nada
        } else if (kind === 'taxis') {
          if (tamFilter) tamFilter.value = CAT_TAXI;
        } else if (kind === 'combis') {
          if (tamFilter) tamFilter.value = CAT_COMBI;
        } else if (kind === 'industria') {
          const opciones = tamFilter ? [...tamFilter.options].map(o => o.value) : [];
          const match = opciones.find(v => /industr|parque/i.test(v));
          if (match) tamFilter.value = match;
        } else if (kind === 'grandes') {
          const opciones = tamFilter ? [...tamFilter.options].map(o => o.value) : [];
          const match = opciones.find(v => /grande/i.test(v));
          if (match) tamFilter.value = match;
        } else if (kind === 'sindir') {
          window.activeNoAddress = true;
          if (noAddrBtn) noAddrBtn.classList.add('active');
        } else if (kind === 'marcadores') {
          if (marcadores.length) {
            const b = L.latLngBounds(marcadores.map(m => [m.lat, m.lon]));
            map.flyToBounds(b, { padding: [40,40], duration: 1.0 });
          }
        }
      } catch (err) { console.warn('QF error:', err); }
      applyFilters();
    });
  })();

  (function() {
    document.addEventListener('keydown', function(e) {
      const activeTag = (document.activeElement && document.activeElement.tagName) || '';
      const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'f' || e.key === 'F')) {
        const inp = document.getElementById('searchInput');
        if (inp) { e.preventDefault(); inp.focus(); inp.select(); }
        return;
      }

      if (e.key === 'Escape' || e.key === 'Esc') {
        document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
        document.querySelectorAll('[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
        document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
        const inp = document.getElementById('searchInput');
        if (inp && document.activeElement === inp) inp.blur();
        return;
      }

      if (!isTyping) {
        const keyMap = {
          'm': 'centerMoreliaBtn',
          't': 'centerTototlanBtn',
          'u': 'locBtn',
          'd': 'toggleRailBtn',
          'r': 'resetBtn'
        };
        const id = keyMap[e.key.toLowerCase()];
        if (id) {
          const b = document.getElementById(id);
          if (b) { e.preventDefault(); b.click(); }
        }
      }
    });
  })();

  (function() {
    const tips = {
      'searchInput':       'Buscar cliente · Ctrl+K',
      'centerMoreliaBtn':  'Centrar en Morelia · M',
      'centerTototlanBtn': 'Centrar en Tototlán · T',
      'locBtn':            'Mi ubicación · U',
      'toggleRailBtn':     'Directorio · D',
      'resetBtn':          'Restablecer vista · R'
    };
    Object.keys(tips).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.setAttribute('data-tooltip', tips[id]);
    });
  })();

  (function() {
    const rMatch = document.getElementById('rMatch');
    const kpiAvg = document.getElementById('kpiAvg');
    const kpiNoAddr = document.getElementById('kpiNoAddr');
    const kpiRoutes = document.getElementById('kpiRoutes');

    function refreshKPIs() {
      const sinDir = stations.filter(s => !s.direccion).length;
      if (kpiNoAddr) kpiNoAddr.textContent = sinDir;
      let rutas = 0;
      try {
        if (window.rutaLayer || (typeof rutaLayer !== 'undefined' && rutaLayer)) rutas++;
        if (typeof rutasVisiblesCount === 'function') rutas += rutasVisiblesCount();
      } catch (e) {}
      if (kpiRoutes) kpiRoutes.textContent = rutas;
    }
    refreshKPIs();
    setInterval(refreshKPIs, 3000);

    const orig = window.applyFilters;
    window.applyFilters = function() {
      const r = orig.apply(this, arguments);
      if (Array.isArray(r) && r.length) {
        const sum = r.reduce((a, s) => a + (s._matchDist || 0), 0);
        const avg = sum / r.length;
        if (kpiAvg) kpiAvg.textContent = avg.toFixed(0);
      } else {
        if (kpiAvg) kpiAvg.textContent = '–';
      }
      refreshKPIs();
      return r;
    };
  })();

  const dbOverlay = document.getElementById('dashboardOverlay');
  const dbClose   = document.getElementById('dbClose');
  const dbBtn     = document.getElementById('dashboardBtn');
  let chartsInstances = {};
  function destruirCharts() {
    Object.values(chartsInstances).forEach(c => { try { c.destroy(); } catch(e) {} });
    chartsInstances = {};
  }
  function renderDashboard() {
    if (typeof Chart === 'undefined') { toast('El módulo de gráficos aún no está listo', 'info'); return; }
    destruirCharts();

    const total = stations.length;
    const sinDir = stations.filter(s => !s.direccion).length;
    const promedio = total ? (stations.reduce((a, s) => a + s.distKm, 0) / total).toFixed(1) : '0';
    const morelia = stations.filter(s => s.origen === 'morelia').length;
    const tototlan = total - morelia;

    document.getElementById('dbKpis').innerHTML = `
      <div class="kpi"><div class="lbl">Total</div><div class="val">${total}</div></div>
      <div class="kpi"><div class="lbl">Sin dirección</div><div class="val">${sinDir}</div></div>
      <div class="kpi"><div class="lbl">Promedio</div><div class="val">${promedio}<small>km</small></div></div>
      <div class="kpi"><div class="lbl">A Morelia</div><div class="val">${morelia}</div></div>
      <div class="kpi"><div class="lbl">A Tototlán</div><div class="val">${tototlan}</div></div>
    `;

    const cs = getComputedStyle(document.documentElement);
    const textColor = cs.getPropertyValue('--text-main').trim() || '#1e293b';
    const gridColor = cs.getPropertyValue('--border').trim() || '#e2e8f0';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = textColor;

    const porEstado = {};
    stations.forEach(s => { const k = s.estado || 'Sin estado'; porEstado[k] = (porEstado[k]||0)+1; });
    const estOrdenados = Object.entries(porEstado).sort((a,b) => b[1]-a[1]).slice(0, 8);
    chartsInstances.estado = new Chart(document.getElementById('chartEstado'), {
      type: 'bar',
      data: {
        labels: estOrdenados.map(e => e[0]),
        datasets: [{ data: estOrdenados.map(e => e[1]), backgroundColor: '#1F5CA9', borderRadius: 6 }]
      },
      options: {
        plugins: { legend: { display: false } },
        indexAxis: 'y',
        scales: {
          x: { grid: { color: gridColor }, beginAtZero: true },
          y: { grid: { display: false } }
        },
        animation: { duration: 700 }
      }
    });

    const porTam = {};
    stations.forEach(s => { const k = s.tamano || 'Sin categoría'; porTam[k] = (porTam[k]||0)+1; });
    const tamEntries = Object.entries(porTam).sort((a,b) => b[1]-a[1]).slice(0, 6);
    const palette = ['#1F5CA9','#0891b2','#10b981','#f59e0b','#8b5cf6','#ef4444','#64748b'];
    chartsInstances.tamano = new Chart(document.getElementById('chartTamano'), {
      type: 'doughnut',
      data: {
        labels: tamEntries.map(e => e[0]),
        datasets: [{ data: tamEntries.map(e => e[1]), backgroundColor: palette }]
      },
      options: {
        plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } },
        cutout: '55%',
        animation: { animateRotate: true, duration: 700 }
      }
    });

    const bins = [0,0,0,0,0];
    stations.forEach(s => {
      if (s.distKm <= 50) bins[0]++;
      else if (s.distKm <= 100) bins[1]++;
      else if (s.distKm <= 150) bins[2]++;
      else if (s.distKm <= 190) bins[3]++;
      else bins[4]++;
    });
    chartsInstances.dist = new Chart(document.getElementById('chartDist'), {
      type: 'bar',
      data: {
        labels: ['0-50', '50-100', '100-150', '150-190', '>190'],
        datasets: [{ data: bins, backgroundColor: ['#10b981','#34d399','#fbbf24','#fb923c','#94a3b8'], borderRadius: 6 }]
      },
      options: {
        plugins: { legend: { display: false } },
        scales: { y: { grid: { color: gridColor }, beginAtZero: true }, x: { grid: { display: false } } },
        animation: { duration: 700 }
      }
    });

    chartsInstances.ancla = new Chart(document.getElementById('chartAncla'), {
      type: 'doughnut',
      data: {
        labels: ['Morelia', 'Tototlán'],
        datasets: [{ data: [morelia, tototlan], backgroundColor: ['#1F5CA9', '#FF6B35'] }]
      },
      options: {
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } },
        cutout: '58%',
        animation: { animateRotate: true, duration: 700 }
      }
    });
  }
  dbBtn.addEventListener('click', () => {
    dbOverlay.classList.add('open');
    setTimeout(renderDashboard, 60);
  });
  dbClose.addEventListener('click', () => { dbOverlay.classList.remove('open'); destruirCharts(); });
  dbOverlay.addEventListener('click', (e) => { if (e.target === dbOverlay) { dbOverlay.classList.remove('open'); destruirCharts(); } });

  // --- MODO PRESENTACIÓN ---
  const presentBtn = document.getElementById('presentBtn');
  const presentHud = document.getElementById('presentHud');
  const pExitBtn   = document.getElementById('pExitBtn');
  const pHudKpis   = document.getElementById('pHudKpis');
  let tourTimer = null;
  let currentView = 'tour';

  function renderHudKpis() {
    const total = stations.length;
    const sinDir = stations.filter(s => !s.direccion).length;
    const morelia = stations.filter(s => s.origen === 'morelia').length;
    const tototlan = total - morelia;
    const promedio = total ? (stations.reduce((a, s) => a + s.distKm, 0) / total).toFixed(1) : '0';
    pHudKpis.innerHTML = `
      <div class="p-kpi"><div class="lbl">Clientes</div><div class="val">${total}</div></div>
      <div class="p-kpi"><div class="lbl">A Morelia</div><div class="val">${morelia}</div></div>
      <div class="p-kpi"><div class="lbl">A Tototlán</div><div class="val">${tototlan}</div></div>
      <div class="p-kpi"><div class="lbl">Distancia media</div><div class="val">${promedio}<small>km</small></div></div>
      <div class="p-kpi"><div class="lbl">Sin dirección</div><div class="val">${sinDir}</div></div>
    `;
  }

  function pView(name) {
    if (!map) return;
    if (name === 'morelia')  map.flyTo([ANCLA_MORELIA.lat, ANCLA_MORELIA.lon], 10, { duration: 2.5 });
    if (name === 'tototlan') map.flyTo([ANCLA_TOTOTLAN.lat, ANCLA_TOTOTLAN.lon], 10, { duration: 2.5 });
    if (name === 'both')     { const b = L.latLngBounds([[ANCLA_MORELIA.lat, ANCLA_MORELIA.lon],[ANCLA_TOTOTLAN.lat, ANCLA_TOTOTLAN.lon]]); map.flyToBounds(b, { padding:[80,80], duration: 2.5 }); }
  }

  function pTour() {
    stopTour();
    const seq = ['morelia', 'tototlan', 'both'];
    let i = 0;
    pView(seq[0]);
    tourTimer = setInterval(() => {
      i = (i + 1) % seq.length;
      pView(seq[i]);
    }, 6000);
  }
  function stopTour() { if (tourTimer) { clearInterval(tourTimer); tourTimer = null; } }

  function entrarPresentacion() {
    renderHudKpis();
    document.body.classList.add('presenting');
    try { map.invalidateSize(); } catch(e) {}
    try {
      if (typeof activarCirculoId === 'function' && activeCircleFilters.size === 0) {
        activarCirculoId('190Morelia');
        activarCirculoId('190Tototlan');
        applyFilters();
      }
    } catch(e) {}
    currentView = 'tour';
    presentHud.querySelectorAll('.p-ctrl').forEach(c => c.classList.toggle('active', c.dataset.view === 'tour'));
    pTour();
  }
  function salirPresentacion() {
    stopTour();
    document.body.classList.remove('presenting');
    try { map.invalidateSize(); } catch(e) {}
  }
  presentBtn.addEventListener('click', entrarPresentacion);
  pExitBtn.addEventListener('click', salirPresentacion);

  presentHud.addEventListener('click', function(e) {
    const btn = e.target.closest('.p-ctrl');
    if (!btn) return;
    presentHud.querySelectorAll('.p-ctrl').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    if (currentView === 'tour') { pTour(); }
    else { stopTour(); pView(currentView); }
  });

  document.addEventListener('keydown', function(e) {
    const activeTag = (document.activeElement && document.activeElement.tagName) || '';
    const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA';
    if (e.key === 'Escape' || e.key === 'Esc') {
      if (document.body.classList.contains('presenting')) { salirPresentacion(); return; }
      if (dbOverlay.classList.contains('open')) { dbOverlay.classList.remove('open'); destruirCharts(); return; }
      if (document.getElementById('detailCard').classList.contains('open')) { cerrarDetalle(); return; }
    }
    if (!isTyping) {
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); presentBtn.click(); }
      if (e.key === 'b' || e.key === 'B') { e.preventDefault(); dbBtn.click(); }
    }
  });

  // --- BOTTOM SHEET (móvil) ---
  (function() {
    if (!window.matchMedia('(max-width: 768px)').matches) return;
    const rail = document.getElementById('railPanel');
    if (!rail) return;
    let state = 'half';
    rail.classList.add('sheet-half');

    let startY = null, startState = null;
    function onStart(e) {
      const rect = rail.getBoundingClientRect();
      const y = (e.touches ? e.touches[0].clientY : e.clientY);
      if (y - rect.top > 30) return;
      startY = y;
      startState = state;
      rail.style.transition = 'none';
    }
    function onMove(e) {
      if (startY == null) return;
      const y = (e.touches ? e.touches[0].clientY : e.clientY);
      const dy = y - startY;
      if (Math.abs(dy) > 8) e.preventDefault && e.preventDefault();
    }
    function setSheet(newState) {
      rail.classList.remove('sheet-collapsed', 'sheet-half', 'sheet-full');
      rail.classList.add('sheet-' + newState);
      state = newState;
    }
    function onEnd(e) {
      if (startY == null) return;
      rail.style.transition = '';
      const y = (e.changedTouches ? e.changedTouches[0].clientY : e.clientY);
      const dy = y - startY;
      const order = ['collapsed','half','full'];
      let idx = order.indexOf(startState);
      if (dy < -40)  idx = Math.min(order.length - 1, idx + 1);
      else if (dy > 40) idx = Math.max(0, idx - 1);
      setSheet(order[idx]);
      startY = null;
    }
    rail.addEventListener('touchstart', onStart, { passive: true });
    rail.addEventListener('touchmove', onMove, { passive: false });
    rail.addEventListener('touchend', onEnd);
    rail.addEventListener('click', function(e) {
      const rect = rail.getBoundingClientRect();
      const y = e.clientY;
      if (y - rect.top < 30) {
        setSheet(state === 'collapsed' ? 'half' : (state === 'half' ? 'full' : 'collapsed'));
      }
    });
  })();

  // ============================================================
  // 🟢 CORRECCIÓN: Event listener para el filtro de tamaño
  // ============================================================
  // Este es el bloque que faltaba en la versión anterior
  document.getElementById('tamanoFilter').addEventListener('change', function() {
    // Desactivar cualquier chip de filtro rápido para mantener coherencia visual
    document.querySelectorAll('.qf-chip.active').forEach(c => c.classList.remove('active'));
    const allChip = document.querySelector('.qf-chip[data-qf="all"]');
    if (allChip) allChip.classList.add('active');
    applyFilters();
  });

  // ============================================================
  // CORRECCIÓN FINAL: EVENTOS DEL BUSCADOR Y LIMPIAR FILTROS
  // ============================================================
  const searchInput = document.getElementById('searchInput');
  const clearAllBtn = document.getElementById('clearAllBtn');

  searchInput.addEventListener('input', function(e) {
      searchTerm = normalizarTexto(e.target.value);
      applyFilters();
  });

  function limpiarFiltros() {
      searchTerm = '';
      searchInput.value = '';
      [...activeCircleFilters].forEach(id => desactivarCirculoId(id));
      activeCircleFilters.clear();
      actualizarEtiquetaCirculos();
      activePrice = null;
      maxDist = 190;
      document.getElementById('distSlider').value = 190;
      document.getElementById('distLabel').textContent = '190 km';
      window.activeNoAddress = false;
      document.getElementById('noAddressBtn').classList.remove('active');
      document.getElementById('tamanoFilter').value = 'all';
      document.querySelectorAll('.qf-chip.active').forEach(c => c.classList.remove('active'));
      document.querySelector('.qf-chip[data-qf="all"]').classList.add('active');
      applyFilters();
      verAmbasAnclas();
      toast('🧹 Filtros y búsqueda limpiados.', 'success');
  }

  clearAllBtn.addEventListener('click', limpiarFiltros);

  // ============================================================
  // CORRECCIÓN FINAL: BOTONES DE ESTILO DE MAPA
  // ============================================================
  const mapStyleFab = document.getElementById('mapStyleFab');
  mapStyleFab.addEventListener('click', function(e) {
    const btn = e.target.closest('.msb');
    if (!btn) return;

    this.querySelectorAll('.msb').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const style = btn.dataset.style;
    if (baseLayers[style]) {
      Object.keys(baseLayers).forEach(key => {
        if (map.hasLayer(baseLayers[key])) {
          map.removeLayer(baseLayers[key]);
        }
      });
      baseLayers[style].addTo(map);
    }
  });

  // ============================================================
  // 22. INICIALIZACIÓN FINAL
  // ============================================================
  reconstruirMarcadoresClientes();
  actualizarSelectTamano();
  applyFilters();
  document.getElementById('rTotal').textContent = stations.length;
  setTimeout(() => map.invalidateSize(), 100);

  if (window.matchMedia('(max-width: 768px)').matches) {
    document.getElementById('railPanel').classList.add('hidden');
    document.getElementById('railToggleIcon').className = 'fas fa-chevron-left';
  }

  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) loadingOverlay.classList.add('hidden');

  log(`Mapa iniciado con ${stations.length} clientes.`);

  window.stations = stations;
  window.map = map;
  window.applyFilters = applyFilters;
  window.baseLayers = baseLayers;

}); // Fin de DOMContentLoaded
