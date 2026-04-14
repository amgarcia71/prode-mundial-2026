const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./lib/db');
const { calculatePoints } = require('./lib/scoring');
const helpers = require('./lib/helpers');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'mundial2026-prode-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

const requireAuth = (req, res, next) => {
  if (!req.session.userId) return res.redirect('/');
  next();
};
const requireAdmin = (req, res, next) => {
  const user = db.getUser(req.session.userId);
  if (!user || !user.isAdmin) return res.redirect('/dashboard');
  next();
};

app.use((req, res, next) => {
  res.locals.currentUser = req.session.userId ? db.getUser(req.session.userId) : null;
  res.locals.h = helpers;
  res.locals.path = req.path;
  next();
});

// ── AUTH ──────────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = db.getUserByEmail(email);
  if (!user) return res.render('login', { error: 'Correo no encontrado' });
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.render('login', { error: 'Contraseña incorrecta' });
  req.session.userId = user.id;
  res.redirect('/dashboard');
});

app.get('/registro', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('register', { error: null });
});

app.post('/registro', async (req, res) => {
  const { name, email, password, department } = req.body;
  if (!name || !email || !password) return res.render('register', { error: 'Todos los campos son requeridos' });
  if (db.getUserByEmail(email)) return res.render('register', { error: 'Este correo ya está registrado' });
  const hashed = await bcrypt.hash(password, 10);
  const user = {
    id: uuidv4(), name, email, password: hashed,
    department: department || 'General',
    points: 0, exactPredictions: 0, partialPredictions: 0,
    isAdmin: false, createdAt: new Date().toISOString()
  };
  db.saveUser(user);
  req.session.userId = user.id;
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ── DASHBOARD ─────────────────────────────────────────────────────────────────

app.get('/dashboard', requireAuth, (req, res) => {
  const user = db.getUser(req.session.userId);
  const matches = db.getMatches();
  const predictions = db.getPredictionsByUser(user.id);
  const users = db.getUsers();
  const now = new Date();

  const upcoming = matches
    .filter(m => m.status === 'scheduled')
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 6)
    .map(m => ({
      ...m,
      prediction: predictions.find(p => p.matchId === m.id) || null,
      canPredict: new Date(m.date) > now
    }));

  const recentResults = matches
    .filter(m => m.status === 'finished')
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 4)
    .map(m => ({ ...m, prediction: predictions.find(p => p.matchId === m.id) || null }));

  const sorted = [...users].sort((a, b) => b.points - a.points);
  const userRank = sorted.findIndex(u => u.id === user.id) + 1;
  const top5 = sorted.slice(0, 5).map((u, i) => ({ ...u, rank: i + 1 }));

  const totalPred = predictions.length;
  const exact = predictions.filter(p => p.points === 3).length;
  const partial = predictions.filter(p => p.points === 1).length;
  const totalFinished = matches.filter(m => m.status === 'finished').length;

  res.render('dashboard', {
    user: { ...user, rank: userRank },
    upcoming, recentResults, top5,
    stats: { totalPred, exact, partial, totalFinished, totalMatches: matches.length }
  });
});

// ── PARTIDOS ──────────────────────────────────────────────────────────────────

app.get('/partidos', requireAuth, (req, res) => {
  const user = db.getUser(req.session.userId);
  const matches = db.getMatches();
  const predictions = db.getPredictionsByUser(user.id);
  const now = new Date();

  const groups = {};
  matches.forEach(m => {
    if (!groups[m.group]) groups[m.group] = [];
    groups[m.group].push({
      ...m,
      prediction: predictions.find(p => p.matchId === m.id) || null,
      canPredict: new Date(m.date) > now && m.status === 'scheduled'
    });
  });
  Object.keys(groups).forEach(g => {
    groups[g].sort((a, b) => new Date(a.date) - new Date(b.date));
  });

  const allGroups = Object.keys(groups).sort();
  const selectedGroup = req.query.grupo || allGroups[0];
  res.render('matches', { groups, selectedGroup, allGroups });
});

// ── PRONOSTICAR ───────────────────────────────────────────────────────────────

app.get('/pronosticar/:matchId', requireAuth, (req, res) => {
  const match = db.getMatch(req.params.matchId);
  if (!match) return res.redirect('/partidos');
  const user = db.getUser(req.session.userId);
  const prediction = db.getPrediction(user.id, match.id);
  const now = new Date();
  if (new Date(match.date) <= now) return res.redirect('/partidos');

  const allPreds = db.getPredictionsByMatch(match.id);
  const hw = allPreds.filter(p => p.homeScore > p.awayScore).length;
  const dr = allPreds.filter(p => p.homeScore === p.awayScore).length;
  const aw = allPreds.filter(p => p.homeScore < p.awayScore).length;
  const total = allPreds.length || 1;

  res.render('predict', {
    match, prediction,
    wisdom: {
      home: Math.round(hw / total * 100),
      draw: Math.round(dr / total * 100),
      away: Math.round(aw / total * 100),
      count: allPreds.length
    }
  });
});

