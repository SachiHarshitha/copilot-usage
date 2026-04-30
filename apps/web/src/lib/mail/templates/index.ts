/**
 * Single import that registers every shipping mail template. The SMTP
 * service looks templates up by id; importing this module once at boot
 * guarantees every id is resolvable.
 *
 * Tests that need an isolated registry call `_resetMailTemplates()` from
 * `../templates` and register their own fakes.
 */

import './admin';
import './user';
