/** App version. Must match package.json and any version-tracked notes (tools/check.mjs enforces it). */
export const VERSION = '0.3.0';

/**
 * Version of the parsed-match data shape passed from the demo reader (worker) to the screen.
 * Bump only when that shape changes in a breaking way.
 */
export const MATCH_FORMAT = 2;
