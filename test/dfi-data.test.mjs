// Tests de la logique du module : node test/dfi-data.test.mjs
import assert from 'node:assert/strict';
import {
    SUPPORTED_FORMAT, DfiError, parseIdu, parcelKey, splitKey, parcelLabel, formatDate, dataUrl, loadJson,
    checkIndex, loadIndex, loadCommune, buildLookup, describeLot, buildGraph, parcelSummary, layoutGraph,
    fitView, clampView, zoomView, viewBoxOf, lineageOf, nodeTooltip,
    DEFAULT_CADASTRE_URL, cadastreUrl, geometryBbox, expandBbox, extentForVisible, fitExtent, parseCadastre, loadParcel, formatArea,
    communeOptions, sectionOptions, numberOptions, normalizeNumber, selectionIdu
} from '../src/js/dfi-data.js';

let failures = 0;
async function test(name, fn) {
    try { await fn(); console.log('  ok  ' + name); }
    catch (e) { failures++; console.error('  ÉCHEC  ' + name + '\n    ' + (e && e.stack || e)); }
}

// Filiation d'essai : AH 65 + AH 72 -> (lot 0) -> AH 261 -> (lot 1) -> AH 264 -> (lot 2) -> AH 280, AH 281
const LOTS = [
    ['0000100', '00001', 1, '1990-03-01', ['AH0065', 'AH0072'], ['AH0261']],
    ['0000200', '00001', 7, '2001-05-10', ['AH0261'], ['AH0264', 'AH0300']],
    ['0001294', '00001', 7, '2008-01-28', ['AH0264'], ['AH0280', 'AH0281']],
    ['0000300', '00001', 2, '2010-01-05', ['AH0500'], []],                       // disparition
    ['0000400', '00001', 4, '2012-02-02', [], ['AH0600']]                       // création
];
const lookup = buildLookup({ insee: '38544', lots: LOTS });

await test('parseIdu : découpe, majuscules, espaces', () => {
    const p = parseIdu(' 38544000bi0498 ');
    assert.deepEqual([p.insee, p.commune, p.prefix, p.section, p.number, p.key], ['38544', '544', '000', 'BI', '0498', 'BI0498']);
    assert.equal(parseIdu('38544014AH0001').key, '014AH0001');
    assert.equal(parseIdu('2A004000AB0001').insee, '2A004');
});
await test('parseIdu : refuse ce qui n\'est pas un IDU', () => {
    for (const bad of ['', null, undefined, '38544000BI498', '3854400BI0498', 'abc', '38544000BI04980']) {
        assert.equal(parseIdu(bad), null, String(bad));
    }
});
await test('clés, libellés et dates', () => {
    assert.equal(parcelKey('000', 'AH', '0280'), 'AH0280');
    assert.equal(parcelKey('014', 'AH', '0280'), '014AH0280');
    assert.deepEqual(splitKey('014AH0280', '38544'), { insee: '38544', prefix: '014', section: 'AH', number: '0280', idu: '38544014AH0280', key: '014AH0280' });
    assert.equal(splitKey('0C0637', '38544').idu, '385440000C0637');
    assert.equal(parcelLabel('AH0280'), 'AH 280');
    assert.equal(parcelLabel('0C0637'), 'C 637');
    assert.equal(parcelLabel('014AH0001'), '014 AH 1');
    assert.equal(parcelLabel('AH0000'), 'AH 0');
    assert.equal(formatDate('2008-01-28'), '28/01/2008');
    assert.equal(formatDate(''), '');
    assert.equal(dataUrl('https://exemple.fr/d/', 'index.json'), 'https://exemple.fr/d/index.json');
});
await test('checkIndex : format et structure', () => {
    assert.throws(() => checkIndex(null), (e) => e.code === 'index');
    assert.throws(() => checkIndex({ format: 1 }), (e) => e.code === 'index');
    assert.throws(() => checkIndex({ format: 2, communes: {} }), (e) => e instanceof DfiError && e.code === 'format' && /mettre le module à jour/.test(e.message));
    const ok = { format: SUPPORTED_FORMAT, communes: {} };
    assert.equal(checkIndex(ok), ok);
});

