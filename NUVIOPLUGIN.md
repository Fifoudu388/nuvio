# Créer un plugin Nuvio — Notes de session

## Qu'est-ce qu'un plugin Nuvio ?

Un plugin Nuvio = un **fichier `manifest.json`** (hébergé sur GitHub, ou n'importe quel fichier statique) qui liste un ou plusieurs **scrapers** (providers). Chaque scraper est un fichier JavaScript.

Le code JS téléchargé est exécuté **localement sur l'appareil** dans un runtime sandboxé **QuickJS** (pas un navigateur, pas Node). Il fait des requêtes HTTP vers sa source et retourne une liste normalisée de streams.

Clé : le plugin exécute du code sur l'appareil = à n'installer que depuis des sources de confiance.

## Références utiles

- Exemple complet: https://github.com/NuvioPlugin/All-in-One-Nuvio
- Manifest exemple: https://raw.githubusercontent.com/NuvioPlugin/All-in-One-Nuvio/refs/heads/main/manifest.json
- Doc dev complète (574 lignes): https://raw.githubusercontent.com/z7kx/z7kx-nuvio-provider/main/DOCUMENTATION.md
- Wiki Nuvio plugins: https://nuvio.wiki/integrations/plugins
- Repos de référence: `yoruix/nuvio-providers`, `iberiaimm/nuvio-providers` (avec `build.js` + `DOCUMENTATION.md`), `NuvioCommunity/plugins`
- Notes: Nuvio → Settings → Plugin Tester pour tester un manifest local (`npm start` port 3000)

## Structure du repo

```
mon-repo-nuvio/
├── manifest.json       # obligatoire, liste des scrapers
├── providers/
│   └── monprovider.js  # code du scraper (fichier unique ou bundle esbuild)
├── src/                # (optionnel) sources multi-fichiers
│   └── monprovider/
│       ├── index.js
│       └── extractor.js
└── build.js            # (optionnel) script esbuild : node build.js monprovider
```

## manifest.json

```json
{
  "name": "Mon Repository",
  "version": "1.0.0",
  "scrapers": [
    {
      "id": "monprovider",
      "name": "MonProvider",
      "description": "Description courte",
      "version": "1.0.0",
      "author": "Moi",
      "supportedTypes": ["movie", "tv"],
      "filename": "providers/monprovider.js",
      "enabled": true,
      "hasSettings": false,
      "formats": ["mp4", "mkv", "m3u8"],
      "logo": "https://.../logo.png",
      "contentLanguage": ["fr", "en"]
    }
  ]
}
```

Champs clés :
- `filename` : chemin relatif (résolu via URL du manifest) ou URL absolue
- `supportedTypes` : `["movie", "tv"]` (aussi `"anime"` possible)
- `hasSettings` : `true` si le scraper lit `globalThis.SCRAPER_SETTINGS`
- `formats` / `contentLanguage` : libellés affichés

## API du provider (`getStreams`)

```js
async function getStreams(tmdbId, mediaType, season, episode) {
  // tmdbId: string ("550"), mediaType: "movie"|"tv", season/episode: number|null
  const streams = [];
  try {
    const resp = await fetch(`https://api.exemple.com/stream/${tmdbId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!resp.ok) return streams;
    const data = await resp.json();
    for (const s of data.sources || []) {
      streams.push({
        name: 'MonProvider',
        title: `${s.quality} • exemple.com`,
        url: s.url,
        quality: s.quality,
        headers: { 'Referer': 'https://exemple.com/', 'User-Agent': 'Mozilla/5.0' },
      });
    }
  } catch (e) { console.error('Erreur:', e.message); }
  return streams;
}
module.exports = { getStreams };
```

Export accepté : `module.exports.getStreams` (CommonJS) **ou** fonction globale `function getStreams(...)`.

## Format d'un objet stream

```js
{
  name: "MonProvider",              // libellé court
  title: "1080p Stream",            // affiché (requis, fallback = name)
  url: "https://server/...",        // requis — seul champ obligatoire
  quality: "1080p",                 // 4K, 1080p, 720p, CAM...
  headers: { "User-Agent": "...", "Referer": "...", "Cookie": "..." }, // envoyés au player
  size: "2.5GB",
  language: "en",
  provider: "source_name",
  type: "hls",                      // hls, mp4, mkv, mpd
  seeders: 42, peers: 10, infoHash: "..." // P2P/torrent
}
```

## Environnement disponible (QuickJS)

Globaux injectés :
- `fetch(url, options)` (polyfill natif), `URL`, `URLSearchParams`
- `console.*`, `atob`/`btoa`, `AbortController`/`AbortSignal`
- `cheerio` (via `require('cheerio')` → parsing type Jquery)
- `CryptoJS` (via `require('crypto-js')` → MD5, SHA*, AES, HMAC)
- `globalThis.TMDB_API_KEY`, `globalThis.SCRAPER_ID`, `globalThis.SCRAPER_SETTINGS`

Indisponible : `setTimeout`, `setInterval`, `Buffer`, `process`, `TextDecoder`, modules `require` autres que cheerio/crypto-js, système de fichiers.

## Pièges / limites

- **Timeouts** : TV 30s/requête, Mobile 60s/requête ; plugin limité à 60s au total.
  → paralléliser avec `Promise.allSettled`, éviter les chaînes séquentielles lentes.
- **Corps de réponse tronqué** à 256 KB (TV) / 1 MB (Mobile).
- `resp.json()` retourne `null` (pas de rejet) en cas d'échec de parse → toujours vérifier `if (!data)`.
- Pas de `setTimeout` → utiliser un délai par boucle si besoin.
- Les headers de niveau **fetch** ne vont pas au player ; seuls ceux du **stream** sont passés au player.
- Scrapers contenant "VideoEasy" dans id/nom/fichier = bloqués automatiquement.
- Versions Play Store de Nuvio : plugins désactivés. Seules les builds silloaded (full) les supportent.
- Code asynchrone : QuickJS supporte nativement async/await ; pour compat max, git target `es2020`.

## Tester localement (Node)

```bash
node -e "const {getStreams}=require('./providers/monprovider.js'); getStreams('550','movie').then(s=>console.log(JSON.stringify(s,null,2)))"
```

⚠️ V8 (Node) ≠ QuickJS (app) : toujours re-tester dans l'app (Settings → Plugin Tester).