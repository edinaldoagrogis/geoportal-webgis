// Leaflet is loaded globally via CDN


// Initialize Map
const map = L.map('map', {
    zoomControl: false // We will add it manually to position it better
}).setView([-14.2350, -51.9253], 5); // Default view over Brazil

// Add Zoom Control to top right
L.control.zoom({
    position: 'topright'
}).addTo(map);

// Add Measure Control (Ruler for area and distance)
const measureControl = new L.Control.Measure({
    position: 'topright',
    primaryLengthUnit: 'meters',
    secondaryLengthUnit: 'kilometers',
    primaryAreaUnit: 'sqmeters',
    secondaryAreaUnit: 'hectares',
    activeColor: '#10b981',
    completedColor: '#3b82f6',
    localization: 'pt_BR' 
});
measureControl.addTo(map);

// Add Scale Bar
L.control.scale({
    position: 'bottomright',
    metric: true,
    imperial: false,
    maxWidth: 200
}).addTo(map);

// Define Base Layers
const baseLayers = {
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19
    }),
    street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    }),
    dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19
    })
};

// Set initial base layer
baseLayers.satellite.addTo(map);

// Handle Base Layer Switching
document.querySelectorAll('input[name="base-layer"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        Object.values(baseLayers).forEach(layer => {
            if (map.hasLayer(layer)) {
                map.removeLayer(layer);
            }
        });
        baseLayers[e.target.value].addTo(map);
    });
});

// Vector Layer Styles
const colorRamp = [
    '#9333ea', // Purple
    '#16a34a', // Green
    '#2563eb', // Blue
    '#dc2626', // Red
    '#ea580c', // Orange
    '#ca8a04', // Yellow
    '#0d9488', // Teal
    '#c026d3', // Pink
    '#65a30d', // Lime
    '#b45309', // Brown
    '#0284c7', // Light Blue
    '#e11d48'  // Rose
];