const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: () => body === undefined ? Promise.reject(new Error('x')) : Promise.resolve(body) });
await test('loadJson : réussite, 404, erreur HTTP, JSON illisible, réseau', async () => {
    assert.deepEqual(await loadJson(() => Promise.resolve(response(200, { a: 1 })), 'u'), { a: 1 });
    await assert.rejects(loadJson(() => Promise.resolve(response(404, {})), 'u'), (e) => e.code === 'notfound');
    await assert.rejects(loadJson(() => Promise.resolve(response(500, {})), 'u'), (e) => e.code === 'http');
    await assert.rejects(loadJson(() => Promise.resolve(response(200, undefined)), 'u'), (e) => e.code === 'json');
    await assert.rejects(loadJson(() => Promise.reject(new TypeError('Failed to fetch')), 'u'), (e) => e.code === 'network');
});
await test('loadJson : n\'envoie aucune identification', async () => {
    let options;
    await loadJson((url, o) => { options = o; return Promise.resolve(response(200, {})); }, 'u');
    assert.equal(options.credentials, 'omit');
});
await test('loadIndex et loadCommune', async () => {
    const calls = [];
    const fetchFn = (url) => { calls.push(url); return Promise.resolve(response(200, url.endsWith('index.json')
        ? { format: 1, communes: { 38544: { lots: 5 } } } : { insee: '38544', lots: LOTS })); };
    const index = await loadIndex(fetchFn, 'https://exemple.fr/d/');
    const data = await loadCommune(fetchFn, 'https://exemple.fr/d/', index, '38544');
    assert.equal(data.lots.length, 5);
    assert.deepEqual(calls, ['https://exemple.fr/d/index.json', 'https://exemple.fr/d/38544.json']);
    await assert.rejects(loadCommune(fetchFn, 'https://exemple.fr/d/', index, '38999'), (e) => e.code === 'commune');
    assert.equal(calls.length, 2); // commune absente : aucune requête inutile
    await assert.rejects(loadCommune(() => Promise.resolve(response(200, { lots: 'x' })), 'b', index, '38544'), (e) => e.code === 'json');
});
await test('describeLot : type d\'opération', () => {
    const kinds = LOTS.map((l) => describeLot(l).kind);
    assert.deepEqual(kinds, ['Réunion', 'Division', 'Division', 'Disparition', 'Création']);
    assert.equal(describeLot(['1', '00001', 5, '2020-01-02', ['A'], ['B']]).kind, 'Changement de numérotation');
    assert.equal(describeLot(['1', '00001', 5, '2020-01-02', ['A', 'B'], ['C', 'D']]).kind, 'Réorganisation');
    const d = describeLot(LOTS[2]);
    assert.deepEqual([d.natureLabel, d.dateLabel, d.dfi], ['Lotissement', '28/01/2008', '0001294']);
    assert.equal(describeLot(['1', '00001', 9, '2020-01-02', [], []]).natureLabel, 'Nature 9');
});

