// Loaded in <head> of every extension page, before the styles: sets the theme from the mirror so
// the first paint is already right.
import { applyTheme, readMirror } from '../ui/theme';

applyTheme(document, readMirror(document));
