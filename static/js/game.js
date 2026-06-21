/**
 * NEON PARADOX: MASTER EDITION
 * Updated with lowercase jump.wav and boom.wav
 */

const canvasA = document.getElementById('canvasA');
const canvasO = document.getElementById('canvasO');
const ctxA = canvasA.getContext('2d');
const ctxO = canvasO.getContext('2d');

// --- 1. AUDIO SYSTEM (Now using lowercase filenames) ---
const sfx = {
    jump: new Audio('/static/audio/jump.wav'),
    phase: new Audio('/static/audio/jump.wav'), // Reusing jump for phase for now
    crash: new Audio('/static/audio/boom.wav'), 
    bgm: new Audio('/static/audio/music.wav')   // Optional
};

// Audio Settings
sfx.jump.volume = 0.3;
sfx.phase.volume = 0.2;
sfx.crash.volume = 0.6;
sfx.bgm.volume = 0.2;
sfx.bgm.loop = true;

// --- 2. ENGINE STATE ---
let state = {
    active: false,
    score: 0,
    speed: 7,
    isSplit: false,
    startTime: 0,
    pA: null, 
    pO: null,
    obsA: [], 
    obsO: [],
    particles: []
};

// --- 3. PLAYER CLASS ---
class Player {
    constructor(color) {
        this.w = 35; this.h = 35; this.x = 120; this.y = 150;
        this.v = 0; this.g = 1; this.color = color;
        this.phasing = false; 
        this.phaseCooldown = 0;
    }
    update(h) {
        // Physics
        this.v += 0.8 * this.g;
        this.y += this.v;

        // Boundary Collision
        if (this.y > h - this.h) { this.y = h - this.h; this.v = 0; }
        if (this.y < 0) { this.y = 0; this.v = 0; }
        
        // Cooldown Logic
        if (this.phaseCooldown > 0) {
            this.phaseCooldown--;
            if (this.color === '#00f0ff') {
                const percent = (1 - (this.phaseCooldown / 180)) * 100;
                const bar = document.getElementById('phase-cooldown-bar');
                if(bar) bar.style.width = percent + "%";
            }
        }

        // Spawn Trail Particles
        if (state.active && Math.floor(state.score) % 2 === 0) {
            System.spawnPart(this.x, this.y + this.h/2, this.color, 1);
        }
    }
    draw(ctx) {
        ctx.save();
        ctx.shadowBlur = this.phasing ? 50 : 20;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.phasing ? "#fff" : this.color;
        ctx.globalAlpha = this.phasing ? 0.4 : 1;
        
        ctx.beginPath();
        if(this.g === 1) { // Normal
            ctx.moveTo(this.x, this.y + this.h); 
            ctx.lineTo(this.x + this.w/2, this.y); 
            ctx.lineTo(this.x + this.w, this.y + this.h);
        } else { // Inverted
            ctx.moveTo(this.x, this.y); 
            ctx.lineTo(this.x + this.w/2, this.y + this.h); 
            ctx.lineTo(this.x + this.w, this.y);
        }
        ctx.fill();
        ctx.restore();
    }
}

