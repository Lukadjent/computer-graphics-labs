'use strict';

/* Варіант 13. Encyclopedia of Analytical Surfaces, с. 80 (PDF с. 109).
 * U-крива: змінюється u, v зафіксовано.
 * V-крива: змінюється v, u зафіксовано. Тут це пряма.
 */
const SURFACE_DEFAULTS = Object.freeze({
    a: 1, b: 2, n: 2, vMin: -1.5, vMax: 1.5,
    uSegments: 96, vSegments: 20
});

function validateSurfaceParameters(parameters) {
    const p = { ...SURFACE_DEFAULTS, ...parameters };
    for (const key of Object.keys(SURFACE_DEFAULTS)) {
        if (!Number.isFinite(p[key])) throw new Error(`Параметр ${key}: введіть число.`);
    }
    if (p.a < 0 || p.a > 5 || p.b < 0.1 || p.b > 5)
        throw new Error('Допустимо: 0 ≤ a ≤ 5 та 0.1 ≤ b ≤ 5.');
    // Ціле n гарантує збіг кінців u = 0 та u = 2π.
    if (!Number.isInteger(p.n) || p.n < 1 || p.n > 8)
        throw new Error('n має бути цілим числом від 1 до 8.');
    if (p.vMin < -6 || p.vMax > 6 || p.vMin >= p.vMax)
        throw new Error('Потрібно −6 ≤ v min < v max ≤ 6.');
    if (!Number.isInteger(p.uSegments) || p.uSegments < 16 || p.uSegments > 256 ||
        !Number.isInteger(p.vSegments) || p.vSegments < 2 || p.vSegments > 80)
        throw new Error('Кількість кроків: ціла, за u від 16 до 256, за v від 2 до 80.');
    return p;
}

// Це безпосередньо три параметричні формули з методички.
function surfacePoint(u, v, p) {
    const radius = p.a + p.b * Math.sin(p.n * u);
    return [radius * Math.cos(u) - v * Math.sin(u),
            radius * Math.sin(u) + v * Math.cos(u),
            p.b * Math.cos(p.n * u)];
}

function createSurfaceGeometry(parameters = {}) {
    const p = validateSurfaceParameters(parameters);
    const nu = p.uSegments;
    const nv = p.vSegments;
    // Плоский масив: x0,y0,z0, x1,y1,z1, ... . Три float на вершину.
    const uVertices = new Float32Array((nv + 1) * (nu + 1) * 3);
    const vVertices = new Float32Array(nu * (nv + 1) * 3);
    // first і count вимірюються У ВЕРШИНАХ, а не у float чи байтах.
    const uRanges = [];
    const vRanges = [];
    let offset = 0;

    // Сім’я U: зовнішній цикл вибирає стале v,
    // внутрішній проходить за u від 0 до 2π, включно з кінцем для замикання.
    for (let j = 0; j <= nv; j++) {
        const v = p.vMin + (p.vMax - p.vMin) * j / nv;
        uRanges.push({ first: offset / 3, count: nu + 1 });
        for (let i = 0; i <= nu; i++) {
            const u = 2 * Math.PI * i / nu;
            uVertices.set(surfacePoint(u, v, p), offset);
            offset += 3;
        }
    }

    offset = 0;
    // Сім’я V: фіксуємо u та перебираємо v.
    // i < nu: пряма при u = 2π вже збігається з прямою при u = 0.
    for (let i = 0; i < nu; i++) {
        const u = 2 * Math.PI * i / nu;
        vRanges.push({ first: offset / 3, count: nv + 1 });
        for (let j = 0; j <= nv; j++) {
            const v = p.vMin + (p.vMax - p.vMin) * j / nv;
            vVertices.set(surfacePoint(u, v, p), offset);
            offset += 3;
        }
    }
    return { parameters: p, uVertices, vVertices, uRanges, vRanges };
}

// Модель поверхні з двома GPU-буферами. Не залежить від глобального gl.
class Model {
    constructor(gl, parameters = {}) {
        this.gl = gl;
        this.uBuffer = gl.createBuffer();
        this.vBuffer = gl.createBuffer();
        this.BufferData(parameters);
    }

    BufferData(parameters) {
        const geometry = createSurfaceGeometry(parameters);
        Object.assign(this, geometry);
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.uBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.uVertices, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.vVertices, gl.STATIC_DRAW);
    }

    Draw(shader, showU = true, showV = true) {
        const gl = this.gl;
        const drawFamily = (buffer, ranges, color) => {
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.vertexAttribPointer(shader.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(shader.iAttribVertex);
            gl.uniform4fv(shader.iColor, color);
            // Кожна полілінія малюється окремо: зайвих перемичок немає.
            for (const { first, count } of ranges)
                gl.drawArrays(gl.LINE_STRIP, first, count);
        };
        if (showU) drawFamily(this.uBuffer, this.uRanges, [0.35, 0.83, 0.88, 1]);
        if (showV) drawFamily(this.vBuffer, this.vRanges, [0.96, 0.71, 0.46, 1]);
    }

    dispose() {
        this.gl.deleteBuffer(this.uBuffer);
        this.gl.deleteBuffer(this.vBuffer);
    }
}

// Експорт лише для перевірок у Node.js; у браузері працюють звичайні script.
if (typeof module !== 'undefined' && module.exports)
    module.exports = { Model, surfacePoint, createSurfaceGeometry, validateSurfaceParameters, SURFACE_DEFAULTS };
