// ═══════════════════════════════════════════════════════════════════════
//  PRODE 2026 — Cancha interactiva · Arquero estilo futbolito
//  Vista frontal del arco. El arquero sube y baja cubriendo el palo.
//  Arrastrá la pelota hacia un arco para pronosticar el gol.
// ═══════════════════════════════════════════════════════════════════════

class KeeperGame {
  constructor(cfg) {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx    = this.canvas.getContext('2d');
    this.home   = cfg.home;
    this.away   = cfg.away;
    this.score  = { home: cfg.initialHome || 0, away: cfg.initialAway || 0 };

    this.homeImg = this._img(`https://flagcdn.com/w160/${cfg.home.flag}.png`);
    this.awayImg = this._img(`https://flagcdn.com/w160/${cfg.away.flag}.png`);

    // Colores de camiseta de cada arquero (basado en nombre del equipo)
    this.homeColor = this._teamHue(cfg.home.name, 0);
    this.awayColor = this._teamHue(cfg.away.name, 160);

    this.particles = [];
    this.phase     = 'ready';
    this.message   = null;
    this.msgFrames = 0;
    this.ballAngle = 0;
    this.drag = null;
    this.dragCur = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this._input();
    this._syncUI();
    requestAnimationFrame(() => this._loop());
  }

  // ── SETUP ───────────────────────────────────────────────────────────────

  _img(src) {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.src = src;
    return i;
  }

  _teamHue(name, offset) {
    let h = offset;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xfffff;
    return `hsl(${h % 360},80%,50%)`;
  }

  resize() {
    const wrap = document.getElementById('canvasWrapper');
    const W = wrap ? wrap.offsetWidth : 720;
    const H = Math.max(240, Math.min(340, W * 0.4));
    this.canvas.width  = this.W = W;
    this.canvas.height = this.H = H;
    this._metrics();
    this._resetBall();
  }

  _metrics() {
    const { W, H } = this;
    // Goal dimensions — arco cubre todo el alto del canvas
    this.gD = Math.round(Math.min(72, W * 0.10));   // profundidad del arco
    this.gH = H;                                      // arco = altura total del canvas
    this.gY = 0;                                      // empieza en el tope

    // Arquero — ocupa ~16 % del alto del arco
    this.kH = Math.round(this.gH * 0.16);
    this.kW = Math.max(10, Math.round(W * 0.013));   // ancho del cuerpo

    // Posición X del arquero: JUSTO en la boca del arco (lado cancha), bien visible
    if (!this.hk) this.hk = { y: this.H / 2 - this.kH / 2, vy: 8.6 };
    if (!this.ak) this.ak = { y: this.H / 2 - this.kH / 2, vy: -7.5 };
    this.hk.x = this.gD - Math.round(this.kW * 0.5);   // sobre la línea de gol
    this.ak.x = W - this.gD - Math.round(this.kW * 0.5);

    this.bR = Math.max(12, Math.round(H * 0.042));
  }

  _resetBall() {
    if (!this.ball) this.ball = {};
    Object.assign(this.ball, { x: this.W / 2, y: this.H / 2, vx: 0, vy: 0 });
  }

  // ── INPUT ───────────────────────────────────────────────────────────────

  _input() {
    const c = this.canvas;
    const pos = e => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const tch = e => { const t = e.touches[0] || e.changedTouches[0]; const r = c.getBoundingClientRect(); return { x: t.clientX - r.left, y: t.clientY - r.top }; };

    c.addEventListener('mousedown',  e => this._dn(pos(e)));
    c.addEventListener('mousemove',  e => { if (this.drag) this.dragCur = pos(e); });
    c.addEventListener('mouseup',    () => this._up());
    c.addEventListener('mouseleave', () => { this.drag = null; });
    c.addEventListener('touchstart', e => { e.preventDefault(); this._dn(tch(e)); }, { passive: false });
    c.addEventListener('touchmove',  e => { e.preventDefault(); if (this.drag) this.dragCur = tch(e); }, { passive: false });
    c.addEventListener('touchend',   e => { e.preventDefault(); this._up(); }, { passive: false });
  }

