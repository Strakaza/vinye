/**
 * Module de chargement et gestion des données de parcelles
 */

class DataLoader {
    constructor() {
        this.parcelles = [];
        this.parcellesIndex = new Map();
        this.loaded = false;
    }

    /**
     * Charge l'index des parcelles
     */
    async loadIndex() {
        try {
            // Add timestamp to prevent caching
            const response = await fetch(`data/parcelles-index.json?v=${Date.now()}`);
            if (!response.ok) {
                throw new Error('Impossible de charger l\'index des parcelles');
            }

            const data = await response.json();
            this.parcelles = data.parcelles || [];

            // Créer un index pour recherche rapide
            this.parcelles.forEach((parcelle, index) => {
                const key = parcelle.nom.toLowerCase();
                if (!this.parcellesIndex.has(key)) {
                    this.parcellesIndex.set(key, []);
                }
                this.parcellesIndex.get(key).push(index);
            });

            this.loaded = true;
            console.log(`✅ ${this.parcelles.length} parcelles chargées`);
            return true;
        } catch (error) {
            console.error('❌ Erreur de chargement:', error);
            throw error;
        }
    }

    /**
     * Charge un fichier GeoJSON pour une parcelle
     */
    async loadGeoJSON(geojsonPath) {
        try {
            const response = await fetch(`${geojsonPath}`);
            if (!response.ok) {
                throw new Error(`Impossible de charger le GeoJSON: ${geojsonPath}`);
            }
            return await response.json();
        } catch (error) {
            console.error('❌ Erreur de chargement GeoJSON:', error);
            throw error;
        }
    }

    /**
     * Recherche de parcelles par nom (avec fuzzy matching)
     */
    search(query, maxResults = 20) {
        if (!query || query.length < 2) {
            return [];
        }

        const normalizedQuery = query.toLowerCase().trim();
        const results = [];
        const seen = new Set();

        // Recherche exacte en priorité
        for (const parcelle of this.parcelles) {
            const normalizedNom = parcelle.nom.toLowerCase();

            if (normalizedNom === normalizedQuery) {
                const key = `${parcelle.nom}-${parcelle.commune}`;
                if (!seen.has(key)) {
                    results.push({ ...parcelle, score: 100 });
                    seen.add(key);
                }
            }
        }

        // Recherche avec correspondance partielle
        for (const parcelle of this.parcelles) {
            const normalizedNom = parcelle.nom.toLowerCase();
            const normalizedComplet = parcelle.nomComplet.toLowerCase();

            if (normalizedNom.startsWith(normalizedQuery) ||
                normalizedComplet.includes(normalizedQuery)) {
                const key = `${parcelle.nom}-${parcelle.commune}`;
                if (!seen.has(key)) {
                    const score = normalizedNom.startsWith(normalizedQuery) ? 90 : 70;
                    results.push({ ...parcelle, score });
                    seen.add(key);
                }
            }
        }

        // Recherche fuzzy (contient les mots)
        const queryWords = normalizedQuery.split(/\s+/);
        for (const parcelle of this.parcelles) {
            const normalizedNom = parcelle.nom.toLowerCase();
            const normalizedComplet = parcelle.nomComplet.toLowerCase();

            const matchesAllWords = queryWords.every(word =>
                normalizedNom.includes(word) || normalizedComplet.includes(word)
            );

            if (matchesAllWords) {
                const key = `${parcelle.nom}-${parcelle.commune}`;
                if (!seen.has(key)) {
                    results.push({ ...parcelle, score: 50 });
                    seen.add(key);
                }
            }
        }

        // Trier par score puis par nom
        results.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            return a.nom.localeCompare(b.nom);
        });

        return results.slice(0, maxResults);
    }

    /**
     * Groupe les parcelles par nom
     */
    groupByName(parcelles) {
        const grouped = new Map();

        for (const parcelle of parcelles) {
            if (!grouped.has(parcelle.nom)) {
                grouped.set(parcelle.nom, []);
            }
            grouped.get(parcelle.nom).push(parcelle);
        }

        return Array.from(grouped.entries()).map(([nom, items]) => ({
            nom,
            count: items.length,
            parcelles: items
        }));
    }

    /**
     * Récupère toutes les parcelles
     */
    getAllParcelles() {
        return this.parcelles;
    }

    /**
     * Vérifie si les données sont chargées
     */
    isLoaded() {
        return this.loaded;
    }
    /**
     * Récupère les parcelles dans une bounding box donnée
     * @param {Array} bbox [minLng, minLat, maxLng, maxLat]
     * @returns {Array} Liste des parcelles dans la bbox
     */
    getParcellesInBbox(bbox) {
        if (!this.loaded || !bbox || bbox.length !== 4) {
            return [];
        }

        const [minLng, minLat, maxLng, maxLat] = bbox;

        return this.parcelles.filter(parcelle => {
            // Vérifier si le centre de la parcelle est dans la bbox
            // Note: parcelle.center est [lng, lat]
            const [lng, lat] = parcelle.center;
            return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
        });
    }
}

export default DataLoader;
