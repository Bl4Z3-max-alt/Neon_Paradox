/**
 * NEON PARADOX: ZENITH BUILD (V24.0)
 * Developer: Sriparno Malik
 */

const canvasA = document.getElementById('canvasA'), canvasO = document.getElementById('canvasO');
const ctxA = canvasA.getContext('2d'), ctxO = canvasO.getContext('2d');
const prevA = document.getElementById('prevAlpha'), prevO = document.getElementById('prevOmega');
const pCtxA = prevA.getContext('2d'), pCtxO = prevO.getContext('2d');

const sfx = {
    jump: new Audio('/static/audio/jump.wav'),
    crash: new Audio('/static/audio/boom.wav'),
    lobby: new Audio('/static/audio/lobby.wav')
};
sfx.lobby.loop = true;

let state = {
    active: false, score: 0, speed: 7, isSplit: false, startTime: 0,
    pA: null, pO: null, obsA: [], obsO: [], particles: [], shards: [], pickups: [],
    lastTime: performance.now(), selectedColor: '#00f0ff', muted: false, splitTime: 30,
    glitchActive: false, glitchProgress: 0, buildings: []
};

// --- CLASSES ---
class Shard {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.color = color;
        this.size = Math.random()*8+2;
        this.vx = (Math.random()-0.5)*15; this.vy = (Math.random()-0.5)*15;
        this.angle = Math.random()*Math.PI*2; this.vr = (Math.random()-0.5)*0.4; this.life = 1.0;
    }
    update(dt) { this.x += this.vx*dt; this.y += this.vy*dt; this.vy += 0.2*dt; this.angle += this.vr*dt; this.life -= 0.02*dt; }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
        ctx.globalAlpha = Math.max(0, this.life); ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.moveTo(0, -this.size/2); ctx.lineTo(this.size/2, this.size/2); ctx.lineTo(-this.size/2, this.size/2); ctx.fill();
        ctx.restore();
    }
}

class Player {
    constructor(color) {
        this.w = 35; this.h = 35; this.x = 80; this.y = 150;
        this.v = 0; this.g = 1; this.color = color;
        this.phasing = false; this.phaseCooldown = 0; this.angle = 0;
    }
    update(h, dt) {
        this.v += 0.8 * this.g * dt; this.y += this.v * dt;
        if (this.y >= h - this.h || this.y <= 0) { this.angle = 0; this.v = 0; this.y = (this.y <= 0) ? 0 : h - this.h; }
        else { this.angle += (this.g === 1 ? 0.2 : -0.2) * dt; }
        if (this.phaseCooldown > 0) this.phaseCooldown -= 1 * dt;
        if (this.color === state.selectedColor) {
            let bar = document.getElementById('phase-cooldown-bar');
            if(bar) bar.style.width = Math.max(0, (1 - (this.phaseCooldown/180))*100) + "%";
        }
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x + this.w/2, this.y + this.h/2);
        ctx.rotate(this.angle);
        ctx.globalAlpha = this.phasing ? 0.4 : 1.0;
        ctx.shadowBlur = state.glitchActive ? 40 : 15;
        ctx.shadowColor = this.color;
        ctx.fillStyle = (this.phasing || state.glitchActive) ? "#fff" : this.color;
        ctx.beginPath();
        if(this.g === 1) { ctx.moveTo(-this.w/2, this.h/2); ctx.lineTo(0, -this.h/2); ctx.lineTo(this.w/2, this.h/2); }
        else { ctx.moveTo(-this.w/2, -this.h/2); ctx.lineTo(0, this.h/2); ctx.lineTo(this.w/2, -this.h/2); }
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1.0; ctx.shadowBlur = 0; // Prevent blinking
    }
}