  _dn(p) {
    if (this.phase !== 'ready') return;
    if (Math.hypot(p.x - this.ball.x, p.y - this.ball.y) < this.bR * 4) {
      this.drag = p; this.dragCur = { ...p };
    }
  }

  _up() {
    if (!this.drag || this.phase !== 'ready') { this.drag = null; return; }
    const dx = this.dragCur.x - this.drag.x;
    const dy = this.dragCur.y - this.drag.y;
    const d  = Math.hypot(dx, dy);
    if (d > 16) {
      const spd = Math.min(d * 0.33, 26);
      this.ball.vx = dx / d * spd;
      this.ball.vy = dy / d * spd;
      this.phase = 'shooting';
      this._sfx('kick');
    }
    this.drag = null;
  }

  // ── GAME LOGIC ──────────────────────────────────────────────────────────

  _update() {
    this._keepers();
    this._particles();
    if (this.phase === 'shooting' || this.phase === 'saved') {
      this.ball.vx *= 0.991;
      this.ball.vy *= 0.991;
      this.ball.x  += this.ball.vx;
      this.ball.y  += this.ball.vy;
      this.ballAngle += Math.hypot(this.ball.vx, this.ball.vy) * 0.05;
      if (this.phase === 'shooting') {
        this._bounds();
      } else {
        // Wall bounces during save animation so ball doesn't escape off-screen
        const { bR, ball, H } = this;
        if (ball.y - bR <= 0) { ball.y = bR;     ball.vy =  Math.abs(ball.vy); }
        if (ball.y + bR >= H) { ball.y = H - bR; ball.vy = -Math.abs(ball.vy); }
      }
    }
    if (this.msgFrames > 0 && --this.msgFrames === 0) this.message = null;
  }

  _keepers() {
    const { gY, gH, kH, hk, ak } = this;
    const mn = gY, mx = gY + gH - kH;
    // Pong puro: sube y baja a velocidad constante, nunca sigue a la pelota
    hk.y += hk.vy;
    if (hk.y <= mn) { hk.y = mn; hk.vy =  Math.abs(hk.vy); }
    if (hk.y >= mx) { hk.y = mx; hk.vy = -Math.abs(hk.vy); }
    ak.y += ak.vy;
    if (ak.y <= mn) { ak.y = mn; ak.vy =  Math.abs(ak.vy); }
    if (ak.y >= mx) { ak.y = mx; ak.vy = -Math.abs(ak.vy); }
  }

  _bounds() {
    const { W, H, gY, gH, gD, bR, ball } = this;

    // Cualquier tiro que llega a la línea de gol es gol o atajada (no hay "afuera")
    if (ball.x - bR <= gD) {
      this._hitKeeper(ball, this.hk) ? this._save(ball, 1) : this._goal('away');
      return;
    }
    if (ball.x + bR >= W - gD) {
      this._hitKeeper(ball, this.ak) ? this._save(ball, -1) : this._goal('home');
      return;
    }
    if (ball.y - bR <= 0) { ball.y = bR; ball.vy =  Math.abs(ball.vy) * 0.7; }
    if (ball.y + bR >= H) { ball.y = H - bR; ball.vy = -Math.abs(ball.vy) * 0.7; }

    if (Math.abs(ball.vx) < 0.4 && Math.abs(ball.vy) < 0.4) {
      this._msg('😬 Sin potencia — volvé a patear', 80, 'missed');
      setTimeout(() => this._rst(), 1300);
    }
  }

  _hitKeeper(ball, k) {
    // Overlap exacto círculo/rectángulo en eje Y
    return ball.y + this.bR > k.y && ball.y - this.bR < k.y + this.kH;
  }