function getFazendaColor(fazendaId) {
    if (!fazendaId) return '#10b981';
    let hash = 0;
    for (let i = 0; i < fazendaId.length; i++) {
        hash = fazendaId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colorRamp.length;
    return colorRamp[index];
}

const highlightStyle = {
    weight: 3,
    color: '#ffffff', // White highlight for selected
    opacity: 1,
    fillOpacity: 0.7
};

let geojsonLayer = null;
let fazendaLabelsLayer = L.layerGroup();
let currentlySelectedLayer = null;

// Handle zoom based label visibility
function updateZoomClasses() {
    const mapContainer = document.getElementById('map');
    const currentZoom = map.getZoom();
    
    // Talh√£o labels: appear at zoom >= 14 (approx 3km scale or closer)
    if (currentZoom >= 14) {
        mapContainer.classList.add('zoom-talhao-visible');
        mapContainer.classList.remove('zoom-talhao-hidden');
    } else {
        mapContainer.classList.add('zoom-talhao-hidden');
        mapContainer.classList.remove('zoom-talhao-visible');
    }
    
    // Fazenda labels: appear at zoom >= 12 (approx 10km scale or closer)
    if (currentZoom >= 12) {
        mapContainer.classList.add('zoom-fazenda-visible');
        mapContainer.classList.remove('zoom-fazenda-hidden');
    } else {
        mapContainer.classList.add('zoom-fazenda-hidden');
        mapContainer.classList.remove('zoom-fazenda-visible');
    }
}
map.on('zoomend', updateZoomClasses);
updateZoomClasses(); // initial call

// Clear selection styles when a popup closes
map.on('popupclose', () => {
    if (currentlySelectedLayer && geojsonLayer) {
        geojsonLayer.resetStyle(currentlySelectedLayer);
        currentlySelectedLayer = null;
    }
});

// Function to generate popup HTML with specific columns
function generatePopupContent(properties) {
    let content = '<div class="popup-info-container"><h4>Atributos do Pol√≠gono</h4>';
    
    // Define the specific columns to show in order
    const columns = [
        { key: 'NOME_FAZ', label: 'NOME FAZ' },
        { key: 'TALHAO', label: 'TALH√ÉO' },
        { key: 'ZONA', label: 'ZONA' },
        { key: 'TALHAO_ARE', label: '√ÅREA (ha)' } // Fixed key to TALHAO_ARE
    ];
    
    columns.forEach(col => {
        let value = properties[col.key];
        
        // Skip if value is missing
        if (value === null || value === undefined || value === '') return;
        
        // Format TALHAO_ARE to 2 decimal places
        if (col.key === 'TALHAO_ARE' && !isNaN(value)) {
            value = parseFloat(value).toFixed(2);
        }
        
        content += `
            <div style="margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">
                <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">${col.label}</div>
                <div style="font-size: 0.95rem; font-weight: 500; color: #f8fafc; word-break: break-word;">${value}</div>
            </div>`;
    });
    
    content += '</div>';
    return content;
}

// Function to load Vector Data
function loadFazendasData() {
    const loadingIndicator = document.getElementById('fazendas-loading');
    const checkbox = document.getElementById('layer-fazendas');
    
    try {
        if (typeof fazendasData === 'undefined') {
            throw new Error('Dados n√£o encontrados. O arquivo BASE_FAZENDAS.js foi carregado?');
        }
        
        const fazendaBounds = {};
        const fazendaInfo = {};

        geojsonLayer = L.geoJSON(fazendasData, {
            style: (feature) => {
                const color = getFazendaColor(feature.properties['DL FUNDOAGRIC']);
                return {
                    color: color, 
                    weight: 1,
                    opacity: 0.8,
                    fillColor: color,
                    fillOpacity: 0.45
                };
            },
            onEachFeature: (feature, layer) => {
                // Add static labels (tooltips) to the center of each polygon
                if (feature.properties) {
                    const cod = feature.properties['COD_TALHAO'] || '';
                    const area = feature.properties['TALHAO_ARE'] ? parseFloat(feature.properties['TALHAO_ARE']).toFixed(2).replace('.', ',') : '';
                    const var_dl = feature.properties['DL VARIEDADE'] || '';
                    
                    const tooltipContent = `
                        <div style="text-align: center; line-height: 1.0; font-family: 'Inter', sans-serif;">
                            <span style="font-size: 9px; font-weight: 700; color: #1f2937;">${cod}</span><br>
                            <span style="font-size: 8px; font-weight: 600; color: #1f2937;">${area}</span><br>
                            <span style="font-size: 7px; font-weight: 600; color: #1f2937;">${var_dl}</span>
                        </div>
                    `;
                    
                    layer.bindTooltip(tooltipContent, {
                        permanent: true,
                        direction: 'center',
                        className: 'transparent-tooltip talhao-label'
                    });
                }

                layer.on({
                    mouseover: (e) => {
                        const l = e.target;
                        if (routeMode) return; // Don't highlight on hover during route mode
                        if (l !== currentlySelectedLayer) {
                            l.setStyle(highlightStyle);
                            if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                                l.bringToFront();
                            }
                        }
                    },
                    mouseout: (e) => {
                        const l = e.target;
                        if (routeMode) return;
                        if (l !== currentlySelectedLayer) {
                            geojsonLayer.resetStyle(l);
                        }
                    },
                    click: (e) => {
                        L.DomEvent.stopPropagation(e);
                        const l = e.target;

                        // ---- ROUTE MODE: intercept click for origin/destination ----
                        if (routeMode) {
                            const name = (feature.properties && feature.properties['NOME_FAZ']) || 'Desconhecido';
                            const center = l.getBounds().getCenter();

                            if (!routeOriginLayer) {
                                // SELECT ORIGIN
                                routeOriginLayer = l;
                                l.setStyle(ROUTE_ORIGIN_STYLE);
                                if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) l.bringToFront();
                                originMarker = L.marker(center, { icon: originIcon, zIndexOffset: 2000 }).addTo(map);
                                setRouteStatus(`üü¢ Origem: "${name}". Agora clique no pol√≠gono de DESTINO.`, 'info');

                            } else if (!routeDestLayer && l !== routeOriginLayer) {
                                // SELECT DESTINATION
                                routeDestLayer = l;
                                l.setStyle(ROUTE_DEST_STYLE);
                                if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) l.bringToFront();
                                destMarker = L.marker(center, { icon: destIcon, zIndexOffset: 2000 }).addTo(map);
                                map.getContainer().style.cursor = '';
                                routeMode = false;
                                document.getElementById('btn-route-start').textContent = 'üìç Iniciar Rota';

                                const originName = (routeOriginLayer.feature.properties && routeOriginLayer.feature.properties['NOME_FAZ']) || '';
                                const originCenter = routeOriginLayer.getBounds().getCenter();
                                drawRoute(originCenter, center, originName, name);
                            }
                            return; // Don't open popup in route mode
                        }

                        // ---- NORMAL MODE: select polygon and show popup ----
                        if (currentlySelectedLayer && currentlySelectedLayer !== l) {
                            geojsonLayer.resetStyle(currentlySelectedLayer);
                        }
                        currentlySelectedLayer = l;
                        l.setStyle(highlightStyle);
                        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                            l.bringToFront();
                        }
                        map.fitBounds(l.getBounds(), { padding: [50, 50], maxZoom: 15 });
                        if (feature.properties) {
                            l.bindPopup(generatePopupContent(feature.properties)).openPopup();
                        }
                    }
                });
            }
        });
        
        // Calculate Fazenda groups and bounds
        geojsonLayer.eachLayer((layer) => {
            const props = layer.feature.properties;
            const fazId = props['NOME_FAZ']; // Group by NOME_FAZ
            if (!fazId) return;
            
            if (!fazendaBounds[fazId]) {
                fazendaBounds[fazId] = L.latLngBounds(layer.getBounds());
                fazendaInfo[fazId] = {
                    desc: props['DL DESCFUNDOA'] || '',
                    cod: props['DL FUNDOAGRIC'] || '',
                    area: props['DL AREAFAZEND'] ? parseFloat(props['DL AREAFAZEND']).toFixed(2).replace('.', ',') : ''
                };
            } else {
                fazendaBounds[fazId].extend(layer.getBounds());
            }
        });
        
        fazendaLabelsLayer.clearLayers();
        for (const fazId in fazendaBounds) {
            const info = fazendaInfo[fazId];
            const center = fazendaBounds[fazId].getCenter();
            
            const labelHtml = `
                <div style="text-align: center; line-height: 1.2; font-family: 'Inter', sans-serif;">
                    <span style="font-size: 15px; font-weight: 700; color: rgba(253, 230, 138, 0.95); text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3), -1px -1px 2px rgba(0, 0, 0, 0.3);">${info.desc}</span><br>
                    <span style="font-size: 14px; font-weight: 600; color: rgba(253, 230, 138, 0.95); text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3), -1px -1px 2px rgba(0, 0, 0, 0.3);">Cod.: ${info.cod}</span><br>
                    <span style="font-size: 14px; font-weight: 600; color: rgba(253, 230, 138, 0.95); text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3), -1px -1px 2px rgba(0, 0, 0, 0.3);">√Årea Total=${info.area}</span>
                </div>
            `;
            
            const icon = L.divIcon({
                className: 'fazenda-label-icon',
                html: labelHtml,
                iconSize: [300, 70],
                iconAnchor: [150, 35]
            });
            
            L.marker(center, { icon: icon, interactive: false }).addTo(fazendaLabelsLayer);
        }

        if (checkbox.checked) {
            geojsonLayer.addTo(map);
            fazendaLabelsLayer.addTo(map);
            map.fitBounds(geojsonLayer.getBounds(), { padding: [50, 50] });
        }
        
    } catch (error) {
        console.error('Erro ao carregar camada de fazendas:', error);
        alert('Erro ao carregar a base de fazendas: ' + error.message);
    } finally {
        loadingIndicator.style.display = 'none';
    }
}


