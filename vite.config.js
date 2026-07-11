import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Build erzeugt eine einzelne HTML-Datei mit eingebettetem JS/CSS,
// die auch per Doppelklick (file://) funktioniert.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
});
