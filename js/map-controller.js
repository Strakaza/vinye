/**
 * Contrôleur de carte Mapbox
 */

class MapController {
    constructor(containerId, mapboxToken) {
        this.containerId = containerId;
        this.map = null;
        this.currentLayers = [];
        this.currentParcelsData = [];

        // Configuration Mapbox
        mapboxgl.accessToken = mapboxToken;
    }

    /**
     * Initialise la carte
     */
    init() {
        this.map = new mapboxgl.Map({
            container: this.containerId,
            style: 'mapbox://styles/mapbox/satellite-streets-v12',
            center: [4.8, 47.0], // Centre de la Bourgogne
            zoom: 9,
            pitch: 0,
            bearing: 0,
            attributionControl: false
        });

        // Ajouter les contrôles
        this.map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        this.map.addControl(new mapboxgl.AttributionControl({
            compact: true
        }), 'bottom-left');

        // Événements
        this.map.on('load', () => {
            console.log('✅ Carte chargée');
        });

        return this.map;
    }

    /**
     * Bascule entre vue Satellite et Plan
     */
    toggleStyle() {
        if (!this.map) return;

        const currentStyle = this.map.getStyle().sprite;
        const isSatellite = currentStyle && currentStyle.includes('satellite');

        const newStyle = isSatellite
            ? 'mapbox://styles/mapbox/light-v11'
            : 'mapbox://styles/mapbox/satellite-streets-v12';

        console.log(`🔄 Changement de style: ${isSatellite ? 'Satellite -> Plan' : 'Plan -> Satellite'}`);

        this.map.setStyle(newStyle);

        // Ré-afficher les données une fois le style chargé
        this.map.once('style.load', () => {
            if (this.currentParcelsData && this.currentParcelsData.length > 0) {
                console.log('♻️ Restauration des parcelles...');
                this.displayMultipleParcels(this.currentParcelsData);
            }

            // Restaurer le marqueur utilisateur s'il existe (géré par MapPage, mais on peut émettre un event si besoin)
            // Note: Les marqueurs DOM (comme userMarker) restent généralement sur la carte, 
            // mais les layers GeoJSON doivent être réajoutés.
        });

        return !isSatellite; // Retourne true si on passe en satellite, false sinon
    }

    /**
     * Affiche une parcelle sur la carte
     */
    async displayParcel(geojson, parcelName) {
        // Wrapper pour utiliser la méthode générique
        return this.displayMultipleParcels([{
            parcel: { nomComplet: parcelName, nom: parcelName },
            geojson: geojson
        }]);
    }

    /**
     * Affiche plusieurs parcelles
     */
    async displayMultipleParcels(parcelsData) {
        if (!this.map) return;

        // Sauvegarder les données pour le changement de style
        this.currentParcelsData = parcelsData;

        this.clearLayers();

        const colors = [
            '#d4af37', '#8b1538', '#2d7f3e', '#d47f37', '#376bd4',
            '#9b59b6', '#e74c3c', '#3498db', '#1abc9c', '#f39c12'
        ];

        parcelsData.forEach((data, index) => {
            const layerId = `parcel-${index}-${Date.now()}`;
            const sourceId = `source-${layerId}`;
            const color = colors[index % colors.length];

            // Enrichir le GeoJSON avec le nom complet de la parcelle
            const enrichedGeoJSON = {
                ...data.geojson,
                features: data.geojson.features.map(feature => ({
                    ...feature,
                    properties: {
                        ...feature.properties,
                        nomComplet: data.parcel.nomComplet,
                        parcelName: data.parcel.nom
                    }
                }))
            };

            console.log(`🗺️ Parcelle ${index + 1}: "${data.parcel.nomComplet}" enriched with ${enrichedGeoJSON.features.length} features`);

            if (this.map.getSource(sourceId)) {
                this.map.removeSource(sourceId);
            }

            this.map.addSource(sourceId, {
                type: 'geojson',
                data: enrichedGeoJSON
            });

            // Layer de remplissage
            this.map.addLayer({
                id: `${layerId}-fill`,
                type: 'fill',
                source: sourceId,
                paint: {
                    'fill-color': color,
                    'fill-opacity': 0.5
                }
            });

            // Layer de contour
            this.map.addLayer({
                id: `${layerId}-outline`,
                type: 'line',
                source: sourceId,
                paint: {
                    'line-color': color,
                    'line-width': 2
                }
            });

            // Layer de label (texte)
            this.map.addLayer({
                id: `${layerId}-label`,
                type: 'symbol',
                source: sourceId,
                layout: {
                    'text-field': ['get', 'nomComplet'],
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-size': 12,
                    'text-anchor': 'center',
                    'text-max-width': 10,
                    'text-allow-overlap': false,
                    'text-ignore-placement': false
                },
                paint: {
                    'text-color': '#ffffff',
                    'text-halo-color': color,
                    'text-halo-width': 2,
                    'text-halo-blur': 1
                },
                minzoom: 11  // Afficher les labels seulement à partir du zoom 11
            });

            this.currentLayers.push({
                fillId: `${layerId}-fill`,
                outlineId: `${layerId}-outline`,
                labelId: `${layerId}-label`,
                sourceId: sourceId
            });

            // Ajouter événements de clic
            this.map.on('click', `${layerId}-fill`, (e) => {
                this.showPopup(e.lngLat, data.parcel.nomComplet, e.features[0].properties);
            });

            // Changer le curseur sur hover
            this.map.on('mouseenter', `${layerId}-fill`, () => {
                this.map.getCanvas().style.cursor = 'pointer';
            });

            this.map.on('mouseleave', `${layerId}-fill`, () => {
                this.map.getCanvas().style.cursor = '';
            });
        });

        // Calculer les bounds combinés
        const allFeatures = parcelsData.flatMap(d => d.geojson.features);
        const combinedGeoJSON = {
            type: 'FeatureCollection',
            features: allFeatures
        };

        const bounds = this.getBounds(combinedGeoJSON);
        if (bounds) {
            // On ne re-zoom que si c'est un nouvel affichage, pas un restore
            // Pour simplifier ici on re-zoom toujours, ou on pourrait ajouter un flag
            this.map.fitBounds(bounds, {
                padding: { top: 100, bottom: 100, left: 50, right: 50 },
                maxZoom: 14,
                duration: 1000
            });
        }
    }