// Handle Vector Layer Toggle
document.getElementById('layer-fazendas').addEventListener('change', (e) => {
    if (!geojsonLayer) {
        if (e.target.checked) loadFazendasData();
        return;
    }
    
    if (e.target.checked) {
        geojsonLayer.addTo(map);
        fazendaLabelsLayer.addTo(map);
    } else {
        map.removeLayer(geojsonLayer);
        map.removeLayer(fazendaLabelsLayer);
        map.closePopup();
    }
});

// Initial load
loadFazendasData();

// ============================================================
//  FERRAMENTA DE ROTA
// ============================================================
let routeMode = false;
let routeOriginLayer = null;
let routeDestLayer = null;
let routingControl = null;
let originMarker = null;
let destMarker = null;

const ROUTE_ORIGIN_STYLE = {
    color: '#22c55e', weight: 3, opacity: 1, fillColor: '#22c55e', fillOpacity: 0.55
};
const ROUTE_DEST_STYLE = {
    color: '#ef4444', weight: 3, opacity: 1, fillColor: '#ef4444', fillOpacity: 0.55
};

const originIcon = L.divIcon({
    className: '',
    html: `<div style="width:32px;height:32px;background:#22c55e;border:3px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;color:white;font-size:13px;font-weight:800;">A</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
});
const destIcon = L.divIcon({
    className: '',
    html: `<div style="width:32px;height:32px;background:#ef4444;border:3px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;color:white;font-size:13px;font-weight:800;">B</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
});

function setRouteStatus(msg, type = 'info') {
    const el = document.getElementById('route-status');
    el.textContent = msg;
    el.style.color = type === 'error' ? '#f87171' : type === 'success' ? '#4ade80' : '#94a3b8';
}

