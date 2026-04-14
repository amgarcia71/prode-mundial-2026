// ═══════════════════════════════════════════════════════════════════════
//  PRODE 2026 — Cancha interactiva con arquero Pong
//  Arrastrá la pelota hacia los arcos para pronosticar goles.
//  El arquero se mueve solo; si te ataja, reiniciás la pelota.
// ═══════════════════════════════════════════════════════════════════════

class KeeperGame {
  constructor(cfg) {
    this.canvas  = document.getElementById('gameCanvas');
    this.ctx     = this.canvas.getContext('2d');
    this.home    = cfg.home;   // { name, flag }
    this.away    = cfg.away;
    this.score   = { home: cfg.initialHome || 0, away: cfg.initialAway || 0 };

    // Pre-cargar banderas
    this.homeImg = this._loadImg(`https://flagcdn.com/w160/${cfg.home.flag}.png`);
    this.awayImg = this._loadImg(`https://flagcdn.com/w160/${cfg.away.flag}.png`);

    // Colores de arquero basados en nombre del equipo
    this.homeColor = this._teamColor(cfg.home.name);
    this.awayColor = this._teamColor(cfg.away.name, 180);

    this.particles = [];
    this.phase     = 'ready'; // ready | shooting | scored | saved | missed
    this.message   = null;
    this.msgTimer  = 0;
    this.ballAngle = 0;
    this.drag      = null;
    this.dragCur   = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this._setupInput();
    this._syncUI();
    this._loop();
  }

  // ── INIT ────────────────────────────────────────────────────────────────

  resize() {
    const wrapper = document.getElementById('canvasWrapper');
    const W = wrapper ? wrapper.offsetWidth : 700;
    const H = Math.max(200, Math.min(300, W * 0.36));
    this.canvas.width  = this.W = W;
    this.canvas.height = this.H = H;
    this._initMetrics();
    this._resetBallPos();
  }

  _initMetrics() {
    const { W, H } = this;
    this.gD  = Math.round(Math.min(68, W * 0.09));  // goal depth
    this.gH  = Math.round(H * 0.56);                // goal height
    this.gY  = Math.round((H - this.gH) / 2);       // goal top Y
    this.kW  = Math.max(13, Math.round(W * 0.021)); // keeper width
    this.kH  = Math.round(this.gH * 0.28);          // keeper height
    this.bR  = Math.max(11, Math.round(H * 0.044)); // ball radius

    if (!this.hk) this.hk = { y: H/2 - this.kH/2, vy: 2.4 };
    if (!this.ak) this.ak = { y: H/2 - this.kH/2, vy: -2.1 };

    // Keeper x positions (inside goal mouth)
    this.hk.x = this.gD - this.kW - 5;
    this.ak.x = W - this.gD + 5;
  }

  _resetBallPos() {
    if (!this.ball) this.ball = { x: 0, y: 0, vx: 0, vy: 0 };
    this.ball.x  = this.W / 2;
    this.ball.y  = this.H / 2;
    this.ball.vx = 0;
    this.ball.vy = 0;
  }

