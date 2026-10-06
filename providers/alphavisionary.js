var BASE_URL = 'https://alpha-visionary.xo.je';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

var CryptoJS = null;
try {
  CryptoJS = require('crypto-js');
} catch (e) {
  console.warn('[AlphaVisionary] CryptoJS indisponible, impossible de resoudre le challenge anti-bot.');
}

function aesToHex(keyHex, ivHex, ctHex) {
  var key = CryptoJS.enc.Hex.parse(keyHex);
  var iv = CryptoJS.enc.Hex.parse(ivHex);
  var ct = CryptoJS.enc.Hex.parse(ctHex);
  var plain = CryptoJS.AES.decrypt({ ciphertext: ct }, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.NoPadding
  });
  return plain.toString(CryptoJS.enc.Hex);
}

function isChallenge(html) {
  return html.indexOf('slowAES') !== -1 && html.indexOf('__test') !== -1;
}

function solveChallenge(html) {
  if (!CryptoJS) return null;
  var re = /toNumbers\("([0-9a-f]+)"\)/g;
  var m;
  var hex = [];
  while ((m = re.exec(html)) !== null) hex.push(m[1]);
  if (hex.length < 3 || !hex[0] || !hex[1] || !hex[2]) return null;
  var cookie = aesToHex(hex[0], hex[1], hex[2]);
  return cookie ? '__test=' + cookie : null;
}

function getHost(url) {
  try { return new URL(url).hostname; } catch (e) { return ''; }
}

function isEmbed(url) {
  return url.indexOf('/embed/') !== -1 || /embed\./.test(getHost(url));
}

function two(n) {
  return n < 10 ? '0' + n : '' + n;
}

async function fetchApi(url) {
  var body = null;
  for (var attempt = 0; attempt < 2; attempt++) {
    var resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!resp.ok) {
      console.error('[AlphaVisionary] HTTP ' + resp.status);
      return null;
    }
    body = await resp.text();
    if (!isChallenge(body)) break;
    var cookie = solveChallenge(body);
    if (!cookie) {
      console.error('[AlphaVisionary] Challenge anti-bot non resolu.');
      return null;
    }
    resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Cookie': cookie } });
    if (!resp.ok) {
      console.error('[AlphaVisionary] HTTP ' + resp.status + ' apres challenge.');
      return null;
    }
    body = await resp.text();
    break;
  }
  try {
    return JSON.parse(body);
  } catch (e) {
    console.error('[AlphaVisionary] Reponse non JSON.');
    return null;
  }
}

async function tmdbMeta(id, mediaType) {
  var key = globalThis.TMDB_API_KEY || '';
  if (!key) return {};
  var kind = mediaType === 'tv' ? 'tv' : 'movie';
  try {
    var resp = await fetch('https://api.themoviedb.org/3/' + kind + '/' + encodeURIComponent(id) + '?api_key=' + key + '&language=fr-FR', { headers: { 'User-Agent': USER_AGENT } });
    if (!resp.ok) return {};
    var d = await resp.json();
    if (!d) return {};
    if (mediaType === 'tv') {
      return {
        title: d.name || '',
        year: d.first_air_date ? d.first_air_date.slice(0, 4) : '',
        duration: d.episode_run_time && d.episode_run_time.length ? d.episode_run_time[0] : 0
      };
    }
    return {
      title: d.title || '',
      year: d.release_date ? d.release_date.slice(0, 4) : '',
      duration: d.runtime || 0
    };
  } catch (e) {
    console.warn('[AlphaVisionary] TMDB indisponible : ' + e.message);
    return {};
  }
}

function buildTitle(meta, isMovie, season, episode, source, quality) {
  var line1;
  if (isMovie) {
    line1 = meta.title ? meta.title + (meta.year ? ' - ' + meta.year : '') : 'Film';
  } else {
    line1 = 'S' + two(season || 1) + ' E' + two(episode || 1) + (meta.title ? ' - ' + meta.title : '');
  }
  var line2 = 'Source : ' + source;
  var line3 = 'M3U8';
  if (quality) line3 += ' | ' + quality;
  if (meta.duration) line3 += ' | ' + meta.duration + ' min';
  return line1 + '\n' + line2 + '\n' + line3;
}

var qualityCache = {};

function qualityFromResolution(height) {
  if (height >= 2000) return '2160p';
  if (height >= 1000) return '1080p';
  if (height >= 700) return '720p';
  if (height >= 480) return '480p';
  if (height >= 360) return '360p';
  return '';
}

async function detectQuality(url, headers) {
  if (qualityCache[url] !== undefined) return qualityCache[url];
  qualityCache[url] = '';
  try {
    var resp = await fetch(url, { headers: headers });
    if (!resp.ok) return '';
    var text = await resp.text();
    var m;
    var max = 0;
    var re = /RESOLUTION=(\d{2,5})x(\d{2,5})/g;
    while ((m = re.exec(text)) !== null) {
      var h = parseInt(m[2], 10);
      if (h > max) max = h;
    }
    qualityCache[url] = qualityFromResolution(max);
    return qualityCache[url];
  } catch (e) {
    console.warn('[AlphaVisionary] Qualite indisponible pour ' + url + ' : ' + e.message);
    return '';
  }
}

async function getStreams(tmdbId, mediaType, season, episode) {
  var type = mediaType === 'tv' ? 'serie' : 'movie';
  var isMovie = mediaType !== 'tv';
  var url = BASE_URL + '/stream.php?type=' + type + '&id=' + encodeURIComponent(tmdbId);
  if (!isMovie) {
    url += '&season=' + (season || 1) + '&episode=' + (episode || 1);
  }

  var metaPromise = tmdbMeta(tmdbId, mediaType);
  var data = await fetchApi(url);
  var meta = await metaPromise;
  if (!data || (data.status && data.status !== 'ok')) {
    console.log('[AlphaVisionary] ' + (data && data.message ? data.message : 'Aucun resultat.'));
    return [];
  }

  var results = [];
  (data.streams || []).forEach(function (s) {
    if (!s || !s.url) return;
    if (isEmbed(s.url)) {
      console.log('[AlphaVisionary] Lien embed ignore : ' + s.url);
      return;
    }
    var host = getHost(s.url);
    var headers = { 'User-Agent': USER_AGENT };
    var source = '';
    if (host.indexOf('vdohls.com') !== -1) {
      source = 'VDO';
      headers['Origin'] = 'https://fembed.co';
      headers['Referer'] = 'https://fembed.co/';
    } else if (host.indexOf('finepulfe.xyz') !== -1) {
      source = 'Pur';
    }
    results.push({
      name: 'Source : ' + (source || host),
      title: '',
      size: '',
      description: '',
      url: s.url,
      quality: '',
      language: '',
      format: 'm3u8',
      headers: headers,
      _source: source || host
    });
  });

  var probes = results.map(function (r) { return detectQuality(r.url, r.headers); });
  var qualities = await Promise.all(probes);
  qualities.forEach(function (q, i) {
    results[i].quality = q;
    var display = buildTitle(meta, isMovie, season, episode, results[i]._source, q);
    results[i].title = display;
    results[i].size = display;
    results[i].description = display;
  });
  results.forEach(function (r) { delete r._source; });

  console.log('[AlphaVisionary] ' + results.length + ' stream(s) trouve(s).');
  return results;
}

module.exports = { getStreams: getStreams };