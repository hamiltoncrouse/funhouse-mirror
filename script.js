const video = document.getElementById('video');
const canvas = document.getElementById('gl-canvas');
const status = document.getElementById('status');
const buttons = document.querySelectorAll('.effect-btn');

let gl;
let program;
let texture;
let currentEffect = 'normal';

const vsSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
        gl_Position = vec4(a_position, 0, 1);
        v_texCoord = a_texCoord;
    }
`;

const fsSource = `
    precision mediump float;
    uniform sampler2D u_image;
    uniform int u_effect;
    uniform float u_time;
    varying vec2 v_texCoord;

    void main() {
        vec2 uv = v_texCoord;
        
        // Mirror the image horizontally (selfie mode)
        uv.x = 1.0 - uv.x;

        if (u_effect == 1) { // Bulge
            vec2 center = vec2(0.5, 0.5);
            vec2 d = uv - center;
            float r = length(d);
            if (r < 0.5) {
                uv = center + d * r * 2.0;
            }
        } 
        else if (u_effect == 2) { // Pinch
            vec2 center = vec2(0.5, 0.5);
            vec2 d = uv - center;
            float r = length(d);
            uv = center + d * sqrt(r) * 1.4;
        } 
        else if (u_effect == 3) { // Swirl
            vec2 center = vec2(0.5, 0.5);
            vec2 d = uv - center;
            float r = length(d);
            float angle = atan(d.y, d.x) + (1.0 - r) * 5.0;
            if (r < 0.5) {
                uv = center + vec2(cos(angle), sin(angle)) * r;
            }
        } 
        else if (u_effect == 4) { // Wave
            uv.x += sin(uv.y * 20.0 + u_time * 5.0) * 0.02;
            uv.y += cos(uv.x * 20.0 + u_time * 5.0) * 0.02;
        } 
        else if (u_effect == 5) { // Stretch
            uv.y = uv.y * uv.y;
            uv.x = 0.5 + (uv.x - 0.5) * (uv.y + 0.5);
        }

        gl_FragColor = texture2D(u_image, uv);
    }
`;

async function init() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user' }, 
            audio: false 
        });
        video.srcObject = stream;
        video.play();
        
        video.onloadedmetadata = () => {
            setupWebGL();
            requestAnimationFrame(render);
            status.textContent = "Running!";
        };
    } catch (err) {
        status.textContent = "Camera error: " + err.message;
        console.error(err);
    }
}

function setupWebGL() {
    gl = canvas.getContext('webgl');
    if (!gl) {
        status.textContent = "WebGL not supported";
        return;
    }

    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    program = createProgram(gl, vs, fs);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,  1, -1,  -1, 1,
        -1, 1,   1, -1,   1, 1,
    ]), gl.STATIC_DRAW);

    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0, 1,  1, 1,  0, 0,
        0, 0,  1, 1,  1, 0,
    ]), gl.STATIC_DRAW);

    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
}

function render(time) {
    time *= 0.001; // convert to seconds

    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
    }

    gl.useProgram(program);

    const positionLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); // Using fresh buffers for simplicity in this script
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const texCoordLoc = gl.getAttribLocation(program, "a_texCoord");
    gl.enableVertexAttribArray(texCoordLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,1, 1,1, 0,0, 0,0, 1,1, 1,0]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    const effectMap = { normal: 0, bulge: 1, pinch: 2, swirl: 3, wave: 4, stretch: 5 };
    gl.uniform1i(gl.getUniformLocation(program, "u_effect"), effectMap[currentEffect]);
    gl.uniform1f(gl.getUniformLocation(program, "u_time"), time);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(render);
}

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(gl, vs, fs) {
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    return program;
}

buttons.forEach(btn => {
    btn.onclick = () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentEffect = btn.dataset.effect;
    };
});

init();