    /**
     * Nettoie les layers
     */
    clearLayers() {
        this.currentLayers.forEach(layer => {
            if (this.map.getLayer(layer.fillId)) {
                this.map.removeLayer(layer.fillId);
            }
            if (this.map.getLayer(layer.outlineId)) {
                this.map.removeLayer(layer.outlineId);
            }
            if (this.map.getLayer(layer.labelId)) {
                this.map.removeLayer(layer.labelId);
            }
            if (this.map.getSource(layer.sourceId)) {
                this.map.removeSource(layer.sourceId);
            }
        });
        this.currentLayers = [];
    }

    /**
     * Calcule les bounds d'un GeoJSON
     */
    getBounds(geojson) {
        if (!geojson || !geojson.features || geojson.features.length === 0) {
            return null;
        }

        let minLng = Infinity, minLat = Infinity;
        let maxLng = -Infinity, maxLat = -Infinity;

        geojson.features.forEach(feature => {
            const coords = this.extractCoordinates(feature.geometry);
            coords.forEach(([lng, lat]) => {
                minLng = Math.min(minLng, lng);
                minLat = Math.min(minLat, lat);
                maxLng = Math.max(maxLng, lng);
                maxLat = Math.max(maxLat, lat);
            });
        });

        return [[minLng, minLat], [maxLng, maxLat]];
    }

    /**
     * Extrait les coordonnées d'une géométrie
     */
    extractCoordinates(geometry) {
        if (geometry.type === 'Polygon') {
            return geometry.coordinates[0];
        } else if (geometry.type === 'MultiPolygon') {
            return geometry.coordinates.flatMap(poly => poly[0]);
        }
        return [];
    }

    /**
     * Affiche un popup
     */
    showPopup(lngLat, title, properties) {
        const popup = new mapboxgl.Popup({ closeButton: true })
            .setLngLat(lngLat)
            .setHTML(`
                <div style="padding: 8px;">
                    <h3 style="margin: 0 0 8px 0; font-size: 1rem; font-weight: 700;">${title}</h3>
                    <p style="margin: 0; font-size: 0.875rem; color: #666;">
                        ${properties.nomcom || properties.commune || ''}
                    </p>
                </div>
            `)
            .addTo(this.map);
    }

    /**
     * Réinitialise la vue
     */
    resetView() {
        if (!this.map) return;

        this.map.flyTo({
            center: [4.8, 47.0],
            zoom: 9,
            duration: 1500
        });
    }

    /**
     * Zoom in
     */
    zoomIn() {
        if (!this.map) return;
        this.map.zoomIn({ duration: 300 });
    }

    /**
     * Zoom out
     */
    zoomOut() {
        if (!this.map) return;
        this.map.zoomOut({ duration: 300 });
    }

    /**
     * Récupère l'instance de la carte
     */
    getMap() {
        return this.map;
    }
}

export default MapController;
