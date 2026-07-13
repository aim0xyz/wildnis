import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Build erzeugt eine einzelne HTML-Datei mit eingebettetem JS/CSS,
// die auch per Doppelklick (file://) funktioniert.
export default defineConfig({
  base: './',
  publicDir: 'assets',
  // JS und CSS bleiben bequem in einer HTML-Datei. Große Medien werden als
  // eigene, cachebare Dateien ausgegeben statt als teures Base64 im Bundle.
  plugins: [viteSingleFile({ inlinePattern: ['**/*.js', '**/*.css'] })],
});
