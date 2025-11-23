/**
 * Page d'accueil - Recherche de parcelles
 */

import DataLoader from './data-loader.js';

class HomePage {
    constructor() {
        this.dataLoader = new DataLoader();
        this.searchInput = document.getElementById('search-input');
        this.searchBtn = document.getElementById('search-btn');
        this.autocomplete = document.getElementById('autocomplete');
        this.searchTimeout = null;
    }

    async init() {
        try {
            // Charger les données
            await this.dataLoader.loadIndex();

            // Setup event listeners
            this.setupListeners();

            console.log('✅ Homepage initialized');
        } catch (error) {
            console.error('❌ Error initializing homepage:', error);
        }
    }

    setupListeners() {
        // Search input
        this.searchInput.addEventListener('input', (e) => {
            this.handleInput(e.target.value);
        });

        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleSearch(this.searchInput.value);
            }
        });

        // Search button
        this.searchBtn.addEventListener('click', () => {
            this.handleSearch(this.searchInput.value);
        });

        // Close autocomplete on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-box')) {
                this.hideAutocomplete();
            }
        });
    }

    handleInput(query) {
        clearTimeout(this.searchTimeout);

        if (query.length < 2) {
            this.hideAutocomplete();
            return;
        }

        this.searchTimeout = setTimeout(() => {
            this.showAutocomplete(query);
        }, 300);
    }

    showAutocomplete(query) {
        const parcels = this.dataLoader.parcelles || [];
        const normalizedQuery = query.toLowerCase();

        const results = parcels
            .filter(p =>
                p.nomComplet.toLowerCase().includes(normalizedQuery) ||
                p.nom.toLowerCase().includes(normalizedQuery)
            )
            .slice(0, 8);

        if (results.length === 0) {
            this.hideAutocomplete();
            return;
        }

        const html = results.map(p => `
            <div class="autocomplete-item" data-geojson="${p.geojsonPath}" data-commune="${p.commune}">
                <div class="autocomplete-name">${p.nomComplet}</div>
                <div class="autocomplete-details">${p.communeNom} • Dept. ${p.departement}</div>
            </div>
        `).join('');

        this.autocomplete.innerHTML = html;
        this.autocomplete.classList.remove('hidden');

        // Add click handlers
        this.autocomplete.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => {
                const geojson = item.dataset.geojson;
                const commune = item.dataset.commune;
                this.navigateToMap(geojson, commune);
            });
        });
    }

    hideAutocomplete() {
        this.autocomplete.classList.add('hidden');
    }

    handleSearch(query) {
        if (!query || query.trim().length < 2) return;
        window.location.href = `map.html?search=${encodeURIComponent(query)}`;
    }

    navigateToMap(geojson, commune) {
        window.location.href = `map.html?geojson=${encodeURIComponent(geojson)}&commune=${commune}`;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const app = new HomePage();
    app.init();
});

export default HomePage;
