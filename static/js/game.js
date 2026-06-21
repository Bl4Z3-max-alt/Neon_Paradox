const canvasA = document.getElementById('canvasA');
const canvasO = document.getElementById('canvasO');
const ctxA = canvasA.getContext('2d');
const ctxO = canvasO.getContext('2d');
const prevA = document.getElementById('prevAlpha');
const prevO = document.getElementById('prevOmega');
const pCtxA = prevA.getContext('2d');
const pCtxO = prevO.getContext('2d');

const sfx = {
    jump: new Audio('/static/audio/jump.wav'),
    phase: new Audio('/static/audio/jump.wav'),
    crash: new Audio('/static/audio/boom.wav'),
    lobby: new Audio('/static/audio/lobby.wav')
};
sfx.lobby.loop = true; sfx.lobby.volume = 0.2;

let state = {
    active: false, score: 0, speed: 7, isSplit: false, startTime: 0,
    pA: null, pO: null, obsA: [], obsO: [], particles: [], shards: []
};

class Shard {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.color = color;
        this.size = Math.random() * 10 + 3;
        this.vx = (Math.random() - 0.5) * 15;
        this.vy = (Math.random() - 0.5) * 15;
        this.angle = Math.random() * Math.PI * 2;
        this.vr = (Math.random() - 0.5) * 0.4;
        this.life = 1.0;
    }
    update() { this.x += this.vx; this.y += this.vy; this.vy += 0.2; this.angle += this.vr; this.life -= 0.02; }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
        ctx.globalAlpha = this.life; ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.moveTo(0, -this.size/2); ctx.lineTo(this.size/2, this.size/2); ctx.lineTo(-this.size/2, this.size/2); ctx.fill(); ctx.restore();
    }
}

class Player {
    constructor(color) {
        this.w = 35; this.h = 35; this.x = 120; this.y = 150;
        this.v = 0; this.g = 1; this.color = color;
        this.phasing = false; this.phaseCooldown = 0; this.angle = 0;
    }
    update(h) {
        this.v += 0.8 * this.g; this.y += this.v;
        if (this.y >= h - this.h || this.y <= 0) { 
            this.angle = 0; this.v = 0; 
            this.y = (this.y <= 0) ? 0 : h - this.h;
        } else { this.angle += (this.g === 1) ? 0.2 : -0.2; }
        if (this.phaseCooldown > 0) {
            this.phaseCooldown--;
            if (this.color === '#00f0ff') document.getElementById('phase-cooldown-bar').style.width = (1 - (this.phaseCooldown/180))*100 + "%";
        }
        if (state.active && Math.floor(state.score) % 2 === 0) System.spawnPart(this.x, this.y + this.h/2, this.color, 1);
    }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x + this.w/2, this.y + this.h/2); ctx.rotate(this.angle);
        ctx.shadowBlur = this.phasing ? 50 : 20; ctx.shadowColor = this.color;
        ctx.fillStyle = this.phasing ? "#fff" : this.color; ctx.globalAlpha = this.phasing ? 0.4 : 1;
        ctx.beginPath();
        if(this.g === 1) { ctx.moveTo(-this.w/2, this.h/2); ctx.lineTo(0, -this.h/2); ctx.lineTo(this.w/2, this.h/2); }
        else { ctx.moveTo(-this.w/2, -this.h/2); ctx.lineTo(0, this.h/2); ctx.lineTo(this.w/2, -this.h/2); }
        ctx.fill(); ctx.restore();
    }
}

