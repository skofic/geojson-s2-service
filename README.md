# geojson-s2-service

An ArangoDB **Foxx** service that puts [`geojson-s2`](https://github.com/skofic/geojson-s2) behind two HTTP routes, so a GeoJSON geometry can be **validated or repaired before it reaches a collection**. ArangoDB validates nothing on insert: a clockwise exterior ring is accepted and silently indexed as the complement of the intended area. This service is the gate.

Stateless — no collections, no configuration. Mountable on any database (the intended home is the `GeoService` database, in front of the `Shapes` collection the portal writes to).

## Routes

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/validate` | `{ geometry, warningsAsErrors? }` | `{ ok, errors, warnings, issues[] }` |
| POST | `/repair` | `{ geometry, warningsAsErrors? }` | `{ geometry, changed[], ok, errors, warnings, issues[] }` — the repaired geometry, the codes of the repairs applied (`[]` when nothing changed), and its post-repair verdict |

Each issue is `{ severity, code, path, message }`. Severity records what ArangoDB *does* with the fault — `error` = rejected or silently mis-indexed, `warning` = RFC-invalid but tolerated — see the [geojson-s2 README](https://github.com/skofic/geojson-s2#severity) for the full table.

`/repair` applies only the **forced** fixes (rewind a wrongly-wound ring, close an open ring, drop duplicate consecutive positions). Self-intersections and hole-containment faults are not repaired and come back as errors: a caller that stores the result must still check `ok`.

```sh
curl -s -u user:pass -X POST "http://localhost:8529/_db/GeoService/geojson/validate" \
  -H 'Content-Type: application/json' \
  -d '{"geometry":{"type":"Polygon","coordinates":[[[0,0],[0,1],[1,1],[1,0],[0,0]]]}}'
# → {"ok":false,"errors":1,"warnings":0,"issues":[{"severity":"error","code":"EXTERIOR_NOT_CCW",…}]}
```

## Install

```sh
git clone https://github.com/skofic/geojson-s2-service.git && cd geojson-s2-service
npm install --omit=dev            # pulls geojson-s2 from its GitHub tag into node_modules/
npm run bundle                    # → geojson-s2-service.zip (sources + node_modules)

# install (first time) / replace (upgrade) at a mount point — here /geojson on database GeoService
curl -s -u user:pass -X POST "http://localhost:8529/_db/GeoService/_api/foxx?mount=/geojson" -F "source=@geojson-s2-service.zip"
curl -s -u user:pass -X PUT  "http://localhost:8529/_db/GeoService/_api/foxx/service?mount=/geojson" -F "source=@geojson-s2-service.zip"

# run its tests
curl -s -u user:pass -X POST "http://localhost:8529/_db/GeoService/_api/foxx/tests?mount=/geojson"
```

Foxx resolves `require('geojson-s2')` from the `node_modules/` shipped inside the bundle; nothing is installed server-side. To take a new `geojson-s2` release, bump the pin in `package.json`, `npm install`, re-bundle, re-install.

## Policy is the caller's

The service judges and mends; it does not decide. Whether a portal upload is **rejected** on any issue, **auto-repaired** for the forced fixes and rejected only on remaining errors, or accepted with warnings, is the calling application's policy — `MILKO.md` records the options and the current recommendation.
