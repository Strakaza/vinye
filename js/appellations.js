/**
 * Page Carte des Appellations - Affichage de toutes les parcelles
 */

import DataLoader from './data-loader.js?v=3';

class AppellationsPage {
    constructor() {
        this.dataLoader = new DataLoader();
        this.map = null;
        this.MAPBOX_TOKEN = 'pk.eyJ1Ijoic3RyYWthemEiLCJhIjoiY21pNzl6YnA3MDg4YzJrc2JrcnI2eTBnOCJ9.IVHXNpl2MQ-WHRdBaxWdNA';
        this.userMarker = null;
        this.loadedGeoJSONs = new Map(); // Cache for loaded GeoJSONs
        this.visiblePolygons = new Map(); // Currently visible polygons
        this.isLoading = false;
        this.colorCache = new Map(); // Cache for appellation colors
    }

    async init() {
        try {
            // Load data index
            await this.dataLoader.loadIndex();

            // Initialize map
            this.initMap();

            // Setup controls
            this.setupControls();

        } catch (error) {
            console.error('❌ Error initializing appellations page:', error);
            alert('Erreur lors du chargement de la carte');
        }
    }

    initMap() {
        mapboxgl.accessToken = this.MAPBOX_TOKEN;

        this.map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/satellite-streets-v12',
            center: [4.8, 47.0], // Centered on Burgundy
            zoom: 9,
            minZoom: 8,
            maxZoom: 18,
            pitch: 0,
            bearing: 0
        });

        this.map.on('load', () => {
            this.setupLayers();
            this.displayParcelsPoints(); // Initial display as points
            this.updateView(); // Check if we need to load polygons immediately
            document.getElementById('loading').classList.add('hidden');
        });

        this.map.on('moveend', () => {
            this.updateView();
        });

        // Add navigation controls
        this.map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    }

    setupLayers() {
        // Source for polygons
        this.map.addSource('parcels-polygons', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });

        // Layer for polygons fill
        this.map.addLayer({
            id: 'parcels-fill',
            type: 'fill',
            source: 'parcels-polygons',
            paint: {
                'fill-color': ['get', 'color'],
                'fill-opacity': 0.6,
                'fill-outline-color': '#ffffff'
            }
        });

        // Layer for polygons outline (for better visibility)
        this.map.addLayer({
            id: 'parcels-line',
            type: 'line',
            source: 'parcels-polygons',
            paint: {
                'line-color': '#ffffff',
                'line-width': 1,
                'line-opacity': 0.8
            }
        });

        // Source for points (low zoom)
        this.map.addSource('parcels-points', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });

        // Interaction events
        this.setupInteractions();
    }

    displayParcelsPoints() {
        const parcels = this.dataLoader.parcelles || [];
        const features = parcels.map(p => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: p.center
            },
            properties: {
                id: p.geojsonPath, // Use path as ID
                nom: p.nom,
                nomComplet: p.nomComplet,
                commune: p.communeNom,
                departement: p.departement
            }
        }));

        this.map.getSource('parcels-points').setData({
            type: 'FeatureCollection',
            features: features
        });
    }

    async updateView() {
        const zoom = this.map.getZoom();

        // If zoomed out, show points/clusters (handled by layers min/max zoom)
        // If zoomed in (> 12), load polygons
        if (zoom >= 12) {
            await this.loadVisiblePolygons();
        }
    }

    async loadVisiblePolygons() {
        if (this.isLoading) return;

        const bounds = this.map.getBounds();
        const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];

        // Get parcels in view
        const parcelsInView = this.dataLoader.getParcellesInBbox(bbox);

        if (parcelsInView.length === 0) return;

        // Limit to avoid performance issues
        if (parcelsInView.length > 800) {
            console.warn('Too many parcels to load polygons (' + parcelsInView.length + '), wait for zoom');
            return;
        }

        this.isLoading = true;
        document.getElementById('loading').classList.remove('hidden');

        const newFeatures = [];
        const promises = [];

        for (const parcelle of parcelsInView) {
            // Skip if already loaded
            if (this.visiblePolygons.has(parcelle.geojsonPath)) {
                newFeatures.push(this.visiblePolygons.get(parcelle.geojsonPath));
                continue;
            }

            // Fetch if not in cache
            if (!this.loadedGeoJSONs.has(parcelle.geojsonPath)) {
                promises.push(
                    this.dataLoader.loadGeoJSON(parcelle.geojsonPath)
                        .then(geojson => {
                            // Process features to add properties and color
                            if (geojson.features && geojson.features.length > 0) {
                                const feature = geojson.features[0];
                                feature.properties = {
                                    ...feature.properties,
                                    ...parcelle, // Add index properties
                                    color: this.getColorForAppellation(parcelle.nom)
                                };
                                this.loadedGeoJSONs.set(parcelle.geojsonPath, feature);
                                this.visiblePolygons.set(parcelle.geojsonPath, feature);
                                return feature;
                            }
                            return null;
                        })
                        .catch(err => {
                            console.warn('Failed to load parcel:', parcelle.nom, err);
                            return null;
                        })
                );
            } else {
                // Use cached
                const feature = this.loadedGeoJSONs.get(parcelle.geojsonPath);
                this.visiblePolygons.set(parcelle.geojsonPath, feature);
                newFeatures.push(feature);
            }
        }

        // Wait for all fetches
        const results = await Promise.all(promises);
        results.forEach(f => {
            if (f) newFeatures.push(f);
        });

        // Sort features by area (largest first, so they are rendered at the bottom)
        // Smallest features will be last and rendered on top
        newFeatures.sort((a, b) => {
            const getArea = (f) => {
                if (f.properties.bbox) {
                    const [minLng, minLat, maxLng, maxLat] = f.properties.bbox;
                    return (maxLng - minLng) * (maxLat - minLat);
                }
                return 0;
            };
            return getArea(b) - getArea(a);
        });

        this.map.getSource('parcels-polygons').setData({
            type: 'FeatureCollection',
            features: newFeatures
        });

        this.isLoading = false;
        document.getElementById('loading').classList.add('hidden');
    }

    getColorForAppellation(nom) {
        if (this.colorCache.has(nom)) {
            return this.colorCache.get(nom);
        }

        // Generate a consistent color from the string
        let hash = 0;
        for (let i = 0; i < nom.length; i++) {
            hash = nom.charCodeAt(i) + ((hash << 5) - hash);
        }

        // Use HSL for better pastel colors
        const h = Math.abs(hash % 360);
        const s = 60 + (Math.abs(hash) % 20); // 60-80% saturation
        const l = 40 + (Math.abs(hash) % 20); // 40-60% lightness

        const color = `hsl(${h}, ${s}%, ${l}%)`;
        this.colorCache.set(nom, color);
        return color;
    }

    setupInteractions() {
        // Click on polygon
        this.map.on('click', 'parcels-fill', (e) => {
            if (e.features.length > 0) {
                const feature = e.features[0];
                const props = feature.properties;

                new mapboxgl.Popup()
                    .setLngLat(e.lngLat)
                    .setHTML(`
                        <div style="padding: 10px; min-width: 200px;">
                            <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 700; color: #333;">${props.denom || props.nomComplet}</h3>
                            <div style="margin-bottom: 8px;">
                                <span style="background: ${props.color}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 12px;">${props.nom}</span>
                            </div>
                            <p style="margin: 0 0 4px 0; font-size: 14px; color: #666;"><strong>Commune:</strong> ${props.commune}</p>
                            <p style="margin: 0; font-size: 14px; color: #666;"><strong>Département:</strong> ${props.departement}</p>
                        </div>
                    `)
                    .addTo(this.map);
            }
        });
        this.map.on('mouseleave', 'parcels-fill', () => {
            this.map.getCanvas().style.cursor = '';
        });

        // Click on clusters (same as before)
        this.map.on('click', 'clusters', (e) => {
            const features = this.map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
            const clusterId = features[0].properties.cluster_id;
            this.map.getSource('parcels-points').getClusterExpansionZoom(clusterId, (err, zoom) => {
                if (err) return;
                this.map.easeTo({
                    center: features[0].geometry.coordinates,
                    zoom: zoom
                });
            });
        });

        this.map.on('mouseenter', 'clusters', () => {
            this.map.getCanvas().style.cursor = 'pointer';
        });
        this.map.on('mouseleave', 'clusters', () => {
            this.map.getCanvas().style.cursor = '';
        });
    }

    setupControls() {
        document.getElementById('back-btn').addEventListener('click', () => {
            window.location.href = 'index.html';
        });

        document.getElementById('location-btn').addEventListener('click', () => {
            this.handleGeolocation();
        });
    }

    handleGeolocation() {
        const btn = document.getElementById('location-btn');

        if (!navigator.geolocation) {
            alert('La géolocalisation n\'est pas supportée par votre navigateur');
            return;
        }

        btn.classList.add('active');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;

                // Center map
                this.map.flyTo({
                    center: [longitude, latitude],
                    zoom: 14 // Zoom enough to trigger polygon loading
                });

                // Add or update user marker
                if (this.userMarker) {
                    this.userMarker.setLngLat([longitude, latitude]);
                } else {
                    const el = document.createElement('div');
                    el.className = 'user-marker';
                    el.style.width = '20px';
                    el.style.height = '20px';
                    el.style.backgroundColor = '#007AFF';
                    el.style.borderRadius = '50%';
                    el.style.border = '3px solid white';
                    el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';

                    this.userMarker = new mapboxgl.Marker(el)
                        .setLngLat([longitude, latitude])
                        .addTo(this.map);
                }

                btn.classList.remove('active');
            },
            (error) => {
                console.error('Geolocation error:', error);
                alert('Impossible de vous localiser. Vérifiez vos paramètres.');
                btn.classList.remove('active');
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const app = new AppellationsPage();
    app.init();
});

export default AppellationsPage;
