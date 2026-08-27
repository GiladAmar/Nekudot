// Explicit whole-page entry: injected by the "Add nikud to the whole page"
// menu item into every reachable frame. Deliberately ignores any selection —
// the user asked for the whole page, and a stray surviving selection must
// not narrow the scope.
import {runWholePage} from './content_runtime.mjs';

runWholePage();
