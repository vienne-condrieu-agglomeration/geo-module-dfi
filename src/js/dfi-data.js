/**
 * Logique du module sans GEO ni Angular : lecture des données DFI, graphe de filiation, mise en page.
 * Testée sous Node (test/dfi-data.test.mjs). Syntaxe limitée à ce que webpack 4 sait lire (pas de `?.` ni de `??`).
 *
 * Les données viennent de l'intégrateur integrator-dfi (un JSON par commune + index.json) :
 *   un lot est [identifiant du DFI, numéro de lot, nature, date ISO, parcelles mères, parcelles filles] ;
 *   une parcelle est « section(2) + numéro(4) », précédée du préfixe de section (3) s'il n'est pas « 000 ».
 */

// Version du format de sortie lue dans index.json : une autre version est refusée (voir README de l'intégrateur).
export var SUPPORTED_FORMAT = 1;

export var NATURES = {
    1: "Document d'arpentage",
    2: 'Croquis de conservation',
    4: 'Remaniement',
    5: "Document d'arpentage numérique",
    6: 'Lotissement numérique',
    7: 'Lotissement',
    8: 'Rénovation'
};

export class DfiError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'DfiError';
        this.code = code;
    }
}

// ─── Identifiants de parcelle ────────────────────────────────────────────────────────────────────────

/**
 * Découpe un IDU (14 caractères : INSEE 5 + préfixe 3 + section 2 + numéro 4). Retourne null s'il est invalide.
 * `key` est l'écriture des fichiers de données (préfixe omis lorsqu'il vaut « 000 »).
 */
export function parseIdu(text) {
    var idu = String(text == null ? '' : text).toUpperCase().replace(/\s+/g, '');
    var m = /^(\d[0-9AB]\d{3})(\d{3})([0-9A-Z]{2})(\d{4})$/.exec(idu);
    if (!m) { return null; }
    return {
        idu: idu, insee: m[1], commune: m[1].slice(2), prefix: m[2], section: m[3], number: m[4],
        key: parcelKey(m[2], m[3], m[4])
    };
}

export function parcelKey(prefix, section, number) {
    return (prefix && prefix !== '000' ? prefix : '') + section + number;
}

/** Découpe une parcelle d'un fichier de données (6 ou 9 caractères) ; l'INSEE est celui du fichier. */
export function splitKey(key, insee) {
    var hasPrefix = key.length === 9;
    var prefix = hasPrefix ? key.slice(0, 3) : '000';
    var rest = hasPrefix ? key.slice(3) : key;
    return {
        insee: insee, prefix: prefix, section: rest.slice(0, 2), number: rest.slice(2),
        idu: insee + prefix + rest, key: key
    };
}

/** « AH 280 » : section sans zéro de cadrage (« 0A » -> « A »), numéro sans zéros de tête, préfixe devant s'il existe. */
export function parcelLabel(key) {
    var p = splitKey(key, '');
    var num = p.number.replace(/^0+/, '') || '0';
    return (p.prefix !== '000' ? p.prefix + ' ' : '') + p.section.replace(/^0/, '') + ' ' + num;
}

export function formatDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] : String(iso || '');
}

// ─── Chargement des données ──────────────────────────────────────────────────────────────────────────

export function dataUrl(base, name) {
    return String(base || '').replace(/\/+$/, '') + '/' + name;
}

/**
 * Lit un JSON avec `fetchFn` (fetch du navigateur, pas $http : les intercepteurs de GEO pourraient joindre des
 * en-têtes d'authentification à une adresse tierce, ce qui échouerait en CORS et divulguerait un jeton).
 */
export function loadJson(fetchFn, url) {
    return fetchFn(url, { credentials: 'omit' }).then(function (response) {
        if (response.status === 404) { throw new DfiError('notfound', 'Données introuvables : ' + url); }
        if (!response.ok) { throw new DfiError('http', 'Réponse ' + response.status + ' pour ' + url); }
        return response.json().catch(function () { throw new DfiError('json', 'Fichier illisible : ' + url); });
    }, function () {
        throw new DfiError('network', 'Données inaccessibles (réseau ou accès bloqué) : ' + url);
    });
}

