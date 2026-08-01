// gps-performance.js - Real-time High-Accuracy GPS Tracking & Mobile Performance Optimizations

let userLocationMarker = null;
let userAccuracyCircle = null;
let currentGpsLatLng = null;
let isFollowMode = false;

// Custom Pulsing Blue Location Dot (Google Maps / Avenza style)
const blueDotIcon = L.divIcon({
    className: 'gps-user-marker',
    html: `
        <div class="blue-dot-wrapper">
            <div class="blue-dot-pulse"></div>
            <div class="blue-dot-core"></div>
        </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
});

// High-Precision GPS Tracker
function initGpsTracker(mapInstance) {
    if (!('geolocation' in navigator)) {
        console.warn('GPS não suportado neste navegador');
        return;
    }

    const options = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 2000
    };

    navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;
            currentGpsLatLng = [lat, lng];

            // Update status text on bottom bar if available
            const statusText = document.getElementById('avenza-status-text');
            if (statusText) {
                statusText.textContent = `GPS: ±${Math.round(accuracy)}m`;
            }

            // Create or update Marker
            if (!userLocationMarker) {
                userLocationMarker = L.marker(currentGpsLatLng, {
                    icon: blueDotIcon,
                    zIndexOffset: 10000
                }).addTo(mapInstance);
                userLocationMarker.bindTooltip(`📍 Você está aqui (Precisão: ±${Math.round(accuracy)}m)`, {
                    direction: 'top',
                    offset: [0, -10]
                });
            } else {
                userLocationMarker.setLatLng(currentGpsLatLng);
            }

            // Create or update Accuracy Circle
            if (!userAccuracyCircle) {
                userAccuracyCircle = L.circle(currentGpsLatLng, {
                    radius: accuracy,
                    color: '#3b82f6',
                    fillColor: '#3b82f6',
                    fillOpacity: 0.15,
                    weight: 1,
                    interactive: false
                }).addTo(mapInstance);
            } else {
                userAccuracyCircle.setLatLng(currentGpsLatLng);
                userAccuracyCircle.setRadius(accuracy);
            }

            // If follow mode active, keep map centered on user
            if (isFollowMode) {
                mapInstance.panTo(currentGpsLatLng, { animate: true });
            }
        },
        (error) => {
            console.warn('Erro ao obter posição GPS:', error.message);
            const statusText = document.getElementById('avenza-status-text');
            if (statusText && !currentGpsLatLng) {
                statusText.textContent = 'GPS Inativo';
            }
        },
        options
    );

    // Pause follow mode when user manually drags the map
    mapInstance.on('dragstart', () => {
        if (isFollowMode) {
            isFollowMode = false;
            const gpsBtn = document.getElementById('btn-gps-my-location');
            if (gpsBtn) gpsBtn.classList.remove('active-follow');
        }
    });
}

// Zoom / Fly directly to GPS location (Ferramenta de Aproximar)
function zoomToUserLocation(mapInstance) {
    const gpsBtn = document.getElementById('btn-gps-my-location');
    const statusText = document.getElementById('avenza-status-text');

    if (currentGpsLatLng) {
        isFollowMode = true;
        if (gpsBtn) gpsBtn.classList.add('active-follow');
        mapInstance.flyTo(currentGpsLatLng, 17, {
            animate: true,
            duration: 1.2
        });
        if (statusText) statusText.textContent = 'GPS Focado';
    } else {
        if (statusText) statusText.textContent = 'Buscando GPS...';
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                currentGpsLatLng = [lat, lng];
                isFollowMode = true;
                if (gpsBtn) gpsBtn.classList.add('active-follow');
                mapInstance.flyTo([lat, lng], 17, {
                    animate: true,
                    duration: 1.2
                });
            },
            (err) => {
                alert('Não foi possível obter a localização GPS. Por favor, ative a localização no seu celular.');
                if (statusText) statusText.textContent = 'GPS Desativado';
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }
}

// Mobile Canvas & Performance Tweaks for Leaflet
document.addEventListener('DOMContentLoaded', () => {
    // Hook into global map object when initialized
    const checkMapInterval = setInterval(() => {
        if (typeof map !== 'undefined' && map) {
            clearInterval(checkMapInterval);
            initGpsTracker(map);

            // Bind Zoom to Location button
            const gpsBtn = document.getElementById('btn-gps-my-location');
            if (gpsBtn) {
                gpsBtn.addEventListener('click', () => zoomToUserLocation(map));
            }
        }
    }, 200);
});
