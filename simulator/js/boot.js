// Titik masuk: tampilkan menu awal, atau muat simulator bila pengaturan sudah ada di URL.
import { readSettings } from './settings.js';

const s = readSettings();
if (s.started) import('./main.js');
else import('./menu.js').then((m) => m.showMenu(s));