export function checkIndex(index) {
    if (!index || typeof index !== 'object' || typeof index.communes !== 'object') {
        throw new DfiError('index', "L'index des données est illisible.");
    }
    if (index.format !== SUPPORTED_FORMAT) {
        throw new DfiError('format', 'Les données sont au format ' + index.format + ', ce module lit le format '
            + SUPPORTED_FORMAT + ' : mettre le module à jour.');
    }
    return index;
}

export function loadIndex(fetchFn, base) {
    return loadJson(fetchFn, dataUrl(base, 'index.json')).then(checkIndex);
}

export function loadCommune(fetchFn, base, index, insee) {
    if (!index.communes[insee]) {
        return Promise.reject(new DfiError('commune', "La commune " + insee + " n'est pas publiée dans les données."));
    }
    return loadJson(fetchFn, dataUrl(base, insee + '.json')).then(function (data) {
        if (!data || !Array.isArray(data.lots)) { throw new DfiError('json', 'Fichier de la commune ' + insee + ' illisible.'); }
        return data;
    });
}

/** Index des parcelles : lots où elles sont mères et lots où elles sont filles. */
export function buildLookup(communeData) {
    var asMother = {};
    var asDaughter = {};
    communeData.lots.forEach(function (lot, i) {
        lot[4].forEach(function (p) { (asMother[p] = asMother[p] || []).push(i); });
        lot[5].forEach(function (p) { (asDaughter[p] = asDaughter[p] || []).push(i); });
    });
    return { insee: communeData.insee, lots: communeData.lots, asMother: asMother, asDaughter: asDaughter };
}

// ─── Sélection commune -> section -> numéro ──────────────────────────────────────────────────────────

function _collator() { return typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator('fr', { sensitivity: 'base', numeric: true }) : null; }

/**
 * Communes proposées : [{ insee, name, label }] triées par nom. `allowed` : { insee: true } ou null (toutes les communes publiées).
 * Sans nom dans l'index (données d'une version antérieure de l'intégrateur), le code INSEE tient lieu de libellé.
 */
export function communeOptions(index, allowed) {
    var list = Object.keys(index.communes).filter(function (insee) { return !allowed || allowed[insee]; }).map(function (insee) {
        var name = String(index.communes[insee].nom || '');
        return { insee: insee, name: name, label: name ? name + ' (' + insee + ')' : insee };
    });
    var collator = _collator();
    list.sort(function (a, b) {
        if (!a.name !== !b.name) { return a.name ? -1 : 1; }   // les communes sans nom en dernier
        var r = collator ? collator.compare(a.name || a.insee, b.name || b.insee) : (a.name || a.insee).localeCompare(b.name || b.insee);
        return r || (a.insee < b.insee ? -1 : 1);
    });
    return list;
}

function _allKeys(lookup) {
    var seen = {};
    Object.keys(lookup.asMother).concat(Object.keys(lookup.asDaughter)).forEach(function (k) { seen[k] = true; });
    return Object.keys(seen);
}

/**
 * Sections de la commune qui figurent dans un DFI : [{ value, prefix, section, label, count }]. `value` = préfixe + section
 * (« 000AH »), clé stable pour une liste déroulante ; `label` = « AH » (« 014 AH » avec un préfixe).
 */
export function sectionOptions(lookup) {
    var groups = {};
    _allKeys(lookup).forEach(function (key) {
        var p = splitKey(key, lookup.insee);
        var value = p.prefix + p.section;
        var g = groups[value] || (groups[value] = { value: value, prefix: p.prefix, section: p.section,
            label: (p.prefix !== '000' ? p.prefix + ' ' : '') + p.section.replace(/^0/, ''), count: 0 });
        g.count++;
    });
    return Object.keys(groups).sort().map(function (v) { return groups[v]; });
}

/** Numéros (4 chiffres) d'une section, d'après sa valeur « préfixe + section » : triés, sans doublon. */
export function numberOptions(lookup, sectionValue) {
    var out = [];
    _allKeys(lookup).forEach(function (key) {
        var p = splitKey(key, lookup.insee);
        if (p.prefix + p.section === sectionValue) { out.push(p.number); }
    });
    return out.sort();
}