const System = {
    initTerminal: () => { sfx.lobby.play().catch(() => {}); System.loadWithBar('HUB'); },
    loadWithBar: (target) => {
        const screen = document.getElementById('loading-screen');
        const bar = document.getElementById('progress-bar');
        document.getElementById('splash-screen').classList.remove('active');
        document.getElementById('death-overlay').style.display = 'none';
        screen.classList.add('active');
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 15; bar.style.width = Math.min(progress, 100) + "%";
            if(progress >= 100) {
                clearInterval(interval);
                setTimeout(() => {
                    screen.classList.remove('active');
                    if(target === 'HUB') { document.getElementById('hub-room').classList.add('active'); PreviewEngine.loop(); System.loadScores(); }
                    else if(target === 'VOID') System.boot();
                }, 400);
            }
        }, 60);
    },
    boot: () => {
        sfx.lobby.pause();
        document.getElementById('hub-room').classList.remove('active');
        document.getElementById('void-room').classList.add('active');
        canvasA.width = canvasO.width = window.innerWidth * 0.95;
        canvasA.height = canvasO.height = window.innerHeight * 0.42;
        state.active = true; state.startTime = Date.now(); state.score = 0; state.speed = 7; state.isSplit = false;
        state.obsA = []; state.obsO = []; state.particles = []; state.shards = [];
        state.pA = new Player('#00f0ff'); state.pO = new Player('#ff8c00');
        canvasO.style.display = 'none';
        System.gameLoop();
    },
    update: () => {
        if(!state.active) { state.shards.forEach((s, i) => { s.update(); if(s.life <= 0) state.shards.splice(i, 1); }); return; }
        state.score += 0.15; state.speed = 7 + (state.score / 200);
        document.getElementById('sync-val').innerText = Math.floor(state.score);
        if(!state.isSplit && Date.now() - state.startTime > 30000) { state.isSplit = true; canvasO.style.display = 'block'; System.shake(); }
        [ {p: state.pA, obs: state.obsA, id: 'A'}, {p: state.pO, obs: state.obsO, id: 'O'} ].forEach(cfg => {
            if(cfg.id === 'O' && !state.isSplit) return;
            cfg.p.update(canvasA.height);
            if(Math.random() < 0.02) cfg.obs.push({x: canvasA.width + 100, y: Math.random() > 0.5 ? 0 : canvasA.height - 70, w: 30, h: 70});
            cfg.obs.forEach((o, i) => {
                o.x -= state.speed;
                if(!cfg.p.phasing && cfg.p.x + 8 < o.x + o.w && cfg.p.x + cfg.p.w - 8 > o.x && cfg.p.y + 8 < o.y + o.h && cfg.p.y + cfg.p.h - 8 > o.y) System.die(cfg.p);
                if(o.x < -150) cfg.obs.splice(i, 1);
            });
        });
        state.particles.forEach((p, i) => { p.x += p.vx; p.y += p.vy; p.life -= 0.02; if(p.life <= 0) state.particles.splice(i, 1); });
    },
    draw: () => {
        [ctxA, ctxO].forEach((ctx, i) => {
            const id = i === 0 ? 'A' : 'O'; if(id === 'O' && !state.isSplit) return;
            ctx.clearRect(0, 0, canvasA.width, canvasA.height);
            ctx.strokeStyle = (id === 'A') ? '#00f0ff' : '#ff8c00'; ctx.globalAlpha = 0.1;
            let xOff = (state.score * 10) % 100;
            for(let x = -xOff; x < canvasA.width; x += 100) ctx.strokeRect(x, 0, 100, canvasA.height);
            ctx.globalAlpha = 1;
            state.particles.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 4, 4); });
            state.shards.forEach(s => s.draw(ctx));
            if(state.active) {
                if(id === 'A') { state.pA.draw(ctx); state.obsA.forEach(o => { ctx.fillStyle = '#ff003c'; ctx.fillRect(o.x, o.y, o.w, o.h); }); }
                else { state.pO.draw(ctx); state.obsO.forEach(o => { ctx.fillStyle = '#ff003c'; ctx.fillRect(o.x, o.y, o.w, o.h); }); }
            }
        });
    },
    die: (p) => {
        state.active = false; sfx.crash.currentTime = 0; sfx.crash.play(); System.shake();
        for(let i=0; i<15; i++) state.shards.push(new Shard(p.x + p.w/2, p.y + p.h/2, p.color));
        setTimeout(() => { document.getElementById('death-overlay').style.display = 'flex'; document.getElementById('final-score').innerText = Math.floor(state.score); }, 1200);
    },
    gameLoop: () => { System.update(); System.draw(); requestAnimationFrame(System.gameLoop); },
    submit: async () => {
        const name = document.getElementById('runner-name').value || "ANON";
        await fetch('/api/score', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name, score: Math.floor(state.score) }) });
        document.getElementById('void-room').classList.remove('active'); document.getElementById('death-overlay').style.display = 'none';
        sfx.lobby.play().catch(() => {}); System.loadWithBar('HUB');
    },
    spawnPart: (x, y, color, count) => { for(let i=0; i<count; i++) state.particles.push({x, y, color, vx: (Math.random()-0.5)*8, vy: (Math.random()-0.5)*8, life: 1.0}); },
    shake: () => { const v = document.getElementById('void-room'); v.style.animation = 'shake 0.1s 8'; setTimeout(() => v.style.animation = '', 800); },
    loadScores: async () => { const r = await fetch('/api/leaderboard'); const data = await r.json(); document.getElementById('score-list').innerHTML = data.map((s, i) => `<div class="score-row" style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #222;"><span>${i+1}. ${s.name}</span><span>${s.score}</span></div>`).join(''); },
    showManual: () => alert("KEYBOARD: Space (Jump), W/S (Flip), Shift (Phase)\nMOBILE: Left (Flip), Right (Jump), Center (Phase)")
};