  _loadImg(src) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    return img;
  }

  _teamColor(name, offset = 0) {
    let h = offset;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xfffff;
    return `hsl(${h % 360}, 75%, 48%)`;
  }

  // ── INPUT ───────────────────────────────────────────────────────────────

  _setupInput() {
    const c = this.canvas;
    const xy = (e) => {
      const r = c.getBoundingClientRect();
      return { x: (e.clientX ?? e.touches[0].clientX) - r.left,
               y: (e.clientY ?? e.touches[0].clientY) - r.top };
    };
    const xyt = (e) => {
      const t = e.changedTouches[0] || e.touches[0];
      const r = c.getBoundingClientRect();
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };

    c.addEventListener('mousedown',  e => this._down(xy(e)));
    c.addEventListener('mousemove',  e => { if (this.drag) this._move(xy(e)); });
    c.addEventListener('mouseup',    e => this._up());
    c.addEventListener('mouseleave', () => { this.drag = null; });

    c.addEventListener('touchstart', e => { e.preventDefault(); this._down(xyt(e)); }, { passive: false });
    c.addEventListener('touchmove',  e => { e.preventDefault(); if (this.drag) this._move(xyt(e)); }, { passive: false });
    c.addEventListener('touchend',   e => { e.preventDefault(); this._up(); }, { passive: false });
  }

  _down(p) {
    if (this.phase !== 'ready') return;
    if (Math.hypot(p.x - this.ball.x, p.y - this.ball.y) < this.bR * 3.8) {
      this.drag    = p;
      this.dragCur = { ...p };
    }
  }
  _move(p) { this.dragCur = p; }
  _up() {
    if (!this.drag || this.phase !== 'ready') { this.drag = null; return; }
    const dx   = this.dragCur.x - this.drag.x;
    const dy   = this.dragCur.y - this.drag.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 18) {
      const spd     = Math.min(dist * 0.34, 26);
      this.ball.vx  = (dx / dist) * spd;
      this.ball.vy  = (dy / dist) * spd;
      this.phase    = 'shooting';
    }
    this.drag = null;
  }

  // ── GAME LOGIC ──────────────────────────────────────────────────────────

  _update() {
    this._moveKeepers();
    this._updateParticles();

    if (this.phase === 'shooting') {
      this.ball.vx *= 0.991;
      this.ball.vy *= 0.991;
      this.ball.x  += this.ball.vx;
      this.ball.y  += this.ball.vy;
      this.ballAngle += Math.hypot(this.ball.vx, this.ball.vy) * 0.05;
      this._checkBounds();
    }

    if (this.msgTimer > 0) {
      this.msgTimer--;
      if (this.msgTimer === 0) this.message = null;
    }
  }

  _moveKeepers() {
    const { gY, gH, kH, hk, ak } = this;
    const min = gY, max = gY + gH - kH;
    const clamp = (v) => Math.max(min, Math.min(max, v));

    if (this.phase === 'ready' || this.phase === 'scored' || this.phase === 'missed') {
      // Pong bounce — small random nudge to avoid monotony
      hk.y += hk.vy;
      if (hk.y <= min) { hk.y = min; hk.vy =  Math.abs(hk.vy) + Math.random() * 0.4; }
      if (hk.y >= max) { hk.y = max; hk.vy = -Math.abs(hk.vy) - Math.random() * 0.4; }
      ak.y += ak.vy;
      if (ak.y <= min) { ak.y = min; ak.vy =  Math.abs(ak.vy) + Math.random() * 0.4; }
      if (ak.y >= max) { ak.y = max; ak.vy = -Math.abs(ak.vy) - Math.random() * 0.4; }

    } else if (this.phase === 'shooting') {
      // The keeper the ball is heading toward reacts; the other keeps bouncing
      const trackSpd = 4.2;
      const target   = clamp(this.ball.y - kH / 2);

      if (this.ball.vx < 0) {
        // Heading left → home keeper tracks
        hk.y += Math.sign(target - hk.y) * Math.min(Math.abs(target - hk.y), trackSpd);
        ak.y  = clamp(ak.y + ak.vy);
      } else {
        // Heading right → away keeper tracks
        ak.y += Math.sign(target - ak.y) * Math.min(Math.abs(target - ak.y), trackSpd);
        hk.y  = clamp(hk.y + hk.vy);
      }

    } else if (this.phase === 'saved') {
      // Both keepers continue bouncing (celebration)
      hk.y = clamp(hk.y + hk.vy * 1.5);
      ak.y = clamp(ak.y + ak.vy * 1.5);
    }
  }

  _checkBounds() {
    const { W, H, gY, gH, gD, bR, ball } = this;

    // ── LEFT GOAL ──
    if (ball.x - bR <= gD) {
      if (ball.y >= gY && ball.y <= gY + gH) {
        if (this._hitsKeeper(ball, this.hk)) {
          this._doSave(ball, +1);
        } else {
          this._doGoal('home');
        }
      } else {
        this._doMissed(ball, +1); // bounced off post
      }
      return;
    }

    // ── RIGHT GOAL ──
    if (ball.x + bR >= W - gD) {
      if (ball.y >= gY && ball.y <= gY + gH) {
        if (this._hitsKeeper(ball, this.ak)) {
          this._doSave(ball, -1);
        } else {
          this._doGoal('away');
        }
      } else {
        this._doMissed(ball, -1);
      }
      return;
    }

    // ── TOP / BOTTOM WALLS ──
    if (ball.y - bR <= 0)     { ball.y = bR;      ball.vy =  Math.abs(ball.vy) * 0.7; }
    if (ball.y + bR >= H)     { ball.y = H - bR;  ball.vy = -Math.abs(ball.vy) * 0.7; }

    // ── STALL (perdió toda velocidad en el medio) ──
    if (Math.abs(ball.vx) < 0.4 && Math.abs(ball.vy) < 0.4) {
      this._setMsg('😬 Sin potencia — volvé a patear', 80, 'missed');
      setTimeout(() => this._resetShot(), 1300);
    }
  }

  _hitsKeeper(ball, keeper) {
    const kcx = keeper.x + this.kW / 2;
    const kcy = keeper.y + this.kH / 2;
    return Math.hypot(ball.x - kcx, ball.y - kcy) < (this.bR + Math.max(this.kW, this.kH) * 0.55);
  }

  _doGoal(team) {
    this.score[team]++;
    const name = team === 'home' ? this.home.name : this.away.name;
    this._setMsg(`⚽  ¡GOOOL!  ${name}`, 120, 'scored');
    this._spawnParticles(team);
    this._syncUI();
    setTimeout(() => this._resetShot(), 2100);
  }

  _doSave(ball, sign) {
    // Ball bounces back toward center
    ball.vx = sign * Math.abs(ball.vx) * 0.5 + sign * (2 + Math.random() * 3);
    ball.vy = (Math.random() - 0.5) * 9;
    this._setMsg('🧤  ¡ATAJADA!  Volvé a intentar', 110, 'saved');
    setTimeout(() => {
      this.phase = 'ready';
      this.message = null;
    }, 1700);
  }

  _doMissed(ball, sign) {
    ball.vx = sign * Math.abs(ball.vx) * 0.4;
    ball.vy = -ball.vy * 0.5;
    this._setMsg('📯  Afuera del arco', 80, 'missed');
    setTimeout(() => this._resetShot(), 1300);
  }

  _setMsg(txt, frames, phase) {
    this.message  = txt;
    this.msgTimer = frames;
    this.phase    = phase;
  }

  _resetShot() {
    this._resetBallPos();
    this.ballAngle = 0;
    this.message   = null;
    this.phase     = 'ready';
  }

  _syncUI() {
    const sd = document.getElementById('gameScoreDisplay');
    const hi = document.getElementById('homeScoreInput');
    const ai = document.getElementById('awayScoreInput');
    const ch = document.getElementById('confirmHome');
    const ca = document.getElementById('confirmAway');
    const { home, away } = this.score;

    if (sd) sd.textContent = `${home} – ${away}`;
    if (hi) hi.value = home;
    if (ai) ai.value = away;
    if (ch) ch.textContent = home;
    if (ca) ca.textContent = away;
  }

  // ── PARTICLES ───────────────────────────────────────────────────────────

  _spawnParticles(team) {
    const cx = team === 'home' ? this.gD * 0.5 : this.W - this.gD * 0.5;
    const cy = this.H / 2;
    for (let i = 0; i < 32; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 3 + Math.random() * 9;
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 4,
        life: 1,
        color: `hsl(${30 + Math.random() * 60},100%,${55 + Math.random() * 20}%)`,
        r: 2 + Math.random() * 4
      });
    }
  }

  _updateParticles() {
    this.particles = this.particles.filter(p => {
      p.x    += p.vx;
      p.y    += p.vy;
      p.vy   += 0.35;
      p.life -= 0.022;
      return p.life > 0;
    });
  }

  // ── DRAW ────────────────────────────────────────────────────────────────

  _draw() {
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);
    this._drawField();
    this._drawGoal('left');
    this._drawGoal('right');
    this._drawParticles();
    this._drawKeeper(this.hk, this.homeColor);
    this._drawKeeper(this.ak, this.awayColor);
    if (this.drag && this.dragCur) this._drawArrow();
    this._drawBall();
    this._drawFlags();
    if (this.message) this._drawMessage();
    if (this.phase === 'ready' && !this.drag) this._drawIdleHint();
  }

  _drawField() {
    const { ctx, W, H, gD } = this;

    // Franjas de pasto
    const strW = W / 8;
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#1b5e20' : '#1e7323';
      ctx.fillRect(i * strW, 0, strW, H);
    }

    // Borde exterior
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth   = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(3, 3, W - 6, H - 6);

    // Línea central
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(W/2, 6); ctx.lineTo(W/2, H-6); ctx.stroke();

    // Círculo central
    ctx.beginPath(); ctx.arc(W/2, H/2, H * 0.19, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    // Punto central
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.arc(W/2, H/2, 4, 0, Math.PI * 2); ctx.fill();

    // Áreas de penalti
    const pW = W * 0.11, pY = H * 0.22, pH = H * 0.56;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(gD, pY, pW, pH);
    ctx.strokeRect(W - gD - pW, pY, pW, pH);
  }

  _drawGoal(side) {
    const { ctx, W, gD, gH, gY } = this;
    const isLeft = side === 'left';
    const x      = isLeft ? 0 : W - gD;
    const openX  = isLeft ? gD : W - gD;

    // Red del arco
    const grad = ctx.createLinearGradient(x, 0, x + gD, 0);
    grad.addColorStop(isLeft ? 0 : 1, 'rgba(0,0,0,0.55)');
    grad.addColorStop(isLeft ? 1 : 0, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, gY, gD, gH);

    // Grilla de red
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = 0.6;
    ctx.setLineDash([]);
    const ns = 10;
    for (let nx = x; nx <= x + gD; nx += ns) {
      ctx.beginPath(); ctx.moveTo(nx, gY); ctx.lineTo(nx, gY + gH); ctx.stroke();
    }
    for (let ny = gY; ny <= gY + gH; ny += ns) {
      ctx.beginPath(); ctx.moveTo(x, ny); ctx.lineTo(x + gD, ny); ctx.stroke();
    }

    // Postes blancos con brillo
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 5;
    ctx.lineCap     = 'round';
    ctx.shadowColor = 'rgba(255,255,255,0.7)';
    ctx.shadowBlur  = 8;
    ctx.setLineDash([]);

    ctx.beginPath(); ctx.moveTo(openX, gY);         ctx.lineTo(openX, gY + gH); ctx.stroke(); // poste lateral
    ctx.beginPath(); ctx.moveTo(x, gY);              ctx.lineTo(openX, gY);      ctx.stroke(); // travesaño superior
    ctx.beginPath(); ctx.moveTo(x, gY + gH);         ctx.lineTo(openX, gY + gH);ctx.stroke(); // travesaño inferior
    ctx.shadowBlur = 0;
  }

  _drawKeeper(keeper, color) {
    const { ctx, kW, kH } = this;
    const { x, y } = keeper;
    const cx = x + kW / 2;

    // Sombra / glow del arquero
    ctx.shadowColor = color;
    ctx.shadowBlur  = 16;

    // Cuerpo
    ctx.fillStyle = color;
    this._rrect(x, y, kW, kH, 5);
    ctx.fill();

    // Reflejo lateral
    const hl = ctx.createLinearGradient(x, y, x + kW, y);
    hl.addColorStop(0,   'rgba(255,255,255,0.35)');
    hl.addColorStop(0.5, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = hl;
    this._rrect(x, y, kW, kH, 5);
    ctx.fill();

    ctx.shadowBlur = 0;

    // Cabeza
    ctx.fillStyle = '#ffd5a8';
    ctx.beginPath();
    ctx.arc(cx, y - kH * 0.1, kW * 0.44, 0, Math.PI * 2);
    ctx.fill();

    // Guantes
    ctx.fillStyle = '#ffffcc';
    const g = (gx, gy) => { ctx.beginPath(); ctx.arc(gx, gy, 4.5, 0, Math.PI*2); ctx.fill(); };
    g(x - 3, y + kH * 0.28);
    g(x + kW + 3, y + kH * 0.28);
    g(x - 3, y + kH * 0.70);
    g(x + kW + 3, y + kH * 0.70);
  }

  _drawBall() {
    const { ctx, bR } = this;
    const { x, y } = this.ball;

    // Sombra
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + bR * 0.65, bR * 0.78, bR * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.ballAngle);

    // Pelota blanca
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor = 'rgba(255,255,255,0.5)';
    ctx.shadowBlur  = 7;
    ctx.beginPath();
    ctx.arc(0, 0, bR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Manchas negras (5 puntos tipo pelota oficial)
    ctx.fillStyle = '#111';
    const pts = [[0,0],[bR*0.48,-bR*0.48],[-bR*0.48,-bR*0.48],[bR*0.48,bR*0.48],[-bR*0.48,bR*0.48]];
    pts.forEach(([px,py]) => {
      ctx.beginPath(); ctx.arc(px, py, bR * 0.23, 0, Math.PI*2); ctx.fill();
    });

    // Clip circular
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, bR, 0, Math.PI*2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // Brillo
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath();
    ctx.ellipse(-bR*0.3, -bR*0.32, bR*0.22, bR*0.14, -Math.PI/4, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();

    // Anillo pulsante cuando está listo para patear
    if (this.phase === 'ready' && !this.drag) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 480);
      ctx.strokeStyle = `rgba(255,220,50,${0.25 + pulse * 0.4})`;
      ctx.lineWidth   = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(x, y, bR + 7 + pulse * 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  _drawArrow() {
    const { ctx, ball } = this;
    const dx   = this.dragCur.x - this.drag.x;
    const dy   = this.dragCur.y - this.drag.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 8) return;

    const nx    = dx / dist;
    const ny    = dy / dist;
    const len   = Math.min(dist * 0.82, 95);
    const ex    = ball.x + nx * len;
    const ey    = ball.y + ny * len;
    const alpha = Math.min(dist / 45, 1);

    // Línea de tiro
    ctx.strokeStyle = `rgba(255,220,50,${0.72 * alpha})`;
    ctx.lineWidth   = 3.5;
    ctx.lineCap     = 'round';
    ctx.setLineDash([]);
    ctx.shadowColor = 'rgba(255,220,50,0.5)';
    ctx.shadowBlur  = 10;
    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Punta de flecha
    const ang = Math.atan2(dy, dx);
    ctx.fillStyle = `rgba(255,220,50,${0.9 * alpha})`;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - 17 * Math.cos(ang - 0.38), ey - 17 * Math.sin(ang - 0.38));
    ctx.lineTo(ex - 17 * Math.cos(ang + 0.38), ey - 17 * Math.sin(ang + 0.38));
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  _drawFlags() {
    const { ctx, W, gD, gY, gH, homeImg, awayImg } = this;
    const fw = Math.round(Math.min(50, gD * 0.82));
    const fh = Math.round(fw * 0.66);
    const fy = gY - fh - 10;
    const homeFX = Math.round(gD / 2 - fw / 2);
    const awayFX = Math.round(W - gD / 2 - fw / 2);

    const drawF = (img, fx) => {
      if (!img.complete || img.naturalWidth === 0) return;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur  = 6;
      ctx.fillStyle   = '#000';
      this._rrect(fx - 2, fy - 2, fw + 4, fh + 4, 4);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      this._rrect(fx, fy, fw, fh, 3);
      ctx.clip();
      ctx.drawImage(img, fx, fy, fw, fh);
      ctx.restore();
    };
    drawF(homeImg, homeFX);
    drawF(awayImg, awayFX);

    // Nombres de equipos
    const fs = Math.max(9, Math.round(this.H * 0.038));
    ctx.fillStyle    = 'rgba(255,255,255,0.88)';
    ctx.font         = `700 ${fs}px Inter, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor  = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur   = 4;
    const trunc = (s, n=11) => s.length > n ? s.slice(0, n) + '…' : s;
    ctx.fillText(trunc(this.home.name), gD / 2,       fy + fh + 4);
    ctx.fillText(trunc(this.away.name), W - gD / 2,   fy + fh + 4);
    ctx.shadowBlur = 0;
  }

  _drawParticles() {
    const ctx = this.ctx;
    this.particles.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  _drawMessage() {
    const { ctx, W, H, phase, message } = this;
    const isGoal = phase === 'scored';
    const isSave = phase === 'saved';

    const bg = isGoal ? 'rgba(240,180,41,0.96)'
             : isSave ? 'rgba(31,111,235,0.96)'
             :          'rgba(30,30,30,0.90)';
    const fg = isGoal ? '#000' : '#fff';

    const mW = Math.min(W * 0.68, 330);
    const mH = 52;
    const mx = (W - mW) / 2;
    const my = (H - mH) / 2;

    ctx.shadowColor = isGoal ? '#f0b429' : isSave ? '#1f6feb' : '#000';
    ctx.shadowBlur  = 22;
    ctx.fillStyle   = bg;
    this._rrect(mx, my, mW, mH, 26);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle    = fg;
    ctx.font         = `700 ${Math.max(13, Math.round(H * 0.054))}px Inter, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, W / 2, H / 2 + 1);
  }

  _drawIdleHint() {
    const { ctx, W, H } = this;
    ctx.fillStyle    = 'rgba(255,255,255,0.3)';
    ctx.font         = `${Math.max(10, Math.round(H * 0.036))}px Inter, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('⬅  arrastrá la pelota hacia un arco  ➡', W / 2, H - 5);
  }

  _rrect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y,         x + r, y);
    ctx.closePath();
  }

  // ── LOOP ────────────────────────────────────────────────────────────────

  _loop() {
    this._update();
    this._draw();
    requestAnimationFrame(() => this._loop());
  }
}

// ── BOOT ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  if (window.GAME_CONFIG) {
    new KeeperGame(window.GAME_CONFIG);
  }

  // Animate wisdom bars
  document.querySelectorAll('.wisdom-bar').forEach((bar, i) => {
    const w = bar.style.width;
    bar.style.width = '0%';
    setTimeout(() => { bar.style.width = w; }, 300 + i * 100);
  });
});