/** Numéro saisi (« 498 », « 0498 ») -> 4 chiffres, ou null s'il n'est pas valide. */
export function normalizeNumber(text) {
    var digits = String(text == null ? '' : text).trim();
    if (!/^\d{1,4}$/.test(digits)) { return null; }
    return ('0000' + digits).slice(-4);
}

/** IDU d'une sélection (commune, valeur de section « préfixe + section », numéro saisi) ou null si incomplète ou invalide. */
export function selectionIdu(insee, sectionValue, numberText) {
    var number = normalizeNumber(numberText);
    if (!insee || !sectionValue || sectionValue.length !== 5 || !number) { return null; }
    return insee + sectionValue + number;
}

// ─── Lots ────────────────────────────────────────────────────────────────────────────────────────────

/** Décrit un lot en français : type d'opération déduit du nombre de mères et de filles, et nature du DFI. */
export function describeLot(lot) {
    var mothers = lot[4].length;
    var daughters = lot[5].length;
    var kind;
    if (mothers === 0) { kind = 'Création'; }
    else if (daughters === 0) { kind = 'Disparition'; }
    else if (mothers === 1 && daughters === 1) { kind = 'Changement de numérotation'; }
    else if (mothers === 1) { kind = 'Division'; }
    else if (daughters === 1) { kind = 'Réunion'; }
    else { kind = 'Réorganisation'; }
    return {
        dfi: lot[0], lotNumber: lot[1], nature: lot[2], natureLabel: NATURES[lot[2]] || 'Nature ' + lot[2],
        date: lot[3], dateLabel: formatDate(lot[3]), kind: kind, mothers: lot[4], daughters: lot[5]
    };
}

// ─── Graphe de filiation ─────────────────────────────────────────────────────────────────────────────

/**
 * Graphe des ancêtres et des descendants de `key`. Nœuds : parcelles (id « p:KEY ») et lots (id « l:INDEX »).
 * Niveau d'une parcelle : 0 pour la parcelle cherchée, négatif pour ses ancêtres, positif pour ses descendants ;
 * un lot est à mi-chemin entre ses mères et ses filles (niveau ±0,5). Les autres parcelles d'un lot rencontré
 * (sœurs, co-mères) sont montrées sans être explorées, dans la limite de `maxSiblings` par lot.
 */
