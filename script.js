let ftthData = {}, populationData = {}, communesStats = {}, layersMap1 = {}, layersMap2 = {};
let avgCoverageNational, avgDensityNational;

const metroBounds = [[41.0, -5.8], [51.7, 10.0]], FRANCE_CENTER = [46.6, 2.4], FRANCE_ZOOM = 6;

/* ── Initialisation Cartes ── */
const createMap = (id) => {
    const m = L.map(id, { preferCanvas: true, minZoom: 5.5, maxBounds: metroBounds, zoomSnap: 0.25 }).setView(FRANCE_CENTER, FRANCE_ZOOM);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO' }).addTo(m);
    return m;
};
const map1 = createMap('map1'), map2 = createMap('map2');

/* ── Sync & Reset ── */
let isSyncing = false;
const sync = (src, tgt) => src.on('move', () => {
    if (isSyncing) return;
    isSyncing = true;
    tgt.setView(src.getCenter(), src.getZoom(), { animate: false });
    isSyncing = false;
});
sync(map1, map2); sync(map2, map1);

const resetView = () => { map1.setView(FRANCE_CENTER, FRANCE_ZOOM); map2.setView(FRANCE_CENTER, FRANCE_ZOOM); };
document.getElementById('reset-btn-1').onclick = resetView;
document.getElementById('reset-btn-2').onclick = resetView;

/* ── Styles ── */
const getColorFTTH = v => v >= 90 ? '#4A148C' : v >= 75 ? '#7B1FA2' : v >= 50 ? '#9C27B0' : v >= 25 ? '#BA68C8' : '#E1BEE7';
const getColorDens = v => v >= 1000 ? '#67000d' : v >= 500 ? '#cb181d' : v >= 200 ? '#fb6a4a' : v >= 50 ? '#fcae91' : '#fee5d9';

const addHoverEffect = (layer, styleNormal) => {
    layer.on('mouseover', function() { this.setStyle({ weight: 2.5, color: '#4c1d95', fillOpacity: 0.95 }); this.bringToFront(); });
    layer.on('mouseout', function() { this.setStyle(styleNormal); });
};

/* ── Popups (Vos fonctions) ── */
function vsNationalBadge(v, avg, unit) {
    if (v == null || avg == null) return '';
    const diff = v - avg;
    const cls = diff > 0.5 ? 'above' : diff < -0.5 ? 'below' : 'neutral';
    const label = diff > 0.5 ? `↑ +${diff.toFixed(1)}${unit}` : diff < -0.5 ? `↓ ${diff.toFixed(1)}${unit}` : `≈ Moyenne`;
    return `<span class="popup-vs-national ${cls}" style="font-size:11px; font-weight:bold;">${label} vs moyenne</span>`;
}

const createPopup1 = (name, cov) => {
    const well = cov >= 75;
    return `<div class="popup-content"><b>${name}</b><br>Couverture: ${cov.toFixed(1)}%<br>${vsNationalBadge(cov, avgCoverageNational, '%')}<div class="popup-status ${well?'bien-fibre':'mal-fibre'}">${well?'Bien fibré':'Faible'}</div></div>`;
};

const createPopup2 = (name, dens, cov, pop) => {
    const well = cov >= 75;
    return `<div class="popup-content"><b>${name}</b><br>Pop: ${pop?.toLocaleString()}<br>Densité: ${dens?.toFixed(1)} hab/km²<br>${vsNationalBadge(dens, avgDensityNational, ' hab/km²')}<div class="popup-status ${well?'bien-fibre':'mal-fibre'}">Fibre: ${cov?.toFixed(1)}%</div></div>`;
};

