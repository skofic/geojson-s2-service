'use strict';
const createRouter = require('@arangodb/foxx/router');
const joi = require('joi');
const { validateGeometry, repairGeometry, SEVERITY } = require('geojson-s2');
const router = createRouter();
const MOUNT = module.context.mount;

const bodySchema = joi.object({
    geometry:         joi.any().required().description('A GeoJSON geometry object (RFC 7946)'),
    warningsAsErrors: joi.boolean().default(false).description('Strictness of the `ok` verdict on the repaired geometry')
}).required();

router.post('/', function (req, res) {
    const { geometry, warningsAsErrors } = req.body;
    const { geometry: repaired, changed } = repairGeometry(geometry);
    const { ok, issues } = validateGeometry(repaired, { warningsAsErrors });
    res.json({
        geometry: repaired,
        changed,
        ok,
        errors:   issues.filter(i => i.severity === SEVERITY.ERROR).length,
        warnings: issues.filter(i => i.severity === SEVERITY.WARNING).length,
        issues
    });
})
.body(bodySchema, 'Geometry to repair')
.response(['application/json'], '`{ geometry, changed[], ok, errors, warnings, issues[] }` — the repaired geometry, the codes of the repairs applied, and the post-repair verdict')
.summary('Apply the forced repairs to a GeoJSON geometry, then validate it')
.description(
    'Applies only the repairs that have exactly one correct reading, so nothing can be lost: rewind a ' +
    'wrongly-wound ring, close an open ring, drop duplicate consecutive positions. Idempotent; the input ' +
    'is never mutated. Self-intersection and hole containment are **not** repaired — they have no single ' +
    'correct interpretation — so the returned `issues` may still contain errors; callers must check `ok` ' +
    'and refuse the geometry if it is false.\n\n' +
    '**Example**\n\n' +
    '```\n' +
    'POST ' + MOUNT + '/repair\n' +
    '{ "geometry": { "type": "Polygon", "coordinates": [[[0,0],[0,1],[1,1],[1,0],[0,0]]] } }\n' +
    '```\n' +
    'The clockwise square comes back counter-clockwise with `changed: ["EXTERIOR_NOT_CCW"], ok: true`; a clean geometry returns `changed: []`.'
);

module.exports = router;
