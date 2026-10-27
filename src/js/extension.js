/**
 * geo-dfi — filiation des parcelles cadastrales (Documents de Filiation Informatisés de la DGFiP) dans un onglet
 * de la barre latérale droite de GEO : saisie d'un IDU, graphe des parcelles mères, des lots et des parcelles filles.
 *
 * Les données sont des fichiers JSON statiques (un par commune) préparés par integrator-dfi et publiés sur GitHub
 * Pages : aucun serveur, aucune base de données. Source : DGFiP, Licence Ouverte 2.0.
 * La logique sans GEO ni Angular est dans dfi-data.js (testée sous Node).
 */
import angular from 'angular';
import pluginConf from '../plugin.geoext.json';

import * as dfi from './dfi-data.js';
import { createChangelog } from './changelog.js';
import changelogMd from '../../CHANGELOG.md';

angular
    .module(pluginConf.code.moduleName, pluginConf.code.dependencies)
    .run(['geoApplication', 'acfExtensionService', '$rootScope', '$injector',
          function (geoApplication, acfExtensionService, $rootScope, $injector) {

        var changelog = createChangelog({
            name: pluginConf.name, title: pluginConf.displayName, version: pluginConf.version,
            markdown: changelogMd, prefix: 'geo-dfi', zIndex: 1000000001
        });

        // ============================================================
        // Configuration (remplie depuis le Générateur GEO)
        // ============================================================
        var _DEFAULT_DATA_URL = 'https://vienne-condrieu-agglomeration.github.io/geo-community-data-dfi/';
        var _dataUrl      = _DEFAULT_DATA_URL;
        var _communes     = null;          // { insee: true } ou null (toutes les communes publiées)
        var _toolName     = 'Filiation des parcelles';
        var _panelWidthPct = 45;       // largeur courante du panneau (100 en plein écran)
        var _panelWidthCfg = 45;       // largeur réglée dans le Générateur
        var _FULLSCREEN_BODY_CLASS = 'geo-dfi-fullscreen-active';
        var _locateEnabled = true;     // bouton « Localiser sur la carte » (API Carto Cadastre de l'IGN)
        var _cadastreUrl  = dfi.DEFAULT_CADASTRE_URL;
        var _markLayer    = null;      // couche OpenLayers du contour de la parcelle repérée
        var _markMap      = null;
        var _panelEl      = null;      // élément du panneau, pour mesurer ce qu'il recouvre de la carte
        var _registered   = false;
        var _widgetId     = null;
        var _currentScope = null;

        // Données en mémoire pour la durée de la page : index, puis un index de parcelles par commune
        var _indexPromise = null;
        var _source       = { dateLabel: '', millesime: '' };
        var _lookups      = {};            // insee -> promesse de { lookup }

        function _lucideSvg(inner) {
            return '<svg class="geo-dfi-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" '
                 + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
                 + inner + '</svg>';
        }
        var _ICONS = {
            maximize: _lucideSvg('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>'
                                + '<path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>'),
            minimize: _lucideSvg('<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/>'
                                + '<path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>'),
            // « map-pin » et « map-pin-off » (https://lucide.dev/icons/map-pin, https://lucide.dev/icons/map-pin-off)
            mapPin: _lucideSvg('<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>'
                             + '<circle cx="12" cy="10" r="3"/>'),
            mapPinOff: _lucideSvg('<path d="M12.75 7.09a3 3 0 0 1 2.16 2.16"/>'
                                + '<path d="M17.072 17.072c-1.634 2.17-3.527 3.912-4.471 4.727a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 1.432-4.568"/>'
                                + '<path d="m2 2 20 20"/><path d="M8.475 2.818A8 8 0 0 1 20 10c0 1.183-.31 2.377-.81 3.533"/>'
                                + '<path d="M9.13 9.13a3 3 0 0 0 3.74 3.74"/>'),
            // « sparkles » (https://lucide.dev/icons/sparkles) : nouveautés
            sparkles: _lucideSvg('<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/>'
                               + '<path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>'),
            // « graph-hub » (https://lucide.dev/icons/graph-hub) : un nœud et ses enfants, comme une division de parcelle
            graphHub: _lucideSvg('<circle cx="12" cy="7" r="4"/><circle cx="4" cy="19" r="2"/><circle cx="12" cy="19" r="2"/>'
                               + '<circle cx="20" cy="19" r="2"/><path d="M8 7a4 4 0 0 0-4 4v6"/><path d="M12 11v6"/>'
                               + '<path d="M16 7a4 4 0 0 1 4 4v6"/>')
        };
        // GEO n'a pas « graph-hub » parmi ses icônes natives : l'onglet l'affiche en masque CSS, à la couleur du texte
        var _TAB_ICON_MASK = 'url("data:image/svg+xml,'
                           + encodeURIComponent(_ICONS.graphHub.replace('currentColor', '#000')) + '")';

        geoApplication.executeWhenInitialized(function () {
            var conf = geoApplication.getConfigurationByExtensionKey(pluginConf.name);
            if (!conf || conf.length < 1) {
                console.warn('[geo-dfi] aucune configuration pour ' + pluginConf.name + ' : onglet non enregistré.');
                return;
            }
            // Un module déposé plusieurs fois dans le gabarit donne plusieurs entrées : seule la première est lue.
            if (conf.length > 1) {
                console.warn('[geo-dfi] ' + conf.length + ' configurations pour ' + pluginConf.name
                    + ' (module déposé plusieurs fois dans le gabarit ?) : seule la première est utilisée.');
            }
            var props = conf[0].properties || {};

            _dataUrl      = String(props.dataUrl || '').trim() || _DEFAULT_DATA_URL;
            _toolName     = String(props.toolName || '').trim() || _toolName;
            _locateEnabled = props.locateEnabled !== false && props.locateEnabled !== 'false';
            _cadastreUrl   = String(props.cadastreApiUrl || '').trim() || dfi.DEFAULT_CADASTRE_URL;
            var width     = parseFloat(props.panelWidth);
            _panelWidthPct = width >= 25 && width <= 80 ? width : _panelWidthPct;
            _panelWidthCfg = _panelWidthPct;

            var codes = String(props.communes || '').toUpperCase().split(/[\s,;]+/)
                .filter(function (c) { return /^\d[0-9AB]\d{3}$/.test(c); });
            _communes = null;
            if (codes.length) { _communes = {}; codes.forEach(function (c) { _communes[c] = true; }); }

            if (!_registered) {
                _registered = true;
                _injectStyles();
                _registerWidget();
            }
        });

        // ============================================================
        // Panneau natif GEO
        // ============================================================
        function _registerWidget() {
            acfExtensionService.registerWidgetExtension({
                type:         window.bgCanvasId === 'pro1' ? 'rightPanel' : 'widget.side',
                key:          pluginConf.name,
                extensionKey: pluginConf.name,
                name:         _toolName,
                icon:         'geo-dfi-tab-icon',     // classe posée par GEO sur l'onglet (.launcher-icon), dessinée dans _injectStyles
                active:       false,
                widthPolicy:  'custom',
                enable:       function () { return true; },
                template:     _buildTemplate(),
                controller:   _buildController(),
                configure:    function (ext) {
                    _widgetId = ext && ext.id ? ext.id : pluginConf.name;
                    _requestPanelWidthSoon();
                }
            });
            $rootScope.$on('activeRightTabChanged', function (event, tabId) {
                if (tabId === pluginConf.name || tabId === _widgetId) { _requestPanelWidthSoon(); }
            });
        }

        // Le panneau natif est étroit par défaut : un graphe a besoin de place.
        function _requestPanelWidth() {
            $rootScope.$broadcast('EXTENSION_WIDGET_ACTION', {
                action: 'setPanelSize', widgetId: _widgetId || pluginConf.name, width: _panelWidthPct
            });
            window.dispatchEvent(new Event('resize'));
        }
        function _requestPanelWidthSoon() {
            [0, 100, 300].forEach(function (delay) { setTimeout(_requestPanelWidth, delay); });
        }

        // ============================================================
        // Données
        // ============================================================
        // fetch du navigateur et non $http : les intercepteurs de GEO pourraient joindre des en-têtes d'authentification
        // à cette adresse tierce (échec CORS et fuite de jeton). Voir dfi-data.js.
        function _fetch(url, options) { return window.fetch(url, options); }

        function _getIndex() {
            if (!_indexPromise) {
                _indexPromise = dfi.loadIndex(_fetch, _dataUrl).then(function (index) {
                    _source = { dateLabel: dfi.formatDate(index.situation), millesime: index.millesime || '' };
                    return index;
                });
                _indexPromise.catch(function () { _indexPromise = null; });   // nouvel essai possible
            }
            return _indexPromise;
        }

        function _getLookup(index, insee) {
            if (!_lookups[insee]) {
                _lookups[insee] = dfi.loadCommune(_fetch, _dataUrl, index, insee).then(dfi.buildLookup);
                _lookups[insee].catch(function () { delete _lookups[insee]; });
            }
            return _lookups[insee];
        }

        function _errorMessage(err, parsed) {
            console.error('[geo-dfi]', err);
            switch (err && err.code) {
                case 'network':  return 'Les données ne sont pas accessibles depuis ce poste (réseau ou accès à ' + _hostOf(_dataUrl) + ' bloqué).';
                case 'notfound': return "Les données sont introuvables à l'adresse configurée (" + _hostOf(_dataUrl) + ').';
                case 'commune':  return 'La commune ' + (parsed ? parsed.insee : '') + " n'est pas publiée dans les données.";
                default:         return (err && err.message) || 'Erreur inattendue (voir la console du navigateur).';
            }
        }
        function _hostOf(url) { var m = /^https?:\/\/([^/]+)/i.exec(url); return m ? m[1] : url; }

        // ============================================================
        // Gabarit et contrôleur du panneau
        // ============================================================
        function _buildTemplate() {
            return [
                '<div class="geo-dfi" ng-class="{\'geo-dfi--full\': isFullscreen}">',
                '  <div class="geo-dfi-toolbar" role="toolbar" aria-label="Barre d\'outils">',
                '    <span class="geo-dfi-toolbar-icon">' + _ICONS.graphHub + '</span>',
                '    <span class="geo-dfi-title">{{ title }}</span>',
                '    <div class="geo-dfi-bar-actions">',
                '      <button type="button" class="geo-dfi-iconbtn" ng-if="locateEnabled && state.result" ng-click="locate(state.result.parsed)"',
                '              ng-disabled="state.locating" title="Localiser sur la carte" aria-label="Localiser sur la carte">' + _ICONS.mapPin + '</button>',
                '      <button type="button" class="geo-dfi-iconbtn" ng-if="state.located" ng-click="clearLocation()"',
                '              title="Effacer le repérage" aria-label="Effacer le repérage">' + _ICONS.mapPinOff + '</button>',
                '      <button type="button" class="geo-dfi-iconbtn" ng-click="openChangelog()" title="{{ changelogTitle }}" aria-label="Nouveautés du module">',
                '        ' + _ICONS.sparkles,
                '        <i class="geo-dfi-dot-new" ng-if="changelogNew()"></i>',
                '      </button>',
                '      <button type="button" class="geo-dfi-iconbtn" ng-class="{\'geo-dfi-iconbtn--on\': isFullscreen}" ng-click="toggleFullscreen()"',
                '              title="{{ isFullscreen ? \'Quitter le plein écran (Échap)\' : \'Plein écran\' }}"',
                '              aria-label="{{ isFullscreen ? \'Quitter le plein écran\' : \'Plein écran\' }}">',
                '        <span ng-if="!isFullscreen">' + _ICONS.maximize + '</span>',
                '        <span ng-if="isFullscreen">' + _ICONS.minimize + '</span>',
                '      </button>',
                '    </div>',
                '  </div>',
                '  <div class="geo-dfi-body">',
                '  <form class="geo-dfi-form" ng-submit="searchSelection()" novalidate>',
                '    <div class="geo-dfi-msg geo-dfi-msg--warn" role="alert" ng-if="communeWarning">{{ communeWarning }}</div>',
                '    <label for="geo-dfi-commune">Commune</label>',
                '    <select id="geo-dfi-commune" class="geo-dfi-field" ng-model="state.insee" ng-change="onCommune()"',
                '            ng-options="c.insee as c.label for c in communes" ng-disabled="!communes.length">',
                '      <option value="">{{ communes.length ? \'— Choisir une commune —\' : \'—\' }}</option>',
                '    </select>',
                '    <div class="geo-dfi-row geo-dfi-row--pair">',
                '      <div><label for="geo-dfi-section">Section</label>',
                '        <select id="geo-dfi-section" class="geo-dfi-field" ng-model="state.section" ng-change="onSection()"',
                '                ng-options="s.value as s.label for s in sections" ng-disabled="!sections.length">',
                '          <option value="">{{ state.listLoading ? \'Chargement…\' : \'—\' }}</option>',
                '        </select></div>',
                '      <div><label for="geo-dfi-number">Numéro</label>',
                '        <input id="geo-dfi-number" class="geo-dfi-field" type="text" list="geo-dfi-numbers" inputmode="numeric" maxlength="4"',
                '               ng-model="state.numberText" ng-disabled="!state.section" autocomplete="off" placeholder="ex. 498"></div>',
                '    </div>',
                '    <datalist id="geo-dfi-numbers"></datalist>',
                '    <button type="submit" class="geo-dfi-btn geo-dfi-btn--main geo-dfi-btn--wide" ng-disabled="state.loading || !canSearch()">Chercher</button>',
                '  </form>',
                '  <details class="geo-dfi-idubox">',
                '    <summary>Saisir une référence cadastrale (IDU)</summary>',
                '    <form class="geo-dfi-form" ng-submit="search()" novalidate>',
                '      <label for="geo-dfi-idu">IDU, 14 caractères</label>',
                '      <div class="geo-dfi-row">',
                '        <input id="geo-dfi-idu" type="text" ng-model="state.idu" maxlength="24" autocomplete="off"',
                '               spellcheck="false" placeholder="38544000BI0498">',
                '        <button type="submit" class="geo-dfi-btn geo-dfi-btn--main" ng-disabled="state.loading">Chercher</button>',
                '      </div>',
                '    </form>',
                '  </details>',
                '  <div class="geo-dfi-msg geo-dfi-msg--error" role="alert" ng-if="state.error">{{ state.error }}</div>',
                '  <div class="geo-dfi-msg" ng-if="state.loading">Chargement des données…</div>',
                '  <div class="geo-dfi-result" ng-if="state.result">',
                '    <div class="geo-dfi-parcel">{{ state.result.label }} <span class="geo-dfi-idu">{{ state.result.idu }}</span></div>',
                '    <div class="geo-dfi-msg" ng-if="state.locateMessage">{{ state.locateMessage }}</div>',
                '    <div class="geo-dfi-msg" ng-if="!state.result.hasHistory">Aucune filiation connue dans les DFI pour cette parcelle. ',
                '      L\'historique informatisé commence vers 1988-1990 et les remembrements n\'y figurent pas.</div>',
                '    <ul class="geo-dfi-summary" ng-if="state.result.hasHistory">',
                '      <li ng-repeat="t in state.result.originText">{{ t }}</li>',
                '      <li ng-repeat="t in state.result.futureText">{{ t }}</li>',
                '      <li ng-if="!state.result.futureText.length">Devenir : aucune évolution postérieure connue dans les DFI.</li>',
                '    </ul>',
                '    <div class="geo-dfi-msg" ng-if="state.result.truncated">Graphe tronqué : trop de parcelles liées.</div>',
                '    <div class="geo-dfi-graph" tabindex="-1"></div>',
                '    <div class="geo-dfi-detail" ng-if="state.selected">',
                '      <div class="geo-dfi-detail-title">{{ state.selected.title }}</div>',
                '      <div ng-repeat="line in state.selected.lines">{{ line }}</div>',
                '      <div class="geo-dfi-chips" ng-if="state.selected.mothers.length">Mère(s) :',
                '        <button type="button" class="geo-dfi-chip" ng-repeat="p in state.selected.mothers"',
                '                ng-click="focusParcel(p.idu)">{{ p.label }}</button></div>',
                '      <div class="geo-dfi-chips" ng-if="state.selected.daughters.length">Fille(s) :',
                '        <button type="button" class="geo-dfi-chip" ng-repeat="p in state.selected.daughters"',
                '                ng-click="focusParcel(p.idu)">{{ p.label }}</button></div>',
                '      <button type="button" class="geo-dfi-btn" ng-if="state.selected.parcel && !state.selected.current"',
                '              ng-click="focusParcel(state.selected.parcel.idu)">Voir la filiation de cette parcelle</button>',
                '      <button type="button" class="geo-dfi-btn" ng-if="state.selected.parcel && locateEnabled"',
                '              ng-click="locate(state.selected.parcel)" ng-disabled="state.locating">Localiser sur la carte</button>',
                '    </div>',
                '  </div>',
                '  <div class="geo-dfi-foot">',
                '    Source : DGFiP, Documents de filiation informatisés (DFI){{ source.dateLabel ? \', mise à jour du \' + source.dateLabel : \'\' }},',
                '    Licence Ouverte 2.0. Projet communautaire, non affilié à la DGFiP ni à Business Geografic.',
                '  </div>',
                '  </div>',
                '</div>'
            ].join('\n');
        }

        function _buildController() {
            return ['$scope', '$element', '$timeout', function ($scope, $element, $timeout) {
                _currentScope = $scope;
                $scope.title     = _toolName;
                $scope.isFullscreen = false;
                $scope.locateEnabled = _locateEnabled;
                $scope.source    = _source;
                $scope.sections  = [];
                $scope.communes  = [];
                // Sans codes INSEE déclarés, la liste serait celle de toutes les communes publiées : on exige une déclaration
                $scope.communeWarning = _communes ? '' : 'Aucune commune déclarée : renseigner « Communes du territoire » (codes INSEE) '
                    + 'dans les options du module. La recherche par commune est désactivée ; la saisie d\'une référence cadastrale (IDU) reste possible.';
                $scope.state     = {
                    idu: '', insee: '', section: '', numberText: '', listLoading: false,
                    loading: false, error: '', result: null, selected: null,
                    locating: false, locateMessage: '', located: false
                };
                var _layout = null;
                var _lookup = null;
                var _selectedId = null;

                _panelEl = $element[0];

                // Bouton « Nouveautés » de la barre d'outils : le point rouge disparaît une fois le journal ouvert.
                $scope.changelogTitle = 'Nouveautés du module' + (changelog.current ? ' (v' + changelog.current + ')' : '');
                $scope.changelogNew   = function () { return changelog.hasNew(); };
                $scope.openChangelog  = function () { changelog.open(); };

                function _apply(fn) { $timeout(fn, 0); }   // les promesses natives sont hors du cycle Angular

                $scope.search = function () {
                    var st = $scope.state;
                    st.error = ''; st.locateMessage = ''; st.selected = null;
                    var parsed = dfi.parseIdu(st.idu);
                    if (!parsed) {
                        st.result = null;
                        st.error = 'Référence invalide : 14 caractères attendus (INSEE 5, préfixe 3, section 2, numéro 4), '
                            + 'par exemple 38544000BI0498.';
                        return;
                    }
                    if (_communes && !_communes[parsed.insee]) {
                        st.result = null;
                        st.error = 'La commune ' + parsed.insee + " ne fait pas partie du territoire configuré pour ce module.";
                        return;
                    }
                    st.loading = true; st.result = null;
                    _getIndex().then(function (index) { return _getLookup(index, parsed.insee); })
                        .then(function (lookup) { _apply(function () { _show(lookup, parsed); }); })
                        .catch(function (err) { _apply(function () { st.loading = false; st.error = _errorMessage(err, parsed); }); });
                };

                function _lotText(prefix, l) {
                    return prefix + l.kind + ' le ' + l.dateLabel + ' (' + l.natureLabel + ', DFI ' + l.dfi + '), '
                        + 'parcelle(s) mère(s) : ' + (l.mothers.length ? l.mothers.map(dfi.parcelLabel).join(', ') : 'aucune')
                        + ' ; fille(s) : ' + (l.daughters.length ? l.daughters.map(dfi.parcelLabel).join(', ') : 'aucune') + '.';
                }

                function _show(lookup, parsed) {
                    var st = $scope.state;
                    _lookup = lookup;
                    st.loading = false;
                    _syncCascade(lookup, parsed);
                    var graph = dfi.buildGraph(lookup, parsed.key);
                    var summary = dfi.parcelSummary(lookup, parsed.key);
                    st.result = {
                        parsed: parsed, idu: parsed.idu, label: dfi.parcelLabel(parsed.key), hasHistory: graph.hasHistory,
                        truncated: graph.truncated,
                        originText: summary.origin.map(function (l) { return _lotText('Origine : ', l); }),
                        futureText: summary.future.map(function (l) { return _lotText('Devenir : ', l); })
                    };
                    _layout = dfi.layoutGraph(graph, function (n) {
                        if (n.type === 'parcel') { return dfi.parcelLabel(n.key); }
                        var d = dfi.describeLot(lookup.lots[n.index]);
                        return d.kind + ' ' + d.dateLabel + (n.hidden ? ' (+' + n.hidden + ')' : '');
                    });
                    _selectedId = 'p:' + parsed.key;
                    $timeout(_draw, 0);   // le conteneur est créé par ng-if au prochain cycle
                }

                function _draw() {
                    var container = $element[0].querySelector('.geo-dfi-graph');
                    if (!container || !_layout) { return; }
                    _renderGraph(container, _layout, _selectedId, 'p:' + $scope.state.result.parsed.key, function (node) {
                        _apply(function () { _select(node); });
                    });
                }

                function _parcelInfo(key) {
                    var p = dfi.splitKey(key, _lookup.insee);
                    return { key: key, label: dfi.parcelLabel(key), idu: p.idu, prefix: p.prefix, section: p.section,
                             number: p.number, insee: p.insee, commune: p.insee.slice(2) };
                }

                function _select(node) {
                    _selectedId = node.id;
                    var st = $scope.state;
                    if (node.type === 'parcel') {
                        var info = _parcelInfo(node.key);
                        var s = dfi.parcelSummary(_lookup, node.key);
                        st.selected = {
                            title: 'Parcelle ' + info.label, parcel: info, mothers: [], daughters: [],
                            current: node.key === st.result.parsed.key,
                            lines: ['IDU : ' + info.idu]
                                .concat(s.origin.map(function (l) { return _lotText('Origine : ', l); }))
                                .concat(s.future.map(function (l) { return _lotText('Devenir : ', l); }))
                        };
                    } else {
                        var d = dfi.describeLot(_lookup.lots[node.index]);
                        st.selected = {
                            title: d.kind + ' — ' + d.natureLabel, parcel: null,
                            lines: ['Date : ' + d.dateLabel, 'DFI n° ' + d.dfi + ', lot ' + d.lotNumber],
                            mothers: d.mothers.map(_parcelInfo), daughters: d.daughters.map(_parcelInfo)
                        };
                    }
                    _draw();
                }

                $scope.focusParcel = function (idu) { $scope.state.idu = idu; $scope.search(); };

                // ── Sélection Commune -> Section -> Numéro : les listes viennent des données (index puis fichier de la commune) ──
                var _cascadeLookup = null;

                function _fillDatalist(id, values) {
                    var list = $element[0].querySelector('#' + id);
                    if (!list) { return; }
                    var fragment = document.createDocumentFragment();
                    values.forEach(function (v) { var o = document.createElement('option'); o.value = v; fragment.appendChild(o); });
                    list.textContent = '';
                    list.appendChild(fragment);   // construit en JS : plus rapide qu'un ng-repeat pour des milliers de communes
                }
                function _numberLabel(n) { return n.replace(/^0+/, '') || '0'; }
                function _fillNumbers() {
                    var st = $scope.state;
                    _fillDatalist('geo-dfi-numbers', _cascadeLookup && st.section ? dfi.numberOptions(_cascadeLookup, st.section).map(_numberLabel) : []);
                }
                function _resetCascade() {
                    var st = $scope.state;
                    st.insee = ''; st.section = ''; st.numberText = ''; st.listLoading = false;
                    $scope.sections = []; _cascadeLookup = null; _fillNumbers();
                }

                $scope.onCommune = function () {
                    var st = $scope.state;
                    var insee = st.insee;
                    _resetCascade();
                    if (!insee) { return; }
                    st.insee = insee; st.listLoading = true; st.error = '';
                    _getIndex().then(function (index) { return _getLookup(index, insee); }).then(function (lookup) {
                        _apply(function () {
                            if (st.insee !== insee) { return; }   // une autre commune a été choisie entre-temps
                            st.listLoading = false; _cascadeLookup = lookup;
                            $scope.sections = dfi.sectionOptions(lookup);
                            if ($scope.sections.length === 1) { st.section = $scope.sections[0].value; $scope.onSection(); }
                        });
                    }).catch(function (err) { _apply(function () { if (st.insee === insee) { st.listLoading = false; st.error = _errorMessage(err); } }); });
                };
                $scope.onSection = function () { $scope.state.numberText = ''; _fillNumbers(); };
                $scope.canSearch = function () { var st = $scope.state; return !!dfi.selectionIdu(st.insee, st.section, st.numberText); };
                $scope.searchSelection = function () {
                    var st = $scope.state;
                    var idu = dfi.selectionIdu(st.insee, st.section, st.numberText);
                    if (!idu) { st.error = 'Choisir une commune, une section puis saisir un numéro de parcelle.'; return; }
                    st.idu = idu; $scope.search();
                };

                // Reporte la parcelle affichée dans les trois champs (saisie d'IDU, clic dans le graphe ou la synthèse)
                function _syncCascade(lookup, parsed) {
                    var st = $scope.state;
                    st.insee = parsed.insee; st.listLoading = false; _cascadeLookup = lookup;
                    $scope.sections = dfi.sectionOptions(lookup);
                    st.section = parsed.prefix + parsed.section;
                    st.numberText = _numberLabel(parsed.number);
                    _fillNumbers();
                }

                _getIndex().then(function (index) {
                    _apply(function () {
                        // sans déclaration : aucune liste (un menu de 35 000 communes n'aurait pas de sens)
                        $scope.communes = _communes ? dfi.communeOptions(index, _communes) : [];
                        if (_communes && !$scope.communes.length) {
                            $scope.communeWarning = 'Aucune des communes déclarées dans les options du module n\'est publiée dans les données ('
                                + Object.keys(_communes).join(', ') + ').';
                        }
                    });
                }).catch(function (err) { _apply(function () { $scope.state.error = _errorMessage(err); }); });

                // ── Localisation : l'API Carto Cadastre de l'IGN renvoie le contour de la parcelle ───────────────────
                $scope.locate = function (p) {
                    var st = $scope.state;
                    var label = p.label || dfi.parcelLabel(p.key);
                    st.locating = true; st.locateMessage = '';
                    dfi.loadParcel(_fetch, _cadastreUrl, p).then(function (res) {
                        _apply(function () {
                            st.locating = false;
                            if (!res) {
                                st.locateMessage = label + " n'existe plus au cadastre actuel (parcelle divisée, réunie ou renumérotée) : "
                                    + 'elle ne peut pas être localisée.';
                                return;
                            }
                            // En plein écran la carte est masquée : on en sort, puis on attend que le panneau ait retrouvé sa largeur
                            // (setPanelSize se joue à 0, 100 et 300 ms) avant de mesurer ce qu'il recouvre.
                            var wait = 0;
                            if ($scope.isFullscreen) { _setFullscreen(false); wait = 450; }
                            $timeout(function () {
                                if (!_showOnMap(res)) {
                                    st.locateMessage = "Parcelle trouvée, mais la carte n'a pas pu être déplacée (voir la console du navigateur).";
                                    return;
                                }
                                st.located = true;
                                st.locateMessage = [label, res.commune, dfi.formatArea(res.contenance)].filter(Boolean).join(' · ') + ' : repérée sur la carte.';
                            }, wait);
                        });
                    }).catch(function (err) {
                        console.error('[geo-dfi] localisation :', err);
                        _apply(function () { st.locating = false; st.locateMessage = _locateError(err); });
                    });
                };
                $scope.clearLocation = function () { _clearHighlight(); $scope.state.located = false; $scope.state.locateMessage = ''; };

                // Plein écran : le panneau prend toute la largeur ; les boutons de la carte (qui se replient et chevauchent
                // ceux de gauche quand la carte est masquée) sont cachés tant que dure le plein écran. Échap en sort.
                function _onEscape(e) {
                    if (e.key === 'Escape' && $scope.isFullscreen) { _apply(function () { _setFullscreen(false); }); }
                }
                function _setFullscreen(on) {
                    $scope.isFullscreen = on;
                    _panelWidthPct = on ? 100 : _panelWidthCfg;
                    _requestPanelWidthSoon();
                    document.body.classList.toggle(_FULLSCREEN_BODY_CLASS, on);
                    document[on ? 'addEventListener' : 'removeEventListener']('keydown', _onEscape, true);
                    $timeout(_draw, 250);   // le conteneur du graphe a changé de taille
                }
                $scope.toggleFullscreen = function () { _setFullscreen(!$scope.isFullscreen); };

                $scope.$on('$destroy', function () {
                    if ($scope.isFullscreen) { _panelWidthPct = _panelWidthCfg; document.removeEventListener('keydown', _onEscape, true); }
                    document.body.classList.remove(_FULLSCREEN_BODY_CLASS);
                    _clearHighlight();
                    if (_currentScope === $scope) { _currentScope = null; _panelEl = null; }
                });
            }];
        }

        // ============================================================
        // Graphe SVG
        // ============================================================
        var _SVG = 'http://www.w3.org/2000/svg';
        function _svg(tag, attrs, parent) {
            var el = document.createElementNS(_SVG, tag);
            Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
            if (parent) { parent.appendChild(el); }
            return el;
        }

        function _renderGraph(container, layout, selectedId, searchedId, onSelect) {
            var keepX = container.scrollLeft, keepY = container.scrollTop;
            container.innerHTML = '';
            var svg = _svg('svg', {
                width: layout.width, height: layout.height, viewBox: '0 0 ' + layout.width + ' ' + layout.height,
                'class': 'geo-dfi-svg', role: 'group', 'aria-label': 'Graphe de filiation de la parcelle'
            }, container);
            var defs = _svg('defs', {}, svg);
            var marker = _svg('marker', { id: 'geo-dfi-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5',
                markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, defs);
            _svg('path', { d: 'M0,0 L10,5 L0,10 z', 'class': 'geo-dfi-arrowhead' }, marker);
            layout.paths.forEach(function (p) {
                _svg('path', { d: p.d, 'class': 'geo-dfi-edge', 'marker-end': 'url(#geo-dfi-arrow)' }, svg);
            });
            var searchedNode = null;
            layout.nodes.forEach(function (n) {
                var cls = 'geo-dfi-node geo-dfi-node--' + n.type
                    + (n.id === searchedId ? ' geo-dfi-node--searched' : '')
                    + (n.type === 'parcel' && !n.explored ? ' geo-dfi-node--leaf' : '')
                    + (n.id === selectedId ? ' geo-dfi-node--selected' : '');
                var g = _svg('g', { 'class': cls, transform: 'translate(' + n.x + ',' + n.y + ')', tabindex: '0', role: 'button',
                    'aria-label': n.label }, svg);
                _svg('rect', { width: n.w, height: n.h, rx: n.type === 'lot' ? 14 : 4 }, g);
                var t = _svg('text', { x: n.w / 2, y: n.h / 2 + 4, 'text-anchor': 'middle' }, g);
                t.textContent = n.label;
                g.addEventListener('click', function () { onSelect(n); });
                g.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(n); }
                });
                if (n.id === searchedId) { searchedNode = n; }
            });
            if (searchedNode && !keepX && !keepY) {   // première image : la parcelle cherchée au centre de la zone visible
                container.scrollLeft = Math.max(0, searchedNode.x + searchedNode.w / 2 - container.clientWidth / 2);
                container.scrollTop  = Math.max(0, searchedNode.y + searchedNode.h / 2 - container.clientHeight / 2);
            } else { container.scrollLeft = keepX; container.scrollTop = keepY; }
        }

        // ============================================================
        // Carte : zoom sur la parcelle et contour
        // ============================================================
        function _locateError(err) {
            switch (err && err.code) {
                case 'network': return 'Le service cadastral (' + _hostOf(_cadastreUrl) + ") n'est pas accessible depuis ce poste (réseau ou accès bloqué).";
                default:        return (err && err.message) || 'La localisation a échoué (voir la console du navigateur).';
            }
        }

        function _clearHighlight() {
            if (_markLayer && _markMap) {
                try { _markMap.removeLayer(_markLayer); } catch (err) { console.warn('[geo-dfi] retrait du contour impossible :', err); }
            }
            _markLayer = null; _markMap = null;
        }

        function _nativeMap() { return $injector.get('acfMapService').getMapViewImmediate().getNativeMap(); }

        // Contour de la parcelle sur la carte native (OpenLayers fourni par GEO, voir module-development.md §1).
        function _highlight(feature) {
            _clearHighlight();
            var ol = window.ol;
            var olMap = _nativeMap();
            var features = new ol.format.GeoJSON().readFeatures(feature, {
                dataProjection: 'EPSG:4326', featureProjection: olMap.getView().getProjection().getCode()
            });
            var layer = new ol.layer.Vector({
                source: new ol.source.Vector({ features: features }),
                style: new ol.style.Style({
                    stroke: new ol.style.Stroke({ color: '#c76a00', width: 3 }),
                    fill: new ol.style.Fill({ color: 'rgba(255, 200, 120, 0.25)' })
                }),
                zIndex: 1000   // au-dessus des fonds de plan et des couches thématiques
            });
            olMap.addLayer(layer);
            _markLayer = layer; _markMap = olMap;
        }

        // Cadrage de la parcelle par la vue OpenLayers native. `setExtent` de GEO n'est pas utilisable ici : il applique ses propres
        // paddings de canvas (« FitOptions.disablePadding ») et le cadrage obtenu ne dépendait pas de l'emprise donnée (constaté sur GEO 4.5.0).
        // On mesure sur la page ce que le panneau recouvre réellement de la carte, qu'il la recouvre ou qu'il la rétrécisse.
        function _coveredRight(olMap) {
            var panel = _panelEl && (_panelEl.querySelector('.geo-dfi') || _panelEl);
            var target = olMap.getTargetElement && olMap.getTargetElement();
            if (!panel || !target) { return 0; }
            var pr = panel.getBoundingClientRect();
            var mr = target.getBoundingClientRect();
            var covered = Math.round(mr.right - pr.left);
            return covered > 0 && covered < mr.width * 0.9 ? covered : 0;
        }

        function _zoomNative(bbox) {
            var olMap = _nativeMap();
            var view = olMap.getView();
            var viewCrs = view.getProjection().getCode();
            var box = dfi.expandBbox(bbox, 0.3, 0.0003);      // marge de 30 %, d'au moins 0,0003° (environ 30 m)
            var ext = [box.minX, box.minY, box.maxX, box.maxY];
            if (viewCrs !== 'EPSG:4326') { ext = window.ol.proj.transformExtent(ext, 'EPSG:4326', viewCrs); }
            var covered = _coveredRight(olMap);
            console.info('[geo-dfi] cadrage : carte ' + _safeSize(olMap) + ' px, panneau recouvrant ' + covered + ' px à droite, projection ' + viewCrs);
            view.fit(ext, { size: olMap.getSize(), padding: [20, covered + 20, 20, 20], maxZoom: 20, duration: 300 });
        }
        function _safeSize(olMap) { try { return olMap.getSize().join(' × '); } catch (err) { return '?'; } }

        // Repli si la carte native n'est pas lisible : setExtent de GEO, avec une emprise au rapport de la carte.
        function _zoomTo(bbox) {
            try { _zoomNative(bbox); return; }
            catch (err) { console.warn('[geo-dfi] cadrage natif impossible, repli sur setExtent de GEO :', err); }
            var map = geoApplication.map;
            var mapCrs = (map.extent && map.extent.crs) || 'EPSG:3857';
            var size = null;
            try {
                var px = _nativeMap().getSize();
                if (px && px[0] > 0 && px[1] > 0) { size = { width: px[0], height: px[1] }; }
            } catch (err) { console.warn('[geo-dfi] taille de la carte inconnue, centrage approché :', err); }
            var box = dfi.expandBbox(bbox, 0.5, 0.0003);
            var ext = [box.minX, box.minY, box.maxX, box.maxY];
            var crs = 'EPSG:4326';
            if (mapCrs !== 'EPSG:4326') {
                try { ext = window.ol.proj.transformExtent(ext, 'EPSG:4326', mapCrs); crs = mapCrs; }
                catch (err) { console.warn('[geo-dfi] changement de projection impossible, emprise donnée en EPSG:4326 :', err); }
            }
            var v = dfi.fitExtent({ minX: ext[0], minY: ext[1], maxX: ext[2], maxY: ext[3] }, size, (100 - _panelWidthPct) / 100);
            var r = map.setExtent({ minX: v.minX, maxX: v.maxX, minY: v.minY, maxY: v.maxY, crs: crs }, crs, { disablePadding: true });
            if (r && typeof r.subscribe === 'function') {
                r.subscribe(function () {}, function (err) { console.error('[geo-dfi] setExtent a échoué :', err); });
            }
        }

        function _showOnMap(res) {
            if (!geoApplication.map) { console.warn('[geo-dfi] carte GEO indisponible'); return false; }
            var done = false;
            try { _highlight(res.feature); done = true; } catch (err) { console.error('[geo-dfi] contour de la parcelle :', err); }
            try { _zoomTo(res.bbox); done = true; } catch (err) { console.error('[geo-dfi] zoom sur la parcelle :', err); }
            return done;
        }

        // ============================================================
        // Styles
        // ============================================================
        function _injectStyles() {
            if (document.getElementById('geo-dfi-styles')) { return; }
            var style = document.createElement('style');
            style.id = 'geo-dfi-styles';
            style.textContent = [
                '.geo-dfi-tab-icon::before{content:"";display:inline-block;width:1em;height:1em;vertical-align:-.125em;background-color:currentColor;',
                '  -webkit-mask:' + _TAB_ICON_MASK + ' center/contain no-repeat;mask:' + _TAB_ICON_MASK + ' center/contain no-repeat;}',
                // Barre d'outils fixe en haut, contenu qui défile seul en dessous (même principe que le panneau de Panoramax)
                '.geo-dfi{display:flex;flex-direction:column;height:100%;font-size:13px;line-height:1.4;color:#222;background:#fff;overflow:hidden;box-sizing:border-box;}',
                '.geo-dfi-toolbar{flex:none;display:flex;align-items:center;gap:8px;padding:6px 12px;background:#f4f6f9;border-bottom:1px solid #d5dae1;}',
                '.geo-dfi-toolbar-icon{display:flex;color:#27487a;}',
                '.geo-dfi-title{flex:1 1 auto;min-width:0;font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
                '.geo-dfi-body{flex:1 1 auto;min-height:0;overflow:auto;padding:12px;}',
                '.geo-dfi-bar-actions{flex:none;display:flex;gap:6px;}',
                '.geo-dfi-iconbtn{display:flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;',
                '  border:1px solid #89898a;border-radius:50%;background:#fff;color:#333;cursor:pointer;}',
                '.geo-dfi-iconbtn:hover:not([disabled]){background:#eef2f8;}',
                '.geo-dfi-iconbtn[disabled]{opacity:.5;cursor:default;}',
                '.geo-dfi-iconbtn{position:relative;}',
                '.geo-dfi-dot-new{position:absolute;top:0;right:0;width:10px;height:10px;border-radius:50%;background:#d93025;border:2px solid #f4f6f9;}',
                '.geo-dfi-iconbtn--on{background:#27487a;border-color:#27487a;color:#fff;}',
                '.geo-dfi-iconbtn--on:hover{background:#1d3a66;}',
                '.geo-dfi-icon{width:18px;height:18px;display:block;}',
                '.geo-dfi--full .geo-dfi-graph{max-height:70vh;}',
                'body.' + _FULLSCREEN_BODY_CLASS + ' .acf-map-controls-topright{display:none!important;}',
                '.geo-dfi label{display:block;margin-bottom:4px;font-weight:600;}',
                '.geo-dfi-row{display:flex;gap:6px;margin-bottom:8px;}',
                '.geo-dfi-row input{flex:1;min-width:0;padding:6px 8px;border:1px solid #9aa4b2;border-radius:4px;font:inherit;}',
                '.geo-dfi-field{display:block;box-sizing:border-box;width:100%;margin-bottom:8px;padding:6px 8px;border:1px solid #9aa4b2;border-radius:4px;background:#fff;font:inherit;}',
                '.geo-dfi-row--pair{gap:8px;}',
                '.geo-dfi-row--pair>div{flex:1;min-width:0;}',
                '.geo-dfi-btn--wide{width:100%;padding:7px 10px;}',
                '.geo-dfi-idubox{margin:10px 0 4px;font-size:12px;color:#444;}',
                '.geo-dfi-idubox summary{cursor:pointer;}',
                '.geo-dfi-idubox .geo-dfi-form{margin-top:6px;}',
                '.geo-dfi-btn{padding:5px 10px;border:1px solid #4a6fa5;border-radius:4px;background:#fff;color:#27487a;font:inherit;cursor:pointer;}',
                '.geo-dfi-btn:hover:not([disabled]){background:#e8f0fe;}',
                '.geo-dfi-btn[disabled]{opacity:.55;cursor:default;}',
                '.geo-dfi-btn--main{background:#27487a;color:#fff;}',
                '.geo-dfi-btn--main:hover:not([disabled]){background:#1d3a66;}',
                '.geo-dfi-msg{margin:8px 0;padding:6px 8px;background:#f1f3f6;border-radius:4px;}',
                '.geo-dfi-msg--error{background:#fdecea;color:#8a1c12;}',
                '.geo-dfi-msg--warn{background:#fff4d6;color:#6b4b00;}',
                '.geo-dfi-parcel{margin:10px 0 4px;font-size:15px;font-weight:700;}',
                '.geo-dfi-parcel .geo-dfi-btn{margin-left:6px;font-size:12px;font-weight:400;}',
                '.geo-dfi-idu{margin:0 6px;font-size:12px;font-weight:400;color:#555;}',
                '.geo-dfi-summary{margin:6px 0 8px;padding-left:18px;}',
                '.geo-dfi-graph{margin:8px 0;max-height:52vh;overflow:auto;border:1px solid #d5dae1;border-radius:4px;background:#fbfcfd;}',
                '.geo-dfi-svg{display:block;}',
                '.geo-dfi-edge{fill:none;stroke:#8a96a8;stroke-width:1.4;}',
                '.geo-dfi-arrowhead{fill:#8a96a8;}',
                '.geo-dfi-node{cursor:pointer;outline:none;}',
                '.geo-dfi-node rect{fill:#e8f0fe;stroke:#4a6fa5;stroke-width:1.2;}',
                '.geo-dfi-node text{font-size:12px;fill:#1b2b45;pointer-events:none;}',
                '.geo-dfi-node--lot rect{fill:#f4f1e8;stroke:#a08a4a;}',
                '.geo-dfi-node--leaf rect{stroke-dasharray:3 2;fill:#f5f7fa;}',
                '.geo-dfi-node--searched rect{fill:#ffe2b8;stroke:#c76a00;stroke-width:2.2;}',
                '.geo-dfi-node--selected rect{stroke:#0b6b3a;stroke-width:2.6;}',
                '.geo-dfi-node:focus-visible rect{stroke:#0b6b3a;stroke-width:3;}',
                '.geo-dfi-detail{margin:8px 0;padding:8px;border:1px solid #d5dae1;border-radius:4px;}',
                '.geo-dfi-detail-title{margin-bottom:4px;font-weight:700;}',
                '.geo-dfi-detail .geo-dfi-btn{margin:6px 6px 0 0;}',
                '.geo-dfi-chips{margin-top:4px;}',
                '.geo-dfi-chip{margin:2px 4px 2px 0;padding:1px 8px;border:1px solid #4a6fa5;border-radius:10px;background:#e8f0fe;color:#27487a;font:inherit;cursor:pointer;}',
                '.geo-dfi-foot{margin-top:14px;padding-top:8px;border-top:1px solid #e1e5ea;font-size:11px;color:#59616e;}'
            ].join('\n');
            document.head.appendChild(style);
        }
    }]);