const byId = (g) => Object.fromEntries(g.nodes.map((n) => [n.id, n]));
await test('buildGraph : ancêtres, descendants et niveaux', () => {
    const g = buildGraph(lookup, 'AH0264');
    const n = byId(g);
    assert.equal(n['p:AH0264'].level, 0);
    assert.equal(n['p:AH0261'].level, -1);
    assert.equal(n['p:AH0065'].level, -2);
    assert.equal(n['p:AH0072'].level, -2);
    assert.equal(n['l:0'].level, -1.5);
    assert.equal(n['l:1'].level, -0.5);
    assert.equal(n['l:2'].level, 0.5);
    assert.equal(n['p:AH0280'].level, 1);
    assert.equal(n['p:AH0281'].level, 1);
    assert.equal(n['p:AH0300'].level, 0, 'sœur de la parcelle cherchée : même niveau, non explorée');
    assert.equal(n['p:AH0300'].explored, false);
    assert.ok(g.edges.some((e) => e.from === 'p:AH0261' && e.to === 'l:1'));
    assert.ok(g.edges.some((e) => e.from === 'l:1' && e.to === 'p:AH0264'));
    assert.ok(g.edges.some((e) => e.from === 'l:1' && e.to === 'p:AH0300'));
    assert.equal(g.hasHistory, true);
    assert.equal(g.truncated, false);
    assert.ok(!n['l:3'] && !n['l:4'], 'lots sans rapport absents');
});
await test('buildGraph : parcelle sans historique', () => {
    const g = buildGraph(lookup, 'ZZ0001');
    assert.equal(g.nodes.length, 1);
    assert.equal(g.hasHistory, false);
});
await test('buildGraph : parcelle créée et parcelle disparue', () => {
    const created = buildGraph(lookup, 'AH0600');
    assert.deepEqual(created.nodes.map((n) => n.id).sort(), ['l:4', 'p:AH0600']);
    const gone = buildGraph(lookup, 'AH0500');
    assert.deepEqual(gone.nodes.map((n) => n.id).sort(), ['l:3', 'p:AH0500']);
});
await test('buildGraph : cas pathologiques (parcelle mère et fille d\'un même lot, cycle) : le calcul se termine', () => {
    // Absent des départements 38 et 69 (0 lot sur 674 787) : on garantit seulement la terminaison et l'absence de doublon.
    const loop = buildLookup({ lots: [
        ['1', '00001', 1, '2000-01-01', ['AB0001'], ['AB0001', 'AB0002']],
        ['2', '00001', 1, '2001-01-01', ['AB0002'], ['AB0003']]
    ] });
    const g = buildGraph(loop, 'AB0001');
    const ids = g.nodes.map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length, 'doublon');
    assert.ok(ids.includes('l:0') && ids.includes('p:AB0001') && ids.includes('p:AB0002'));
    const cycle = buildLookup({ lots: [
        ['1', '00001', 1, '2000-01-01', ['AB0001'], ['AB0002']],
        ['2', '00001', 1, '2001-01-01', ['AB0002'], ['AB0001']]
    ] });
    assert.ok(buildGraph(cycle, 'AB0001').nodes.length <= 4);   // se termine
});
await test('buildGraph : limites (nœuds, sœurs masquées)', () => {
    const many = Array.from({ length: 30 }, (_, i) => 'AB' + String(i + 10).padStart(4, '0'));
    const big = buildLookup({ lots: [['1', '00001', 4, '2000-01-01', ['AB0001'], many]] });
    const g = buildGraph(big, 'AB0001', { maxNodes: 1000 });
    assert.equal(g.nodes.filter((n) => n.type === 'parcel').length, 1 + 30, 'toutes les filles sont des descendants');
    const fromDaughter = buildGraph(big, many[0]);
    const lot = fromDaughter.nodes.find((n) => n.type === 'lot');
    assert.equal(lot.hidden, 21, '29 sœurs : 8 montrées, 21 masquées');
    const tiny = buildGraph(big, 'AB0001', { maxNodes: 5 });
    assert.equal(tiny.nodes.length, 5);
    assert.equal(tiny.truncated, true);
});
await test('parcelSummary', () => {
    const s = parcelSummary(lookup, 'AH0264');
    assert.deepEqual(s.origin.map((l) => l.dfi), ['0000200']);
    assert.deepEqual(s.future.map((l) => l.dfi), ['0001294']);
    assert.deepEqual(parcelSummary(lookup, 'AH0280').future, []);
});
await test('layoutGraph : lignes par niveau, pas de chevauchement', () => {
    const g = buildGraph(lookup, 'AH0264');
    const labelOf = (n) => n.type === 'parcel' ? 'P ' + n.key : 'L ' + n.index;
    const l = layoutGraph(g, labelOf);
    assert.ok(Number.isFinite(l.width) && Number.isFinite(l.height) && l.width > 0 && l.height > 0);
    const n = byId(g);
    assert.ok(n['p:AH0065'].y < n['p:AH0261'].y && n['p:AH0261'].y < n['p:AH0264'].y && n['p:AH0264'].y < n['p:AH0280'].y);
    const rows = {};
    g.nodes.forEach((x) => { (rows[x.y] = rows[x.y] || []).push(x); });
    Object.values(rows).forEach((row) => {
        row.sort((a, b) => a.x - b.x);
        for (let i = 1; i < row.length; i++) { assert.ok(row[i].x >= row[i - 1].x + row[i - 1].w, 'chevauchement'); }
    });
    g.nodes.forEach((x) => { assert.ok(x.x >= 0 && x.x + x.w <= l.width && x.y + x.h <= l.height); });
    assert.equal(l.paths.length, g.edges.length);
    assert.ok(l.paths.every((p) => /^M[\d.]+,[\d.]+ C/.test(p.d)));
});
await test('layoutGraph : un seul nœud', () => {
    const l = layoutGraph(buildGraph(lookup, 'ZZ0001'), () => 'ZZ 1');
    assert.equal(l.nodes.length, 1);
    assert.equal(l.paths.length, 0);
});

