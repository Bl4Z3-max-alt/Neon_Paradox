const canvasA = document.getElementById('canvasA'), canvasO = document.getElementById('canvasO');
const ctxA = canvasA.getContext('2d'), ctxO = canvasO.getContext('2d');
const prevO = document.getElementById('prevOmega'), pCtxO = prevO.getContext('2d');

const sfx = {
    jump: new Audio('/static/audio/jump.wav'),
    crash: new Audio('/static/audio/boom.wav'),
    lobby: new Audio('/static/audio/lobby.wav')
};
sfx.lobby.loop = true; sfx.lobby.volume = 0.2;

let state = {
    active: false, score: 0, speed: 7, isSplit: false, startTime: 0,
    pA: null, pO: null, obsA: [], obsO: [], particles: [], shards: [], pickups: [],
    lastTime: 0, selectedColor: '#00f0ff',
    glitchActive: false, glitchProgress: 0,
    buildings: [] // For city background
};

class Shard {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.color = color;
        this.size = Math.random()*8+2;
        this.vx = (Math.random()-0.5)*15; this.vy = (Math.random()-0.5)*15;
        this.angle = Math.random()*Math.PI*2; this.vr = (Math.random()-0.5)*0.4; this.life = 1.0;
    }
    update(dt) { this.x += this.vx*dt; this.y += this.vy*dt; this.vy += 0.2*dt; this.angle += this.vr*dt; this.life -= 0.02*dt; }
    draw(ctx) { ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle); ctx.globalAlpha = Math.max(0, this.life); ctx.fillStyle = this.color; ctx.beginPath(); ctx.moveTo(0, -this.size/2); ctx.lineTo(this.size/2, this.size/2); ctx.lineTo(-this.size/2, this.size/2); ctx.fill(); ctx.restore(); }
}

class Player {
    constructor(color) { this.w = 35; this.h = 35; this.x = 120; this.y = 150; this.v = 0; this.g = 1; this.color = color; this.phasing = false; this.phaseCooldown = 0; this.angle = 0; }
    update(h, dt) {
        this.v += 0.8 * this.g * dt; this.y += this.v * dt;
        if (this.y >= h - this.h || this.y <= 0) { this.angle = 0; this.v = 0; this.y = (this.y <= 0) ? 0 : h - this.h; }
        else { this.angle += (this.g === 1 ? 0.2 : -0.2) * dt; }
        if (this.phaseCooldown > 0) { this.phaseCooldown -= 1 * dt; if (this.color === state.selectedColor) document.getElementById('phase-cooldown-bar').style.width = Math.max(0, (1 - (this.phaseCooldown/180))*100) + "%"; }
        if (state.active && Math.floor(state.score) % 3 === 0) System.spawnPart(this.x, this.y + this.h/2, this.color, 1);
    }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x + this.w/2, this.y + this.h/2); ctx.rotate(this.angle);
        ctx.shadowBlur = 20; ctx.shadowColor = this.color; ctx.fillStyle = (this.phasing || state.glitchActive) ? "#fff" : this.color;
        ctx.beginPath(); if(this.g === 1) { ctx.moveTo(-this.w/2, this.h/2); ctx.lineTo(0, -this.h/2); ctx.lineTo(this.w/2, this.h/2); }
        else { ctx.moveTo(-this.w/2, -this.h/2); ctx.lineTo(0, this.h/2); ctx.lineTo(this.w/2, -this.h/2); }
        ctx.fill(); ctx.restore();
    }
}

