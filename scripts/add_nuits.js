const fs = require('fs');
const path = require('path');

const DIRECTORY = 'c:/ivana/mobile-app/delimitation_aoc/21/21464';
const INDEX_FILE = 'c:/ivana/mobile-app/data/parcelles-index.json';
const RELATIVE_BASE = 'delimitation_aoc/21/21464';

function getBboxAndCenter(geometry) {
    let coords = [];
    if (geometry.type === 'Polygon') {
        coords = geometry.coordinates[0];
    } else if (geometry.type === 'MultiPolygon') {
        geometry.coordinates.forEach(poly => {
            coords = coords.concat(poly[0]);
        });
    }

    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    let sumLng = 0, sumLat = 0;

    coords.forEach(coord => {
        const [lng, lat] = coord;
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
        sumLng += lng;
        sumLat += lat;
    });

    return {
        bbox: [minLng, minLat, maxLng, maxLat],
        center: [sumLng / coords.length, sumLat / coords.length]
    };
}

try {
    const indexData = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    const files = fs.readdirSync(DIRECTORY);

    let addedCount = 0;

    files.forEach(file => {
        if (!file.endsWith('.geojson') || file === 'cadastre-parcelles.json') return;

        const filePath = path.join(DIRECTORY, file);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        if (!content.features || content.features.length === 0) return;

        const feature = content.features[0];
        const props = feature.properties;
        const { bbox, center } = getBboxAndCenter(feature.geometry);

        const entry = {
            nom: props.app,
            nomComplet: props.denom || props.app,
            commune: props.insee,
            communeNom: props.nomcom,
            departement: "21",
            geojsonPath: `${RELATIVE_BASE}/${file}`,
            center: center,
            bbox: bbox
        };

        // Check if already exists (by path)
        const existing = indexData.parcelles.filter(p => p.geojsonPath === entry.geojsonPath);
        if (existing.length > 0) {
            existing.forEach(e => {
                if (e.nom === 'Nuits-Saint-Georges' && !e.nomComplet.includes('Les Vallerots') && file === '01012.geojson') {
                    console.log('Found GENERIC entry for 01012:', JSON.stringify(e, null, 2));
                }
                if (e.nom === 'Nuits-Saint-Georges' && e.nomComplet === 'Nuits-Saint-Georges premier cru') {
                    console.log(`Found generic entry for ${file}:`, e.nomComplet);
                }
            });
        }
    });

    indexData.totalParcelles = indexData.parcelles.length;

    fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2));
    console.log(`Added ${addedCount} parcels to index.`);

} catch (error) {
    console.error('Error:', error);
}
