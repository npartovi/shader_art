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
            u_resolution: [800, 600], // Initial resolution
            u_timeSpeed: 1.0,
            u_distortion: 1.0,
            u_complexity: 3.0,
            u_colorIntensity: 1.0,
            u_rotationSpeed: 0.5,
            u_scaleFactor: 1.0,
            u_mouse: [0.5, 0.5],
            u_clickEffect: 0.0,
            u_hoverIntensity: 0.0,
            u_clickCombo: 0.0,
            u_energyLevel: 0.0,
            u_pulseIntensity: 0.0,
            u_colorBoost: 0.0
        };
        
        this.mousePos = { x: 0.5, y: 0.5 };
        this.clickEffect = 0.0;
        this.hoverIntensity = 0.0;
        this.isMouseOver = false;
        this.isMouseDown = false;
        this.clickCombo = 0.0;
        this.lastClickTime = 0;
        this.energyLevel = 0.0;
        this.pulseIntensity = 0.0;
        this.colorBoost = 0.0;
        this.clickCount = 0;
        
        this.initShaders();
        this.initBuffers();
        this.setupControls();
        this.setupMouseEvents();
        this.setupResize();
        this.resizeCanvas(); // Resize after shaders are initialized
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
            uniform vec2 u_mouse;
            uniform float u_clickEffect;
            uniform float u_hoverIntensity;
            uniform float u_clickCombo;
            uniform float u_energyLevel;
            uniform float u_pulseIntensity;
            uniform float u_colorBoost;
            
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
                
                // Mouse interactions
                vec2 mouseUV = u_mouse * 2.0 - 1.0;
                mouseUV.y *= -1.0; // Flip Y coordinate
                float mouseDistance = length(uv - mouseUV);
                
                // Enhanced click effect with combo multiplier
                float comboMultiplier = 1.0 + u_clickCombo * 2.0;
                float clickRipple = sin(mouseDistance * (20.0 + u_clickCombo * 10.0) - u_clickEffect * 15.0) * 
                                   exp(-u_clickEffect * 2.0) * 
                                   exp(-mouseDistance * (1.5 - u_clickCombo * 0.3)) * 
                                   comboMultiplier;
                
                // Multiple ripple layers for more intensity
                float clickRipple2 = sin(mouseDistance * 30.0 - u_clickEffect * 20.0 + 1.5) * 
                                    exp(-u_clickEffect * 2.5) * 
                                    exp(-mouseDistance * 1.8) * 
                                    comboMultiplier * 0.7;
                
                float clickRipple3 = sin(mouseDistance * 40.0 - u_clickEffect * 25.0 + 3.0) * 
                                    exp(-u_clickEffect * 3.0) * 
                                    exp(-mouseDistance * 2.2) * 
                                    comboMultiplier * 0.5;
                
                float totalRipple = clickRipple + clickRipple2 + clickRipple3;
                
                // Energy pulse that builds with interaction
                float energyPulse = sin(time * 10.0 + u_energyLevel * 5.0) * u_energyLevel * 0.2;
                
                // Dynamic hover effect that intensifies with energy
                float hoverIntensity = u_hoverIntensity * (1.0 + u_energyLevel);
                vec2 mouseWarp = (uv - mouseUV) * hoverIntensity * (0.3 + u_pulseIntensity * 0.4) * 
                                exp(-mouseDistance * (2.0 - u_energyLevel * 0.5));
                uv += mouseWarp;
                
                // Add spiral distortion around mouse when energy is high
                if (u_energyLevel > 0.3) {
                    float angle = atan(uv.y - mouseUV.y, uv.x - mouseUV.x);
                    float spiral = sin(angle * 8.0 + time * 5.0) * u_energyLevel * 0.1;
                    uv += normalize(uv - mouseUV) * spiral * exp(-mouseDistance * 2.0);
                }
                
                // Create seamless, continuous patterns without grid artifacts
                vec2 originalUV = uv;
                
                for (float i = 0.0; i < 6.0; i++) {
                    // Use smooth transformations instead of fractal repetition
                    uv = originalUV;
                    
                    // Apply scale factor as smooth zoom rather than grid repetition
                    uv *= u_scaleFactor * (0.5 + i * 0.3);
                    
                    // Enhanced mouse-influenced rotation with energy feedback
                    float mouseRotation = hoverIntensity * mouseDistance * (2.0 + u_energyLevel * 3.0);
                    float energyRotation = u_energyLevel * sin(time * 8.0) * 0.5;
                    float layerRotation = time * u_rotationSpeed + i * 0.8 + mouseRotation + energyRotation;
                    uv = rotate(uv, layerRotation);
                    
                    // Create flowing, organic shapes
                    float d = length(uv);
                    
                    // Add flowing wave patterns
                    float wave1 = sin(uv.x * 3.0 + time * 2.0) * cos(uv.y * 2.0 + time * 1.5);
                    float wave2 = sin(uv.x * 5.0 - time * 3.0) * sin(uv.y * 4.0 + time * 2.5);
                    d += wave1 * 0.3 + wave2 * 0.2;
                    
                    // Create smooth distance field patterns
                    d = abs(sin(d * (6.0 + u_complexity + hoverIntensity * 3.0 + u_energyLevel * 4.0) + time + energyPulse));
                    
                    // Smooth field distortion instead of harsh repetition
                    float fieldDistortion = u_distortion + hoverIntensity * 2.5 + 
                                           abs(totalRipple) * 3.0 + u_energyLevel * 2.0;
                    
                    // Add flowing turbulence
                    vec2 turbulence = vec2(
                        sin(uv.x * 2.0 + time) + cos(uv.y * 3.0 + time * 1.5),
                        cos(uv.x * 3.0 + time * 1.2) + sin(uv.y * 2.5 + time * 0.8)
                    ) * fieldDistortion * 0.1;
                    
                    uv += turbulence;
                    
                    // Create smooth intensity falloff
                    float intensity = exp(-d * (2.0 - u_energyLevel * 0.5)) * (1.0 / (i + 1.0));
                    
                    // Dynamic color shifting with combo effects
                    float colorShift = hoverIntensity * 0.8 + abs(totalRipple) * 0.5 + 
                                      u_energyLevel * sin(time * 15.0) * 0.3 + 
                                      u_colorBoost * 2.0 + i * 0.2;
                    
                    vec3 col = palette(length(originalUV) * 2.0 + time * 0.4 + colorShift);
                    
                    // Add high-energy color explosions
                    if (u_energyLevel > 0.5) {
                        vec3 explosionColor = palette(time * 2.0 + mouseDistance * 5.0 + i * 0.3);
                        col = mix(col, explosionColor, u_energyLevel * 0.4);
                    }
                    
                    // Multi-layered brightness with combo effects
                    float brightness = u_colorIntensity * 
                                      (1.0 + abs(totalRipple) * 1.5 + 
                                       u_energyLevel * 0.8 + 
                                       u_pulseIntensity * 0.6) * 
                                      (1.0 - i * 0.1); // Fade each layer
                    
                    finalColor += col * intensity * brightness;
                }
                
                // Enhanced glow effects
                float mouseGlow = exp(-mouseDistance * (3.0 - u_energyLevel)) * 
                                 hoverIntensity * (0.15 + u_energyLevel * 0.2);
                
                // Energy aura that grows with interaction
                float energyAura = exp(-mouseDistance * 1.5) * u_energyLevel * 0.3 * 
                                  sin(time * 12.0);
                
                // Combo flash effect
                float comboFlash = u_clickCombo * exp(-mouseDistance * 4.0) * 0.2;
                
                vec3 glowColor = palette(time + u_energyLevel * 3.0);
                finalColor += glowColor * (mouseGlow + energyAura + comboFlash);
                
                gl_FragColor = vec4(finalColor, 1.0);
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
    
    setupMouseEvents() {
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mousePos.x = (e.clientX - rect.left) / rect.width;
            this.mousePos.y = (e.clientY - rect.top) / rect.height;
            this.uniforms.u_mouse = [this.mousePos.x, this.mousePos.y];
        });
        
        this.canvas.addEventListener('mouseenter', () => {
            this.isMouseOver = true;
        });
        
        this.canvas.addEventListener('mouseleave', () => {
            this.isMouseOver = false;
        });
        
        this.canvas.addEventListener('mousedown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mousePos.x = (e.clientX - rect.left) / rect.width;
            this.mousePos.y = (e.clientY - rect.top) / rect.height;
            this.uniforms.u_mouse = [this.mousePos.x, this.mousePos.y];
            this.isMouseDown = true;
            
            // Enhanced click mechanics with combo system
            const currentTime = Date.now();
            const timeSinceLastClick = currentTime - this.lastClickTime;
            
            if (timeSinceLastClick < 500) { // Combo window
                this.clickCount++;
                this.clickCombo = Math.min(this.clickCount * 0.3, 2.0);
            } else {
                this.clickCount = 1;
                this.clickCombo = 0.3;
            }
            
            this.lastClickTime = currentTime;
            this.clickEffect = 1.0 + this.clickCombo;
            this.energyLevel = Math.min(this.energyLevel + 0.2 + this.clickCombo * 0.1, 1.0);
            this.colorBoost = 1.0;
        });
        
        this.canvas.addEventListener('mouseup', () => {
            this.isMouseDown = false;
        });
        
        this.canvas.addEventListener('click', (e) => {
            // Additional click feedback for instant gratification
            this.pulseIntensity = 1.0;
        });
        
        // Enhanced touch support for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const touch = e.touches[0];
            this.mousePos.x = (touch.clientX - rect.left) / rect.width;
            this.mousePos.y = (touch.clientY - rect.top) / rect.height;
            this.uniforms.u_mouse = [this.mousePos.x, this.mousePos.y];
            
            // Apply same combo logic for touch
            const currentTime = Date.now();
            const timeSinceLastClick = currentTime - this.lastClickTime;
            
            if (timeSinceLastClick < 500) {
                this.clickCount++;
                this.clickCombo = Math.min(this.clickCount * 0.3, 2.0);
            } else {
                this.clickCount = 1;
                this.clickCombo = 0.3;
            }
            
            this.lastClickTime = currentTime;
            this.clickEffect = 1.0 + this.clickCombo;
            this.energyLevel = Math.min(this.energyLevel + 0.2 + this.clickCombo * 0.1, 1.0);
            this.colorBoost = 1.0;
            this.pulseIntensity = 1.0;
            this.isMouseOver = true;
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
            this.isMouseOver = false;
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
        
        // Detect mobile layout
        const isMobile = window.innerWidth <= 768;
        
        let maxWidth, maxHeight;
        
        if (isMobile) {
            // Mobile: canvas takes 60% of viewport height
            maxWidth = window.innerWidth - 20; // Account for margins
            maxHeight = window.innerHeight * 0.6; // 60vh
        } else {
            // Desktop: account for controls panel
            maxWidth = window.innerWidth - 380; // Account for controls panel
            maxHeight = window.innerHeight - 40; // Account for margins
        }
        
        // Use container dimensions if available
        if (rect.width > 0 && rect.height > 0) {
            maxWidth = Math.min(maxWidth, rect.width - 4); // Account for border
            maxHeight = Math.min(maxHeight, rect.height - 4);
        }
        
        // Maintain aspect ratio while maximizing size
        const aspectRatio = 16/10; // Slightly wider aspect ratio for better visuals
        let width = maxWidth;
        let height = width / aspectRatio;
        
        if (height > maxHeight) {
            height = maxHeight;
            width = height * aspectRatio;
        }
        
        // Ensure minimum size for usability
        width = Math.max(width, 400);
        height = Math.max(height, 300);
        
        // Set canvas resolution (use device pixel ratio for crisp rendering)
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.floor(width * dpr);
        this.canvas.height = Math.floor(height * dpr);
        
        // Set display size
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        
        // Update uniforms safely
        if (this.uniforms && this.uniforms.u_resolution) {
            this.uniforms.u_resolution = [this.canvas.width, this.canvas.height];
        }
        
        // Update WebGL viewport
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
        
        // Enhanced hover intensity with energy boost
        const targetHover = this.isMouseOver ? (1.0 + this.energyLevel * 0.5) : 0.0;
        this.hoverIntensity += (targetHover - this.hoverIntensity) * 0.08;
        this.uniforms.u_hoverIntensity = this.hoverIntensity;
        
        // Click effect with sustained intensity for mouse hold
        if (this.clickEffect > 0.0) {
            this.uniforms.u_clickEffect = this.clickEffect;
            
            // Slower decay when mouse is held down for sustained effects
            const decayRate = this.isMouseDown ? 0.98 : 0.93;
            this.clickEffect *= decayRate;
            
            if (this.clickEffect < 0.01) {
                this.clickEffect = 0.0;
            }
        }
        
        // Energy level management - builds with interaction, slowly decays
        if (this.isMouseOver || this.isMouseDown) {
            this.energyLevel = Math.min(this.energyLevel + 0.01, 1.0);
        } else {
            this.energyLevel *= 0.995; // Very slow decay to keep users engaged
        }
        this.uniforms.u_energyLevel = this.energyLevel;
        
        // Combo system with decay
        if (this.clickCombo > 0.0) {
            this.uniforms.u_clickCombo = this.clickCombo;
            this.clickCombo *= 0.997; // Very slow decay to maintain combo feeling
            if (this.clickCombo < 0.05) {
                this.clickCombo = 0.0;
                this.clickCount = 0;
            }
        }
        
        // Pulse intensity for immediate feedback
        if (this.pulseIntensity > 0.0) {
            this.uniforms.u_pulseIntensity = this.pulseIntensity;
            this.pulseIntensity *= 0.92; // Quick decay for punchy feedback
            if (this.pulseIntensity < 0.01) {
                this.pulseIntensity = 0.0;
            }
        }
        
        // Color boost for satisfying visual rewards
        if (this.colorBoost > 0.0) {
            this.uniforms.u_colorBoost = this.colorBoost;
            this.colorBoost *= 0.96; // Medium decay
            if (this.colorBoost < 0.01) {
                this.colorBoost = 0.0;
            }
        }
        
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