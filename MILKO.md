# geojson-s2-service — maintainer notes

Foxx wrapper around the `geojson-s2` library (<https://github.com/skofic/geojson-s2>). Two POST routes, no state. Scaffolded 2026-08-21 as part of extracting `geojson-s2` and the dictionary validator out of `metadata-store` into standalone, pinned dependencies.

## Why a service, when the library runs anywhere

The library already runs in Node (the `metadata-external-databases` delivery gate) and in the dictionary validator. The service exists for the one consumer that cannot `require` it: the **portal**, which submits a shape to the database from the browser and needs a verdict before the document is written. Putting the gate inside the database also means the rule is enforced no matter which client writes — the `Shapes` collection stays valid by construction, not by convention.

## Layout

```
manifest.json        Foxx manifest (main, tests glob)
package.json         the geojson-s2 pin + the `bundle` script
main.js              mounts routes/validate and routes/repair
routes/validate.js   POST /validate — validateGeometry(geometry, { warningsAsErrors })
routes/repair.js     POST /repair   — repairGeometry, then validateGeometry on the result
test/validate.js     mocha (Foxx test runner): CCW passes, CW → EXTERIOR_NOT_CCW, duplicate vertex is a
                     warning unless strict, 400 on missing geometry; repair rewinds / closes / leaves clean
                     geometry alone / refuses to guess at a bow-tie
```

Pattern copied from `metadata-store-service` (`createRouter`, `joi` body schema, `MOUNT = module.context.mount` in doc strings, `@arangodb/request` in tests).

## Build, install, test

```sh
npm install --omit=dev && npm run bundle          # geojson-s2-service.zip with node_modules inside
# install / replace / test — substitute database and mount
curl -s -u user:pass -X POST "http://localhost:8529/_db/<db>/_api/foxx?mount=/geojson"           -F "source=@geojson-s2-service.zip"
curl -s -u user:pass -X PUT  "http://localhost:8529/_db/<db>/_api/foxx/service?mount=/geojson"   -F "source=@geojson-s2-service.zip"
curl -s -u user:pass -X POST "http://localhost:8529/_db/<db>/_api/foxx/tests?mount=/geojson"
```

Verification (2026-08-21): bundled, installed from the zip into the local `metadata` database at `/geojson`, 8/8 Foxx tests passed, both routes curl-checked, then uninstalled again (`DELETE /_api/foxx/service?mount=/geojson`) — it is not meant to live there. The intended home is the `GeoService` database; mounting it there is a follow-up decision, not part of the scaffold. Unlike `metadata-store-service`, it is **not** mounted from a working directory.

Foxx notes: Foxx has no `fs`, no ESM, no Node `crypto` — `geojson-s2` uses none of them, which is the whole reason it can live here. Dependencies are **bundled**, never installed on the server; the zip must contain `node_modules/geojson-s2`.

## Taking a new geojson-s2 release

1. Bump `"geojson-s2": "github:skofic/geojson-s2#vX.Y.Z"` in `package.json`; `npm install`.
2. Run the Foxx tests after re-installing; bump `version` in `manifest.json`/`package.json`; tag.

## Open — the portal policy (not decided here)

The service returns a verdict and a repaired geometry; what the portal does with them is the next plan. The options, from strictest to most forgiving:

| Policy | Behaviour | When it fits |
|---|---|---|
| Reject on any issue | `POST /validate` with `warningsAsErrors: true`; store only if `ok` | authoring a standard; the user must fix the file |
| Repair-then-judge (**recommended for the portal**) | `POST /repair`; store the **returned** geometry if `ok`; show the `issues` list as what was changed / what is still wrong | third-party shapes: the forced fixes are safe and invisible, genuine faults are still refused |
| Accept with warnings | `POST /validate`, store if `ok` (warnings tolerated) | bulk ingestion that must not stall — this is what the external-databases delivery gate does |

Also to decide: where the call is made (the portal's own backend, or a Foxx route on the `GeoService` service that wraps the write and calls this service internally), and whether the original geometry is kept alongside the repaired one for audit.