// --- 4. SYSTEM CORE ---
const System = {
    boot: () => {
        // UNLOCK AUDIO for browsers
        [sfx.jump, sfx.phase, sfx.crash, sfx.bgm].forEach(track => {
            track.play().then(() => {
                track.pause();
                track.currentTime = 0;
            }).catch(() => {});
        });
        
        // Start background music
        sfx.bgm.play().catch(() => {});

        // Switch Rooms
        document.getElementById('hub-room').classList.remove('active');
        document.getElementById('void-room').classList.add('active');
        
        // Setup Canvas Size
        canvasA.width = canvasO.width = window.innerWidth * 0.92;
        canvasA.height = canvasO.height = window.innerHeight * 0.42;

        // Reset State
        state.active = true; 
        state.startTime = Date.now();
        state.score = 0; 
        state.speed = 7; 
        state.isSplit = false;
        state.obsA = []; 
        state.obsO = []; 
        state.particles = [];
        state.pA = new Player('#00f0ff'); 
        state.pO = new Player('#ff8c00');
        
        canvasO.style.display = 'none';
        System.loop();
    },

    spawnPart: (x, y, color, count) => {
        for(let i=0; i<count; i++) {
            state.particles.push({
                x, y, color, 
                vx: (Math.random()-0.5)*8, 
                vy: (Math.random()-0.5)*8, 
                life: 1.0
            });
        }
    },

    update: () => {
        if(!state.active) return;

        // Controlled Score Speed
        state.score += 0.2; 
        document.getElementById('sync-val').innerText = Math.floor(state.score);
        state.speed += 0.0012;

        // Reality Split (30 seconds)
        if(!state.isSplit && Date.now() - state.startTime > 30000) {
            state.isSplit = true;
            canvasO.style.display = 'block';
            System.shake();
        }

        const barText = document.getElementById('phase-status');
        if(state.pA.phasing) { 
            barText.innerText = "PHASING"; barText.style.color = "#fff"; 
        } else if(state.pA.phaseCooldown > 0) { 
            barText.innerText = "RECHARGING"; barText.style.color = "#444"; 
        } else { 
            barText.innerText = "READY"; barText.style.color = "#00f0ff"; 
        }

        // Process Reality A and Reality O
        [ {p: state.pA, obs: state.obsA, ctx: ctxA, id: 'A'},
          {p: state.pO, obs: state.obsO, ctx: ctxO, id: 'O'} ].forEach(cfg => {
            if(cfg.id === 'O' && !state.isSplit) return;
            cfg.p.update(canvasA.height);

            // Obstacle Spawner
            if(Math.random() < 0.025) {
                cfg.obs.push({
                    x: canvasA.width + 100, y: Math.random() > 0.5 ? 0 : canvasA.height - 70,
                    w: 30, h: 70, glitch: (Math.random() < 0.1)
                });
            }

            cfg.obs.forEach((o, i) => {
                o.x -= state.speed;
                if(!cfg.p.phasing) {
                    // Forgiving Hitbox
                    if(cfg.p.x + 5 < o.x + o.w && cfg.p.x + cfg.p.w - 5 > o.x && 
                       cfg.p.y + 5 < o.y + o.h && cfg.p.y + cfg.p.h - 5 > o.y) {
                        System.die(cfg.p.x, cfg.p.y);
                    }
                }
                if(o.x < -150) cfg.obs.splice(i, 1);
            });
        });

        // Update Particles
        state.particles.forEach((p, i) => {
            p.x += p.vx; p.y += p.vy; p.life -= 0.025;
            if(p.life <= 0) state.particles.splice(i, 1);
        });
    },

    draw: () => {
        [ctxA, ctxO].forEach((ctx, i) => {
            const id = i === 0 ? 'A' : 'O';
            if(id === 'O' && !state.isSplit) return;
            ctx.clearRect(0, 0, canvasA.width, canvasA.height);

            // Warp Grid
            ctx.strokeStyle = id === 'A' ? '#00f0ff' : '#ff8c00';
            ctx.globalAlpha = 0.15;
            let xOff = (state.score * (state.speed * 1.5)) % 100;
            for(let x = -xOff; x < canvasA.width; x += 100) ctx.strokeRect(x, 0, 100, canvasA.height);
            ctx.globalAlpha = 1;

            // Draw Particles
            state.particles.forEach(p => {
                ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 4, 4);
            });
            ctx.globalAlpha = 1;

            // Draw Actors
            if(id === 'A') {
                state.pA.draw(ctx);
                state.obsA.forEach(o => { 
                    ctx.fillStyle = o.glitch ? '#fff' : '#ff003c'; 
                    ctx.shadowBlur = 15; ctx.shadowColor = ctx.fillStyle;
                    ctx.fillRect(o.x, o.y, o.w, o.h); 
                    ctx.shadowBlur = 0;
                });
            } else {
                state.pO.draw(ctx);
                state.obsO.forEach(o => { 
                    ctx.fillStyle = o.glitch ? '#fff' : '#ff003c'; 
                    ctx.shadowBlur = 15; ctx.shadowColor = ctx.fillStyle;
                    ctx.fillRect(o.x, o.y, o.w, o.h); 
                    ctx.shadowBlur = 0;
                });
            }
        });
    },

    loop: () => {
        if(!state.active) return;
        System.update(); System.draw();
        requestAnimationFrame(System.loop);
    },

    die: (x, y) => {
        state.active = false;
        System.spawnPart(x, y, '#ff0000', 80);
        System.shake();
        
        // CRASH SOUND (boom.wav)
        sfx.crash.currentTime = 0;
        sfx.crash.play();
        
        setTimeout(() => {
            document.getElementById('death-overlay').style.display = 'flex';
            document.getElementById('final-score').innerText = Math.floor(state.score);
        }, 600);
    },

    shake: () => {
        const v = document.getElementById('void-room');
        v.style.animation = 'shake 0.1s 6';
        setTimeout(() => v.style.animation = '', 600);
    },

    submit: async () => {
        const name = document.getElementById('runner-name').value || "ANON";
        await fetch('/api/score', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name, score: Math.floor(state.score) })
        });
        location.reload();
    },

    loadScores: async () => {
        const r = await fetch('/api/leaderboard');
        const data = await r.json();
        document.getElementById('score-list').innerHTML = data.map((s, i) => `
            <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #222;">
                <span>${i+1}. ${s.name}</span><span>${s.score}</span>
            </div>
        `).join('');
    }
};

// --- 5. INPUTS ---
window.onkeydown = (e) => {
    if(!state.active) return;

    // SHIFT: Neural Phase
    if(e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        if(state.pA.phaseCooldown <= 0) {
            state.pA.phasing = state.pO.phasing = true;
            state.pA.phaseCooldown = 180;
            
            // PHASE SOUND (jump.wav)
            sfx.phase.currentTime = 0;
            sfx.phase.play();
            
            setTimeout(() => { state.pA.phasing = state.pO.phasing = false; }, 500);
        }
    }

    // SPACE: Jump
    if(e.code === 'Space') {
        state.pA.v = (state.pA.g === 1) ? -14 : 14;
        if(state.isSplit) state.pO.v = (state.pO.g === 1) ? -14 : 14;
        
        // JUMP SOUND (jump.wav)
        sfx.jump.currentTime = 0;
        sfx.jump.play();
    }

    // Gravity
    if(e.code === 'KeyW') { state.pA.g = -1; if(state.isSplit) state.pO.g = -1; }
    if(e.code === 'KeyS') { state.pA.g = 1; if(state.isSplit) state.pO.g = 1; }
};

// Start by loading scores
System.loadScores();