// --- SYSTEM ---
const System = {
    initTerminal: () => { sfx.lobby.play().catch(()=>{}); System.loadWithBar('HUB'); },
    switchRoom: (id) => { document.querySelectorAll('.room').forEach(r => r.classList.remove('active')); document.getElementById(id).classList.add('active'); },
    setSkin: (color, el) => { state.selectedColor = color; document.querySelectorAll('.skin-opt').forEach(o => o.classList.remove('active')); el.classList.add('active'); },
    toggleMute: () => { state.muted = !state.muted; Object.values(sfx).forEach(s => s.muted = state.muted); document.getElementById('mute-btn').innerText = state.muted ? "MUTE: ON" : "MUTE: OFF"; },
    updateSettings: () => { state.splitTime = document.getElementById('split-slider').value; document.getElementById('split-val').innerText = state.splitTime + "s"; },

    loadWithBar: (target) => {
        const screen = document.getElementById('loading-screen'), bar = document.getElementById('progress-bar');
        document.getElementById('splash-screen').classList.remove('active');
        screen.classList.add('active');
        let progress = 0;
        let interval = setInterval(() => {
            progress += 5; bar.style.width = progress + "%";
            if(progress >= 100) {
                clearInterval(interval); screen.classList.remove('active');
                if(target === 'HUB') { System.switchRoom('hub-room'); PreviewEngine.loop(); System.loadScores(); }
                else if(target === 'VOID') System.boot();
            }
        }, 50);
    },

    boot: () => {
        sfx.lobby.pause(); System.switchRoom('void-room');
        canvasA.width = canvasO.width = window.innerWidth * 0.98;
        canvasA.height = canvasO.height = window.innerHeight * 0.42;
        state.active = true; state.startTime = Date.now(); state.score = 0; state.speed = 7; state.isSplit = false;
        state.obsA = []; state.obsO = []; state.particles = []; state.shards = []; state.pickups = [];
        state.pA = new Player(state.selectedColor); state.pO = new Player('#ff8c00');
        state.buildings = []; for(let i=0; i<15; i++) state.buildings.push({x: i*300, w: 100+Math.random()*150, h: 50+Math.random()*200});
        state.lastTime = performance.now();
        System.gameLoop(performance.now());
    },

    update: (dt) => {
        if(!state.active) { state.shards.forEach((s, i) => { s.update(dt); if(s.life <= 0) state.shards.splice(i, 1); }); return; }
        
        let cDt = state.glitchActive ? dt * 0.3 : dt;
        if(state.glitchActive) {
            state.glitchProgress += 0.4 * dt;
            document.getElementById('glitch-pct').innerText = Math.floor(state.glitchProgress);
            if(state.glitchProgress >= 100) { state.glitchActive = false; document.body.classList.remove('glitch-active'); document.getElementById('glitch-status').style.display = 'none'; }
        }

        state.score += 0.1 * cDt;
        state.speed = 7 + (state.score / 300);
        document.getElementById('sync-val').innerText = Math.floor(state.score);
        if(!state.isSplit && Date.now() - state.startTime > state.splitTime * 1000) { state.isSplit = true; canvasO.style.display = 'block'; }

        [ {p: state.pA, obs: state.obsA, id: 'A'}, {p: state.pO, obs: state.obsO, id: 'O'} ].forEach(cfg => {
            if(cfg.id === 'O' && !state.isSplit) return;
            cfg.p.update(canvasA.height, cDt);
            if(Math.random() < 0.001 * cDt) state.pickups.push({x: canvasA.width + 50, y: Math.random()*(canvasA.height-40), w: 30, h:30, id: cfg.id});
            if(Math.random() < 0.015 * cDt) cfg.obs.push({x: canvasA.width + 100, y: Math.random() > 0.5 ? 0 : canvasA.height - 70, w: 30, h: 70});
            
            cfg.obs.forEach((o, i) => {
                o.x -= state.speed * cDt;
                if(cfg.p.x < o.x + o.w && cfg.p.x + cfg.p.w > o.x && cfg.p.y < o.y + o.h && cfg.p.y + cfg.p.h > o.y) {
                    if(state.glitchActive) System.blueScreen(); else if(!cfg.p.phasing) System.die(cfg.p);
                }
                if(o.x < -150) cfg.obs.splice(i, 1);
            });
        });

        state.pickups.forEach((pk, i) => {
            pk.x -= state.speed * cDt;
            let p = (pk.id === 'A') ? state.pA : state.pO;
            if(p.x < pk.x + pk.w && p.x + p.w > pk.x && p.y < pk.y + pk.h && p.y + p.h > pk.y) {
                state.glitchActive = true; state.glitchProgress = 0;
                document.body.classList.add('glitch-active'); document.getElementById('glitch-status').style.display = 'block';
                state.pickups.splice(i, 1);
            }
        });
    },

    draw: () => {
        [ctxA, ctxO].forEach((ctx, i) => {
            const id = i === 0 ? 'A' : 'O'; if(id === 'O' && !state.isSplit) return;
            ctx.clearRect(0, 0, canvasA.width, canvasA.height);
            
            // Buildings - Fixed Persistence
            ctx.fillStyle = '#050508'; ctx.globalAlpha = 0.6;
            state.buildings.forEach(b => {
                let bx = (b.x - (state.score * 5)) % (canvasA.width + 400);
                ctx.fillRect(bx - 200, canvasA.height - b.h, b.w, b.h);
            });

            ctx.strokeStyle = (id === 'A') ? state.selectedColor : '#ff8c00'; ctx.globalAlpha = 0.1;
            for(let x = -(state.score*15%100); x < canvasA.width; x += 100) ctx.strokeRect(x, 0, 100, canvasA.height);
            ctx.globalAlpha = 1.0;

            state.shards.forEach(s => s.draw(ctx));
            ctx.fillStyle = '#fff'; ctx.shadowBlur = 15; ctx.shadowColor = '#fff';
            state.pickups.filter(p => p.id === id).forEach(p => ctx.fillRect(p.x, p.y, p.w, p.h));
            
            if(state.active) {
                if(id === 'A') { state.pA.draw(ctx); state.obsA.forEach(o => { ctx.fillStyle = '#ff003c'; ctx.fillRect(o.x, o.y, o.w, o.h); }); }
                else { state.pO.draw(ctx); state.obsO.forEach(o => { ctx.fillStyle = '#ff003c'; ctx.fillRect(o.x, o.y, o.w, o.h); }); }
            }
            ctx.shadowBlur = 0;
        });
    },

    die: (p) => {
        state.active = false; sfx.crash.play();
        for(let i=0; i<15; i++) state.shards.push(new Shard(p.x + p.w/2, p.y + p.h/2, p.color));
        setTimeout(() => { document.getElementById('death-overlay').style.display = 'flex'; document.getElementById('final-score').innerText = Math.floor(state.score); }, 1200);
    },

    blueScreen: () => { state.active = false; document.getElementById('blue-screen').style.display = 'flex'; setTimeout(() => location.reload(), 3000); },
    gameLoop: (t) => { let dt = (t - state.lastTime)/16.67; state.lastTime = t; System.update(Math.min(dt, 2)); System.draw(); requestAnimationFrame(System.gameLoop); },
    submit: async () => {
        const name = document.getElementById('runner-name').value || "ANON";
        await fetch('/api/score', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name, score: Math.floor(state.score) }) });
        location.reload();
    },
    loadScores: async () => { const r = await fetch('/api/leaderboard'); const data = await r.json(); document.getElementById('score-list').innerHTML = data.map((s, i) => `<div class="score-row" style="display:flex; justify-content:space-between; padding:5px; border-bottom:1px solid #222;"><span>${i+1}. ${s.name}</span><span>${s.score}</span></div>`).join(''); }
};