function clearRoute() {
    if (routingControl) { map.removeControl(routingControl); routingControl = null; }
    if (originMarker) { map.removeLayer(originMarker); originMarker = null; }
    if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
    if (routeOriginLayer && geojsonLayer) { geojsonLayer.resetStyle(routeOriginLayer); routeOriginLayer = null; }
    if (routeDestLayer && geojsonLayer) { geojsonLayer.resetStyle(routeDestLayer); routeDestLayer = null; }
    document.getElementById('route-result').style.display = 'none';
    document.getElementById('btn-route-clear').style.display = 'none';
    document.getElementById('btn-route-start').textContent = 'üìç Iniciar Rota';
    routeMode = false;
    setRouteStatus('Clique em "Iniciar Rota" e selecione dois pol√≠gonos no mapa.');
    map.getContainer().style.cursor = '';
    map.closePopup();
}

function formatDistance(meters) {
    if (meters >= 1000) return (meters / 1000).toFixed(1) + ' km';
    return Math.round(meters) + ' m';
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return h + 'h ' + m + 'min';
    return m + ' min';
}

function drawRoute(originLatLng, destLatLng, originName, destName) {
    setRouteStatus('‚è≥ Calculando rota pelas estradas...', 'info');
    if (routingControl) { map.removeControl(routingControl); routingControl = null; }

    routingControl = L.Routing.control({
        waypoints: [
            L.latLng(originLatLng.lat, originLatLng.lng),
            L.latLng(destLatLng.lat, destLatLng.lng)
        ],
        router: L.Routing.osrmv1({
            serviceUrl: 'https://router.project-osrm.org/route/v1',
            profile: 'driving'
        }),
        lineOptions: {
            styles: [
                { color: '#1e3a8a', weight: 10, opacity: 0.25 },
                { color: '#3b82f6', weight: 5, opacity: 1.0 }
            ]
        },
        createMarker: () => null,
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        show: false
    }).addTo(map);

    routingControl.on('routesfound', (e) => {
        const route = e.routes[0];
        document.getElementById('route-distance').textContent = formatDistance(route.summary.totalDistance);
        document.getElementById('route-time').textContent = formatTime(route.summary.totalTime);
        document.getElementById('route-origin-name').textContent = originName || 'Origem';
        document.getElementById('route-dest-name').textContent = destName || 'Destino';
        document.getElementById('route-result').style.display = 'block';
        setRouteStatus('‚úÖ Rota calculada! Clique em Limpar para nova busca.', 'success');
    });

    routingControl.on('routingerror', () => {
        setRouteStatus('‚ùå N√£o foi poss√≠vel calcular a rota. Verifique a conex√£o ou tente outros pol√≠gonos.', 'error');
    });
}

// Button: Start Route
document.getElementById('btn-route-start').addEventListener('click', () => {
    if (!geojsonLayer) {
        setRouteStatus('‚ùå Carregue a camada de fazendas primeiro!', 'error');
        return;
    }
    clearRoute();
    routeMode = true;
    map.getContainer().style.cursor = 'crosshair';
    document.getElementById('btn-route-start').textContent = '‚è≥ Aguardando...';
    document.getElementById('btn-route-clear').style.display = 'block';
    map.closePopup();
    setRouteStatus('üü¢ Clique no pol√≠gono de ORIGEM (ponto A).', 'info');
});

// Button: Clear Route
document.getElementById('btn-route-clear').addEventListener('click', clearRoute);

// ============================================================
//  FERRAMENTA DE GRAVACAO DE TRILHA GPS
// ============================================================

let trackPoints = [];          // Array of {lat, lng, ts, alt}
let trackPolyline = null;      // Leaflet polyline drawn on map
let trackPositionMarker = null;// Pulsing dot showing current position
let trackWatchId = null;       // navigator.geolocation.watchPosition ID
let trackTimerInterval = null; // Interval for the chrono timer
let trackStartTime = null;     // Date when recording started
let trackRecording = false;

