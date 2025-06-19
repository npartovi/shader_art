class ShaderApp {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.gl = this.canvas.getContext('webgl');
        
        if (!this.gl) {
            alert('WebGL not supported');
            return;
        }
        
        this.startTime = Date.now();
        this.uniforms = {
            u_time: 0,
            u_resolution: [this.canvas.width, this.canvas.height],
            u_timeSpeed: 1.0,
            u_distortion: 1.0,
            u_complexity: 3.0,
            u_colorIntensity: 1.0,
            u_rotationSpeed: 0.5,
            u_scaleFactor: 1.0
        };
        
        this.initShaders();
        this.initBuffers();
        this.setupControls();
        this.render();
    }
    
    initShaders() {
        const vertexShaderSource = `
            attribute vec2 a_position;
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
            }
        `;
        
        const fragmentShaderSource = `
            precision mediump float;
            
            uniform vec2 u_resolution;
            uniform float u_time;
            uniform float u_timeSpeed;
            uniform float u_distortion;
            uniform float u_complexity;
            uniform float u_colorIntensity;
            uniform float u_rotationSpeed;
            uniform float u_scaleFactor;
            
            vec2 rotate(vec2 v, float a) {
                float s = sin(a);
                float c = cos(a);
                mat2 m = mat2(c, -s, s, c);
                return m * v;
            }
            
            float sdBox(vec2 p, vec2 b) {
                vec2 d = abs(p) - b;
                return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
            }
            
            float sdCircle(vec2 p, float r) {
                return length(p) - r;
            }
            
            float sdStar(vec2 p, float r, int n, float m) {
                float an = 3.141593 / float(n);
                float en = 3.141593 / m;
                vec2 acs = vec2(cos(an), sin(an));
                vec2 ecs = vec2(cos(en), sin(en));
                
                float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
                p = length(p) * vec2(cos(bn), abs(sin(bn)));
                p -= r * acs;
                p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
                return length(p) * sign(p.x);
            }
            
            vec3 palette(float t) {
                vec3 a = vec3(0.5, 0.5, 0.5);
                vec3 b = vec3(0.5, 0.5, 0.5);
                vec3 c = vec3(1.0, 1.0, 1.0);
                vec3 d = vec3(0.263, 0.416, 0.557);
                
                return a + b * cos(6.28318 * (c * t + d));
            }
            
            void main() {
                vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
                vec2 uv0 = uv;
                vec3 finalColor = vec3(0.0);
                
                float time = u_time * u_timeSpeed;
                
                for (float i = 0.0; i < 4.0; i++) {
                    uv = fract(uv * u_scaleFactor) - 0.5;
                    
                    uv = rotate(uv, time * u_rotationSpeed + i * 0.5);
                    
                    float d = length(uv) * exp(-length(uv0));
                    
                    vec3 col = palette(length(uv0) + i * 0.4 + time * 0.4);
                    
                    d = sin(d * 8.0 + time) / 8.0;
                    d = abs(d);
                    d = pow(0.01 / d, 1.2);
                    
                    d *= sin(uv.x * u_complexity + time) * sin(uv.y * u_complexity + time);
                    d = abs(d);
                    
                    d += sin(length(uv) * 10.0 * u_distortion + time * 2.0) * 0.1;
                    
                    finalColor += col * d * u_colorIntensity;
                }
                
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `;
        
        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);
        
        this.program = this.createProgram(vertexShader, fragmentShader);
        this.gl.useProgram(this.program);
        
        this.uniformLocations = {};
        Object.keys(this.uniforms).forEach(key => {
            this.uniformLocations[key] = this.gl.getUniformLocation(this.program, key);
        });
        
        this.positionAttributeLocation = this.gl.getAttribLocation(this.program, 'a_position');
    }
    
    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compilation error:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        
        return shader;
    }
    
    createProgram(vertexShader, fragmentShader) {
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error('Program linking error:', this.gl.getProgramInfoLog(program));
            this.gl.deleteProgram(program);
            return null;
        }
        
        return program;
    }
    
    initBuffers() {
        const positions = [
            -1, -1,
             1, -1,
            -1,  1,
            -1,  1,
             1, -1,
             1,  1,
        ];
        
        this.positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);
    }
    
    setupControls() {
        const controls = [
            'timeSpeed', 'distortion', 'complexity', 
            'colorIntensity', 'rotationSpeed', 'scaleFactor'
        ];
        
        controls.forEach(control => {
            const slider = document.getElementById(control);
            const display = document.getElementById(control + 'Value');
            
            slider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                this.uniforms['u_' + control] = value;
                display.textContent = value.toFixed(1);
            });
        });
    }
    
    render() {
        this.uniforms.u_time = (Date.now() - this.startTime) / 1000.0;
        
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        
        this.gl.useProgram(this.program);
        
        Object.keys(this.uniforms).forEach(key => {
            const location = this.uniformLocations[key];
            const value = this.uniforms[key];
            
            if (Array.isArray(value)) {
                this.gl.uniform2fv(location, value);
            } else {
                this.gl.uniform1f(location, value);
            }
        });
        
        this.gl.enableVertexAttribArray(this.positionAttributeLocation);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.vertexAttribPointer(this.positionAttributeLocation, 2, this.gl.FLOAT, false, 0, 0);
        
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
        
        requestAnimationFrame(() => this.render());
    }
}

