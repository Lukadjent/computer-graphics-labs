'use strict';

// Організація рендерингу базується на ademch/WebGL: ShaderProgram, m4, TrackballRotator.
let gl, surface, shProgram, spaceball;
let canvas, axesBuffer;
let sceneRadius = 5, zoom = 1;
const byId = id => document.getElementById(id);

class ShaderProgram {
    constructor(program) {
        this.prog = program;
        this.iAttribVertex = gl.getAttribLocation(program, 'vertex');
        this.iColor = gl.getUniformLocation(program, 'color');
        this.iModelViewProjectionMatrix = gl.getUniformLocation(program, 'ModelViewProjectionMatrix');
    }
    Use() { gl.useProgram(this.prog); }
}

function createProgram(gl, vertexSource, fragmentSource) {
    const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const error = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(error);
        }
        return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program));
    return program;
}

function updateStats() {
    byId('u-count').textContent = surface.uRanges.length;
    byId('v-count').textContent = surface.vRanges.length;
    byId('vertex-count').textContent = (surface.uVertices.length + surface.vVertices.length) / 3;
    const p = surface.parameters;
    byId('parameter-label').textContent = `a = ${p.a} · b = ${p.b} · n = ${p.n}`;
    // Верхня оцінка відстані до початку координат для налаштування камери.
    sceneRadius = Math.hypot(p.a + p.b, Math.max(Math.abs(p.vMin), Math.abs(p.vMax)), p.b);
}

function resetView() {
    zoom = 1;
    // Вісь z спрямована вгору; розглядаємо поверхню під кутом.
    spaceball.setView(0, [7, -9, 6], [0, 0, 1]);
    draw();
}

function drawAxes() {
    const length = sceneRadius * 0.82;
    gl.bindBuffer(gl.ARRAY_BUFFER, axesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0,0,0, length,0,0, 0,0,0, 0,length,0, 0,0,0, 0,0,length
    ]), gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgram.iAttribVertex);
    const colors = [[0.64,0.27,0.29,1], [0.25,0.54,0.42,1], [0.30,0.44,0.66,1]];
    colors.forEach((color, i) => {
        gl.uniform4fv(shProgram.iColor, color);
        gl.drawArrays(gl.LINES, i * 2, 2);
    });
}

function draw() {
    if (!spaceball || gl.isContextLost()) return;
    // Розмір drawing buffer дорівнює розміру CSS: початковий TrackballRotator
    // використовує canvas.width та CSS-координати миші в одній системі.
    const width = Math.max(1, Math.round(canvas.clientWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight));
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.055, 0.129, 0.192, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    shProgram.Use();
    const aspect = width / height;
    const halfHeight = sceneRadius * 1.12 / (zoom * Math.min(1, aspect));
    const halfWidth = halfHeight * aspect;
    const projection = m4.orthographic(-halfWidth, halfWidth, -halfHeight, halfHeight,
        -sceneRadius * 4, sceneRadius * 4);
    const modelViewProjection = m4.multiply(projection, spaceball.getViewMatrix());
    gl.uniformMatrix4fv(shProgram.iModelViewProjectionMatrix, false, modelViewProjection);
    if (byId('showAxes').checked) drawAxes();
    surface.Draw(shProgram, byId('showU').checked, byId('showV').checked);
}

function readParameters() {
    const p = {};
    for (const key of Object.keys(SURFACE_DEFAULTS)) p[key] = byId(key).valueAsNumber;
    return p;
}

function rebuildSurface() {
    try {
        surface.BufferData(readParameters());
        byId('input-error').hidden = true;
        updateStats();
        draw();
    } catch (error) {
        byId('input-error').textContent = error.message;
        byId('input-error').hidden = false;
    }
}

function setPreset(name) {
    const presets = {
        rotor1: { a: 2, b: 2, n: 1, vMin: 0, vMax: 2 },
        rotor2: { a: 1, b: 2, n: 2, vMin: -1.5, vMax: 1.5 },
        rotor5: { a: 2, b: 1.5, n: 5, vMin: -1.2, vMax: 1.2 }
    };
    for (const [key, value] of Object.entries(presets[name])) byId(key).value = value;
    rebuildSurface();
    resetView();
}

function saveScreenshot() {
    draw();
    canvas.toBlob(blob => {
        if (!blob) return;
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = 'PA1_variant13_surface.png';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
}

function init() {
    try {
        canvas = byId('webglcanvas');
        gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
        if (!gl) throw new Error('WebGL недоступний. Відкрийте сторінку в браузері з підтримкою WebGL.');
        shProgram = new ShaderProgram(createProgram(gl, vertexShaderSource, fragmentShaderSource));
        surface = new Model(gl, SURFACE_DEFAULTS);
        axesBuffer = gl.createBuffer();
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        spaceball = new TrackballRotator(canvas, draw, 0, [7, -9, 6], [0, 0, 1]);
        updateStats();
        for (const key of Object.keys(SURFACE_DEFAULTS)) byId(key).addEventListener('input', rebuildSurface);
        for (const id of ['showU', 'showV', 'showAxes']) byId(id).addEventListener('change', draw);
        byId('preset').addEventListener('change', event => setPreset(event.target.value));
        byId('reset').addEventListener('click', resetView);
        byId('screenshot').addEventListener('click', saveScreenshot);
        canvas.addEventListener('wheel', event => {
            event.preventDefault();
            zoom = Math.min(4, Math.max(0.4, zoom * Math.exp(-event.deltaY * 0.001)));
            draw();
        }, { passive: false });
        canvas.addEventListener('webglcontextlost', event => {
            event.preventDefault();
            byId('input-error').textContent = 'Контекст WebGL втрачено. Перезавантажте сторінку.';
            byId('input-error').hidden = false;
        });
        new ResizeObserver(draw).observe(byId('canvas-holder'));
        draw();
    } catch (error) {
        byId('canvas-holder').textContent = error.message;
        console.error(error);
    }
}

window.addEventListener('DOMContentLoaded', init);
