/** Shared HTML helpers re-exported from views/panels.ts.
 *  This file exists so that feature folders can pull common styles + helpers
 *  without forcing panels.ts to declare every helper as `export function`. */

import { commonStylesShared, loadingPageShared, escShared, fmtShared, headerIconShared } from '../../views/panels';

export const commonStyles = commonStylesShared;
export const loadingPage = loadingPageShared;
export const esc = escShared;
export const fmt = fmtShared;
export const headerIcon = headerIconShared;