// --- Haversine distance (meters) between two {lat,lng} points ---
function haversine(a, b) {
    const R = 6371000;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 +
              Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function totalTrackDistance() {
    let d = 0;
    for (let i = 1; i < trackPoints.length; i++) {
        d += haversine(trackPoints[i - 1], trackPoints[i]);
    }
    return d;
}

function formatTrackDistance(m) {
    return m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
}

function formatElapsed(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const ss = String(s % 60).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function setTrackStatus(msg, type = 'info') {
    const el = document.getElementById('track-status');
    el.textContent = msg;
    el.style.color = type === 'error' ? '#f87171' : type === 'success' ? '#4ade80' :
                     type === 'rec'   ? '#f87171' : '#94a3b8';
}

// Pulsing current-position marker (CSS animation via divIcon)
const pulseIcon = L.divIcon({
    className: '',
    html: `<div class="gps-pulse-outer"><div class="gps-pulse-inner"></div></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
});

function onGpsPosition(pos) {
    const { latitude: lat, longitude: lng, altitude: alt } = pos.coords;
    const ts = new Date(pos.timestamp).toISOString();
    const point = { lat, lng, ts, alt };

    trackPoints.push(point);

    // Update or create polyline
    const latlngs = trackPoints.map(p => [p.lat, p.lng]);
    if (!trackPolyline) {
        trackPolyline = L.polyline(latlngs, {
            color: '#ef4444',
            weight: 4,
            opacity: 0.95,
            lineJoin: 'round',
            lineCap: 'round'
        }).addTo(map);
    } else {
        trackPolyline.setLatLngs(latlngs);
    }

    // Update position marker
    const ll = L.latLng(lat, lng);
    if (!trackPositionMarker) {
        trackPositionMarker = L.marker(ll, { icon: pulseIcon, zIndexOffset: 3000 }).addTo(map);
        map.setView(ll, Math.max(map.getZoom(), 15));
    } else {
        trackPositionMarker.setLatLng(ll);
        map.panTo(ll);
    }

    // Update UI stats
    document.getElementById('track-points').textContent = trackPoints.length;
    document.getElementById('track-distance').textContent = formatTrackDistance(totalTrackDistance());
}

function onGpsError(err) {
    const msgs = {
        1: 'Permiss„o de localizaÁ„o negada. Habilite o GPS no seu dispositivo.',
        2: 'PosiÁ„o indisponÌvel. Verifique o sinal de GPS.',
        3: 'Timeout ao obter localizaÁ„o.'
    };
    setTrackStatus('? ' + (msgs[err.code] || err.message), 'error');
    stopTrackRecording(false);
}

function startTrackRecording() {
    if (!navigator.geolocation) {
        setTrackStatus('? Seu navegador n„o suporta GPS.', 'error');
        return;
    }
    trackRecording = true;
    trackStartTime = Date.now();
    trackPoints = [];

    // Clear old track if exists
    if (trackPolyline) { map.removeLayer(trackPolyline); trackPolyline = null; }
    if (trackPositionMarker) { map.removeLayer(trackPositionMarker); trackPositionMarker = null; }

    document.getElementById('track-stats').style.display = 'block';
    document.getElementById('btn-track-start').style.display = 'none';
    document.getElementById('btn-track-stop').style.display = 'block';
    document.getElementById('track-export').style.display = 'none';
    setTrackStatus('?? Gravando... Mova-se para registrar a trilha.', 'rec');

    // Timer
    trackTimerInterval = setInterval(() => {
        document.getElementById('track-time').textContent = formatElapsed(Date.now() - trackStartTime);
    }, 1000);

    // GPS Watch
    trackWatchId = navigator.geolocation.watchPosition(onGpsPosition, onGpsError, {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 15000
    });
}

function stopTrackRecording(showExport = true) {
    trackRecording = false;
    if (trackWatchId !== null) {
        navigator.geolocation.clearWatch(trackWatchId);
        trackWatchId = null;
    }
    clearInterval(trackTimerInterval);

    document.getElementById('btn-track-stop').style.display = 'none';
    document.getElementById('btn-track-start').style.display = 'block';

    if (showExport && trackPoints.length > 1) {
        document.getElementById('track-export').style.display = 'block';
        setTrackStatus(`? Trilha gravada! ${trackPoints.length} pontos / ${formatTrackDistance(totalTrackDistance())}. Exporte abaixo.`, 'success');
        // Fit map to the track
        if (trackPolyline) map.fitBounds(trackPolyline.getBounds(), { padding: [40, 40] });
    } else if (trackPoints.length <= 1) {
        setTrackStatus('?? Poucos pontos gravados. Tente novamente ao ar livre.', 'error');
    }
}

function clearTrack() {
    stopTrackRecording(false);
    if (trackPolyline) { map.removeLayer(trackPolyline); trackPolyline = null; }
    if (trackPositionMarker) { map.removeLayer(trackPositionMarker); trackPositionMarker = null; }
    trackPoints = [];
    document.getElementById('track-stats').style.display = 'none';
    document.getElementById('track-export').style.display = 'none';
    document.getElementById('track-time').textContent = '00:00';
    document.getElementById('track-distance').textContent = '0 m';
    document.getElementById('track-points').textContent = '0';
    document.getElementById('btn-track-start').style.display = 'block';
    document.getElementById('btn-track-stop').style.display = 'none';
    setTrackStatus('Pressione "Iniciar" para comeÁar a gravar sua trilha em tempo real.');
}

// --- Export GPX ---
function exportGPX() {
    if (!trackPoints.length) return;
    const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GeoPortal WebGIS" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Trilha_${now}</name>
    <trkseg>\n`;
    trackPoints.forEach(p => {
        const alt = p.alt !== null && p.alt !== undefined ? `\n      <ele>${p.alt.toFixed(1)}</ele>` : '';
        gpx += `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lng.toFixed(7)}"><time>${p.ts}</time>${alt}</trkpt>\n`;
    });
    gpx += `    </trkseg>
  </trk>
</gpx>`;
    downloadFile(`Trilha_${now}.gpx`, gpx, 'application/gpx+xml');
}

// --- Export GeoJSON ---
function exportGeoJSON() {
    if (!trackPoints.length) return;
    const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const geojson = {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: trackPoints.map(p => [p.lng, p.lat, p.alt || 0])
            },
            properties: {
                name: `Trilha_${now}`,
                distancia_m: Math.round(totalTrackDistance()),
                pontos: trackPoints.length,
                inicio: trackPoints[0].ts,
                fim: trackPoints[trackPoints.length - 1].ts
            }
        }]
    };
    downloadFile(`Trilha_${now}.geojson`, JSON.stringify(geojson, null, 2), 'application/geo+json');
}