/* ── Data & Dashboard ── */
async function init() {
    try {
        const csv = await fetch('https://raw.githubusercontent.com/diarydemba1-boop/data_yes/main/ok.csv').then(r => r.text());
        csv.trim().split('\n').slice(1).forEach(line => {
            const p = line.trim().split(/\s+/);
            const code = p[0].padStart(5, '0');
            ftthData[code] = parseFloat(p[p.length - 1]);
        });

        const pop = await fetch('https://geo.api.gouv.fr/communes?zone=metro&fields=code,nom,population,surface').then(r => r.json());
        pop.forEach(c => populationData[c.code] = c);

        const geo = await fetch('https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/2025/geojson/communes-1000m.geojson').then(r => r.json());
        const metroFeatures = geo.features.filter(f => {
            const c = (f.properties.code || f.properties.insee_com);
            return c && !c.startsWith("97") && !c.startsWith("98");
        });

        let tCov = 0, cCov = 0, tDens = 0, cDens = 0;
        metroFeatures.forEach(f => {
            const c = (f.properties.code || f.properties.insee_com);
            const p = populationData[c] || {};
            const cov = ftthData[c] || 0;
            const dens = (p.population && p.surface) ? p.population / (p.surface / 100) : 0;
            communesStats[c] = { name: f.properties.nom, coverage: cov, density: dens, pop: p.population };
            if (cov) { tCov += cov; cCov++; }
            if (dens && dens < 50000) { tDens += dens; cDens++; }
        });

        avgCoverageNational = tCov / cCov;
        avgDensityNational = tDens / cDens;

        render(metroFeatures);
        updateUI();
        setupSearch('search-input-1', 'search-results-1');
        setupSearch('search-input-2', 'search-results-2');
    } catch (e) { console.error(e); }
}

function render(features) {
    L.geoJSON(features, {
        style: f => {
            const s = communesStats[f.properties.code || f.properties.insee_com];
            return { color: "#9e9e9e", weight: 0.15, fillOpacity: 0.8, fillColor: getColorFTTH(s?.coverage || 0) };
        },
        onEachFeature: (f, l) => {
            const c = f.properties.code || f.properties.insee_com;
            layersMap1[c] = l;
            addHoverEffect(l, l.options.style);
            l.bindPopup(() => createPopup1(communesStats[c].name, communesStats[c].coverage));
        }
    }).addTo(map1);

    L.geoJSON(features, {
        style: f => {
            const s = communesStats[f.properties.code || f.properties.insee_com];
            return { color: "#9e9e9e", weight: 0.15, fillOpacity: 0.8, fillColor: getColorDens(s?.density || 0) };
        },
        onEachFeature: (f, l) => {
            const c = f.properties.code || f.properties.insee_com;
            layersMap2[c] = l;
            addHoverEffect(l, l.options.style);
            l.bindPopup(() => createPopup2(communesStats[c].name, communesStats[c].density, communesStats[c].coverage, communesStats[c].pop));
        }
    }).addTo(map2);
}

function updateUI() {
    document.getElementById('hero-coverage').textContent = avgCoverageNational.toFixed(1) + '%';
    document.getElementById('hero-density').textContent = avgDensityNational.toFixed(1) + ' hab/km²';
    document.getElementById('hero-count').textContent = Object.keys(communesStats).length.toLocaleString();
    
    // Sidebar Simplifiée
    document.getElementById('sidebar').innerHTML = `
        <div class="kpi-card"><b>📡 Moyenne FTTH</b><br><span class="kpi-value">${avgCoverageNational.toFixed(1)}%</span></div>
        <div class="kpi-card"><b>👥 Densité Moy.</b><br><span class="kpi-value">${avgDensityNational.toFixed(0)}</span></div>
    `;
}

function setupSearch(inputId, resId) {
    const input = document.getElementById(inputId), res = document.getElementById(resId);
    input.oninput = () => {
        const q = input.value.toLowerCase();
        res.innerHTML = '';
        if (q.length < 2) { res.style.display = 'none'; return; }
        const matches = Object.entries(communesStats).filter(([c, s]) => s.name.toLowerCase().includes(q)).slice(0, 10);
        matches.forEach(([code, s]) => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.innerHTML = `<span>${s.name}</span><b>${s.coverage.toFixed(0)}%</b>`;
            div.onclick = () => {
                fetch(`https://geo.api.gouv.fr/communes/${code}?fields=centre`).then(r=>r.json()).then(data => {
                    const [lng, lat] = data.centre.coordinates;
                    map1.setView([lat, lng], 12); map2.setView([lat, lng], 12);
                    setTimeout(() => { layersMap1[code]?.openPopup(); layersMap2[code]?.openPopup(); }, 400);
                });
                res.style.display = 'none';
                input.value = s.name;
            };
            res.appendChild(div);
        });
        res.style.display = 'block';
    };
}

init();