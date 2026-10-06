const { getStreams } = require('./providers/alphavisionary.js');

globalThis.TMDB_API_KEY = process.env.TMDB_API_KEY || '';

async function run(label, fn) {
  try {
    const streams = await fn();
    console.log(`\n=== ${label} ===`);
    console.log('Streams trouvés:', streams.length);
    streams.forEach((s, i) => {
      console.log(`  [${i}] name=${JSON.stringify(s.name)}`);
      console.log(`      title:\n${s.title.split('\n').map(l => '        ' + l).join('\n')}`);
      console.log(`      ${s.url}`);
      console.log(`      headers: ${JSON.stringify(s.headers)}`);
    });
  } catch (e) {
    console.error(`\n=== ${label} ===`);
    console.error('ERREUR:', e.message);
  }
}

(async () => {
  await run('Film 863', () => getStreams('863', 'movie', null, null));
  await run('Film 1084244 (multi-sources)', () => getStreams('1084244', 'movie', null, null));
  await run('Série 1396 S01E01', () => getStreams('1396', 'tv', 1, 1));
  await run('Film inexistant 550', () => getStreams('550', 'movie', null, null));
})();