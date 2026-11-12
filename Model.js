'use strict';

// PA2, варіант 13: Phong + Facet Area Weighted Average.
// Поверхня з PA1: Encyclopedia of Analytical Surfaces, с. 80 (PDF с. 109).
const SURFACE_DEFAULTS = Object.freeze({
    a: 1, b: 2, n: 2, vMin: -1.5, vMax: 1.5,
    uSegments: 96, vSegments: 20
});

function validateSurfaceParameters(parameters) {
    const p = { ...SURFACE_DEFAULTS, ...parameters };
    for (const key of Object.keys(SURFACE_DEFAULTS)) {
        if (!Number.isFinite(p[key])) throw new Error('Параметр ' + key + ': введіть число.');
    }
    if (p.a < 0 || p.a > 5 || p.b < 0.1 || p.b > 5)
        throw new Error('Допустимо: 0 ≤ a ≤ 5 та 0.1 ≤ b ≤ 5.');
    if (!Number.isInteger(p.n) || p.n < 1 || p.n > 8)
        throw new Error('n має бути цілим числом від 1 до 8.');
    if (p.vMin < -6 || p.vMax > 6 || p.vMin >= p.vMax)
        throw new Error('Потрібно −6 ≤ v min < v max ≤ 6.');
    if (!Number.isInteger(p.uSegments) || p.uSegments < 16 || p.uSegments > 256 ||
        !Number.isInteger(p.vSegments) || p.vSegments < 2 || p.vSegments > 80)
        throw new Error('Кількість кроків: ціла, за u від 16 до 256, за v від 2 до 80.');
    return p;
}

// Формули тієї самої поверхні з PA1.
function surfacePoint(u, v, p) {
    const radius = p.a + p.b * Math.sin(p.n * u);
    return [radius * Math.cos(u) - v * Math.sin(u),
            radius * Math.sin(u) + v * Math.cos(u),
            p.b * Math.cos(p.n * u)];
}

function calculateAreaWeightedNormals(positions, indices) {
    const sums = new Float64Array(positions.length);
    for (let k = 0; k < indices.length; k += 3) {
        const a = indices[k] * 3, b = indices[k + 1] * 3, c = indices[k + 2] * 3;
        const ab = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
        const ac = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
        const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        // Довжина cross = 2 * площа. НЕ нормалізуємо до підсумовування.
        for (const vertex of [a, b, c])
            for (let axis = 0; axis < 3; axis++) sums[vertex + axis] += cross[axis];
    }
    const normals = new Float32Array(positions.length);
    for (let i = 0; i < sums.length; i += 3) {
        const length = Math.hypot(sums[i], sums[i + 1], sums[i + 2]);
        if (length > 1e-12) {
            for (let axis = 0; axis < 3; axis++) normals[i + axis] = sums[i + axis] / length;
        } else {
            // У виродженій точці нормаль не визначена; уникаємо NaN у шейдері.
            normals[i + 2] = 1;
        }
    }
    return normals;
}

function createSurfaceGeometry(parameters = {}) {
    const p = validateSurfaceParameters(parameters);
    const nu = p.uSegments, nv = p.vSegments;
    const positions = new Float32Array(nu * (nv + 1) * 3);
    const indices = new Uint16Array(nu * nv * 6);
    const wireIndices = new Uint16Array((nu * (nv + 1) + nu * nv) * 2);
    // u = 2π не дублюється: спільні індекси на шві дають спільну нормаль.
    for (let j = 0; j <= nv; j++) {
        const v = p.vMin + (p.vMax - p.vMin) * j / nv;
        for (let i = 0; i < nu; i++) {
            const u = 2 * Math.PI * i / nu;
            positions.set(surfacePoint(u, v, p), (j * nu + i) * 3);
        }
    }
    let triangleOffset = 0, wireOffset = 0;
    for (let j = 0; j <= nv; j++) {
        for (let i = 0; i < nu; i++) {
            const a = j * nu + i, b = j * nu + (i + 1) % nu;
            wireIndices.set([a, b], wireOffset);
            wireOffset += 2;
            if (j < nv) {
                const c = a + nu, d = b + nu;
                // Два трикутники комірки, обхід узгоджений з Pu × Pv.
                indices.set([a, b, c, b, d, c], triangleOffset);
                triangleOffset += 6;
                wireIndices.set([a, c], wireOffset);
                wireOffset += 2;
            }
        }
    }
    const normals = calculateAreaWeightedNormals(positions, indices);
    return { parameters: p, positions, normals, indices, wireIndices };
}

class Model {
    constructor(gl, parameters = {}) {
        this.gl = gl;
        this.positionBuffer = gl.createBuffer();
        this.normalBuffer = gl.createBuffer();
        this.indexBuffer = gl.createBuffer();
        this.wireBuffer = gl.createBuffer();
        this.BufferData(parameters);
    }

    BufferData(parameters) {
        Object.assign(this, createSurfaceGeometry(parameters));
        const gl = this.gl;
        for (const [target, buffer, data] of [
            [gl.ARRAY_BUFFER, this.positionBuffer, this.positions],
            [gl.ARRAY_BUFFER, this.normalBuffer, this.normals],
            [gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer, this.indices],
            [gl.ELEMENT_ARRAY_BUFFER, this.wireBuffer, this.wireIndices]
        ]) {
            gl.bindBuffer(target, buffer);
            gl.bufferData(target, data, gl.STATIC_DRAW);
        }
    }

    Draw(shader, wireframe = false) {
        const gl = this.gl;
        for (const [buffer, attribute] of [[this.positionBuffer, shader.iAttribVertex], [this.normalBuffer, shader.iAttribNormal]]) {
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(attribute);
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, wireframe ? this.wireBuffer : this.indexBuffer);
        gl.drawElements(wireframe ? gl.LINES : gl.TRIANGLES,
            wireframe ? this.wireIndices.length : this.indices.length, gl.UNSIGNED_SHORT, 0);
    }

    dispose() {
        for (const buffer of [this.positionBuffer, this.normalBuffer, this.indexBuffer, this.wireBuffer])
            this.gl.deleteBuffer(buffer);
    }
}

if (typeof module !== 'undefined' && module.exports)
    module.exports = { Model, surfacePoint, createSurfaceGeometry, calculateAreaWeightedNormals, validateSurfaceParameters, SURFACE_DEFAULTS };