function loadPreset(preset) {
    const app = window.shaderApp;
    const presets = {
        kaleidoscope: {
            timeSpeed: 0.5,
            distortion: 2.0,
            complexity: 6,
            colorIntensity: 1.5,
            rotationSpeed: 1.0,
            scaleFactor: 1.5
        },
        plasma: {
            timeSpeed: 1.5,
            distortion: 3.0,
            complexity: 4,
            colorIntensity: 2.0,
            rotationSpeed: 0.2,
            scaleFactor: 0.8
        },
        fractal: {
            timeSpeed: 0.3,
            distortion: 1.5,
            complexity: 8,
            colorIntensity: 1.2,
            rotationSpeed: -0.5,
            scaleFactor: 2.0
        },
        waves: {
            timeSpeed: 2.0,
            distortion: 4.0,
            complexity: 3,
            colorIntensity: 1.8,
            rotationSpeed: 0.8,
            scaleFactor: 1.2
        },
        hypnotic: {
            timeSpeed: 0.8,
            distortion: 2.5,
            complexity: 5,
            colorIntensity: 2.5,
            rotationSpeed: 1.5,
            scaleFactor: 1.8
        },
        electric: {
            timeSpeed: 3.0,
            distortion: 5.0,
            complexity: 7,
            colorIntensity: 3.0,
            rotationSpeed: -1.2,
            scaleFactor: 0.6
        },
        dreamscape: {
            timeSpeed: 0.2,
            distortion: 1.0,
            complexity: 4,
            colorIntensity: 1.3,
            rotationSpeed: 0.3,
            scaleFactor: 2.5
        },
        cosmic: {
            timeSpeed: 1.2,
            distortion: 3.5,
            complexity: 9,
            colorIntensity: 1.8,
            rotationSpeed: 0.7,
            scaleFactor: 1.4
        },
        meditation: {
            timeSpeed: 0.1,
            distortion: 0.5,
            complexity: 2,
            colorIntensity: 0.8,
            rotationSpeed: 0.1,
            scaleFactor: 3.0
        },
        cyberpunk: {
            timeSpeed: 2.5,
            distortion: 4.5,
            complexity: 6,
            colorIntensity: 2.8,
            rotationSpeed: -1.8,
            scaleFactor: 0.9
        },
        aurora: {
            timeSpeed: 0.6,
            distortion: 2.2,
            complexity: 4,
            colorIntensity: 1.6,
            rotationSpeed: 0.4,
            scaleFactor: 2.2
        },
        tornado: {
            timeSpeed: 2.8,
            distortion: 4.8,
            complexity: 8,
            colorIntensity: 2.2,
            rotationSpeed: 2.0,
            scaleFactor: 1.1
        }
    };
    
    if (presets[preset]) {
        Object.keys(presets[preset]).forEach(key => {
            const value = presets[preset][key];
            const slider = document.getElementById(key);
            const display = document.getElementById(key + 'Value');
            
            slider.value = value;
            display.textContent = value.toFixed(1);
            app.uniforms['u_' + key] = value;
        });
    }
}

function resetControls() {
    const defaults = {
        timeSpeed: 1.0,
        distortion: 1.0,
        complexity: 3,
        colorIntensity: 1.0,
        rotationSpeed: 0.5,
        scaleFactor: 1.0
    };
    
    Object.keys(defaults).forEach(key => {
        const value = defaults[key];
        const slider = document.getElementById(key);
        const display = document.getElementById(key + 'Value');
        
        slider.value = value;
        display.textContent = value.toFixed(1);
        window.shaderApp.uniforms['u_' + key] = value;
    });
}

function randomize() {
    const app = window.shaderApp;
    const controls = [
        'timeSpeed', 'distortion', 'complexity', 
        'colorIntensity', 'rotationSpeed', 'scaleFactor'
    ];
    
    controls.forEach(control => {
        const slider = document.getElementById(control);
        const display = document.getElementById(control + 'Value');
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        const value = Math.random() * (max - min) + min;
        
        slider.value = value;
        display.textContent = value.toFixed(1);
        app.uniforms['u_' + control] = value;
    });
}

window.addEventListener('load', () => {
    window.shaderApp = new ShaderApp();
});