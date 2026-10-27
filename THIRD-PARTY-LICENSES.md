# Licences des composants tiers

Le fichier `main.js` livré avec le module (`npm run build`) embarque une seule bibliothèque tierce, **Driver.js** (visite guidée, MIT,
voir ci-dessous), en plus du code du module (GPL-3.0-or-later, voir `LICENSE`) et de **quelques icônes** Lucide, listées ci-dessous. AngularJS
et OpenLayers sont fournis par la plateforme GEO et ne sont pas redistribués ici ; les dépendances de développement (webpack, babel, archiver…)
ne sont pas dans le bundle.

## driver.js 1.10.2

- Licence : **MIT** — https://github.com/nilbuild/driver.js
- Texte (fichier license du paquet) :

    The MIT License

    Copyright (c) Kamran Ahmed

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in
    all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
    THE SOFTWARE.

## Icônes Lucide

- Icônes copiées en SVG dans `src/js/extension.js` (onglet et barre d'outils du panneau) : « graph-hub » (<https://lucide.dev/icons/graph-hub>),
  « map-pin » (<https://lucide.dev/icons/map-pin>), « map-pin-off » (<https://lucide.dev/icons/map-pin-off>), « sparkles » (<https://lucide.dev/icons/sparkles>), « maximize » et « minimize »
  (<https://lucide.dev/icons/maximize>, <https://lucide.dev/icons/minimize>) ; boutons de zoom du graphe : « zoom-in », « zoom-out » et « scan »
  (<https://lucide.dev/icons/zoom-in>, <https://lucide.dev/icons/zoom-out>, <https://lucide.dev/icons/scan>) ; bouton de la visite guidée :
  « circle-question-mark » (<https://lucide.dev/icons/circle-question-mark>). Source : <https://github.com/lucide-icons/lucide>
  (version 1.61.0 des icônes). Aucune modification des tracés.
- L'image d'aperçu `src/preview.png` reprend « graph-hub », dessinée en blanc sur un hexagone bleu (même style que l'aperçu du gabarit).
- Licence : **ISC** pour Lucide, et **MIT** pour les icônes dérivées du projet Feather, dont « map-pin », « maximize », « minimize », « zoom-in », « zoom-out » et « circle-question-mark ». Textes :

    ISC License

    Copyright (c) 2026 Lucide Icons and Contributors

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted, provided that the above
    copyright notice and this permission notice appear in all copies.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
    WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
    MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
    ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
    WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
    ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
    OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

    ---

    The MIT License (MIT) (for the Lucide icons derived from the Feather project, among them map-pin, maximize and minimize)

    Copyright (c) 2013-present Cole Bemis

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.

## Données

Le module affiche les **Documents de filiation informatisés (DFI) des parcelles** de la DGFiP, sous
[Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/), lus à l'exécution dans des fichiers publiés séparément (voir
<https://github.com/vienne-condrieu-agglomeration/geo-community-data-dfi>), et le contour d'une parcelle fourni à la demande par l'**API Carto
Cadastre de l'IGN** (<https://apicarto.ign.fr>, données du cadastre sous Licence Ouverte). Ces données ne sont pas embarquées dans le module.