const System = {
    initTerminal: () => { sfx.lobby.play().catch(() => {}); System.loadWithBar('HUB'); },
    switchRoom: (id) => { document.querySelectorAll('.room').forEach(r => r.classList.remove('active')); document.getElementById(id).classList.add('active'); },
    setSkin: (color, el) => { state.selectedColor = color; document.querySelectorAll('.skin-opt').forEach(o => o.classList.remove('active')); el.classList.add('active'); },
    
    loadWithBar: (target) => {
        const screen = document.getElementById('loading-screen');
        const bar = document.getElementById('progress-bar');
        document.getElementById('splash-screen').classList.remove('active');
        screen.classList.add('active');
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 15; bar.style.width = Math.min(progress, 100) + "%";
            if(progress >= 100) { clearInterval(interval); setTimeout(() => { screen.classList.remove('active'); if(target === 'HUB') { System.switchRoom('hub-room'); PreviewEngine.loop(); System.loadScores(); } else if(target === 'VOID') System.boot(); }, 400); }
        }, 60);
    },

    boot: () => {
        sfx.lobby.pause(); System.switchRoom('void-room');
        canvasA.width = canvasO.width = window.innerWidth * 0.96; canvasA.height = canvasO.height = window.innerHeight * 0.42;
        state.active = true; state.startTime = Date.now(); state.score = 0; state.speed = 7; state.isSplit = false;
        state.obsA = []; state.obsO = []; state.particles = []; state.shards = []; state.pickups = [];
        state.glitchActive = false; state.glitchProgress = 0;
        state.pA = new Player(state.selectedColor); state.pO = new Player('#ff8c00');
        // Generate buildings
        state.buildings = [];
        for(let i=0; i<10; i++) state.buildings.push({x: i*200, w: 80 + Math.random()*100, h: 100 + Math.random()*200});
        state.lastTime = performance.now(); System.gameLoop(performance.now());
    },

    spawnCode: () => {
        const container = document.getElementById('glitch-code-container');
        const code = document.createElement('div');
        code.className = 'falling-code';
        code.style.left = Math.random() * 100 + "%";
        code.style.animationDuration = (Math.random()*2 + 1) + "s";
        code.innerText = Math.random().toString(16).substring(2, 10).toUpperCase();
        container.appendChild(code);
        setTimeout(() => code.remove(), 2000);
    },

    update: (dt) => {
        if(!state.active) { state.shards.forEach((s, i) => { s.update(dt); if(s.life <= 0) state.shards.splice(i, 1); }); return; }
        
        // Glitch Time Logic
        let currentDt = state.glitchActive ? dt * 0.2 : dt; // 80% slow-mo
        if(state.glitchActive) {
            state.glitchProgress += 0.4 * dt; // Memory leak speed
            document.getElementById('glitch-pct').innerText = Math.floor(state.glitchProgress);
            System.spawnCode();
            if(state.glitchProgress >= 100) System.blueScreen();
        }

        state.score += 0.15 * currentDt; 
        state.speed = Math.min(7 + (state.score / 250), 18);
        document.getElementById('sync-val').innerText = Math.floor(state.score);

        if(!state.isSplit && Date.now() - state.startTime > 30000) { state.isSplit = true; canvasO.style.display = 'block'; System.shake(); }

        [ {p: state.pA, obs: state.obsA, id: 'A'}, {p: state.pO, obs: state.obsO, id: 'O'} ].forEach(cfg => {
            if(cfg.id === 'O' && !state.isSplit) return;
            cfg.p.update(canvasA.height, currentDt);
            
            // Rare Core Spawn (0.2%)
            if(Math.random() < 0.002 * currentDt) state.pickups.push({x: canvasA.width + 50, y: Math.random()*(canvasA.height-30), w: 30, h:30, id: cfg.id});

            if(Math.random() < 0.02 * currentDt) cfg.obs.push({x: canvasA.width + 100, y: Math.random() > 0.5 ? 0 : canvasA.height - 70, w: 30, h: 70});
            cfg.obs.forEach((o, i) => {
                o.x -= state.speed * currentDt;
                if(!cfg.p.phasing && cfg.p.x < o.x + o.w && cfg.p.x + cfg.p.w > o.x && cfg.p.y < o.y + o.h && cfg.p.y + cfg.p.h > o.y) System.die(cfg.p);
                if(o.x < -150) cfg.obs.splice(i, 1);
            });
        });

        state.pickups.forEach((pk, i) => {
            pk.x -= state.speed * currentDt;
            let player = (pk.id === 'A') ? state.pA : state.pO;
            if(player.x < pk.x + pk.w && player.x + player.w > pk.x && player.y < pk.y + pk.h && player.y + player.h > pk.y) {
                state.glitchActive = true;
                document.body.classList.add('glitch-active');
                document.getElementById('glitch-status').style.display = 'block';
                state.pickups.splice(i, 1);
                setTimeout(() => { 
                    state.glitchActive = false; 
                    state.glitchProgress = 0; 
                    document.body.classList.remove('glitch-active'); 
                    document.getElementById('glitch-status').style.display = 'none';
                    document.getElementById('glitch-code-container').innerHTML = '';
                }, 5000); // 5 Seconds of Slow-mo
            }
            if(pk.x < -100) state.pickups.splice(i, 1);
        });

        state.particles.forEach((p, i) => { p.x += p.vx * currentDt; p.y += p.vy * currentDt; p.life -= 0.02 * currentDt; if(p.life <= 0) state.particles.splice(i, 1); });
    },

    draw: () => {
        [ctxA, ctxO].forEach((ctx, i) => {
            const id = i === 0 ? 'A' : 'O'; if(id === 'O' && !state.isSplit) return;
            ctx.clearRect(0, 0, canvasA.width, canvasA.height);
            
            // Draw City Background
            ctx.fillStyle = '#050508'; ctx.globalAlpha = 0.4;
            state.buildings.forEach(b => {
                let bx = (b.x - (state.score * 2)) % (canvasA.width + 200);
                if(bx < -200) bx += canvasA.width + 400;
                ctx.fillRect(bx, canvasA.height - b.h, b.w, b.h);
            });

            ctx.strokeStyle = (id === 'A') ? state.selectedColor : '#ff8c00'; ctx.globalAlpha = 0.1;
            let xOff = (state.score * 10) % 100;
            for(let x = -xOff; x < canvasA.width; x += 100) ctx.strokeRect(x, 0, 100, canvasA.height);
            ctx.globalAlpha = 1;
            state.particles.forEach(p => { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 4, 4); });
            state.shards.forEach(s => s.draw(ctx));
            
            ctx.fillStyle = '#fff'; ctx.shadowBlur = 20; ctx.shadowColor = '#ffd700';
            state.pickups.filter(p => p.id === id).forEach(p => ctx.fillRect(p.x, p.y, p.w, p.h));
            
            if(state.active) {
                if(id === 'A') { state.pA.draw(ctx); state.obsA.forEach(o => { ctx.fillStyle = '#ff003c'; ctx.fillRect(o.x, o.y, o.w, o.h); }); }
                else { state.pO.draw(ctx); state.obsO.forEach(o => { ctx.fillStyle = '#ff003c'; ctx.fillRect(o.x, o.y, o.w, o.h); }); }
            }
        });
    },

    blueScreen: () => {
        state.active = false;
        document.getElementById('blue-screen').classList.add('active');
        setTimeout(() => {
            document.getElementById('blue-screen').classList.remove('active');
            location.reload(); // Hard reset on blue screen
        }, 3000);
    },

    die: (p) => {
        state.active = false; sfx.crash.currentTime = 0; sfx.crash.play(); System.shake();
        for(let i=0; i<15; i++) state.shards.push(new Shard(p.x + p.w/2, p.y + p.h/2, p.color));
        setTimeout(() => { document.getElementById('death-overlay').style.display = 'flex'; document.getElementById('final-score').innerText = Math.floor(state.score); }, 1200);
    },

    gameLoop: (currentTime) => { const dt = (currentTime - state.lastTime) / 16.67; state.lastTime = currentTime; System.update(Math.min(dt, 2)); System.draw(); requestAnimationFrame(System.gameLoop); },
    submit: async () => { const name = document.getElementById('runner-name').value || "ANON"; await fetch('/api/score', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name, score: Math.floor(state.score) }) }); System.switchRoom('hub-room'); document.getElementById('death-overlay').style.display = 'none'; sfx.lobby.play().catch(() => {}); System.loadWithBar('HUB'); },
    spawnPart: (x, y, color, count) => { for(let i=0; i<count; i++) state.particles.push({x, y, color, vx: (Math.random()-0.5)*8, vy: (Math.random()-0.5)*8, life: 1.0}); },
    shake: () => { const v = document.getElementById('void-room'); v.style.animation = 'shake 0.1s 8'; setTimeout(() => v.style.animation = '', 800); },
    loadScores: async () => { const r = await fetch('/api/leaderboard'); const data = await r.json(); document.getElementById('score-list').innerHTML = data.map((s, i) => `<div class="score-row" style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #222;"><span>${i+1}. ${s.name}</span><span>${s.score}</span></div>`).join(''); }
};