// --- INPUT LOGIC (PC + MOBILE) ---
const Actions = {
    jump: () => { if(!state.active) return; state.pA.v = (state.pA.g === 1) ? -14 : 14; if(state.isSplit) state.pO.v = (state.pO.g === 1) ? -14 : 14; sfx.jump.currentTime = 0; sfx.jump.play(); },
    flip: (dir) => { if(!state.active) return; state.pA.g = dir; if(state.isSplit) state.pO.g = dir; },
    phase: () => { if(!state.active || state.pA.phaseCooldown > 0) return; state.pA.phasing = state.pO.phasing = true; state.pA.phaseCooldown = 180; sfx.phase.currentTime = 0; sfx.phase.play(); setTimeout(() => { state.pA.phasing = state.pO.phasing = false; }, 500); }
};

window.onkeydown = (e) => {
    if(e.code === 'Space') Actions.jump();
    if(e.code === 'KeyW') Actions.flip(-1);
    if(e.code === 'KeyS') Actions.flip(1);
    if(e.code === 'ShiftLeft' || e.code === 'ShiftRight') Actions.phase();
};

window.ontouchstart = (e) => {
    if(!state.active) return;
    const x = e.touches[0].clientX;
    const w = window.innerWidth;
    if (x < w * 0.3) Actions.flip(state.pA.g === 1 ? -1 : 1); // Left 30% flips
    else if (x > w * 0.7) Actions.jump(); // Right 30% jumps
    else Actions.phase(); // Center 40% phases
};

const PreviewEngine = {
    frame: 0, obsA: [], obsO: [],
    draw: (ctx, color, obsArr) => {
        ctx.fillStyle = '#000'; ctx.fillRect(0,0,prevA.width, prevA.height);
        ctx.strokeStyle = color; ctx.globalAlpha = 0.1;
        for(let x=-(PreviewEngine.frame%50); x<prevA.width; x+=50) ctx.strokeRect(x,0,50,prevA.height);
        ctx.globalAlpha = 1; ctx.fillStyle = color;
        ctx.fillRect(30, 50 + Math.sin(PreviewEngine.frame * 0.1) * 30, 20, 20);
        ctx.fillStyle = '#ff003c';
        if(PreviewEngine.frame % 60 === 0) obsArr.push({x: prevA.width, y: Math.random()*80, w:10, h:30});
        obsArr.forEach((o, i) => { o.x -= 4; ctx.fillRect(o.x, o.y, o.w, o.h); if(o.x < -20) obsArr.splice(i, 1); });
    },
    loop: () => { if(state.active) return; PreviewEngine.frame++; PreviewEngine.draw(pCtxA, '#00f0ff', PreviewEngine.obsA); PreviewEngine.draw(pCtxO, '#ff8c00', PreviewEngine.obsO); requestAnimationFrame(PreviewEngine.loop); }
};