function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Button wiring
document.getElementById('btn-track-start').addEventListener('click', startTrackRecording);
document.getElementById('btn-track-stop').addEventListener('click', () => stopTrackRecording(true));
document.getElementById('btn-track-clear').addEventListener('click', clearTrack);
document.getElementById('btn-export-gpx').addEventListener('click', exportGPX);
document.getElementById('btn-export-geojson').addEventListener('click', exportGeoJSON);

// ============================================================
//  FERRAMENTA DE MEDICAO GPS (AREA e DISTANCIA)
// ============================================================

let measureMode = 'distance';   // 'distance' | 'area'
let measureActive = false;
let measurePoints = [];         // [{lat, lng}]
let measureWatchId = null;
let measureLastPos = null;      // Last raw GPS position for manual add
let measurePolyline = null;     // Leaflet Polyline (distance mode)
let measurePolygon = null;      // Leaflet Polygon (area mode)
let measureMarkers = [];        // Vertex markers
let measureCurrentDot = null;   // Current GPS position dot

// ---- Mode toggle buttons ----
document.querySelectorAll('.measure-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (measureActive) return; // can't switch while active
        document.querySelectorAll('.measure-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        measureMode = btn.dataset.mode;
        clearGpsMeasure();
        setMeasureStatus(measureMode === 'distance'
            ? 'Modo Dist‚ncia: pressione Iniciar e caminhe pelo percurso.'
            : 'Modo ¡rea: pressione Iniciar e caminhe pelo perÌmetro do terreno.');
    });
});

function setMeasureStatus(msg, type = 'info') {
    const el = document.getElementById('gps-measure-status');
    el.textContent = msg;
    el.style.color = type === 'error' ? '#f87171' : type === 'success' ? '#4ade80' : '#94a3b8';
}

// ---- Geodetic area (Shoelace on local ENU plane) in m≤ ----
function geodeticArea(pts) {
    if (pts.length < 3) return 0;
    // Project to local ENU from centroid
    const lat0 = pts.reduce((s, p) => s + p.lat, 0) / pts.length * Math.PI / 180;
    const lng0 = pts.reduce((s, p) => s + p.lng, 0) / pts.length * Math.PI / 180;
    const R = 6378137;
    const cosLat = Math.cos(lat0);
    const xy = pts.map(p => ({
        x: (p.lng * Math.PI / 180 - lng0) * R * cosLat,
        y: (p.lat * Math.PI / 180 - lat0) * R
    }));
    let area = 0;
    const n = xy.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += xy[i].x * xy[j].y - xy[j].x * xy[i].y;
    }
    return Math.abs(area / 2);
}