export function buildGraph(lookup, key, options) {
    var o = Object.assign({ maxDepth: 30, maxNodes: 300, maxSiblings: 8 }, options || {});
    var nodes = {};
    var order = [];
    var edges = [];
    var seenEdges = {};
    var truncated = false;

    function addNode(id, node) {
        if (nodes[id]) { return nodes[id]; }
        if (order.length >= o.maxNodes) { truncated = true; return null; }
        nodes[id] = node;
        order.push(id);
        return node;
    }
    function addEdge(from, to) {
        var id = from + '>' + to;
        if (!seenEdges[id]) { seenEdges[id] = true; edges.push({ from: from, to: to }); }
    }
    function addParcel(k, level, explored) {
        return addNode('p:' + k, { id: 'p:' + k, type: 'parcel', key: k, level: level, explored: !!explored });
    }
    // Ajoute au plus `maxSiblings` parcelles non encore présentes ; retourne le nombre de parcelles non affichées.
    function addOthers(keys, except, level, link) {
        var shown = 0;
        var hidden = 0;
        keys.forEach(function (k) {
            if (k === except) { return; }
            if (nodes['p:' + k]) { link(k); return; }
            if (shown >= o.maxSiblings) { hidden++; return; }
            if (addParcel(k, level, false)) { shown++; link(k); } else { hidden++; }
        });
        return hidden;
    }

    addParcel(key, 0, true);

    // Ancêtres : lots dont la parcelle est fille ; on remonte vers leurs mères.
    var queue = [{ key: key, level: 0, depth: 0 }];
    while (queue.length) {
        var up = queue.shift();
        if (up.depth >= o.maxDepth) { truncated = true; continue; }
        (lookup.asDaughter[up.key] || []).forEach(function (i) {
            var lotId = 'l:' + i;
            var isNew = !nodes[lotId];
            var lotNode = addNode(lotId, { id: lotId, type: 'lot', index: i, level: up.level - 0.5, hidden: 0 });
            if (!lotNode) { return; }
            addEdge(lotId, 'p:' + up.key);
            if (!isNew) { return; }
            var lot = lookup.lots[i];
            lot[4].forEach(function (m) {
                if (m === up.key) { return; }
                var existing = nodes['p:' + m];
                if (addParcel(m, up.level - 1, true)) {
                    addEdge('p:' + m, lotId);
                    if (!existing) { queue.push({ key: m, level: up.level - 1, depth: up.depth + 1 }); }
                }
            });
            lotNode.hidden += addOthers(lot[5], up.key, up.level, function (k) { addEdge(lotId, 'p:' + k); });
        });
    }

    // Descendants : lots dont la parcelle est mère ; on descend vers leurs filles.
    queue = [{ key: key, level: 0, depth: 0 }];
    while (queue.length) {
        var down = queue.shift();
        if (down.depth >= o.maxDepth) { truncated = true; continue; }
        (lookup.asMother[down.key] || []).forEach(function (i) {
            var lotId = 'l:' + i;
            var isNew = !nodes[lotId];
            var lotNode = addNode(lotId, { id: lotId, type: 'lot', index: i, level: down.level + 0.5, hidden: 0 });
            if (!lotNode) { return; }
            addEdge('p:' + down.key, lotId);
            if (!isNew) { return; }
            var lot = lookup.lots[i];
            lot[5].forEach(function (d) {
                if (d === down.key) { return; }
                var existing = nodes['p:' + d];
                if (addParcel(d, down.level + 1, true)) {
                    addEdge(lotId, 'p:' + d);
                    if (!existing) { queue.push({ key: d, level: down.level + 1, depth: down.depth + 1 }); }
                }
            });
            lotNode.hidden += addOthers(lot[4], down.key, down.level, function (k) { addEdge('p:' + k, lotId); });
        });
    }

    return {
        key: key,
        nodes: order.map(function (id) { return nodes[id]; }),
        edges: edges.filter(function (e) { return nodes[e.from] && nodes[e.to]; }),
        truncated: truncated,
        hasHistory: order.length > 1
    };
}

/**
 * Lignée d'un nœud du graphe : ses ancêtres (en remontant les arêtes) et ses descendants (en les descendant), lui compris.
 * Les sœurs et co-mères n'en font pas partie : c'est le chemin d'origine et de devenir à mettre en évidence.
 * Retourne un objet id -> true.
 */
export function lineageOf(edges, id) {
    var up = {};
    var down = {};
    edges.forEach(function (e) {
        (up[e.to] = up[e.to] || []).push(e.from);
        (down[e.from] = down[e.from] || []).push(e.to);
    });
    var seen = {};
    seen[id] = true;
    [up, down].forEach(function (next) {
        var stack = [id];
        var visited = {};
        while (stack.length) {
            (next[stack.pop()] || []).forEach(function (n) {
                if (!visited[n]) { visited[n] = true; seen[n] = true; stack.push(n); }
            });
        }
    });
    return seen;
}

/** Texte de l'infobulle d'un nœud du graphe (survol) : l'essentiel, sans cliquer. */
export function nodeTooltip(lookup, node) {
    var lines;
    if (node.type === 'parcel') {
        var s = parcelSummary(lookup, node.key);
        lines = ['Parcelle ' + parcelLabel(node.key)]
            .concat(s.origin.map(function (l) { return 'Origine : ' + l.kind.toLowerCase() + ' le ' + l.dateLabel; }))
            .concat(s.future.length
                ? s.future.map(function (l) { return 'Devenir : ' + l.kind.toLowerCase() + ' le ' + l.dateLabel; })
                : ['Devenir : aucune évolution postérieure connue']);
    } else {
        var d = describeLot(lookup.lots[node.index]);
        lines = [d.kind + ' — ' + d.natureLabel, d.dateLabel + ', DFI n° ' + d.dfi,
                 d.mothers.length + ' mère(s), ' + d.daughters.length + ' fille(s)' + (node.hidden ? ', dont ' + node.hidden + ' non affichée(s)' : '')];
    }
    return lines.concat(['Cliquer pour le détail']).join('\n');
}

