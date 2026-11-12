'use strict';

// Каркас PA1: ShaderProgram, m4 та TrackballRotator.
let gl, surface, shProgram, spaceball, canvas, helpersBuffer;
const materialTextures = [];
let sceneRadius = 5, zoom = 1.3, lightAngle = 7 * Math.PI / 4, previousTime;
const byId = id => document.getElementById(id);
const textureTransform = { pivot: [0.25, 0.5], scale: [1, 1] };

// Опорна точка в нормованій області поверхні; s періодична, t обмежена.
function setTexturePivot(s, t) {
    textureTransform.pivot = [((s % 1) + 1) % 1, Math.max(0, Math.min(1, t))];
    byId('transform-error').hidden = true;
    syncTextureControls();
    draw();
}

function syncTextureControls() {
    const [s, t] = textureTransform.pivot;
    byId('pivotU').value = Number(s.toFixed(4));
    byId('pivotV').value = Number(t.toFixed(4));
    textureTransform.scale.forEach((value, axis) => {
        const id = axis === 0 ? 'scaleU' : 'scaleV';
        byId(id).value = value;
        byId(id + '-value').value = value.toFixed(2);
    });
    byId('scale-label').textContent = textureTransform.scale.map(x => x.toFixed(2)).join(' × ');
    const p = surface.parameters;
    byId('pivot-parameters').textContent = 'u = ' + (s * 2 * Math.PI).toFixed(3) +
        ' · v = ' + (p.vMin + t * (p.vMax - p.vMin)).toFixed(3);
    drawUVPreview();
}

function drawUVPreview() {
    const preview = byId('uv-preview'), ctx = preview.getContext('2d');
    const w = preview.width, h = preview.height, left = 48, right = w - 24, top = 28, bottom = h - 42;
    ctx.clearRect(0, 0, w, h);
    ctx.font = '20px Segoe UI';
    ctx.textAlign = 'left'; ctx.fillStyle = '#6d8290'; ctx.fillText('t / v', 8, 24);
    ctx.fillText('s / u', w - 62, h - 10);
    ctx.strokeStyle = '#d6e1e7'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const x = left + (right - left) * i / 4, y = top + (bottom - top) * i / 4;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    }
    ctx.fillText('0', 22, bottom + 6); ctx.fillText('1', 22, top + 6);
    ctx.fillText('0', left - 4, h - 10); ctx.fillText('1', right - 10, h - 10);
    const x = left + textureTransform.pivot[0] * (right - left);
    const y = bottom - textureTransform.pivot[1] * (bottom - top);
    ctx.strokeStyle = '#b08b2a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 9, 0, 2 * Math.PI); ctx.fillStyle = '#ffd05b'; ctx.fill(); ctx.stroke();
}

function initTextureControls() {
    for (const [axis, id] of ['scaleU', 'scaleV'].entries()) byId(id).addEventListener('input', () => {
        const value = byId(id).valueAsNumber;
        textureTransform.scale[axis] = value;
        if (byId('lockScale').checked) textureTransform.scale[1 - axis] = value;
        syncTextureControls(); draw();
    });
    byId('lockScale').addEventListener('change', () => {
        if (byId('lockScale').checked) textureTransform.scale[1] = textureTransform.scale[0];
        syncTextureControls(); draw();
    });
    for (const id of ['pivotU', 'pivotV']) byId(id).addEventListener('input', () => {
        const fields = ['pivotU', 'pivotV'].map(byId);
        if (fields.some(field => !field.checkValidity() || !Number.isFinite(field.valueAsNumber))) {
            byId('transform-error').textContent = 'Координати опорної точки мають бути від 0 до 1.';
            byId('transform-error').hidden = false;
            return;
        }
        byId('transform-error').hidden = true;
        setTexturePivot(fields[0].valueAsNumber, fields[1].valueAsNumber);
    });
    byId('resetTexture').addEventListener('click', () => {
        textureTransform.scale = [1, 1];
        byId('lockScale').checked = true;
        byId('transform-error').hidden = true;
        setTexturePivot(0.25, 0.5);
    });
    byId('showPivot').addEventListener('change', draw);
    const preview = byId('uv-preview');
    preview.addEventListener('pointerdown', event => {
        preview.focus();
        const box = preview.getBoundingClientRect();
        const x = (event.clientX - box.left) * preview.width / box.width;
        const y = (event.clientY - box.top) * preview.height / box.height;
        setTexturePivot(Math.max(0, Math.min(1, (x - 48) / (preview.width - 72))),
            (preview.height - 42 - y) / (preview.height - 70));
    });
    canvas.addEventListener('pointerdown', () => canvas.focus());
    window.addEventListener('keydown', event => {
        if (event.ctrlKey || event.altKey || event.metaKey || event.target.isContentEditable ||
            /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
        const direction = { KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, 1], KeyS: [0, -1] }[event.code];
        if (!direction) return;
        event.preventDefault();
        const step = event.shiftKey ? 0.10 : 0.02;
        const [s, t] = textureTransform.pivot;
        setTexturePivot(s + step * direction[0], t + step * direction[1]);
    });
    syncTextureControls();
}