// ---- Haversine distance between two points ----
function measureHav(a, b) {
    const R = 6371000;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 +
              Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function totalMeasureDist() {
    let d = 0;
    for (let i = 1; i < measurePoints.length; i++) d += measureHav(measurePoints[i - 1], measurePoints[i]);
    return d;
}

// ---- Update map drawing and result display ----
function updateMeasureDisplay() {
    const lls = measurePoints.map(p => [p.lat, p.lng]);

    if (measureMode === 'distance') {
        if (!measurePolyline) {
            measurePolyline = L.polyline(lls, { color: '#f59e0b', weight: 4, opacity: 1 }).addTo(map);
        } else {
            measurePolyline.setLatLngs(lls);
        }
        const dist = totalMeasureDist();
        document.getElementById('measure-result-value').textContent =
            dist >= 1000 ? (dist / 1000).toFixed(3) + ' km' : dist.toFixed(1) + ' m';
        document.getElementById('measure-result-label').textContent = 'Dist‚ncia total';

    } else {
        // Area mode
        if (measurePoints.length >= 2) {
            if (!measurePolygon) {
                measurePolygon = L.polygon(lls, {
                    color: '#8b5cf6', weight: 3, opacity: 1,
                    fillColor: '#8b5cf6', fillOpacity: 0.25
                }).addTo(map);
            } else {
                measurePolygon.setLatLngs(lls);
            }
        }
        if (measurePoints.length >= 3) {
            const areaM2 = geodeticArea(measurePoints);
            const areaHa = areaM2 / 10000;
            document.getElementById('measure-result-value').textContent =
                areaHa >= 1 ? areaHa.toFixed(4) + ' ha' : areaM2.toFixed(1) + ' m≤';
            document.getElementById('measure-result-label').textContent = '¡rea calculada';
        } else {
            document.getElementById('measure-result-value').textContent = 'ó ha';
            document.getElementById('measure-result-label').textContent = 'Adicione = 3 pontos';
        }
    }

    document.getElementById('measure-result-box').style.display = 'block';
    document.getElementById('measure-points').textContent = measurePoints.length;
}

// ---- Add a vertex marker (numbered dot) ----
function addMeasureMarker(lat, lng, index) {
    const icon = L.divIcon({
        className: '',
        html: `<div style="width:20px;height:20px;background:${measureMode === 'area' ? '#8b5cf6' : '#f59e0b'};border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:9px;font-weight:800;box-shadow:0 1px 5px rgba(0,0,0,0.6);">${index + 1}</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
    const m = L.marker([lat, lng], { icon, zIndexOffset: 2500 }).addTo(map);
    measureMarkers.push(m);
}

// ---- GPS position callback (auto-capture every ~5 m moved) ----
function onMeasurePosition(pos) {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    measureLastPos = { lat, lng };

    document.getElementById('measure-accuracy').textContent = accuracy.toFixed(0) + ' m';

    // Update current position dot
    if (!measureCurrentDot) {
        measureCurrentDot = L.circleMarker([lat, lng], {
            radius: 7, color: 'white', weight: 2,
            fillColor: measureMode === 'area' ? '#8b5cf6' : '#f59e0b', fillOpacity: 1
        }).addTo(map);
    } else {
        measureCurrentDot.setLatLng([lat, lng]);
    }

    // Auto-add point if moved > 5 m from last point
    if (measurePoints.length === 0) {
        measurePoints.push({ lat, lng });
        addMeasureMarker(lat, lng, 0);
        map.setView([lat, lng], Math.max(map.getZoom(), 17));
    } else {
        const last = measurePoints[measurePoints.length - 1];
        if (measureHav(last, { lat, lng }) > 5) {
            measurePoints.push({ lat, lng });
            addMeasureMarker(lat, lng, measurePoints.length - 1);
        }
    }

    updateMeasureDisplay();

    // Show "close polygon" hint in area mode
    if (measureMode === 'area' && measurePoints.length >= 3) {
        const firstPt = measurePoints[0];
        const closeDist = measureHav(firstPt, { lat, lng });
        if (closeDist < 10) {
            setMeasureStatus('? VocÍ est· prÛximo ao ponto inicial! Pressione Finalizar para fechar.', 'success');
        } else {
            setMeasureStatus(`?? Gravando... ${measurePoints.length} pontos. Retorne ao inÌcio para fechar.`);
        }
    } else if (measureMode === 'distance') {
        setMeasureStatus(`?? Gravando... ${measurePoints.length} pontos capturados. Pressione Finalizar quando terminar.`);
    } else {
        setMeasureStatus(`?? Caminhe pelo perÌmetro... ${measurePoints.length} pontos capturados.`);
    }
}

function onMeasureError(err) {
    const msgs = { 1: 'Permiss„o de GPS negada.', 2: 'PosiÁ„o indisponÌvel.', 3: 'Timeout de GPS.' };
    setMeasureStatus('? ' + (msgs[err.code] || err.message), 'error');
    stopGpsMeasure(false);
}

// ---- Manual point addition ----
document.getElementById('btn-gps-add-point').addEventListener('click', () => {
    if (!measureLastPos) { setMeasureStatus('?? Aguardando sinal GPS...', 'error'); return; }
    const { lat, lng } = measureLastPos;
    measurePoints.push({ lat, lng });
    addMeasureMarker(lat, lng, measurePoints.length - 1);
    updateMeasureDisplay();
    setMeasureStatus(`?? Ponto ${measurePoints.length} adicionado manualmente.`);
});

// ---- Start ----
function startGpsMeasure() {
    if (!navigator.geolocation) {
        setMeasureStatus('? GPS n„o suportado pelo navegador.', 'error');
        return;
    }
    measureActive = true;
    measurePoints = [];
    measureLastPos = null;

    document.getElementById('btn-gps-measure-start').style.display = 'none';
    document.getElementById('btn-gps-measure-stop').style.display = 'block';
    document.getElementById('btn-gps-add-point').style.display = 'block';
    document.getElementById('btn-gps-measure-clear').style.display = 'none';
    document.getElementById('measure-stats').style.display = 'block';
    document.getElementById('measure-result-box').style.display = 'none';

    setMeasureStatus(measureMode === 'distance'
        ? '?? Aguardando GPS... Caminhe para capturar a dist‚ncia.'
        : '?? Aguardando GPS... Caminhe pelo perÌmetro do terreno.');

    measureWatchId = navigator.geolocation.watchPosition(onMeasurePosition, onMeasureError, {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 20000
    });
}

// ---- Stop / Finalize ----
function stopGpsMeasure(finalize = true) {
    measureActive = false;
    if (measureWatchId !== null) {
        navigator.geolocation.clearWatch(measureWatchId);
        measureWatchId = null;
    }
    if (measureCurrentDot) { map.removeLayer(measureCurrentDot); measureCurrentDot = null; }

    document.getElementById('btn-gps-measure-stop').style.display = 'none';
    document.getElementById('btn-gps-add-point').style.display = 'none';
    document.getElementById('btn-gps-measure-start').style.display = 'block';
    document.getElementById('btn-gps-measure-clear').style.display = 'block';

    if (!finalize || measurePoints.length < 2) {
        setMeasureStatus('?? Poucos pontos. Tente ao ar livre com GPS ativo.', 'error');
        return;
    }

    updateMeasureDisplay();

    if (measureMode === 'distance') {
        const d = totalMeasureDist();
        setMeasureStatus(`? Dist‚ncia total: ${d >= 1000 ? (d / 1000).toFixed(3) + ' km' : d.toFixed(1) + ' m'}`, 'success');
        if (measurePolyline) map.fitBounds(measurePolyline.getBounds(), { padding: [40, 40] });
    } else {
        if (measurePoints.length < 3) { setMeasureStatus('?? Precisa de pelo menos 3 pontos para calcular ·rea.', 'error'); return; }
        const a = geodeticArea(measurePoints);
        const ha = a / 10000;
        setMeasureStatus(`? ¡rea: ${ha.toFixed(4)} ha (${a.toFixed(0)} m≤)`, 'success');
        if (measurePolygon) map.fitBounds(measurePolygon.getBounds(), { padding: [40, 40] });
    }
}

// ---- Clear ----
function clearGpsMeasure() {
    stopGpsMeasure(false);
    if (measurePolyline) { map.removeLayer(measurePolyline); measurePolyline = null; }
    if (measurePolygon) { map.removeLayer(measurePolygon); measurePolygon = null; }
    measureMarkers.forEach(m => map.removeLayer(m));
    measureMarkers = [];
    measurePoints = [];
    document.getElementById('measure-result-box').style.display = 'none';
    document.getElementById('measure-stats').style.display = 'none';
    document.getElementById('btn-gps-measure-clear').style.display = 'none';
    document.getElementById('btn-gps-measure-start').style.display = 'block';
    document.getElementById('measure-points').textContent = '0';
    document.getElementById('measure-accuracy').textContent = 'ó';
    setMeasureStatus(measureMode === 'distance'
        ? 'Modo Dist‚ncia: pressione Iniciar e caminhe pelo percurso.'
        : 'Modo ¡rea: pressione Iniciar e caminhe pelo perÌmetro do terreno.');
}

document.getElementById('btn-gps-measure-start').addEventListener('click', startGpsMeasure);
document.getElementById('btn-gps-measure-stop').addEventListener('click', () => stopGpsMeasure(true));
document.getElementById('btn-gps-measure-clear').addEventListener('click', clearGpsMeasure);
