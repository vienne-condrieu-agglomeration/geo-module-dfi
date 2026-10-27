# Journal des nouveautés

Toutes les évolutions notables du module « Filiation des parcelles (DFI, DGFiP) ». Le format suit
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le versionnement
[SemVer](https://semver.org/lang/fr/).

Ce fichier est affiché dans GEO, dans la fenêtre « Nouveautés » du module : il s'écrit pour les
**utilisateurs**, en français, pas pour les développeurs (la liste des commits est dans git). La version
la plus récente publiée doit être celle de `package.json` et de `src/plugin.geoext.json`
(`npm test` le vérifie).

## [Non publié]

### Modifié

- L'**onglet** du module affiche la même icône de filiation que la barre d'outils et l'aperçu, à la place de la loupe

## [0.3.1] — 2026-10-26

### Modifié

- La **commune** se choisit dans une **liste déroulante** (plus de saisie avec suggestions), limitée aux communes déclarées dans le
  réglage « Communes du territoire » des options du module

### Corrigé

- Si aucune commune n'est déclarée dans les options (codes INSEE oubliés), un **message d'avertissement** l'indique et la recherche par
  commune est désactivée, au lieu de proposer toutes les communes publiées. La saisie d'une référence cadastrale (IDU) reste possible.
  Un message signale aussi le cas où les communes déclarées ne figurent pas dans les données

## [0.3.0] — 2026-10-26

### Ajouté

- **Recherche en trois listes liées : Commune → Section → Numéro.** On tape le nom de la commune (ou son code INSEE) et une liste de
  suggestions apparaît ; la liste des sections est alors celle de la commune choisie, puis les numéros de la section sont proposés pendant
  la saisie. Plus besoin de connaître la référence cadastrale (IDU) de la parcelle
- La recherche suit la parcelle affichée : un clic sur une autre parcelle du graphe met à jour la commune, la section et le numéro
- Les noms des communes viennent des données (publiées avec l'intégrateur 0.2.0 ou plus récent) ; avec des données plus anciennes, le code
  INSEE s'affiche à la place du nom

### Modifié

- La saisie directe de l'IDU est conservée, sous « Saisir une référence cadastrale (IDU) », pour coller une référence venue d'un autre outil
- Les listes ne contiennent que les parcelles qui apparaissent dans un document de filiation ; une parcelle absente se saisit quand même
  (le module répond alors qu'aucune filiation n'est connue)

## [0.2.2] — 2026-10-26

### Modifié

- Le bouton **« Nouveautés »** passe dans la barre d'outils (icône étincelles, avec un point rouge tant que la dernière version n'a pas été
  lue) ; le lien « v… · Nouveautés » en bas du panneau disparaît

### Corrigé

- « Localiser sur la carte » : la parcelle est cadrée dans la partie de la carte que le panneau ne recouvre pas, et occupe davantage de place.
  Le module mesure ce que le panneau recouvre réellement, qu'il soit étroit, large ou que GEO ait rétréci la carte

## [0.2.1] — 2026-10-26

### Modifié

- Vraie barre d'outils fixe en haut du panneau, avec des icônes : localiser la parcelle sur la carte, effacer le repérage, plein écran. Elle
  ne défile plus avec le contenu, seul le contenu défile en dessous
- Nouvelle image d'aperçu du module (un nœud et ses enfants, comme une division de parcelle), reprise dans la barre d'outils

## [0.2.0] — 2026-10-26

### Ajouté

- Bouton **« Localiser sur la carte »** sur la parcelle cherchée et sur chaque parcelle du graphe : la carte zoome sur la
  parcelle, qui est centrée dans la partie non recouverte par le panneau, et son contour est dessiné. « Effacer le repérage »
  retire le contour. Une parcelle qui n'existe plus au cadastre (divisée, réunie ou renumérotée) est signalée au lieu d'être
  localisée. En plein écran, le module repasse en panneau normal pour montrer la carte
- Le contour vient de l'API Carto Cadastre de l'IGN (service public, sans inscription) : l'adresse IP du poste et la référence
  de la parcelle lui sont transmises. Réglages : activer ou non le bouton, adresse du service

## [0.1.0] — 2026-10-26

### Ajouté

- Onglet de la barre latérale droite : saisissez la référence d'une parcelle (IDU, 14 caractères) pour voir son
  historique de filiation sous forme de graphe : parcelles mères, opérations (division, réunion, lotissement,
  remaniement…) avec leur date et leur nature, puis parcelles filles. Un clic sur une parcelle ou une opération
  en donne le détail et permet de suivre la filiation de la parcelle choisie
- Barre de contrôle avec un bouton **plein écran** : le panneau prend toute la largeur de l'écran pour mieux lire les graphes volumineux (Échap pour revenir)
- Les données sont les Documents de filiation informatisés de la DGFiP (Licence Ouverte 2.0), lues dans des
  fichiers statiques par commune : aucun serveur à installer. Leur date de mise à jour est affichée avec la source
- Réglages : adresse des données, communes du territoire, nom et largeur de l'onglet