class ShaderProgram {
    constructor(program) {
        this.prog = program;
        this.iAttribVertex = gl.getAttribLocation(program, 'vertex');
        this.iAttribNormal = gl.getAttribLocation(program, 'normal');
        this.iAttribTangent = gl.getAttribLocation(program, 'tangent');
        this.iAttribTexCoord = gl.getAttribLocation(program, 'texCoord');
        for (const name of ['color', 'ModelViewProjectionMatrix', 'ModelViewMatrix',
            'NormalMatrix', 'LightPositionEye', 'Lighting', 'Components', 'Shininess',
            'DiffuseMap', 'SpecularMap', 'NormalMap', 'UseTextures', 'TextureRepeat', 'NormalStrength', 'DisplayMode',
            'TexturePivot', 'TextureScale', 'PivotMarker'])
            this[name] = gl.getUniformLocation(program, name);
    }
    Use() { gl.useProgram(this.prog); }
}

async function loadMaterialTextures() {
    const names = ['diffuse', 'specular', 'normal'];
    // Окремий sampler і texture unit для кожної з трьох карт.
    await Promise.all(names.map(async (name, unit) => {
        const image = new Image();
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = () => reject(new Error('Не вдалося завантажити карту ' + name));
            image.src = MATERIAL_TEXTURES[name];
        });
        const texture = gl.createTexture();
        materialTextures[unit] = texture;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // Рядок 0 PNG відповідає v=0; normal map має +Y уздовж +v.
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
        // 512 — степінь двійки: WebGL 1 підтримує REPEAT та mipmaps.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D);
    }));
    byId('texture-status').textContent = '3 карти · 512 × 512';
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
    byId('vertex-count').textContent = surface.positions.length / 3;
    byId('triangle-count').textContent = surface.indices.length / 3;
    byId('index-count').textContent = surface.indices.length;
    const p = surface.parameters;
    byId('parameter-label').textContent = 'a = ' + p.a + ' · b = ' + p.b + ' · n = ' + p.n;
    sceneRadius = Math.hypot(p.a + p.b, Math.max(Math.abs(p.vMin), Math.abs(p.vMax)), p.b);
    for (const id of ['uSegments', 'vSegments']) byId(id + '-value').value = p[id];
    syncTextureControls();
}

function resetView() {
    zoom = 1.3;
    spaceball.setView(0, [7, -9, 6], [0, 0, 1]);
    draw();
}

// Джерело рухається у світовій системі, незалежно від обертання камери.
function getLightPosition(angle = lightAngle) {
    return [sceneRadius * 1.35 * Math.cos(angle), sceneRadius * 1.35 * Math.sin(angle), sceneRadius * 0.45];
}