// ── Détail d'un nœud : lignée et infobulle ──────────────────────────────────────────────────────────────────────

await test('lineageOf : ancêtres et descendants, sans les sœurs', () => {
    const g = buildGraph(lookup, 'AH0264');
    const lin = lineageOf(g.edges, 'p:AH0264');
    ['p:AH0264', 'l:1', 'p:AH0261', 'l:0', 'p:AH0065', 'p:AH0072', 'l:2', 'p:AH0280', 'p:AH0281']
        .forEach((id) => assert.ok(lin[id], id + ' dans la lignée'));
    assert.ok(!lin['p:AH0300'], 'AH 300, sœur de AH 264, hors lignée');
    assert.deepEqual(Object.keys(lineageOf(g.edges, 'p:AH0280')).sort(),
        ['l:0', 'l:1', 'l:2', 'p:AH0065', 'p:AH0072', 'p:AH0261', 'p:AH0264', 'p:AH0280'], 'AH 280 : sa sœur AH 281 hors lignée');
    assert.deepEqual(lineageOf([], 'p:X'), { 'p:X': true }, 'nœud isolé');
});

await test('nodeTooltip : parcelle et opération', () => {
    assert.equal(nodeTooltip(lookup, { type: 'parcel', key: 'AH0264' }),
        'Parcelle AH 264\nOrigine : division le 10/05/2001\nDevenir : division le 28/01/2008\nCliquer pour le détail');
    assert.equal(nodeTooltip(lookup, { type: 'parcel', key: 'AH0281' }).split('\n')[2], 'Devenir : aucune évolution postérieure connue');
    assert.equal(nodeTooltip(lookup, { type: 'lot', index: 3, hidden: 0 }),
        'Disparition — Croquis de conservation\n05/01/2010, DFI n° 0000300\n1 mère(s), 0 fille(s)\nCliquer pour le détail');
    assert.ok(nodeTooltip(lookup, { type: 'lot', index: 1, hidden: 1 }).includes('dont 1 non affichée(s)'));
});

// ── Zoom et déplacement du graphe ────────────────────────────────────────────────────────────────────────────

await test('fitView : tout le graphe visible, jamais agrandi', () => {
    assert.deepEqual(fitView(1000, 400, 500, 400), { cx: 500, cy: 200, scale: 0.5 });
    assert.equal(fitView(200, 100, 500, 400).scale, 1, 'un petit graphe reste à la taille réelle');
});

await test('clampView : la vue reste dans l\'emprise du graphe', () => {
    const at = (cx, cy, scale) => ({ cx, cy, scale });
    assert.deepEqual(clampView(at(30, 980, 1), 2000, 1000, 500, 400), at(250, 800, 1), 'coin bas gauche : bords du graphe');
    assert.deepEqual(clampView(at(1000, 500, 1), 2000, 1000, 500, 400), at(1000, 500, 1), 'au milieu : inchangée');
    assert.deepEqual(clampView(at(-5000, 5000, 2), 2000, 1000, 500, 400), at(125, 900, 2), 'zoomée : zone visible plus petite');
    assert.deepEqual(clampView(at(0, 0, 1), 300, 1000, 500, 400), at(150, 200, 1), 'graphe plus étroit que la zone : centré');
});