  _goal(team) {
    this.score[team]++;
    this._msg(`⚽  ¡GOOOL!  ${team === 'home' ? this.home.name : this.away.name}`, 120, 'scored');
    this._burst(team);
    this._syncUI();
    this._sfx('goal');
    setTimeout(() => this._rst(), 2100);
  }
  _save(ball, sign) {
    // Rebota de vuelta hacia el campo
    ball.vx = sign * (Math.abs(ball.vx) * 0.5 + 3);
    ball.vy = (Math.random() - 0.5) * 8;
    this._msg('🧤  ¡ATAJADA!  Intentá de nuevo', 110, 'saved');
    this._sfx('save');
    setTimeout(() => this._rst(), 1800);
  }
  _miss(ball, sign) {
    ball.vx = sign * Math.abs(ball.vx) * 0.4;
    ball.vy = -ball.vy * 0.5;
    this._msg('📯  Afuera del palo', 80, 'missed');
    this._sfx('occasion');
    setTimeout(() => this._rst(), 1300);
  }

  _msg(txt, frames, phase) { this.message = txt; this.msgFrames = frames; this.phase = phase; }
  _rst() { this._resetBall(); this.ballAngle = 0; this.message = null; this.phase = 'ready'; }

  // ── AUDIO (Web Audio API — síntesis pura, sin archivos) ─────────────────
  _sfx(type) {
    try {
      if (!this._ac) this._ac = new (window.AudioContext || window.webkitAudioContext)();
      const ac = this._ac;
      if (ac.state === 'suspended') ac.resume();
      const t = ac.currentTime;

      const osc = (freq, type2, start, dur, vol, freqEnd) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type = type2 || 'sine';
        o.frequency.setValueAtTime(freq, start);
        if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, start + dur);
        g.gain.setValueAtTime(vol, start);
        g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        o.start(start); o.stop(start + dur + 0.01);
      };

      const noise = (dur, vol, lo, hi) => {
        const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = ac.createBufferSource();
        const flt = ac.createBiquadFilter();
        const g   = ac.createGain();
        src.buffer = buf;
        flt.type = 'bandpass'; flt.frequency.value = (lo + hi) / 2; flt.Q.value = 0.8;
        src.connect(flt); flt.connect(g); g.connect(ac.destination);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.start(t); src.stop(t + dur + 0.01);
      };

