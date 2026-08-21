'use strict';

// geojson-s2-service — Foxx wrapper around the geojson-s2 library.
//
// Two routes, no state, no collections: POST /validate and POST /repair. The
// service is mountable on any database; it is meant to sit in front of whatever
// collection receives third-party geometry (GeoService.Shapes, the portal's
// upload path) so that a shape is judged — and, where the fix is forced, mended —
// before it is stored. ArangoDB itself validates nothing on insert.

const createRouter = require('@arangodb/foxx/router');
const router = createRouter();
module.context.use(router);

router.use('/validate', require('./routes/validate'));   // POST — { geometry, warningsAsErrors? } → { ok, issues }
router.use('/repair',   require('./routes/repair'));     // POST — { geometry } → { geometry, changed[], ok, issues }
