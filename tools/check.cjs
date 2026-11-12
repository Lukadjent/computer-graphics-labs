// Перевірки геометрії та індексованого малювання: node tools/check.cjs
const assert = require('node:assert/strict');
const { Model, surfacePoint, surfaceTangent, createSurfaceGeometry, calculateAreaWeightedNormals } = require('../Model.js');
const close = (a, b, eps = 1e-5) => assert.ok(Math.abs(a - b) < eps, a + ' != ' + b);
const p = { a: 1, b: 2, n: 2 };
surfacePoint(0, 0.75, p).forEach((x, i) => close(x, [1, 0.75, 2][i]));
surfacePoint(Math.PI / 2, 0.75, p).forEach((x, i) => close(x, [-0.75, 1, -2][i]));

// Дві перпендикулярні грані з площами 1 та 3: звичайне усереднення дасть інший результат.
const weighted = calculateAreaWeightedNormals(
    [0,0,0, 2,0,0, 0,1,0, 0,0,3], [0,1,2, 0,1,3]);
close(weighted[0], 0);
close(weighted[1], -3 / Math.sqrt(10));
close(weighted[2], 1 / Math.sqrt(10));

for (const parameters of [{}, { n: 1 }, { n: 5 }, { n: 8 },
    { uSegments: 16, vSegments: 2 }, { uSegments: 256, vSegments: 80 },
    { a: 0, b: 0.1, n: 1, vMin: -6, vMax: 6 },
    { a: 0, b: 1, n: 1, vMin: -1, vMax: 1 }]) {
    const g = createSurfaceGeometry(parameters);
    const { uSegments: nu, vSegments: nv } = g.parameters;
    const stride = nu + 1;
    assert.equal(g.positions.length / 3, stride * (nv + 1));
    assert.equal(g.normals.length, g.positions.length);
    assert.equal(g.tangents.length, g.positions.length);
    assert.equal(g.texCoords.length, g.positions.length / 3 * 2);
    assert.equal(g.indices.length, 6 * nu * nv);
    assert.ok(g.indices instanceof Uint16Array);
    const adjacency = new Uint16Array(g.positions.length / 3);
    for (const index of g.indices) {
        assert.ok(index < adjacency.length);
        adjacency[index]++;
    }
    // Фізична суміжність PA2 зберігається після розрізу UV-шва.
    for (let j = 0; j <= nv; j++) {
        for (let i = 0; i < nu; i++) {
            const total = adjacency[j * stride + i] + (i === 0 ? adjacency[j * stride + nu] : 0);
            assert.equal(total, j === 0 || j === nv ? 3 : 6);
        }
        for (const data of [g.positions, g.normals, g.tangents])
            assert.deepEqual(data.slice(j*stride*3, j*stride*3+3),
                data.slice((j*stride+nu)*3, (j*stride+nu)*3+3));
        assert.equal(g.texCoords[j*stride*2], 0);
        assert.equal(g.texCoords[(j*stride+nu)*2], 1);
    }
    for (let i = 0; i < g.normals.length; i += 3)
        close(Math.hypot(...g.normals.subarray(i, i + 3)), 1);
    for (let i = 0; i < g.tangents.length; i += 3)
        close(Math.hypot(...g.tangents.subarray(i, i + 3)), 1);
    for (const data of [g.positions, g.normals, g.tangents, g.texCoords]) assert.ok(data.every(Number.isFinite));
    // Жоден трикутник не інтерполює UV через усю текстуру на шві.
    for (let k = 0; k < g.indices.length; k += 3) {
        const s = Array.from(g.indices.slice(k, k+3), index => g.texCoords[index*2]);
        close(Math.max(...s)-Math.min(...s), 1/nu);
    }
    for (const index of g.wireIndices) assert.ok(index < adjacency.length);
}
// Перевірка орієнтації за незалежним аналітичним Pu × Pv у регулярних точках.
const g = createSurfaceGeometry();
for (let j = 0; j <= 20; j++) {
    const v = -1.5 + 3 * j / 20;
    for (let i = 0; i < 96; i++) {
        const u = 2 * Math.PI * i / 96;
        const analytic = [4 * Math.sin(2 * u) * Math.cos(u), 4 * Math.sin(2 * u) * Math.sin(u), 4 * Math.cos(2 * u) - v];
        const len = Math.hypot(...analytic);
        const dot = analytic.reduce((sum, x, k) => sum + x / len * g.normals[(j * 97 + i) * 3 + k], 0);
        assert.ok(dot > 0.97);
    }
}
// Незалежна чисельна похідна: дотична відповідає саме +u, не +v.
for (const u of [0, 0.38, 1.7, 4.2, 2*Math.PI]) for (const v of [-1.5, 0, 1.5]) {
    const eps = 1e-6, before = surfacePoint(u-eps,v,p), after = surfacePoint(u+eps,v,p);
    surfaceTangent(u,v,p).forEach((value,axis) => close(value,(after[axis]-before[axis])/(2*eps)));
}
assert.throws(() => createSurfaceGeometry({ n: 1.5 }));
assert.throws(() => createSurfaceGeometry({ vMin: 2, vMax: -2 }));
assert.throws(() => createSurfaceGeometry({ a: NaN }));
assert.throws(() => createSurfaceGeometry({ uSegments: 257 }));

const bound = new Map(), gpu = new Map(), attributes = new Map(), calls = [];
const gl = {
    ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963, STATIC_DRAW: 35044,
    FLOAT: 5126, TRIANGLES: 4, LINES: 1, UNSIGNED_SHORT: 5123,
    createBuffer: () => ({}), bindBuffer: (target, buffer) => bound.set(target, buffer),
    bufferData: (target, data) => gpu.set(bound.get(target), data),
    vertexAttribPointer: attribute => attributes.set(attribute, bound.get(34962)),
    enableVertexAttribArray() {}, deleteBuffer() {},
    drawElements(mode, count, type, offset) {
        const indices = gpu.get(bound.get(this.ELEMENT_ARRAY_BUFFER));
        assert.equal(type, this.UNSIGNED_SHORT);
        assert.equal(offset, 0);
        assert.equal(count, indices.length);
        assert.ok(indices instanceof Uint16Array);
        for (const index of indices)
            assert.ok(index * 3 + 2 < gpu.get(attributes.get(0)).length);
        calls.push(mode);
    }
};
const model = new Model(gl);
model.Draw({ iAttribVertex: 0, iAttribNormal: 1, iAttribTangent: 2, iAttribTexCoord: 3 });
model.Draw({ iAttribVertex: 0, iAttribNormal: 1, iAttribTangent: 2, iAttribTexCoord: 3 }, true);
assert.deepEqual(calls, [gl.TRIANGLES, gl.LINES]);
assert.equal(attributes.get(1), model.normalBuffer);
assert.equal(attributes.get(2), model.tangentBuffer);
assert.equal(attributes.get(3), model.texCoordBuffer);
console.log('OK: PA2 normals, UV seam, analytical tangents, degenerate fallback, unit vectors, indices and four VBO attributes.');
