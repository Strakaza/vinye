/**
 * Page Carte - Affichage des résultats de recherche
 */

import DataLoader from './data-loader.js?v=3';
import MapController from './map-controller.js?v=2';

class MapPage {
    constructor() {
        console.log('🚀 MapPage v10 initialized (No Geolocation)');
        this.dataLoader = new DataLoader();
        this.mapController = null;
        this.MAPBOX_TOKEN = 'pk.eyJ1Ijoic3RyYWthemEiLCJhIjoiY21pNzl6YnA3MDg4YzJrc2JrcnI2eTBnOCJ9.IVHXNpl2MQ-WHRdBaxWdNA';
    }

    async init() {
        try {
            // Get URL parameters
            const params = new URLSearchParams(window.location.search);
            const geojsonPath = params.get('geojson');
            const commune = params.get('commune');
            const searchQuery = params.get('search');

            // Load data
            await this.dataLoader.loadIndex();

            // Initialize map
            this.mapController = new MapController('map', this.MAPBOX_TOKEN);
            this.mapController.init();

            // Setup controls
            this.setupControls();

            // Wait for map to load
            await new Promise(resolve => setTimeout(resolve, 500));

            if (geojsonPath && commune) {
                //Display single parcel
                await this.displaySingleParcel(geojsonPath, commune);
            } else if (searchQuery) {
                // Display search results
                await this.displaySearchResults(searchQuery);
            }

        } catch (error) {
            console.error('❌ Error:', error);
            document.getElementById('parcel-title').textContent = 'Erreur de chargement';
            document.getElementById('parcel-details').textContent = error.message;
        }
    }

    setupControls() {
        document.getElementById('zoom-in')?.addEventListener('click', () => {
            this.mapController?.zoomIn();
        });

        document.getElementById('zoom-out')?.addEventListener('click', () => {
            this.mapController?.zoomOut();
        });

        document.getElementById('back-home')?.addEventListener('click', () => {
            window.location.href = 'index.html';
        });

        document.getElementById('toggle-style')?.addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const isSatellite = this.mapController?.toggleStyle();

            // Mettre à jour l'icône
            if (isSatellite) {
                // Icone "Map" (pour revenir au plan)
                btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg>';
            } else {
                // Icone "Satellite" (pour aller vers satellite)
                btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';
            }
        });
    }

    async displaySingleParcel(geojsonPath, commune) {
        try {
            // Find the parcel
            const parcel = this.dataLoader.parcelles.find(p =>
                p.geojsonPath === geojsonPath && p.commune === commune
            );

            if (!parcel) {
                throw new Error('Parcelle non trouvée');
            }

            // Load GeoJSON
            const geojson = await this.dataLoader.loadGeoJSON(parcel.geojsonPath);

            // Get commune name
            const communeNom = geojson.features?.[0]?.properties?.nomcom || parcel.communeNom;

            const enrichedParcel = {
                ...parcel,
                communeNomFromGeo: communeNom
            };

            // Display on map
            await this.mapController.displayMultipleParcels([{
                parcel: enrichedParcel,
                geojson: geojson
            }]);

            // Update info
            document.getElementById('parcel-title').textContent = parcel.nomComplet;
            document.getElementById('parcel-details').textContent = `${communeNom} • Département ${parcel.departement}`;

        } catch (error) {
            console.error('❌ Error displaying parcel:', error);
            throw error;
        }
    }

    async displaySearchResults(query) {
        try {
            const normalizedQuery = query.toLowerCase();
            const parcels = this.dataLoader.parcelles || [];

            const results = parcels.filter(p =>
                p.nomComplet.toLowerCase().includes(normalizedQuery) ||
                p.nom.toLowerCase().includes(normalizedQuery)
            );

            if (results.length === 0) {
                document.getElementById('parcel-title').textContent = 'Aucun résultat';
                document.getElementById('parcel-details').textContent = `Aucune parcelle trouvée pour "${query}"`;
                return;
            }

            // Load all matching parcels
            const parcelsData = await Promise.all(
                results.slice(0, 50).map(async (p) => {
                    try {
                        const geojson = await this.dataLoader.loadGeoJSON(p.geojsonPath);
                        const communeNom = geojson.features?.[0]?.properties?.nomcom || p.communeNom;

                        return {
                            parcel: { ...p, communeNomFromGeo: communeNom },
                            geojson: geojson
                        };
                    } catch (error) {
                        console.warn(`⚠️ Failed to load ${p.nomComplet}`);
                        return null;
                    }
                })
            );

            const validParcels = parcelsData.filter(p => p !== null);

            if (validParcels.length > 0) {
                await this.mapController.displayMultipleParcels(validParcels);

                document.getElementById('parcel-title').textContent = query;
                document.getElementById('parcel-details').textContent =
                    `${validParcels.length} parcelle${validParcels.length > 1 ? 's' : ''} trouvée${validParcels.length > 1 ? 's' : ''}`;
            }

        } catch (error) {
            console.error('❌ Error displaying search results:', error);
            throw error;
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const app = new MapPage();
    app.init();
});

export default MapPage;