await test('zoomView : le point visé reste fixe à l\'écran ; échelle bornée', () => {
    const v = { cx: 100, cy: 100, scale: 1 };
    const z = zoomView(v, 2, 150, 100, 0.2, 3);
    assert.equal(z.scale, 2);
    assert.equal((150 - z.cx) * z.scale, (150 - v.cx) * v.scale, 'même écart au centre, à l\'écran');
    assert.equal(zoomView(v, 10, 0, 0, 0.2, 3).scale, 3);
    assert.equal(zoomView(v, 0.01, 0, 0, 0.2, 3).scale, 0.2);
    assert.deepEqual(zoomView(v, 10, 0, 0, 1, 1), v, 'échelle déjà en butée : la vue ne bouge pas');
});

await test('viewBoxOf : zone vue à l\'échelle', () => {
    assert.equal(viewBoxOf({ cx: 100, cy: 50, scale: 2 }, 400, 200), '0 0 200 100');
});

// ── Localisation (API Carto Cadastre de l'IGN) : réponse de la forme réelle (MultiPolygon EPSG:4326) ──────────
const PARCEL = { type: 'Feature', id: 'parcelle.65018364', geometry: { type: 'MultiPolygon', coordinates: [[[[4.8636, 45.5130], [4.8650, 45.5130], [4.8650, 45.5142], [4.8636, 45.5142], [4.8636, 45.5130]]]] },
    properties: { numero: '0498', section: 'BI', code_dep: '38', nom_com: 'Vienne', code_com: '544', com_abs: '000', idu: '38544000BI0498', contenance: 14000, code_insee: '38544' } };