function drawHelpers() {
    const length = sceneRadius * 0.7;
    const data = [0,0,0, length,0,0, 0,0,0, 0,length,0, 0,0,0, 0,0,length];
    for (let i = 0; i < 96; i++) data.push(...getLightPosition(i * 2 * Math.PI / 96));
    data.push(...getLightPosition());
    const p = surface.parameters, [s, t] = textureTransform.pivot;
    data.push(...surfacePoint(2 * Math.PI * s, p.vMin + t * (p.vMax - p.vMin), p));
    gl.bindBuffer(gl.ARRAY_BUFFER, helpersBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgram.iAttribVertex);
    gl.disableVertexAttribArray(shProgram.iAttribNormal);
    gl.vertexAttrib3f(shProgram.iAttribNormal, 0, 0, 1);
    gl.disableVertexAttribArray(shProgram.iAttribTangent);
    gl.vertexAttrib3f(shProgram.iAttribTangent, 1, 0, 0);
    gl.disableVertexAttribArray(shProgram.iAttribTexCoord);
    gl.vertexAttrib2f(shProgram.iAttribTexCoord, 0, 0);
    gl.uniform1i(shProgram.Lighting, 0);
    if (byId('showAxes').checked) {
        [[0.7,0.3,0.3,1], [0.3,0.65,0.5,1], [0.4,0.55,0.85,1]].forEach((color, i) => {
            gl.uniform4fv(shProgram.color, color);
            gl.drawArrays(gl.LINES, i * 2, 2);
        });
    }
    if (byId('showLight').checked) {
        gl.uniform4fv(shProgram.color, [0.38,0.38,0.31,1]);
        gl.drawArrays(gl.LINE_LOOP, 6, 96);
        gl.uniform4fv(shProgram.color, [1,0.85,0.44,1]);
        gl.drawArrays(gl.POINTS, 102, 1);
    }
    if (byId('showPivot').checked) {
        // Маркер точної P(u,v) поверх моделі: залишається видимим і на дальньому боці.
        gl.disable(gl.DEPTH_TEST);
        gl.uniform1i(shProgram.PivotMarker, 1);
        gl.drawArrays(gl.POINTS, 103, 1);
        gl.uniform1i(shProgram.PivotMarker, 0);
        gl.enable(gl.DEPTH_TEST);
    }
}