const Actions = {
    jump: () => { if(!state.active) return; state.pA.v = (state.pA.g === 1) ? -14 : 14; if(state.isSplit) state.pO.v = (state.pO.g === 1) ? -14 : 14; if(!state.muted) sfx.jump.play(); },
    flip: (dir) => { if(!state.active) return; state.pA.g = dir; if(state.isSplit) state.pO.g = dir; },
    phase: () => { if(!state.active || state.pA.phaseCooldown > 0) return; state.pA.phasing = state.pO.phasing = true; state.pA.phaseCooldown = 180; setTimeout(() => { state.pA.phasing = state.pO.phasing = false; }, 500); }
};

window.onkeydown = (e) => { if(e.code === 'Space') Actions.jump(); if(e.code === 'KeyW') Actions.flip(-1); if(e.code === 'KeyS') Actions.flip(1); if(e.code === 'ShiftLeft' || e.code === 'ShiftRight') Actions.phase(); };
window.ontouchstart = (e) => { if(!state.active) return; let x = e.touches[0].clientX, w = window.innerWidth; if (x < w * 0.3) Actions.flip(state.pA.g === 1 ? -1 : 1); else if (x > w * 0.7) Actions.jump(); else Actions.phase(); };

const PreviewEngine = {
    frame: 0, obsO: [],
    draw: (ctx, color, obsArr, canvas) => { ctx.fillStyle = '#000'; ctx.fillRect(0,0,canvas.width, canvas.height); ctx.globalAlpha = 0.1; ctx.strokeStyle = color; for(let x=-(PreviewEngine.frame%50); x<canvas.width; x+=50) ctx.strokeRect(x,0,50,canvas.height); ctx.globalAlpha = 1; ctx.fillStyle = color; ctx.fillRect(30, 50 + Math.sin(PreviewEngine.frame*0.1)*30, 20, 20); ctx.fillStyle = '#ff003c'; if(PreviewEngine.frame%60===0) obsArr.push({x: canvas.width, y: Math.random()*80, w:10, h:30}); obsArr.forEach((o, i) => { o.x -= 4; ctx.fillRect(o.x, o.y, o.w, o.h); if(o.x < -20) obsArr.splice(i, 1); }); },
    loop: () => { if(state.active) return; PreviewEngine.frame++; PreviewEngine.draw(pCtxA, '#00f0ff', [], prevA); PreviewEngine.draw(pCtxO, '#ff8c00', PreviewEngine.obsO, prevO); requestAnimationFrame(PreviewEngine.loop); }
};