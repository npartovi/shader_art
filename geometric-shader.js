class GeometricShaderApp {
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
            u_resolution: [800, 600],
            u_patternScale: 1.0,
            u_rotationSpeed: 0.3,
            u_patternDensity: 8.0,
            u_transformIntensity: 1.0,
            u_animationSpeed: 1.0,
            u_geometricBlend: 0.5,
            u_mouse: [0.5, 0.5],
            u_patternType: 0.0,
            u_glitchIntensity: 0.0,
            u_pixelCorruption: 0.0,
            u_dataShift: 0.0
        };
        
        this.mousePos = { x: 0.5, y: 0.5 };
        this.isMouseDown = false;
        this.currentPattern = 0;
        
        this.initShaders();
        this.initBuffers();
        this.setupControls();
        this.setupMouseEvents();
        this.setupResize();
        this.resizeCanvas();
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
            uniform float u_patternScale;
            uniform float u_rotationSpeed;
            uniform float u_patternDensity;
            uniform float u_transformIntensity;
            uniform float u_animationSpeed;
            uniform float u_geometricBlend;
            uniform vec2 u_mouse;
            uniform float u_patternType;
            uniform float u_glitchIntensity;
            uniform float u_pixelCorruption;
            uniform float u_dataShift;
            
            vec2 rotate(vec2 v, float a) {
                float s = sin(a);
                float c = cos(a);
                mat2 m = mat2(c, -s, s, c);
                return m * v;
            }
            
            float checkerboard(vec2 uv) {
                vec2 c = floor(uv * u_patternDensity);
                return mod(c.x + c.y, 2.0);
            }
            
            float stripes(vec2 uv) {
                return step(0.5, mod(uv.x * u_patternDensity, 1.0));
            }
            
            float mountains(vec2 uv) {
                float x = uv.x * u_patternDensity;
                float wave = abs(fract(x) - 0.5) * 2.0;
                return step(wave, uv.y * 2.0 - 1.0 + sin(x * 6.28318) * 0.3);
            }
            
            float triangles(vec2 uv) {
                vec2 grid = uv * u_patternDensity;
                vec2 id = floor(grid);
                vec2 gv = fract(grid) - 0.5;
                
                float d = abs(gv.x) + abs(gv.y);
                return step(0.3, d);
            }
            
            float diamonds(vec2 uv) {
                vec2 rotUV = rotate(uv, 0.785398); // 45 degrees
                vec2 c = floor(rotUV * u_patternDensity);
                return mod(c.x + c.y, 2.0);
            }
            
            float hexagons(vec2 uv) {
                vec2 grid = uv * u_patternDensity;
                vec2 id = floor(grid);
                vec2 gv = fract(grid) - 0.5;
                
                float d = max(abs(gv.x) * 0.866 + abs(gv.y) * 0.5, abs(gv.y));
                return step(0.4, d);
            }
            
            float maze(vec2 uv) {
                vec2 grid = uv * u_patternDensity;
                vec2 id = floor(grid);
                vec2 gv = fract(grid);
                
                float hash = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
                
                if (hash < 0.25) {
                    return step(0.1, gv.x) * step(gv.x, 0.9);
                } else if (hash < 0.5) {
                    return step(0.1, gv.y) * step(gv.y, 0.9);
                } else if (hash < 0.75) {
                    return step(0.1, gv.x) * step(gv.x, 0.9) + step(0.1, gv.y) * step(gv.y, 0.9);
                } else {
                    return step(0.4, length(gv - 0.5));
                }
            }
            
            float waves(vec2 uv) {
                float wave = sin(uv.x * u_patternDensity * 6.28318 + u_time * u_animationSpeed);
                return step(0.0, wave + uv.y * 4.0 - 2.0);
            }
            
            float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
            }
            
            vec2 pixelCorruption(vec2 uv, float intensity) {
                // Create pixel-level corruption
                vec2 pixelUV = floor(uv * 100.0) / 100.0;
                float noise = random(pixelUV + u_time * 0.1);
                
                if (noise > 1.0 - intensity) {
                    // Corrupt this pixel block
                    return pixelUV + vec2(random(pixelUV * 2.0), random(pixelUV * 3.0)) * 0.1;
                }
                return uv;
            }
            
            vec2 dataShift(vec2 uv, float intensity) {
                // Simulate data corruption with horizontal shifts
                float y = floor(uv.y * 200.0);
                float corruption = random(vec2(y, floor(u_time * 10.0)));
                
                if (corruption > 1.0 - intensity * 0.3) {
                    float shift = (random(vec2(y * 2.0, u_time)) - 0.5) * intensity * 0.5;
                    uv.x += shift;
                }
                return uv;
            }
            
            float glitchPattern(vec2 uv, float intensity) {
                // Create glitch-like fragmentation
                vec2 blockUV = floor(uv * 50.0) / 50.0;
                float blockNoise = random(blockUV + floor(u_time * 5.0) * 0.1);
                
                if (blockNoise > 1.0 - intensity) {
                    // This block is corrupted
                    float corruptionType = random(blockUV * 2.0);
                    
                    if (corruptionType < 0.33) {
                        // Inverted block
                        return 1.0;
                    } else if (corruptionType < 0.66) {
                        // Shifted pattern
                        vec2 shiftedUV = uv + vec2(0.1, 0.0) * sin(u_time * 20.0);
                        return getPattern(shiftedUV, u_patternType);
                    } else {
                        // Random noise block
                        return random(uv * 100.0 + u_time);
                    }
                }
                return -1.0; // No corruption
            }
            
            float getPattern(vec2 uv, float patternType) {
                if (patternType < 0.5) {
                    return checkerboard(uv);
                } else if (patternType < 1.5) {
                    return stripes(uv);
                } else if (patternType < 2.5) {
                    return mountains(uv);
                } else if (patternType < 3.5) {
                    return triangles(uv);
                } else if (patternType < 4.5) {
                    return diamonds(uv);
                } else if (patternType < 5.5) {
                    return hexagons(uv);
                } else if (patternType < 6.5) {
                    return maze(uv);
                } else {
                    return waves(uv);
                }
            }
            
            void main() {
                vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / u_resolution.y;
                vec2 originalUV = uv;
                
                float time = u_time * u_animationSpeed;
                
                // Apply glitch effects to UV coordinates
                if (u_pixelCorruption > 0.0) {
                    uv = pixelCorruption(uv, u_pixelCorruption);
                }
                
                if (u_dataShift > 0.0) {
                    uv = dataShift(uv, u_dataShift);
                }
                
                // Mouse influence
                vec2 mouseUV = u_mouse * 2.0 - 1.0;
                mouseUV.y *= -1.0;
                float mouseDistance = length(originalUV - mouseUV);
                
                // Apply transformations
                uv *= u_patternScale;
                
                // Add mouse distortion
                vec2 mouseDistortion = (uv - mouseUV) * u_transformIntensity * 0.2 * 
                                      exp(-mouseDistance * 3.0);
                uv += mouseDistortion;
                
                // Rotation
                uv = rotate(uv, time * u_rotationSpeed);
                
                // Check for glitch corruption first
                float glitchResult = glitchPattern(originalUV, u_glitchIntensity);
                float finalPattern;
                
                if (glitchResult >= 0.0) {
                    // Use glitch result
                    finalPattern = glitchResult;
                } else {
                    // Get primary pattern
                    float pattern1 = getPattern(uv, u_patternType);
                    
                    // Get secondary pattern for blending
                    float pattern2 = getPattern(uv * 1.3, mod(u_patternType + 1.0, 8.0));
                    
                    // Blend patterns
                    finalPattern = mix(pattern1, pattern2, u_geometricBlend);
                    
                    // Add time-based animation
                    float animation = sin(time * 2.0 + originalUV.x * 5.0 + originalUV.y * 3.0) * 0.5 + 0.5;
                    finalPattern = mix(finalPattern, 1.0 - finalPattern, animation * 0.1);
                }
                
                // Mouse interaction effect (more intense with glitch)
                float mouseEffect = exp(-mouseDistance * 5.0) * (sin(time * 10.0) * 0.5 + 0.5);
                if (mouseDistance < 0.3) {
                    finalPattern = mix(finalPattern, 1.0 - finalPattern, mouseEffect * (0.5 + u_glitchIntensity));
                }
                
                // Add scanline corruption
                if (u_dataShift > 0.0) {
                    float scanline = floor(gl_FragCoord.y / 2.0);
                    float scanNoise = random(vec2(scanline, floor(u_time * 30.0)));
                    if (scanNoise > 1.0 - u_dataShift * 0.1) {
                        finalPattern = random(originalUV * 100.0 + u_time);
                    }
                }
                
                // Sharp black and white output with potential corruption
                float output = step(0.5, finalPattern);
                
                // Add random pixel corruption
                if (u_pixelCorruption > 0.0) {
                    float pixelNoise = random(gl_FragCoord.xy + u_time * 0.1);
                    if (pixelNoise > 1.0 - u_pixelCorruption * 0.05) {
                        output = 1.0 - output;
                    }
                }
                
                vec3 color = vec3(output);
                
                gl_FragColor = vec4(color, 1.0);
            }
        `;
        
        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);
        
        if (!vertexShader || !fragmentShader) {
            console.error('Failed to create shaders');
            return;
        }
        
        this.program = this.createProgram(vertexShader, fragmentShader);
        if (!this.program) {
            console.error('Failed to create shader program');
            return;
        }
        
        this.gl.useProgram(this.program);
        
        this.uniformLocations = {};
        Object.keys(this.uniforms).forEach(key => {
            this.uniformLocations[key] = this.gl.getUniformLocation(this.program, key);
            if (this.uniformLocations[key] === null) {
                console.warn(`Uniform ${key} not found in shader`);
            }
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
            'patternScale', 'rotationSpeed', 'patternDensity', 
            'transformIntensity', 'animationSpeed', 'geometricBlend',
            'glitchIntensity', 'pixelCorruption', 'dataShift'
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
    
    setupMouseEvents() {
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mousePos.x = (e.clientX - rect.left) / rect.width;
            this.mousePos.y = (e.clientY - rect.top) / rect.height;
            this.uniforms.u_mouse = [this.mousePos.x, this.mousePos.y];
        });
        
        this.canvas.addEventListener('mousedown', () => {
            this.isMouseDown = true;
        });
        
        this.canvas.addEventListener('mouseup', () => {
            this.isMouseDown = false;
        });
        
        this.canvas.addEventListener('mouseleave', () => {
            this.isMouseDown = false;
        });
        
        // Touch support
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const touch = e.touches[0];
            this.mousePos.x = (touch.clientX - rect.left) / rect.width;
            this.mousePos.y = (touch.clientY - rect.top) / rect.height;
            this.uniforms.u_mouse = [this.mousePos.x, this.mousePos.y];
            this.isMouseDown = true;
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const touch = e.touches[0];
            this.mousePos.x = (touch.clientX - rect.left) / rect.width;
            this.mousePos.y = (touch.clientY - rect.top) / rect.height;
            this.uniforms.u_mouse = [this.mousePos.x, this.mousePos.y];
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.isMouseDown = false;
        });
    }
    
    resizeCanvas() {
        if (!this.canvas || !this.uniforms) {
            console.warn('Canvas or uniforms not initialized yet');
            return;
        }
        
        const container = this.canvas.parentElement;
        if (!container) {
            console.warn('Canvas container not found');
            return;
        }
        
        const rect = container.getBoundingClientRect();
        const isMobile = window.innerWidth <= 768;
        
        let maxWidth, maxHeight;
        
        if (isMobile) {
            maxWidth = window.innerWidth - 20;
            maxHeight = window.innerHeight * 0.6;
        } else {
            maxWidth = window.innerWidth - 380;
            maxHeight = window.innerHeight - 40;
        }
        
        if (rect.width > 0 && rect.height > 0) {
            maxWidth = Math.min(maxWidth, rect.width - 4);
            maxHeight = Math.min(maxHeight, rect.height - 4);
        }
        
        const aspectRatio = 16/10;
        let width = maxWidth;
        let height = width / aspectRatio;
        
        if (height > maxHeight) {
            height = maxHeight;
            width = height * aspectRatio;
        }
        
        width = Math.max(width, 400);
        height = Math.max(height, 300);
        
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.floor(width * dpr);
        this.canvas.height = Math.floor(height * dpr);
        
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        
        if (this.uniforms && this.uniforms.u_resolution) {
            this.uniforms.u_resolution = [this.canvas.width, this.canvas.height];
        }
        
        if (this.gl) {
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
    }
    
    setupResize() {
        window.addEventListener('resize', () => {
            this.resizeCanvas();
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
            
            if (location !== null && location !== undefined) {
                if (Array.isArray(value)) {
                    this.gl.uniform2fv(location, value);
                } else {
                    this.gl.uniform1f(location, value);
                }
            }
        });
        
        this.gl.enableVertexAttribArray(this.positionAttributeLocation);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.vertexAttribPointer(this.positionAttributeLocation, 2, this.gl.FLOAT, false, 0, 0);
        
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
        
        requestAnimationFrame(() => this.render());
    }
}

function loadPattern(pattern) {
    const patterns = {
        checkerboard: 0,
        stripes: 1,
        mountains: 2,
        triangles: 3,
        diamonds: 4,
        hexagons: 5,
        maze: 6,
        waves: 7
    };
    
    if (window.geometricApp && patterns.hasOwnProperty(pattern)) {
        window.geometricApp.uniforms.u_patternType = patterns[pattern];
        window.geometricApp.currentPattern = patterns[pattern];
    }
}

function loadGlitchPreset(preset) {
    const presets = {
        corruption: {
            glitchIntensity: 0.3,
            pixelCorruption: 0.2,
            dataShift: 0.4
        },
        pixel_death: {
            glitchIntensity: 0.1,
            pixelCorruption: 0.8,
            dataShift: 0.1
        },
        scanlines: {
            glitchIntensity: 0.0,
            pixelCorruption: 0.0,
            dataShift: 0.7
        },
        full_glitch: {
            glitchIntensity: 0.6,
            pixelCorruption: 0.5,
            dataShift: 0.8
        }
    };
    
    if (window.geometricApp && presets[preset]) {
        Object.keys(presets[preset]).forEach(key => {
            const value = presets[preset][key];
            const slider = document.getElementById(key);
            const display = document.getElementById(key + 'Value');
            
            if (slider && display) {
                slider.value = value;
                display.textContent = value.toFixed(2);
                window.geometricApp.uniforms['u_' + key] = value;
            }
        });
    }
}

function resetControls() {
    const defaults = {
        patternScale: 1.0,
        rotationSpeed: 0.3,
        patternDensity: 8,
        transformIntensity: 1.0,
        animationSpeed: 1.0,
        geometricBlend: 0.5,
        glitchIntensity: 0.0,
        pixelCorruption: 0.0,
        dataShift: 0.0
    };
    
    Object.keys(defaults).forEach(key => {
        const value = defaults[key];
        const slider = document.getElementById(key);
        const display = document.getElementById(key + 'Value');
        
        slider.value = value;
        display.textContent = value.toFixed(1);
        window.geometricApp.uniforms['u_' + key] = value;
    });
}

function randomize() {
    const app = window.geometricApp;
    const controls = [
        'patternScale', 'rotationSpeed', 'patternDensity', 
        'transformIntensity', 'animationSpeed', 'geometricBlend'
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
    
    // Random pattern
    const randomPattern = Math.floor(Math.random() * 8);
    app.uniforms.u_patternType = randomPattern;
}

window.addEventListener('load', () => {
    window.geometricApp = new GeometricShaderApp();
});