const collection = (...features) => ({ type: 'FeatureCollection', features, crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::4326' } } });
const P498 = { insee: '38544', prefix: '000', section: 'BI', number: '0498' };

await test('cadastreUrl : paramètres, préfixe toujours transmis, base personnalisée', () => {
    assert.equal(cadastreUrl(undefined, P498), DEFAULT_CADASTRE_URL + '?code_insee=38544&section=BI&numero=0498&com_abs=000');
    assert.equal(cadastreUrl('https://miroir.exemple.fr/parcelle?x=1', { insee: '38001', prefix: '028', section: '0E', number: '0374' }),
        'https://miroir.exemple.fr/parcelle?code_insee=38001&section=0E&numero=0374&com_abs=028');
    assert.match(cadastreUrl(DEFAULT_CADASTRE_URL, { insee: '38001', section: '0A', number: '0524' }), /com_abs=000$/, 'préfixe absent : 000');
});
await test('geometryBbox, expandBbox, extentForVisible', () => {
    assert.deepEqual(geometryBbox(PARCEL.geometry), { minX: 4.8636, minY: 45.513, maxX: 4.865, maxY: 45.5142 });
    assert.deepEqual(geometryBbox({ type: 'Point', coordinates: [5, 45] }), { minX: 5, minY: 45, maxX: 5, maxY: 45 });
    assert.equal(geometryBbox({ type: 'Polygon', coordinates: [] }), null);
    assert.equal(geometryBbox(null), null);
    const e = expandBbox({ minX: 0, minY: 0, maxX: 10, maxY: 4 }, 0.5, 0);
    assert.deepEqual(e, { minX: -5, minY: -5, maxX: 15, maxY: 9 });
    assert.deepEqual(expandBbox({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, 0.5, 60), { minX: -55, minY: -55, maxX: 65, maxY: 65 });
    // panneau recouvrant 45 % de la carte : l'emprise s'agrandit pour que la parcelle soit au centre des 55 % découverts
    const v = extentForVisible({ minX: 0, minY: 0, maxX: 55, maxY: 20 }, 0.55);
    assert.ok(Math.abs((v.maxX - v.minX) - 100) < 1e-9); assert.equal(v.minY, 0); assert.equal(v.maxY, 20);
    assert.ok(Math.abs((v.minX + 0.55 * 100 / 2) - 27.5) < 1e-9, 'centre de la zone découverte = centre de la parcelle');
    assert.deepEqual(extentForVisible({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 1), { minX: 0, maxX: 10, minY: 0, maxY: 10 });
    assert.deepEqual(extentForVisible({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 0), { minX: 0, maxX: 10, minY: 0, maxY: 10 }, 'fraction invalide ignorée');
});
await test('fitExtent : rapport de la carte et centrage dans la partie découverte', () => {
    const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)), msg + ' : ' + a + ' / ' + b);
    for (const [bb, vp, v] of [
        [{ minX: 0, minY: 0, maxX: 100, maxY: 100 }, { width: 1000, height: 500 }, 0.5],
        [{ minX: 10, minY: -5, maxX: 40, maxY: 95 }, { width: 1745, height: 1100 }, 0.55],       // parcelle haute : limitée par la hauteur
        [{ minX: 0, minY: 0, maxX: 300, maxY: 20 }, { width: 800, height: 600 }, 0.7],            // parcelle large : limitée par la largeur
        [{ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { width: 1000, height: 500 }, 1]]) {
        const e = fitExtent(bb, vp, v);
        near((e.maxX - e.minX) / (e.maxY - e.minY), vp.width / vp.height, 'rapport de la carte');
        near(e.minX + (e.maxX - e.minX) * v / 2, (bb.minX + bb.maxX) / 2, 'centre horizontal de la partie découverte');
        near((e.minY + e.maxY) / 2, (bb.minY + bb.maxY) / 2, 'centre vertical');
        assert.ok(e.minX <= bb.minX + 1e-9 && e.minX + (e.maxX - e.minX) * v >= bb.maxX - 1e-9, 'la parcelle tient dans la partie découverte');
        assert.ok(e.minY <= bb.minY + 1e-9 && e.maxY >= bb.maxY - 1e-9);
    }
    const e = fitExtent({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, { width: 1000, height: 500 }, 0.5);
    assert.deepEqual(e, { minX: 0, maxX: 200, minY: 0, maxY: 100 }, 'la parcelle occupe exactement la moitié gauche');
    assert.deepEqual(fitExtent({ minX: 0, minY: 0, maxX: 55, maxY: 20 }, null, 0.55), extentForVisible({ minX: 0, minY: 0, maxX: 55, maxY: 20 }, 0.55), 'sans taille de carte : repli');
    assert.deepEqual(fitExtent({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, { width: 100, height: 100 }, 0.5), extentForVisible({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, 0.5), 'emprise nulle : repli');
});
await test('parseCadastre : parcelle trouvée, absente, plusieurs préfixes, réponse invalide', () => {
    const ok = parseCadastre(collection(PARCEL), '38544000BI0498');
    assert.equal(ok.idu, '38544000BI0498'); assert.equal(ok.contenance, 14000); assert.equal(ok.commune, 'Vienne'); assert.equal(ok.bbox.minX, 4.8636);
    assert.equal(parseCadastre(collection(), '38544000BI0457'), null, 'parcelle disparue : aucun résultat');
    const other = { ...PARCEL, properties: { ...PARCEL.properties, idu: '38544165BI0498', com_abs: '165' } };
    assert.equal(parseCadastre(collection(other, PARCEL), '38544000BI0498').idu, '38544000BI0498', 'on garde le bon IDU');
    assert.equal(parseCadastre(collection(other), '38544000BI0498'), null, 'un seul résultat mais un autre IDU : refusé');
    assert.equal(parseCadastre(collection({ type: 'Feature', geometry: PARCEL.geometry, properties: {} }), 'X').idu, 'X', 'sans IDU, résultat unique accepté');
    assert.throws(() => parseCadastre({ code: 400 }, 'x'), (e) => e instanceof DfiError && e.code === 'json');
    assert.throws(() => parseCadastre(null, 'x'), (e) => e.code === 'json');
    assert.throws(() => parseCadastre(collection({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: { idu: 'X' } }), 'X'), (e) => e.code === 'json');
});
await test('loadParcel : appel sans identification, parcelle absente, erreurs', async () => {
    let seen;
    const fetchFn = (url, o) => { seen = [url, o]; return Promise.resolve(response(200, collection(PARCEL))); };
    const r = await loadParcel(fetchFn, undefined, P498);
    assert.equal(r.idu, '38544000BI0498'); assert.equal(seen[1].credentials, 'omit'); assert.match(seen[0], /com_abs=000$/);
    assert.equal(await loadParcel(() => Promise.resolve(response(200, collection())), undefined, P498), null);
    await assert.rejects(loadParcel(() => Promise.resolve(response(400, {})), undefined, P498), (e) => e.code === 'http');
    await assert.rejects(loadParcel(() => Promise.resolve(response(200, undefined)), undefined, P498), (e) => e.code === 'json');
    await assert.rejects(loadParcel(() => Promise.reject(new TypeError('x')), undefined, P498), (e) => e.code === 'network');
});
await test('formatArea', () => {
    assert.equal(formatArea(14000), '1,4 ha'); assert.equal(formatArea(10000), '1 ha'); assert.equal(formatArea(987), '987 m²');
    assert.equal(formatArea(1234), '1 234 m²'); assert.equal(formatArea(null), ''); assert.equal(formatArea(NaN), '');
});

await test('communeOptions : tri par nom, libellé, filtre du territoire, index sans noms', () => {
    const index = { communes: { '38544': { lots: 1, nom: 'Vienne' }, '69007': { lots: 1, nom: 'Ampuis' }, '38087': { lots: 1, nom: 'Chasse-sur-Rhône' },
                                '2A004': { lots: 1, nom: 'Ajaccio' }, '38999': { lots: 1 }, '69381': { lots: 1, nom: 'Lyon 1er Arrondissement' } } };
    const all = communeOptions(index, null);
    assert.equal(all[all.length - 1].insee, '38999', 'sans nom : en dernier')
    assert.deepEqual(all.slice(0, 3).map((o) => o.name), ['Ajaccio', 'Ampuis', 'Chasse-sur-Rhône']);
    assert.equal(all.find((o) => o.insee === '38544').label, 'Vienne (38544)');
    assert.equal(all.find((o) => o.insee === '38999').label, '38999', 'sans nom : le code tient lieu de libellé');
    assert.deepEqual(communeOptions(index, { '38544': true, '69007': true, '00000': true }).map((o) => o.insee), ['69007', '38544']);
});
await test('sectionOptions / numberOptions : listes tirées des parcelles des DFI', () => {
    const lk = buildLookup({ insee: '38544', lots: [
        ['a', '1', 1, '1990-03-01', ['AH0065', 'AH0072'], ['AH0261']],
        ['b', '1', 7, '2001-05-10', ['AH0261', '0A0010'], ['AB0007', '014AH0003']],
        ['c', '1', 2, '2010-01-05', ['AB0007'], []] ] });
    assert.deepEqual(sectionOptions(lk).map((s) => [s.value, s.label, s.count]), [['0000A', 'A', 1], ['000AB', 'AB', 1], ['000AH', 'AH', 3], ['014AH', '014 AH', 1]]);
    assert.deepEqual(numberOptions(lk, '000AH'), ['0065', '0072', '0261']); assert.deepEqual(numberOptions(lk, '014AH'), ['0003']);
    assert.deepEqual(numberOptions(lk, '000ZZ'), []);
});
await test('normalizeNumber / selectionIdu', () => {
    assert.equal(normalizeNumber('498'), '0498'); assert.equal(normalizeNumber(' 0498 '), '0498'); assert.equal(normalizeNumber('7'), '0007');
    assert.equal(normalizeNumber('12345'), null); assert.equal(normalizeNumber('4a'), null); assert.equal(normalizeNumber(''), null);
    assert.equal(selectionIdu('38544', '000BI', '498'), '38544000BI0498'); assert.equal(selectionIdu('38544', '000BI', ''), null);
    assert.equal(selectionIdu('', '000BI', '498'), null); assert.equal(selectionIdu('38544', 'BI', '498'), null);
    assert.equal(parseIdu(selectionIdu('2A004', '000AB', '1')).key, 'AB0001', "l'IDU produit est valide");
});

if (failures) { console.error('\n' + failures + ' test(s) en échec'); process.exit(1); }
console.log('\nTous les tests de la logique passent.');