/** Synthèse en français, comme dans l'outil de Romain : origine (lots où la parcelle est fille) et devenir. */
export function parcelSummary(lookup, key) {
    return {
        origin: (lookup.asDaughter[key] || []).map(function (i) { return describeLot(lookup.lots[i]); }),
        future: (lookup.asMother[key] || []).map(function (i) { return describeLot(lookup.lots[i]); })
    };
}

// ─── Mise en page ────────────────────────────────────────────────────────────────────────────────────

/**
 * Place les nœuds : une ligne par niveau (ancêtres en haut, descendants en bas), ordre des nœuds d'une ligne ajusté sur
 * la position moyenne de leurs voisins pour limiter les croisements. Retourne positions, courbes et dimensions.
 */
export function layoutGraph(graph, labelOf, options) {
    var o = Object.assign({ charW: 7, padX: 16, nodeH: 28, gapX: 16, gapY: 40, margin: 12 }, options || {});
    var rowsByLevel = {};
    graph.nodes.forEach(function (n) {
        n.label = labelOf(n);
        n.w = Math.max(48, Math.round(n.label.length * o.charW + o.padX));
        n.h = o.nodeH;
        (rowsByLevel[n.level] = rowsByLevel[n.level] || []).push(n);
    });
    var levels = Object.keys(rowsByLevel).map(Number).sort(function (a, b) { return a - b; });
    var rows = levels.map(function (lv) { return rowsByLevel[lv]; });

    var neighbours = {};
    graph.edges.forEach(function (e) {
        (neighbours[e.from] = neighbours[e.from] || []).push(e.to);
        (neighbours[e.to] = neighbours[e.to] || []).push(e.from);
    });
    var byId = {};
    graph.nodes.forEach(function (n) { byId[n.id] = n; });

    function assignX() {
        var maxW = 0;
        rows.forEach(function (row) {
            var w = row.reduce(function (s, n) { return s + n.w; }, 0) + o.gapX * (row.length - 1);
            row.width = w;
            if (w > maxW) { maxW = w; }
        });
        rows.forEach(function (row) {
            var x = o.margin + (maxW - row.width) / 2;
            row.forEach(function (n) { n.x = x; x += n.w + o.gapX; });
        });
        return maxW;
    }
    function sortRow(row) {
        var keys = new Map();
        row.forEach(function (n, i) {
            var xs = (neighbours[n.id] || []).map(function (id) { return byId[id]; })
                .filter(function (m) { return m && m.x != null && m !== n && m.level !== n.level; })
                .map(function (m) { return m.x + m.w / 2; });
            keys.set(n, xs.length ? xs.reduce(function (s, v) { return s + v; }, 0) / xs.length : n.x + n.w / 2 + i * 1e-6);
        });
        row.sort(function (a, b) { return keys.get(a) - keys.get(b); });
    }
    var maxW = assignX();
    for (var pass = 0; pass < 3; pass++) {
        rows.forEach(sortRow);
        maxW = assignX();
    }
    rows.forEach(function (row, r) { row.forEach(function (n) { n.y = o.margin + r * (o.nodeH + o.gapY); }); });

    var paths = graph.edges.map(function (e) {
        var a = byId[e.from];
        var b = byId[e.to];
        var x1 = a.x + a.w / 2;
        var y1 = a.y + a.h;
        var x2 = b.x + b.w / 2;
        var y2 = b.y;
        var mid = (y1 + y2) / 2;
        return { from: e.from, to: e.to, d: 'M' + x1 + ',' + y1 + ' C' + x1 + ',' + mid + ' ' + x2 + ',' + mid + ' ' + x2 + ',' + y2 };
    });
    return {
        nodes: graph.nodes,
        paths: paths,
        width: maxW + 2 * o.margin,
        height: rows.length * o.nodeH + (rows.length - 1) * o.gapY + 2 * o.margin
    };
}

// ─── Zoom et déplacement du graphe ───────────────────────────────────────────────────────────────────
// Une vue est { cx, cy, scale } : le point du graphe au centre de la zone d'affichage et l'échelle (1 = taille réelle).
// Elle ne dépend pas de la taille de la zone : passer en plein écran garde le même centre et la même échelle.

