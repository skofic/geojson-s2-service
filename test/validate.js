/*global describe, it */
'use strict';

// Tests for POST /validate and POST /repair. No fixtures, no collections: the
// service is stateless, so every case is a literal geometry.

const { expect } = require('chai');
const request = require('@arangodb/request');
const baseUrl = module.context.baseUrl;

const CCW_SQUARE = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
const CW_SQUARE  = { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] };
const OPEN_RING  = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] };
const BOW_TIE    = { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] };
const DUP_VERTEX = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };

function post(path, body) {
    const res = request.post(`${baseUrl}${path}`, { json: true, body });
    return { status: res.status, body: res.json };
}

describe('/validate', function () {

    it('accepts a counter-clockwise square', function () {
        const { status, body } = post('/validate', { geometry: CCW_SQUARE });
        expect(status).to.equal(200);
        expect(body.ok).to.equal(true);
        expect(body.issues).to.be.an('array').that.is.empty;
    });

    it('rejects a clockwise exterior ring with EXTERIOR_NOT_CCW', function () {
        const { status, body } = post('/validate', { geometry: CW_SQUARE });
        expect(status).to.equal(200);
        expect(body.ok).to.equal(false);
        expect(body.issues.map(i => i.code)).to.include('EXTERIOR_NOT_CCW');
    });

    it('tolerates a duplicate vertex unless warningsAsErrors is set', function () {
        let r = post('/validate', { geometry: DUP_VERTEX });
        expect(r.body.ok).to.equal(true);
        expect(r.body.warnings).to.equal(1);
        expect(r.body.issues.map(i => i.code)).to.include('RING_DUPLICATE_POSITION');
        r = post('/validate', { geometry: DUP_VERTEX, warningsAsErrors: true });
        expect(r.body.ok).to.equal(false);
    });

    it('returns 400 when the body has no geometry', function () {
        const { status } = post('/validate', {});
        expect(status).to.equal(400);
    });

});

describe('/repair', function () {

    it('rewinds a clockwise square and names the repair', function () {
        const { status, body } = post('/repair', { geometry: CW_SQUARE });
        expect(status).to.equal(200);
        expect(body.changed).to.deep.equal(['EXTERIOR_NOT_CCW']);
        expect(body.ok).to.equal(true);
        expect(body.geometry.coordinates[0]).to.deep.equal(CCW_SQUARE.coordinates[0]);
    });

    it('closes an open ring', function () {
        const { body } = post('/repair', { geometry: OPEN_RING });
        expect(body.changed).to.include('RING_NOT_CLOSED');
        expect(body.ok).to.equal(true);
        const ring = body.geometry.coordinates[0];
        expect(ring[0]).to.deep.equal(ring[ring.length - 1]);
    });

    it('leaves a clean geometry alone', function () {
        const { body } = post('/repair', { geometry: CCW_SQUARE });
        expect(body.changed).to.be.an('array').that.is.empty;
        expect(body.geometry).to.deep.equal(CCW_SQUARE);
    });

    it('does not repair a self-intersection and says so', function () {
        const { body } = post('/repair', { geometry: BOW_TIE });
        expect(body.ok).to.equal(false);
        expect(body.issues.map(i => i.code)).to.include('RING_SELF_INTERSECTS');
    });

});
