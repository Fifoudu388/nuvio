const { getStreams } = require('./providers/alphavisionary.js');

async function run(label, fn) {
  try {
    const streams = await fn();
    console.log(`\n=== ${label} ===`);
    console.log('Streams trouvés:', streams.length);
    streams.forEach((s, i) => console.log(`  [${i}] ${s.title} -> ${s.url}`));
  } catch (e) {
    console.error(`\n=== ${label} ===`);
    console.error('ERREUR:', e.message);
  }
}

(async () => {
  await run('Film 863', () => getStreams('863', 'movie', null, null));
  await run('Série 1396 S01E01', () => getStreams('1396', 'tv', 1, 1));
  await run('Film inexistant 550', () => getStreams('550', 'movie', null, null));
})();