/** Vue qui montre tout le graphe (width × height) dans une zone cw × ch, sans agrandir au-delà de la taille réelle. */
export function fitView(width, height, cw, ch) {
    return { cx: width / 2, cy: height / 2, scale: Math.min(1, cw / width, ch / height) };
}

/**
 * Ramène la vue dans l'emprise du graphe, pour ne jamais se perdre dans le vide : la zone affichée ne dépasse pas les bords
 * du graphe ; dans le sens où le graphe est plus petit que la zone, il reste centré.
 */
export function clampView(view, width, height, cw, ch) {
    function clamp(c, size, visible) { return size <= visible ? size / 2 : Math.min(size - visible / 2, Math.max(visible / 2, c)); }
    return { cx: clamp(view.cx, width, cw / view.scale), cy: clamp(view.cy, height, ch / view.scale), scale: view.scale };
}

/** Zoom d'un facteur `factor` (> 1 : rapproche) qui garde fixe à l'écran le point (px, py) du graphe ; échelle bornée. */
export function zoomView(view, factor, px, py, minScale, maxScale) {
    var scale = Math.min(maxScale, Math.max(minScale, view.scale * factor));
    var k = view.scale / scale;
    return { cx: px - (px - view.cx) * k, cy: py - (py - view.cy) * k, scale: scale };
}

/** Attribut `viewBox` du SVG pour une vue dans une zone cw × ch. */
export function viewBoxOf(view, cw, ch) {
    var w = cw / view.scale;
    var h = ch / view.scale;
    return [view.cx - w / 2, view.cy - h / 2, w, h].join(' ');
}

// ─── Localisation d'une parcelle (API Carto Cadastre de l'IGN) ───────────────────────────────────────

export var DEFAULT_CADASTRE_URL = 'https://apicarto.ign.fr/api/cadastre/parcelle';

/**
 * Adresse de l'API Carto pour une parcelle. `p` : { insee, prefix, section, number } (section sur 2 caractères,
 * numéro sur 4). Le préfixe de section (`com_abs`) est toujours transmis : sans lui, une même section et un même
 * numéro peuvent exister sous plusieurs préfixes (communes fusionnées) et l'API renvoie plusieurs parcelles.
 */
export function cadastreUrl(base, p) {
    var enc = encodeURIComponent;
    return String(base || DEFAULT_CADASTRE_URL).replace(/\?.*$/, '') + '?code_insee=' + enc(p.insee) + '&section=' + enc(p.section)
        + '&numero=' + enc(p.number) + '&com_abs=' + enc(p.prefix || '000');
}

/** Emprise { minX, minY, maxX, maxY } d'une géométrie GeoJSON (points, lignes, polygones), ou null. */
export function geometryBbox(geometry) {
    var b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    (function walk(coords) {
        if (!Array.isArray(coords)) { return; }
        if (typeof coords[0] === 'number') {
            if (coords[0] < b.minX) { b.minX = coords[0]; } if (coords[0] > b.maxX) { b.maxX = coords[0]; }
            if (coords[1] < b.minY) { b.minY = coords[1]; } if (coords[1] > b.maxY) { b.maxY = coords[1]; }
            return;
        }
        coords.forEach(walk);
    })(geometry && geometry.coordinates);
    return isFinite(b.minX) ? b : null;
}

/** Élargit une emprise de `ratio` de sa plus grande dimension de chaque côté, avec une marge minimale `minMargin`. */
export function expandBbox(b, ratio, minMargin) {
    var m = Math.max(Math.max(b.maxX - b.minX, b.maxY - b.minY) * ratio, minMargin || 0);
    return { minX: b.minX - m, minY: b.minY - m, maxX: b.maxX + m, maxY: b.maxY + m };
}

/**
 * Emprise à donner à la carte pour que `b` apparaisse au centre de la partie visible, quand un panneau recouvre la
 * droite de la carte : `visible` est la fraction de la largeur de la carte qui reste découverte (0 < visible <= 1).
 * La hauteur est conservée ; la largeur est agrandie pour que `b` tienne dans la partie découverte.
 */
