# RSIM Dash — dashboards téléphone par voiture

Le PC lit la télémétrie du jeu, reconnaît la voiture et envoie au téléphone (Wi-Fi) le dashboard de cette voiture.
Aucune dépendance : Python 3 suffit.

## Jeux pris en charge
| Jeu | Réglage dans le jeu |
|---|---|
| Assetto Corsa / ACC / **AC Rally** | rien |
| **Le Mans Ultimate** | activer le plugin de mémoire partagée (voir plus bas) |
| Automobilista 2 | Options > Système > Mémoire partagée : **Project CARS 2** |
| RaceRoom | rien |

AC EVO n'est pas encore géré (son format de mémoire partagée est différent).

### LMU : activer le plugin
1. Vérifie que `rFactor2SharedMemoryMapPlugin64.dll` est dans `...\steamapps\common\Le Mans Ultimate\Plugins\`.
   S'il n'y est pas, télécharge-le depuis github.com/TheIronWolfModding/rF2SharedMemoryMapPlugin (Releases).
2. Ouvre `...\Le Mans Ultimate\UserData\player\CustomPluginVariables.json` et mets :
   `"rFactor2SharedMemoryMapPlugin64.dll": { " Enabled": 1 }` (l'espace avant `Enabled` est normal).
3. Relance LMU.

## Lancer
1. Installe Python 3 (python.org, cocher **Add python.exe to PATH**).
2. Double-clic sur **start.bat**. Au premier lancement, Windows demande l'accès réseau : autorise **Réseau privé**.
3. La fenêtre affiche l'adresse, par exemple `http://192.168.1.20:8888` : ouvre-la sur le téléphone (même Wi-Fi).
4. Touche l'écran : plein écran + paysage. Dans Chrome, menu ⋮ > **Ajouter à l'écran d'accueil** pour l'avoir comme une appli.
5. Mets la mise en veille de l'écran du téléphone sur le maximum (l'appli essaie de le garder allumé, mais en http ce n'est pas garanti).

**demo.bat** : données simulées pour voir et régler les dashs sans jeu.

