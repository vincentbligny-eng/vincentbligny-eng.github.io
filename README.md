# Duplicate

Entraîneur solo de Scrabble duplicate — fonctionne entièrement en local, sans backend.

## Démarrage

```sh
npm install
npm run dev       # http://localhost:4321
```

## Fonctionnalités

- **Tirages aléatoires** — sac français standard (102 pions, 2 jokers).
- **Mode duplicate** — à chaque tour, le meilleur coup est joué sur le plateau
  indépendamment de votre choix. Votre score et le maximum sont suivis.
- **3 suggestions** — un bouton *Révéler* affiche les 3 meilleurs coups avec
  aperçu sur le plateau au survol et possibilité de les appliquer.
- **Tirage dirigé** — réservez jusqu'à 7 lettres qui seront pigées dans votre
  rack au prochain coup (utile pour préparer un scénario).
- **Dictionnaire** — liste française de ~311 000 formes (accents normalisés,
  ligatures développées), chargée une seule fois.

## Architecture

- Astro static + Svelte island unique (pas de SSR, pas de backend).
- Moteur de Scrabble en TypeScript pur (`src/engine/`) : bag, board, moves,
  scoring, duplicate state machine.
- Dictionnaire servi en texte brut à `/dict-fr.txt`.

## Régénérer le dictionnaire

Le jeu lit `public/dict-fr.txt` au démarrage. Pour le remplacer :

```sh
# 1) Fichier local (ODS8, PLI, ODS-compatible, etc.) :
npm run build-dict -- ~/ods8.txt
#   ou via variable d'environnement :
WORDLIST_FILE=~/ods8.txt npm run build-dict

# 2) URL publique :
WORDLIST_URL=https://exemple/list.txt npm run build-dict

# 3) Sans argument : utilise la liste publique par défaut (lorenbrichter/Words,
#    ODS-flavored mais NON officielle).
```

Le format attendu : un mot par ligne, accents autorisés (ils sont normalisés).
Le script met en majuscules, dépose les accents (`é→E`), développe les
ligatures (`œ→OE`, `æ→AE`), et filtre à 2–15 lettres.

**ODS8** : le contenu du dictionnaire est protégé par le droit d'auteur de
Larousse — il n'est pas fourni. Si vous possédez une copie (texte brut, un mot
par ligne), placez-la n'importe où et pointez `WORDLIST_FILE` dessus.
