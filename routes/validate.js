'use strict';
const createRouter = require('@arangodb/foxx/router');
const joi = require('joi');
const { validateGeometry, SEVERITY } = require('geojson-s2');
const router = createRouter();
const MOUNT = module.context.mount;   // live mount path — keeps the doc examples in sync with the actual mount

// The request body is the GeoJSON geometry itself plus one optional flag. The
// geometry is validated by geojson-s2, not by joi: joi only checks that we were
// handed an object, so that a malformed body yields a clean 400 rather than an
// issue list about `NOT_AN_OBJECT`.
const bodySchema = joi.object({
    geometry:         joi.any().required().description('A GeoJSON geometry object (RFC 7946): Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon or GeometryCollection'),
    warningsAsErrors: joi.boolean().default(false).description('When true, warnings also make `ok` false (strict mode — for authoring, not ingestion)')
}).required();

router.post('/', function (req, res) {
    const { geometry, warningsAsErrors } = req.body;
    const { ok, issues } = validateGeometry(geometry, { warningsAsErrors });
    res.json({
        ok,
        errors:   issues.filter(i => i.severity === SEVERITY.ERROR).length,
        warnings: issues.filter(i => i.severity === SEVERITY.WARNING).length,
        issues
    });
})
.body(bodySchema, 'Geometry to validate')
.response(['application/json'], '`{ ok, errors, warnings, issues[] }` — each issue is `{ severity, code, path, message }`')
.summary('Validate a GeoJSON geometry for Google S2 / ArangoDB')
.description(
    'Runs geojson-s2 over the geometry and reports every issue. Severity records what ArangoDB *does* ' +
    'with the fault: `error` = rejected or silently mis-indexed (a clockwise exterior ring is accepted and ' +
    'indexed as the complement of the intended area, with no error anywhere); `warning` = RFC 7946 says ' +
    'malformed, ArangoDB tolerates it. `ok` is false on any error, or on any warning when ' +
    '`warningsAsErrors` is true.\n\n' +
    '**Example**\n\n' +
    '```\n' +
    'POST ' + MOUNT + '/validate\n' +
    '{ "geometry": { "type": "Polygon", "coordinates": [[[0,0],[1,0],[1,1],[0,1],[0,0]]] } }\n' +
    '```\n' +
    'Returns `{ "ok": true, "errors": 0, "warnings": 0, "issues": [] }`. The same square wound clockwise ' +
    'returns `ok: false` with an `EXTERIOR_NOT_CCW` issue.'
);

module.exports = router;