const Actions = {
    jump: () => { if(!state.active) return; state.pA.v = (state.pA.g === 1) ? -14 : 14; if(state.isSplit) state.pO.v = (state.pO.g === 1) ? -14 : 14; sfx.jump.currentTime = 0; sfx.jump.play(); },
    flip: (dir) => { if(!state.active) return; state.pA.g = dir; if(state.isSplit) state.pO.g = dir; },
    phase: () => { if(!state.active || state.pA.phaseCooldown > 0) return; state.pA.phasing = state.pO.phasing = true; state.pA.phaseCooldown = 180; setTimeout(() => { state.pA.phasing = state.pO.phasing = false; }, 500); }
};

window.onkeydown = (e) => { if(e.code === 'Space') Actions.jump(); if(e.code === 'KeyW') Actions.flip(-1); if(e.code === 'KeyS') Actions.flip(1); if(e.code === 'ShiftLeft' || e.code === 'ShiftRight') Actions.phase(); };
window.ontouchstart = (e) => { if(!state.active) return; const x = e.touches[0].clientX, w = window.innerWidth; if (x < w * 0.3) Actions.flip(state.pA.g === 1 ? -1 : 1); else if (x > w * 0.7) Actions.jump(); else Actions.phase(); };

const PreviewEngine = {
    frame: 0, obsO: [],
    draw: (ctx, color, obsArr) => {
        ctx.fillStyle = '#000'; ctx.fillRect(0,0,prevO.width, prevO.height);
        ctx.strokeStyle = color; ctx.globalAlpha = 0.1;
        for(let x=-(PreviewEngine.frame%50); x<prevO.width; x+=50) ctx.strokeRect(x,0,50,prevO.height);
        ctx.globalAlpha = 1; ctx.fillStyle = color;
        ctx.fillRect(30, 50 + Math.sin(PreviewEngine.frame * 0.1) * 30, 20, 20);
        ctx.fillStyle = '#ff003c';
        if(PreviewEngine.frame % 60 === 0) obsArr.push({x: prevO.width, y: Math.random()*80, w:10, h:30});
        obsArr.forEach((o, i) => { o.x -= 4; ctx.fillRect(o.x, o.y, o.w, o.h); if(o.x < -20) obsArr.splice(i, 1); });
    },
    loop: () => { if(state.active) return; PreviewEngine.frame++; PreviewEngine.draw(pCtxO, '#ff8c00', PreviewEngine.obsO); requestAnimationFrame(PreviewEngine.loop); }
};