app.post('/pronosticar/:matchId', requireAuth, (req, res) => {
  const match = db.getMatch(req.params.matchId);
  if (!match || new Date(match.date) <= new Date()) return res.redirect('/partidos');
  const user = db.getUser(req.session.userId);
  const existing = db.getPrediction(user.id, match.id);
  db.savePrediction({
    id: existing ? existing.id : uuidv4(),
    userId: user.id,
    matchId: match.id,
    homeScore: parseInt(req.body.homeScore) || 0,
    awayScore: parseInt(req.body.awayScore) || 0,
    points: null,
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  res.redirect('/partidos?grupo=' + match.group);
});

// ── CLASIFICACIÓN ─────────────────────────────────────────────────────────────

app.get('/clasificacion', requireAuth, (req, res) => {
  const users = db.getUsers();
  const { dpto } = req.query;
  const filtered = dpto ? users.filter(u => u.department === dpto) : users;
  const rankings = [...filtered]
    .sort((a, b) => b.points - a.points || b.exactPredictions - a.exactPredictions)
    .map((u, i) => ({ ...u, rank: i + 1 }));
  const departments = [...new Set(users.map(u => u.department))].sort();
  res.render('rankings', { rankings, departments, selectedDept: dpto, currentUser: db.getUser(req.session.userId) });
});

// ── BANTER WALL ───────────────────────────────────────────────────────────────

app.get('/banter', requireAuth, (req, res) => {
  const messages = db.getMessages();
  const users = db.getUsers();
  const user = db.getUser(req.session.userId);
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  const enriched = [...messages]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 100)
    .map(m => ({
      ...m,
      user: userMap[m.userId] || { name: 'Anónimo', department: '' },
      isOwn: m.userId === user.id
    }));

  res.render('chat', { messages: enriched, user });
});

app.post('/banter', requireAuth, (req, res) => {
  const { message } = req.body;
  if (message && message.trim().length > 0) {
    const user = db.getUser(req.session.userId);
    db.saveMessage({
      id: uuidv4(),
      userId: user.id,
      message: message.trim().slice(0, 500),
      createdAt: new Date().toISOString()
    });
  }
  res.redirect('/banter');
});

// ── ADMIN ─────────────────────────────────────────────────────────────────────

app.get('/admin', requireAdmin, (req, res) => {
  const matches = db.getMatches().sort((a, b) => new Date(a.date) - new Date(b.date));
  const users = db.getUsers().sort((a, b) => b.points - a.points);
  res.render('admin', { matches, users, success: req.query.ok, error: null });
});

app.post('/admin/resultado', requireAdmin, (req, res) => {
  const { matchId, homeScore, awayScore, status } = req.body;
  const match = db.getMatch(matchId);
  if (!match) return res.redirect('/admin');

  match.homeScore = parseInt(homeScore);
  match.awayScore = parseInt(awayScore);
  match.status = status || 'finished';
  db.saveMatch(match);

  if (match.status === 'finished') {
    const predictions = db.getPredictionsByMatch(matchId);
    predictions.forEach(p => {
      p.points = calculatePoints({ homeScore: p.homeScore, awayScore: p.awayScore }, match);
      db.savePrediction(p);
    });
    // Recalculate all user points
    const affectedUsers = [...new Set(predictions.map(p => p.userId))];
    affectedUsers.forEach(uid => {
      const u = db.getUser(uid);
      if (!u) return;
      const allPreds = db.getPredictionsByUser(uid);
      u.points = allPreds.reduce((s, p) => s + (p.points || 0), 0);
      u.exactPredictions = allPreds.filter(p => p.points === 3).length;
      u.partialPredictions = allPreds.filter(p => p.points === 1).length;
      db.saveUser(u);
    });
  }
  res.redirect('/admin?ok=1');
});

app.post('/admin/status', requireAdmin, (req, res) => {
  const { matchId, status } = req.body;
  const match = db.getMatch(matchId);
  if (match) { match.status = status; db.saveMatch(match); }
  res.redirect('/admin');
});

app.listen(PORT, () => {
  console.log(`\n⚽  PRODE Mundial 2026  →  http://localhost:${PORT}\n`);
  console.log('   Admin: admin@empresa.com / admin123');
  console.log('   Demo:  demo@empresa.com / demo123\n');
});