export function extentForVisible(b, visible) {
    var v = visible > 0 && visible <= 1 ? visible : 1;
    var cx = (b.minX + b.maxX) / 2;
    var width = (b.maxX - b.minX) / v;
    var minX = cx - (width * v) / 2;
    return { minX: minX, maxX: minX + width, minY: b.minY, maxY: b.maxY };
}

/**
 * Emprise à donner à GEO pour que `b` soit au centre de la partie découverte de la carte ET que l'emprise ait exactement le
 * rapport largeur / hauteur de la carte (`viewport`, en pixels). Sans ce rapport, GEO ajuste l'emprise sur la plus grande
 * dimension puis la recentre sur toute la carte : le décalage destiné au panneau est alors annulé en partie.
 * `visible` est la fraction de largeur découverte. Sans taille de carte connue, repli sur extentForVisible.
 */
export function fitExtent(b, viewport, visible) {
    var w = viewport && viewport.width;
    var h = viewport && viewport.height;
    var v = visible > 0 && visible <= 1 ? visible : 1;
    if (!(w > 0 && h > 0)) { return extentForVisible(b, v); }
    var res = Math.max((b.maxX - b.minX) / (v * w), (b.maxY - b.minY) / h);   // unités de la carte par pixel
    if (!(res > 0)) { return extentForVisible(b, v); }
    var cx = (b.minX + b.maxX) / 2;
    var cy = (b.minY + b.maxY) / 2;
    var width = w * res;
    var height = h * res;
    var minX = cx - (v * width) / 2;
    return { minX: minX, maxX: minX + width, minY: cy - height / 2, maxY: cy + height / 2 };
}

/**
 * Lit la réponse de l'API Carto. Retourne null si la parcelle n'existe pas (ou plus) au cadastre actuel, sinon
 * { feature, bbox, idu, contenance, commune }. Avec plusieurs parcelles, on garde celle dont l'IDU est celui attendu.
 */
export function parseCadastre(json, expectedIdu) {
    if (!json || json.type !== 'FeatureCollection' || !Array.isArray(json.features)) {
        throw new DfiError('json', "Réponse inattendue du service cadastral.");
    }
    var wanted = String(expectedIdu || '').toUpperCase();
    var list = json.features.filter(function (f) { return f && f.geometry; });
    var feature = list.filter(function (f) { return f.properties && String(f.properties.idu || '').toUpperCase() === wanted; })[0]
        || (list.length === 1 && !(list[0].properties && list[0].properties.idu) ? list[0] : null);
    if (!feature) { return null; }
    var bbox = geometryBbox(feature.geometry);
    if (!bbox) { throw new DfiError('json', 'La parcelle renvoyée par le service cadastral n\'a pas de géométrie lisible.'); }
    var props = feature.properties || {};
    return { feature: feature, bbox: bbox, idu: props.idu || wanted, contenance: typeof props.contenance === 'number' ? props.contenance : null,
             commune: props.nom_com || '' };
}

/** Interroge l'API Carto pour une parcelle ; même fetch sans identification que pour les données. */
export function loadParcel(fetchFn, base, p) {
    var url = cadastreUrl(base, p);
    return fetchFn(url, { credentials: 'omit' }).then(function (response) {
        if (!response.ok) { throw new DfiError('http', 'Le service cadastral a répondu ' + response.status + '.'); }
        return response.json().catch(function () { throw new DfiError('json', 'Réponse illisible du service cadastral.'); });
    }, function () {
        throw new DfiError('network', 'Service cadastral inaccessible (réseau ou accès bloqué) : ' + url);
    }).then(function (json) { return parseCadastre(json, p.insee + (p.prefix || '000') + p.section + p.number); });
}

/** « 14 000 m² » ou « 1,4 ha » à partir d'une contenance en mètres carrés. */
export function formatArea(m2) {
    if (typeof m2 !== 'number' || !isFinite(m2)) { return ''; }
    if (m2 >= 10000) { return String(Math.round(m2 / 100) / 100).replace('.', ',') + ' ha'; }
    return String(Math.round(m2)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' m²';
}