      if (type === 'kick') {
        // Golpe de pelota: thump grave + burst de ruido
        osc(110, 'sine',     t,       0.18, 0.9, 35);
        osc(220, 'triangle', t,       0.08, 0.4, 60);
        noise(0.06, 0.5, 200, 900);
      } else if (type === 'save') {
        // Atajada: palmazo de guante
        noise(0.12, 0.9, 500, 2000);
        osc(180, 'sine', t, 0.12, 0.6, 90);
      } else if (type === 'goal') {
        // Gol: fanfarria ascendente + bombo
        [0, 0.10, 0.20, 0.32].forEach((dt, i) => {
          const freqs = [523, 659, 784, 1047];
          osc(freqs[i], 'sine', t + dt, 0.35, 0.45);
        });
        // bombo de celebración
        osc(80, 'sine', t, 0.3, 0.8, 30);
        noise(0.25, 0.3, 200, 600);
      } else if (type === 'occasion') {
        // Ocasión: silbido descendente + quejido de la tribuna
        osc(700, 'sine', t, 0.35, 0.3, 200);
        noise(0.4, 0.25, 300, 900);
      }
    } catch(e) {}
  }

  _syncUI() {
    const { home, away } = this.score;
    ['gameScoreDisplay'].forEach(id => { const e = document.getElementById(id); if (e) e.textContent = `${home} – ${away}`; });
    ['homeScoreInput','confirmHome'].forEach(id => { const e = document.getElementById(id); if (e) e.value !== undefined ? e.value = home : e.textContent = home; });
    ['awayScoreInput','confirmAway'].forEach(id => { const e = document.getElementById(id); if (e) e.value !== undefined ? e.value = away : e.textContent = away; });
    const hi = document.getElementById('homeScoreInput'); if (hi) hi.value = home;
    const ai = document.getElementById('awayScoreInput'); if (ai) ai.value = away;
    const ch = document.getElementById('confirmHome');    if (ch) ch.textContent = home;
    const ca = document.getElementById('confirmAway');    if (ca) ca.textContent = away;
    // Flash the score display
    const sd = document.getElementById('gameScoreDisplay');
    if (sd) { sd.style.transform = 'scale(1.2)'; setTimeout(() => sd.style.transform = 'scale(1)', 200); }
  }

  // ── PARTICLES ───────────────────────────────────────────────────────────

  _burst(team) {
    const cx = team === 'home' ? this.gD * 0.5 : this.W - this.gD * 0.5;
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 10;
      this.particles.push({ x: cx, y: this.H/2, vx: Math.cos(a)*s, vy: Math.sin(a)*s - 4,
        life: 1, color: `hsl(${30 + Math.random()*60},100%,${55+Math.random()*20}%)`, r: 2+Math.random()*5 });
    }
  }
  _particles() {
    this.particles = this.particles.filter(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.38; p.life -= 0.022; return p.life > 0;
    });
  }

  // ── DRAW ────────────────────────────────────────────────────────────────

  _draw() {
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);
    this._field();
    this._net('left');
    this._net('right');
    this._drawParticles();
    // Arqueros: dibujados DELANTE de la red
    this._keeper(this.hk, this.homeColor, this.homeImg, 'left');
    this._keeper(this.ak, this.awayColor, this.awayImg, 'right');
    if (this.drag && this.dragCur) this._arrow();
    this._ball();
    if (this.message) this._msgBox();
    if (this.phase === 'ready' && !this.drag) this._hint();
  }

  _field() {
    const { ctx, W, H } = this;
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#1b5e20' : '#1e7323';
      ctx.fillRect(i * W / 8, 0, W / 8, H);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 2; ctx.setLineDash([]);
    ctx.strokeRect(3, 3, W-6, H-6);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1.5; ctx.setLineDash([8,6]);
    ctx.beginPath(); ctx.moveTo(W/2, 6); ctx.lineTo(W/2, H-6); ctx.stroke();
    ctx.beginPath(); ctx.arc(W/2, H/2, H*0.19, 0, Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(W/2, H/2, 4, 0, Math.PI*2); ctx.fill();
    // Áreas
    const pW = W*0.10, pY = H*0.20, pH = H*0.60;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(this.gD, pY, pW, pH);
    ctx.strokeRect(W-this.gD-pW, pY, pW, pH);
  }

  _net(side) {
    const { ctx, W, H, gD, gH, gY } = this;
    const isL = side === 'left';
    const x    = isL ? 0 : W - gD;
    const openX = isL ? gD : W - gD;

    // Fondo del arco — verde muy oscuro para que la red resalte
    ctx.fillStyle = '#0d2b0f';
    ctx.fillRect(x, gY, gD, gH);
    // Gradiente de profundidad
    const g = ctx.createLinearGradient(x, 0, x + gD, 0);
    g.addColorStop(isL ? 0 : 1, 'rgba(0,0,0,0.55)');
    g.addColorStop(isL ? 1 : 0, 'rgba(0,0,0,0.05)');
    ctx.fillStyle = g;
    ctx.fillRect(x, gY, gD, gH);

    // Grilla de red — blanca, bien visible
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2; ctx.setLineDash([]);
    for (let nx = x; nx <= x+gD; nx += 9) { ctx.beginPath(); ctx.moveTo(nx, gY); ctx.lineTo(nx, gY+gH); ctx.stroke(); }
    for (let ny = gY; ny <= gY+gH; ny += 9) { ctx.beginPath(); ctx.moveTo(x, ny); ctx.lineTo(x+gD, ny); ctx.stroke(); }

    // Postes blancos con glow — bien gruesos y visibles
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = 14; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(openX, gY); ctx.lineTo(openX, gY+gH); ctx.stroke();   // palo lateral
    ctx.beginPath(); ctx.moveTo(x, gY); ctx.lineTo(openX, gY); ctx.stroke();            // travesaño sup
    ctx.beginPath(); ctx.moveTo(x, gY+gH); ctx.lineTo(openX, gY+gH); ctx.stroke();      // travesaño inf
    ctx.shadowBlur = 0;
  }

  // ────────────────────────────────────────────────────────────────────────
  //  ARQUERO — figura humana de frente, brazos abiertos (estilo futbolito)
  //  Sube y baja cubriendo el arco verticalmente.
  // ────────────────────────────────────────────────────────────────────────
  _keeper(k, color, flagImg, side) {
    const { ctx, kW, kH, gD, gH, gY } = this;

    // Centro X del arquero (sobre la línea de gol, lado cancha)
    const cx = side === 'left' ? gD : this.W - gD;
    const ky = k.y;   // top del arquero (posición vertical que sube/baja)

    // Proporciones humanas dentro de kH
    const headR   = kH * 0.10;
    const headCY  = ky + headR;                      // centro de la cabeza
    const shldrY  = headCY + headR + kH * 0.03;     // hombros
    const torsoH  = kH * 0.30;
    const torsoW  = kW;
    const waistY  = shldrY + torsoH;
    const armY    = shldrY + kH * 0.06;              // altura de los brazos
    const armReach = kH * 0.42;                      // alcance de los brazos (hacia arriba/abajo)
    const gloveR  = kH * 0.062;
    const legLen  = kH * 0.26;
    const legW    = kW * 0.30;

    // ─ Sombra suave debajo del arquero ─
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(cx, ky + kH + 5, kH * 0.32, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // ─ GLOW del arquero ─
    ctx.shadowColor = color;
    ctx.shadowBlur  = 22;

    // ─ BRAZOS abiertos (verticalmente en el arco — arriba y abajo) ─
    // En futbolito el arquero tiene los brazos extendidos cubriendo
    // la apertura vertical del arco → se dibujan como 2 líneas
    // que salen de los hombros hacia arriba y hacia abajo.
    ctx.strokeStyle = color;
    ctx.lineWidth   = kH * 0.085;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - kW * 0.15, armY);            // hombro izq
    ctx.lineTo(cx - kW * 0.15, armY - armReach); // mano arriba izq
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + kW * 0.15, armY);
    ctx.lineTo(cx + kW * 0.15, armY - armReach); // mano arriba der
    ctx.stroke();
    // También brazos hacia abajo (posición defensiva)
    ctx.lineWidth = kH * 0.065;
    ctx.beginPath();
    ctx.moveTo(cx - kW * 0.20, shldrY + torsoH * 0.4);
    ctx.lineTo(cx - kW * 0.28, waistY + kH * 0.08);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + kW * 0.20, shldrY + torsoH * 0.4);
    ctx.lineTo(cx + kW * 0.28, waistY + kH * 0.08);
    ctx.stroke();

    // ─ TORSO (camiseta de arquero) ─
    ctx.fillStyle = color;
    this._rr(cx - torsoW/2, shldrY, torsoW, torsoH, 5);
    ctx.fill();

    // Franja horizontal en la camiseta
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(cx - torsoW/2, shldrY + torsoH * 0.42, torsoW, torsoH * 0.18);

    ctx.shadowBlur = 0;

    // ─ SHORTS ─
    ctx.fillStyle = this._dark(color);
    this._rr(cx - torsoW*0.45, waistY - 1, torsoW*0.9, kH * 0.13, 3);
    ctx.fill();

    // ─ PIERNAS ─
    ctx.strokeStyle = this._dark(color);
    ctx.lineWidth   = legW * 1.8;
    ctx.lineCap     = 'round';
    ctx.beginPath(); ctx.moveTo(cx - torsoW*0.22, waistY + kH*0.10); ctx.lineTo(cx - torsoW*0.3, waistY + legLen); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + torsoW*0.22, waistY + kH*0.10); ctx.lineTo(cx + torsoW*0.3, waistY + legLen); ctx.stroke();

    // Botines
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.ellipse(cx - torsoW*0.3, waistY + legLen + legW*0.5, legW*1.1, legW*0.7, -0.2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + torsoW*0.3, waistY + legLen + legW*0.5, legW*1.1, legW*0.7,  0.2, 0, Math.PI*2); ctx.fill();

    // ─ CABEZA ─
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 5;
    ctx.fillStyle   = '#ffd5a8';
    ctx.beginPath(); ctx.arc(cx, headCY, headR, 0, Math.PI * 2); ctx.fill();
    // Pelo
    ctx.fillStyle = '#2c1810';
    ctx.beginPath(); ctx.arc(cx, headCY - headR*0.12, headR*1.03, Math.PI, 0); ctx.fill();
    // Ojos
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(cx - headR*0.33, headCY - headR*0.1, headR*0.12, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + headR*0.33, headCY - headR*0.1, headR*0.12, 0, Math.PI*2); ctx.fill();

    // ─ GUANTES en las manos arriba ─
    ctx.shadowColor = 'rgba(255,255,200,0.7)'; ctx.shadowBlur = 10;
    ctx.fillStyle   = '#fffde0';
    ctx.beginPath(); ctx.arc(cx - kW*0.15, armY - armReach, gloveR, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + kW*0.15, armY - armReach, gloveR, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;

    // ─ BANDERA encima del arco ─
    this._flagAbove(flagImg, side);
  }

  _flagAbove(img, side) {
    const { ctx, W, gD, gH, gY } = this;
    if (!img.complete || img.naturalWidth === 0) return;
    const fw = Math.min(52, gD * 0.88);
    const fh = Math.round(fw * 0.65);
    const cx = side === 'left' ? gD / 2 : W - gD / 2;
    const fy = gY - fh - 12;

    ctx.save();
    // Marco
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#111';
    this._rr(cx - fw/2 - 2, fy - 2, fw + 4, fh + 4, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Bandera recortada
    ctx.beginPath();
    this._rr(cx - fw/2, fy, fw, fh, 3);
    ctx.clip();
    ctx.drawImage(img, cx - fw/2, fy, fw, fh);
    ctx.restore();

    // Nombre del equipo
    const fs = Math.max(9, Math.round(this.H * 0.036));
    ctx.fillStyle    = '#fff';
    ctx.font         = `700 ${fs}px Inter, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor  = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4;
    const nm = side === 'left' ? this.home.name : this.away.name;
    ctx.fillText(nm.length > 11 ? nm.slice(0, 11) + '…' : nm, cx, fy + fh + 4);
    ctx.shadowBlur = 0;
  }

  _ball() {
    const { ctx, bR } = this;
    const { x, y } = this.ball;

    // Sombra
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(x+2, y+bR*0.65, bR*0.76, bR*0.28, 0, 0, Math.PI*2); ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.ballAngle);

    // Clip circular ANTES de dibujar — sólo afecta dentro del save/restore
    ctx.beginPath(); ctx.arc(0, 0, bR, 0, Math.PI*2); ctx.clip();

    // Pelota blanca
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(255,255,255,0.5)'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(0, 0, bR, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;

    // Manchas negras (quedan clippeadas al círculo)
    ctx.fillStyle = '#111';
    [[0,0],[bR*.48,-bR*.48],[-bR*.48,-bR*.48],[bR*.48,bR*.48],[-bR*.48,bR*.48]].forEach(([px,py]) => {
      ctx.beginPath(); ctx.arc(px, py, bR*0.23, 0, Math.PI*2); ctx.fill();
    });

    // Brillo
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath(); ctx.ellipse(-bR*.3, -bR*.32, bR*.22, bR*.14, -Math.PI/4, 0, Math.PI*2); ctx.fill();

    ctx.restore(); // remueve el clip — todo lo que viene después dibuja sobre el canvas entero

    // Anillo pulsante en idle
    if (this.phase === 'ready' && !this.drag) {
      const p = 0.5 + 0.5*Math.sin(Date.now()/480);
      ctx.strokeStyle = `rgba(255,220,50,${0.25+p*0.45})`; ctx.lineWidth = 2.5; ctx.setLineDash([5,5]);
      ctx.beginPath(); ctx.arc(x, y, bR+7+p*5, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  _arrow() {
    const { ctx, ball } = this;
    const dx = this.dragCur.x - this.drag.x;
    const dy = this.dragCur.y - this.drag.y;
    const d  = Math.hypot(dx, dy);
    if (d < 8) return;
    const nx = dx/d, ny = dy/d;
    const len = Math.min(d*.82, 95);
    const ex = ball.x + nx*len, ey = ball.y + ny*len;
    const al = Math.min(d/45, 1);

    ctx.strokeStyle = `rgba(255,220,50,${.7*al})`; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.setLineDash([]);
    ctx.shadowColor = 'rgba(255,220,50,.5)'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(ex, ey); ctx.stroke();

    const ang = Math.atan2(dy, dx);
    ctx.fillStyle = `rgba(255,220,50,${.9*al})`;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - 17*Math.cos(ang-.38), ey - 17*Math.sin(ang-.38));
    ctx.lineTo(ex - 17*Math.cos(ang+.38), ey - 17*Math.sin(ang+.38));
    ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
  }

  _drawParticles() {
    this.particles.forEach(p => {
      this.ctx.globalAlpha = p.life; this.ctx.fillStyle = p.color;
      this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); this.ctx.fill();
    });
    this.ctx.globalAlpha = 1;
  }

  _msgBox() {
    const { ctx, W, H, phase } = this;
    const isG = phase === 'scored', isS = phase === 'saved';
    const mW = Math.min(W*.68, 340), mH = 52;
    ctx.shadowColor = isG ? '#f0b429' : isS ? '#1f6feb' : '#000'; ctx.shadowBlur = 24;
    ctx.fillStyle   = isG ? 'rgba(240,180,41,.96)' : isS ? 'rgba(31,111,235,.96)' : 'rgba(30,30,30,.92)';
    this._rr((W-mW)/2, (H-mH)/2, mW, mH, 26); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = isG ? '#000' : '#fff';
    ctx.font = `700 ${Math.max(13, Math.round(H*.053))}px Inter,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.message, W/2, H/2+1);
  }

  _hint() {
    const { ctx, W, H } = this;
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.font = `${Math.max(10, Math.round(H*.035))}px Inter,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('⬅  arrastrá la pelota hacia un arco  ➡', W/2, H-5);
  }

  // ── UTILS ────────────────────────────────────────────────────────────────

  _rr(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y); ctx.closePath();
  }

  _dark(hsl) {
    return hsl.replace(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/, (_, h, s, l) => `hsl(${h},${s}%,${Math.max(18,+l-18)}%)`);
  }

  _loop() { this._update(); this._draw(); requestAnimationFrame(() => this._loop()); }
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (window.GAME_CONFIG) new KeeperGame(window.GAME_CONFIG);

  // Animar barras de sabiduría
  document.querySelectorAll('.wisdom-bar').forEach((b, i) => {
    const w = b.style.width; b.style.width = '0%';
    setTimeout(() => { b.style.width = w; }, 300 + i * 100);
  });
});