## Choisir le dash d'une voiture
- Automatique : chaque profil de `cars.json` a des mots-clés (`match`) cherchés dans le nom envoyé par le jeu.
- **Appui long sur le téléphone** : choisis le dash pour la voiture actuelle, c'est mémorisé.
- **Panneau RSIM Dash** sur le PC (s'ouvre tout seul au lancement, ou `http://localhost:8888/hub`) → liste de toutes les voitures déjà roulées, avec leur nom exact, et un menu pour leur attribuer un dash. Aperçu de tous les dashs + bouton « Tester (démo) ».

Bon à savoir :
- **LMU** envoie le nom de l'équipe/livrée (ex. « Vista AF Corse #21 »), pas toujours le modèle. Les marques et quelques équipes connues sont reconnues, sinon attribue le dash une fois (appui long), c'est retenu.
- **RaceRoom** n'envoie qu'un numéro de modèle (`model_1234`) : attribue-le une fois.
- Les attributions sont dans `assignments.json`, les voitures vues dans `seen_cars.json`.

## Dashs inclus
| Famille | Style | Voitures |
|---|---|---|
| `gt3` | écran couleur course moderne (LEDs, rapport, delta, TC/ABS/MAP/BB, fuel, pneus) | 10 LMGT3 de LMU + GT3 générique + universel |
| `rally` | écran Rally2/Rally4 (bargraphe régime, vitesse, chrono, eau/huile/turbo) | i20 N Rally2, 208 Rally4, Fabia Rally2, rallye générique |
| `lcd` | afficheur LCD 7 segments années 90-2000 rétroéclairé | Xsara WRC, 306 Maxi, Impreza Gr.A |
| `analog` | compteurs à aiguille | Delta Integrale, 131 Abarth, Alfa GTA |

Ce sont des dashs **inspirés** du type d'afficheur de chaque voiture (couleurs, disposition, style), pas des copies exactes avec logos.

## Personnaliser
Dans `cars.json`, chaque profil a un `theme` :
- `gt3` / `rally` : `accent`, `bg`, `panel`, `text`, `gear` (couleur du rapport), `leds` (`lr` gauche→droite ou `center`), `ledShape` (`dot`, `bar`, `chevron`), `font` (`mono`, `sans`, `serif`), `layout` (`A` rapport au centre, `B` rapport à droite).
- `lcd` : `bg`, `backlight`, `text` (segments allumés), `lcdOff` (segments éteints).
- `analog` : `face`, `ink`, `needle`, `red`, `bezel`, `tachMax`, `speedMax`.

Pour ajouter une voiture : copie un profil, change `id`, `name`, `match` et les couleurs, relance start.bat.

## Créer un .exe (optionnel)
`build_exe.bat` → `dist\RSIM-Dash.exe` (garde `web\` et `cars.json` à côté).

## Technique
- `telemetry.py` : lecture de la mémoire partagée (ouverture seule, l'appli ne crée jamais de mapping : sans risque pour le jeu).
  Offsets calculés à partir des headers officiels : `r3e.h` (RaceRoom v3.6), `rF2State.h` (plugin rF2/LMU), structure PCars2 (CrewChief), structure ACC (Kunos).
- `server.py` : serveur HTTP + flux temps réel (SSE, 30 images/s), choix du dash, apprentissage des voitures.
- `web/` : rendu Canvas (`dash.js`), page téléphone (`index.html`), page admin (`admin.html`).
- Port différent : `start.bat --port 9000`.

## Panneau RSIM Dash + éditeur (sur le PC)
Le panneau s'ouvre au lancement : tous les dashboards (aperçus animés), « Afficher sur le téléphone », « Mettre sur la voiture en cours », Éditer / Dupliquer / Supprimer, voitures détectées, adresse du téléphone, boutons du volant.
`creer_raccourcis.bat` crée le raccourci bureau (et le démarrage auto avec Windows, sans ouvrir le navigateur).
L'éditeur : bouton « Créer un dashboard » ou « Éditer » dans le panneau.
- **Nouveau** part d'un modèle de 2 pages à modifier. **Ajouter** : valeur télémétrie, rapport, LEDs de régime, barre/jauge, compteur à aiguille, pneus, texte, forme, bouton tactile.
- Glisser pour déplacer, coin bleu pour redimensionner, flèches pour ajuster (Maj = 10 px), Suppr, Ctrl+D dupliquer, Ctrl+C / Ctrl+V entre pages, Ctrl+S enregistrer.
- Panneau de droite : donnée de télémétrie, format (nombre, temps, delta…), police (20 polices racing), tailles, couleurs, fond, bordure, arrondi, lueur.
- **Règles de couleur** : ex. eau > 105 → texte rouge clignotant ; « TC actif == 1 » → fond bleu.
- **Afficher seulement si** : ex. un bandeau « PIT LIMITER » visible seulement quand le limiteur est actif.
- **Pages** : plusieurs écrans par dashboard (+ page, double-clic pour renommer).
- **Voitures (mots-clés)** : le dash est choisi tout seul pour ces voitures. Ou **Mettre sur la voiture en cours** pendant que tu roules.
- Données : « démo animée » ou « jeu en direct » pour régler en roulant. Le téléphone se met à jour dès que tu enregistres.
- Les dashboards sont enregistrés dans le dossier `dashboards\` (un fichier .json par dash, facile à sauvegarder ou partager).

## Boutons (volant + téléphone)
- **Bouton tactile** (widget) : action = page suivante/précédente, dashboard suivant/précédent, dashboard auto, ou **touche clavier envoyée au jeu**
  (ex. démarreur : assigne d'abord une touche au démarreur dans le jeu, puis mets la même touche sur le bouton).
- **Boutons du volant** (onglet « Boutons volant » de l'éditeur) : « Capturer » puis appuie sur le bouton du G29 → choisis l'action. La croix directionnelle = boutons 33 à 36.
  Enregistré dans `bindings.json`.
- Les touches sont envoyées à la fenêtre active : le jeu doit être au premier plan. Si un jeu ne réagit pas, lance start.bat en administrateur.

## Catalogue, button box et édition sur téléphone
- **+ Ajouter un élément** ouvre le catalogue par catégories (Fond, Boîte de vitesse, Roues, Carburant, Moteur, Véhicule, Temps, Session, Button Box) avec aperçus animés.
- Fonds : carbone (3 styles), écran course avec cadre, LCD demi-lune, dégradé, grille, alu brossé, couleur, **image perso**.
- Voyants : ABS, TC, carburant, phares, moteur, eau, PIT, drapeau, pastille, texte — allumés selon une condition de télémétrie, clignotement possible.
- Button Box : démarrer/arrêter moteur, bouton simple / arrondi / rond chromé / image perso, interrupteurs (bascule lumineuse, rond LED, rond, carré, killswitch rouge/bleu, levier métal).
- Touches : modificateur 1 + modificateur 2 + touche, envoi **à l'appui / au relâchement / maintenu**, touche différente quand l'interrupteur passe à OFF, état visuel lié au jeu, remise à OFF quand le jeu est fermé, vibration. Bouton « Tester sur le PC ».
- **Sur le téléphone** : `http://<IP du PC>:8888/editor` (ou appui long sur le dash → « Modifier ce dashboard »). Boutons ronds : ➕ ajouter, 🎨 personnaliser, ⧉ dupliquer, ☰ calques/pages, 🗑 supprimer. Glisser au doigt, coin bleu pour redimensionner.

## Appli RSIM : PC + Android sur le même Wi-Fi
- **Sur le PC** : le raccourci *RSIM Dash* lance l'agent et ouvre RSIM dans **sa propre fenêtre** (Edge/Chrome en mode appli, sans barre de navigateur).
- **Sur le téléphone** : l'**APK RSIM**. Au 1er lancement il **recherche le PC tout seul** sur le Wi-Fi (sinon : Paramètres → adresse affichée sur le PC).
- Même appli des deux côtés : accueil par modules (Dash en direct, Dashboards, Éditeur, Boutons volant, Paramètres ; Télémétrie et Profils FFB à venir).

### Mettre le projet sur GitHub (une fois)
1. Crée un dépôt GitHub (ex. `rsim`).
2. Envoie tout le dossier `rsim-dash` (GitHub Desktop : *Add existing repository* → *Publish*). Les fichiers perso et générés sont exclus par `.gitignore`.

### Obtenir l'APK (automatique)
- À chaque envoi, GitHub construit l'APK : onglet **Actions** → dernier « Build APK RSIM » → **Artifacts** → `RSIM-apk` (zip contenant `app-debug.apk`).
- Copie l'APK sur le téléphone et installe-le (autoriser « sources inconnues »). Pour le prêter à un collègue : même APK.
