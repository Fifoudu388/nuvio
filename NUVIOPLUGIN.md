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

## Scraper réalisé : AlphaVisionary (α-visionary.xo.je)

Repo : `https://github.com/Fifoudu388/nuvio` — manifest : `.../refs/heads/master/manifest.json`

### API
- Films : `GET https://alpha-visionary.xo.je/stream.php?type=movie&id=<tmdbId>` → `{"status":"ok","streams":[{"url":"https://finepulfe.xyz/..."}]}`
- Séries : `?type=serie&id=<tmdbId>&season=N&episode=M` (le type `tv` = chaînes live, inutilisable)
- Parfois plusieurs URLs dans `streams` → on **saute les liens embed** (`/embed/` ou host `embed.*`) et on affiche les autres.

### Anti-bot (obligatoire pour cette API)
1. Sans cookie, l'API renvoie une page HTML de challenge :
   `var a=toNumbers("<hex>"),b=toNumbers("<hex>"),c=toNumbers("<hex>")`
   (a = clé, b = IV, c = ciphertext, mode CBC temps AES-128).
2. Cookie = `__test=<hex(aes-128-cbc-decrypt(c, key=a, iv=b))>` (NoPadding, chiffré sur 1 bloc).
3. Relancer la requête avec `Cookie: __test=...`.
- Implémentation : `CryptoJS.AES.decrypt({ciphertext: Hex.parse(c)}, Hex.parse(a), {iv: Hex.parse(b), mode: CBC, padding: NoPadding})`.
- ⚠️ Piège regex : `/toNumbers\("([0-9a-f]+)"\)/` matche `be` dans le mot `toNumbers` → toujours utiliser une boucle `exec` avec groupe de capture, pas `str.match(...)[N]`.
- NB : clés `a`/`b` fixes sur ce site (`f655ba...` / `9834...`), seul `c` change par requête.

### Sources & headers
- `vdohls.com` → **403 sans** `Origin: https://fembed.co` + `Referer: https://fembed.co/` (et **403 avec** un mauvais referer) → label `Source : VDO`
- `*.finepulfe.xyz` → **marche SANS referer** (un referer = 403) → label `Source : Pur`

### Affichage style Purstream (important pour l'UX)
Nuvio affiche `name` + `language`. Format "propre" constaté sur Porstream (`All-in-One-Nuvio/providers/purstream.js`) :
- Champ `name` = label court (ex. `Source : Pur`) — remplace le nom du provider.
- Champ `title`/`description`/`size` = **chaîne multi-lignes** avec `\n`.
- `quality: ''`, `language: ''` (sinon allergies au `fr` parasite), `format`, `headers`.
- **Qualité** : l'API ne la donne pas → on la détecte en lisant le `RESOLUTION` du master playlist m3u8 (regex `/RESOLUTION=(\d+)x(\d+)/g`, hauteur max → 2160p/1080p/720p/480p/360p). 1 requête extra par stream (en parallèle via `Promise.all`, cache par URL). Si la playlist est bloquée → `quality: ''`, la détection ne plante jamais.
- Titre/année/durée : récupérés via TMDB → `GET https://api.themoviedb.org/3/{movie|tv}/{id}?api_key=<globalThis.TMDB_API_KEY>&language=fr-FR` (key dispo en app, pas en local).
- Fallback si pas de clé TMDB : ligne 1 = `Film` ou `Sxx Exx`.

**Position exacte des infos dans l'objet stream** (ce qu'un scraper doit retourner) :
```js
{
  name:        "Source : VDO",          // petit label affiché à côté du fournisseur ("VDO"/"Pur")
  title:       "Marsupilami - 2026\nSource : VDO\nM3U8 | 99 min",  // ligne 1 = titre, puis lignes affichées par Nuvio
  size:        "Marsupilami - 2026\nSource : VDO\nM3U8 | 99 min",  // pareil que title (pattern Purstream)
  description: "Marsupilami - 2026\nSource : VDO\nM3U8 | 99 min",  // pareil que title (pattern Purstream)
  url:         "https://vdohls.com/.../playlist.m3u8",
  quality:     "1080p",                // détecté depuis le RESOLUTION du playlist ; "" si indisponible
  language:    "",                        // VIDE = évite le "fr" parasite
  format:      "m3u8",
  headers:     { "User-Agent": "...", "Origin": "https://fembed.co", "Referer": "https://fembed.co/" }
}
```
Nuvio rend le `\n` comme des retours à la ligne → l'utilisateur voit :
```
Marsupilami - 2026        ← lignes du champ title/description
Source : VDO
M3U8 | 99 min
```

### Test local
`npm test` (test.js) ; clé TMDB optionnelle via env `TMDB_API_KEY`.