function draw() {
    if (!spaceball || gl.isContextLost()) return;
    // TrackballRotator використовує CSS-координати та canvas.width.
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
    const halfHeight = sceneRadius * 1.58 / (zoom * Math.min(1, aspect));
    const halfWidth = halfHeight * aspect;
    const projection = m4.orthographic(-halfWidth, halfWidth, -halfHeight, halfHeight, -sceneRadius * 5, sceneRadius * 5);
    const modelView = spaceball.getViewMatrix();
    const normal4 = m4.transpose(m4.inverse(modelView));
    const normal3 = [normal4[0], normal4[1], normal4[2], normal4[4], normal4[5], normal4[6], normal4[8], normal4[9], normal4[10]];
    gl.uniformMatrix4fv(shProgram.ModelViewMatrix, false, modelView);
    gl.uniformMatrix4fv(shProgram.ModelViewProjectionMatrix, false, m4.multiply(projection, modelView));
    gl.uniformMatrix3fv(shProgram.NormalMatrix, false, normal3);
    // Точки поверхні та світло передаються в одній системі координат.
    gl.uniform3fv(shProgram.LightPositionEye, m4.transformPoint(modelView, getLightPosition()));
    gl.uniform3fv(shProgram.Components, ['ambient', 'diffuse', 'specular'].map(id => Number(byId(id).checked)));
    gl.uniform1f(shProgram.Shininess, byId('shininess').valueAsNumber);
    gl.uniform3fv(shProgram.UseTextures, ['useDiffuseMap', 'useSpecularMap', 'useNormalMap'].map(id => Number(byId(id).checked)));
    gl.uniform2f(shProgram.TextureRepeat, byId('repeatU').valueAsNumber, byId('repeatV').valueAsNumber);
    gl.uniform2fv(shProgram.TexturePivot, textureTransform.pivot);
    gl.uniform2fv(shProgram.TextureScale, textureTransform.scale);
    gl.uniform1i(shProgram.PivotMarker, 0);
    gl.uniform1f(shProgram.NormalStrength, byId('normalStrength').valueAsNumber);
    gl.uniform1i(shProgram.DisplayMode, Number(byId('textureView').value));
    materialTextures.forEach((texture, unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
    });
    const mode = byId('renderMode').value;
    if (mode !== 'wireframe') {
        gl.uniform1i(shProgram.Lighting, 1);
        gl.uniform4fv(shProgram.color, [0.6, 0.67, 0.69, 1]);
        if (mode === 'overlay') {
            gl.enable(gl.POLYGON_OFFSET_FILL);
            gl.polygonOffset(1, 1);
        }
        surface.Draw(shProgram);
        gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    if (mode !== 'shaded') {
        gl.uniform1i(shProgram.Lighting, 0);
        gl.uniform4fv(shProgram.color, mode === 'overlay' ? [0.08,0.22,0.28,1] : [0.42,0.86,0.9,1]);
        surface.Draw(shProgram, true);
    }
    drawHelpers();
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
        link.download = 'CGW_variant13_surface.png';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
}

function animate(time) {
    const dt = previousTime === undefined ? 0 : Math.min((time - previousTime) / 1000, 0.1);
    previousTime = time;
    if (!gl.isContextLost() && byId('animateLight').checked && byId('lightSpeed').valueAsNumber > 0) {
        lightAngle = (lightAngle + dt * byId('lightSpeed').valueAsNumber * Math.PI / 180) % (2 * Math.PI);
        byId('lightAngle').value = lightAngle * 180 / Math.PI;
        byId('lightAngle-value').value = Math.round(lightAngle * 180 / Math.PI) + '°';
        draw();
    }
    requestAnimationFrame(animate);
}

async function init() {
    try {
        canvas = byId('webglcanvas');
        gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
        if (!gl) throw new Error('WebGL недоступний. Відкрийте сторінку в браузері з підтримкою WebGL.');
        shProgram = new ShaderProgram(createProgram(gl, vertexShaderSource, fragmentShaderSource));
        shProgram.Use();
        for (const [unit, name] of ['DiffuseMap', 'SpecularMap', 'NormalMap'].entries())
            gl.uniform1i(shProgram[name], unit);
        await loadMaterialTextures();
        surface = new Model(gl);
        helpersBuffer = gl.createBuffer();
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        // Без CULL_FACE: поверхня відкрита, видимі обидва боки.
        spaceball = new TrackballRotator(canvas, draw, 0, [7, -9, 6], [0, 0, 1]);
        initTextureControls();
        updateStats();
        for (const key of Object.keys(SURFACE_DEFAULTS)) byId(key).addEventListener('input', rebuildSurface);
        for (const id of ['ambient', 'diffuse', 'specular', 'showAxes', 'showLight', 'renderMode', 'animateLight'])
            byId(id).addEventListener('change', draw);
        for (const id of ['useDiffuseMap', 'useSpecularMap', 'useNormalMap', 'textureView'])
            byId(id).addEventListener('change', draw);
        for (const id of ['shininess', 'lightSpeed', 'normalStrength', 'repeatU', 'repeatV']) byId(id).addEventListener('input', () => {
            byId(id + '-value').value = byId(id).value + (id === 'lightSpeed' ? '°/с' : '');
            draw();
        });
        byId('lightAngle').addEventListener('input', () => {
            byId('animateLight').checked = false;
            lightAngle = byId('lightAngle').valueAsNumber * Math.PI / 180;
            byId('lightAngle-value').value = Math.round(byId('lightAngle').valueAsNumber) + '°';
            draw();
        });
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
        requestAnimationFrame(animate);
    } catch (error) {
        byId('canvas-holder').textContent = error.message;
        console.error(error);
    }
}

window.addEventListener('DOMContentLoaded', init);
