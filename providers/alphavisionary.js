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

async function getStreams(tmdbId, mediaType, season, episode) {
  var type = mediaType === 'tv' ? 'serie' : 'movie';
  var isMovie = mediaType !== 'tv';
  var url = BASE_URL + '/stream.php?type=' + type + '&id=' + encodeURIComponent(tmdbId);
  if (!isMovie) {
    url += '&season=' + (season || 1) + '&episode=' + (episode || 1);
  }

  var data = await fetchApi(url);
  if (!data || (data.status && data.status !== 'ok')) {
    console.log('[AlphaVisionary] ' + (data && data.message ? data.message : 'Aucun resultat.'));
    return [];
  }

  var label = isMovie ? 'Film' : 'S' + two(season || 1) + 'E' + two(episode || 1);
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
      name: 'AlphaVisionary',
      title: 'AlphaVisionary — ' + label + ' | Source : ' + (source || host),
      url: s.url,
      quality: '',
      language: 'fr',
      type: 'hls',
      headers: headers
    });
  });

  console.log('[AlphaVisionary] ' + results.length + ' stream(s) trouve(s).');
  return results;
}

module.exports = { getStreams: getStreams };