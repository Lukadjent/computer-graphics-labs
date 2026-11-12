// Перевірка геометричних властивостей і меж викликів WebGL: node tools/check.cjs
const assert = require('node:assert/strict');
const { Model, surfacePoint, createSurfaceGeometry } = require('../Model.js');
const close = (a, b, eps = 1e-5) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const p = { a: 1, b: 2, n: 2 };
// Незалежні опорні значення з формул: u = 0 та u = π/2.
surfacePoint(0, 0.75, p).forEach((value, i) => close(value, [1, 0.75, 2][i]));
surfacePoint(Math.PI / 2, 0.75, p).forEach((value, i) => close(value, [-0.75, 1, -2][i]));

for (const n of [1, 2, 5, 8]) {
    const g = createSurfaceGeometry({ n });
    // Кожна U-крива замкнена, діапазони покривають буфер без пропусків.
    let end = 0;
    for (const range of g.uRanges) {
        assert.equal(range.first, end);
        const start = range.first * 3;
        const finish = (range.first + range.count - 1) * 3;
        for (let axis = 0; axis < 3; axis++) close(g.uVertices[start + axis], g.uVertices[finish + axis]);
        end += range.count;
    }
    assert.equal(end * 3, g.uVertices.length);
    // V-полілінії лежать на прямих: середина відрізка дорівнює середньому кінців.
    for (const { first, count } of g.vRanges) {
        for (let j = 0; j < count; j++) {
            for (let axis = 0; axis < 3; axis++) {
                const a = g.vVertices[first * 3 + axis];
                const b = g.vVertices[(first + count - 1) * 3 + axis];
                close(g.vVertices[(first + j) * 3 + axis], a + (b - a) * j / (count - 1));
            }
        }
    }
    for (const array of [g.uVertices, g.vVertices]) assert.ok(array.every(Number.isFinite));
}
assert.throws(() => createSurfaceGeometry({ n: 1.5 }));
assert.throws(() => createSurfaceGeometry({ vMin: 2, vMax: -2 }));
assert.throws(() => createSurfaceGeometry({ a: NaN }));

// Перевіряємо, що Model надсилає окремі LINE_STRIP з коректними межами.
const calls = [];
let bound;
const gpu = new Map();
const gl = {
    ARRAY_BUFFER: 34962, STATIC_DRAW: 35044, FLOAT: 5126, LINE_STRIP: 3,
    createBuffer: () => ({}), bindBuffer: (_, buffer) => { bound = buffer; },
    bufferData: (_, data) => gpu.set(bound, data.length / 3),
    vertexAttribPointer() {}, enableVertexAttribArray() {}, uniform4fv() {},
    drawArrays(mode, first, count) {
        assert.equal(mode, this.LINE_STRIP);
        assert.ok(first >= 0 && first + count <= gpu.get(bound));
        calls.push({ buffer: bound, first, count });
    }
};
const model = new Model(gl);
model.Draw({ iAttribVertex: 0, iColor: 0 }, true, false);
assert.equal(calls.length, model.uRanges.length);
assert.ok(calls.every(call => call.buffer === model.uBuffer));
calls.length = 0;
model.Draw({ iAttribVertex: 0, iColor: 0 }, false, true);
assert.equal(calls.length, model.vRanges.length);
assert.ok(calls.every(call => call.buffer === model.vBuffer));
console.log('OK: формули, замикання U, прямолінійність V, валідація, межі LINE_STRIP.');
