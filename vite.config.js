import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// CrazyGames verlangt, dass ihr SDK aus deren CDN geladen wird (nicht gebündelt).
// Dieses Plugin injiziert das Script-Tag NUR im crazygames-Modus in den <head>.
// Der normale Web-Build erzeugt dadurch eine byte-identische index.html wie
// zuvor — der Modus-Guard sorgt dafür, dass hier sonst nichts passiert.
function crazygamesSdk(isCrazygames) {
  return {
    name: 'crazygames-sdk-inject',
    transformIndexHtml(html) {
      if (!isCrazygames) return html;
      return html.replace(
        '</head>',
        '  <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n  </head>',
      );
    },
  };
}

// Build erzeugt eine einzelne HTML-Datei mit eingebettetem JS/CSS,
// die auch per Doppelklick (file://) funktioniert.
export default defineConfig(({ mode }) => {
  const isCrazygames = mode === 'crazygames';
  return {
    base: './',
    publicDir: 'assets',
    // Hinweis: Der CrazyGames-Build enthält BEWUSST die Supabase-URL + den
    // öffentlichen anon/publishable Key (aus `.env.local`). Der eigene
    // E-Mail/Passwort-Login bleibt dort aus (siehe cloud.js), aber der
    // Broadcast-Koop nutzt einen anon-Realtime-Client (siehe coopCrazy.js).
    // Der anon-Key ist ein öffentlicher Client-Schlüssel und steckt ohnehin im
    // Web-Bundle — es werden hier keine geheimen Zugangsdaten eingebettet.
    // JS und CSS bleiben bequem in einer HTML-Datei. Große Medien werden als
    // eigene, cachebare Dateien ausgegeben statt als teures Base64 im Bundle.
    plugins: [
      viteSingleFile({ inlinePattern: ['**/*.js', '**/*.css'] }),
      crazygamesSdk(isCrazygames),
    ],
  };
});
