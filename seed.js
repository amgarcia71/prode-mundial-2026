const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// ── GRUPOS ────────────────────────────────────────────────────────────────────
// 12 grupos × 4 equipos = 48 equipos (formato expandido FIFA 2026)
const GROUPS = {
  A: [
    { name: 'México',       flag: 'mx', conf: 'CONCACAF' },
    { name: 'Polonia',      flag: 'pl', conf: 'UEFA' },
    { name: 'Marruecos',    flag: 'ma', conf: 'CAF' },
    { name: 'Japón',        flag: 'jp', conf: 'AFC' },
  ],
  B: [
    { name: 'USA',          flag: 'us', conf: 'CONCACAF' },
    { name: 'Países Bajos', flag: 'nl', conf: 'UEFA' },
    { name: 'Senegal',      flag: 'sn', conf: 'CAF' },
    { name: 'Corea del Sur',flag: 'kr', conf: 'AFC' },
  ],
  C: [
    { name: 'Canadá',       flag: 'ca', conf: 'CONCACAF' },
    { name: 'España',       flag: 'es', conf: 'UEFA' },
    { name: 'Nigeria',      flag: 'ng', conf: 'CAF' },
    { name: 'Arabia Saudita',flag: 'sa', conf: 'AFC' },
  ],
  D: [
    { name: 'Honduras',     flag: 'hn', conf: 'CONCACAF' },
    { name: 'Serbia',       flag: 'rs', conf: 'UEFA' },
    { name: 'Ghana',        flag: 'gh', conf: 'CAF' },
    { name: 'Irán',         flag: 'ir', conf: 'AFC' },
  ],
  E: [
    { name: 'Jamaica',      flag: 'jm', conf: 'CONCACAF' },
    { name: 'Austria',      flag: 'at', conf: 'UEFA' },
    { name: 'Costa de Marfil', flag: 'ci', conf: 'CAF' },
    { name: 'Qatar',        flag: 'qa', conf: 'AFC' },
  ],
  F: [
    { name: 'Panamá',       flag: 'pa', conf: 'CONCACAF' },
    { name: 'Rumania',      flag: 'ro', conf: 'UEFA' },
    { name: 'Túnez',        flag: 'tn', conf: 'CAF' },
    { name: 'Iraq',         flag: 'iq', conf: 'AFC' },
  ],
  G: [
    { name: 'Argentina',    flag: 'ar', conf: 'CONMEBOL' },
    { name: 'Francia',      flag: 'fr', conf: 'UEFA' },
    { name: 'Camerún',      flag: 'cm', conf: 'CAF' },
    { name: 'Australia',    conf: 'AFC',flag: 'au' },
  ],
  H: [
    { name: 'Brasil',       flag: 'br', conf: 'CONMEBOL' },
    { name: 'Portugal',     flag: 'pt', conf: 'UEFA' },
    { name: 'Argelia',      flag: 'dz', conf: 'CAF' },
    { name: 'Indonesia',    flag: 'id', conf: 'AFC' },
  ],
  I: [
    { name: 'Colombia',     flag: 'co', conf: 'CONMEBOL' },
    { name: 'Alemania',     flag: 'de', conf: 'UEFA' },
    { name: 'Egipto',       flag: 'eg', conf: 'CAF' },
    { name: 'Jordania',     flag: 'jo', conf: 'AFC' },
  ],
  J: [
    { name: 'Ecuador',      flag: 'ec', conf: 'CONMEBOL' },
    { name: 'Francia',      flag: 'fr', conf: 'UEFA' },  // France is in G, let me fix
    { name: 'Escocia',      flag: 'gb-sct', conf: 'UEFA' },
    { name: 'Eslovenia',    flag: 'si', conf: 'UEFA' },
  ],
  K: [
    { name: 'Uruguay',      flag: 'uy', conf: 'CONMEBOL' },
    { name: 'Turquía',      flag: 'tr', conf: 'UEFA' },
    { name: 'Croacia',      flag: 'hr', conf: 'UEFA' },
    { name: 'Dinamarca',    flag: 'dk', conf: 'UEFA' },
  ],
  L: [
    { name: 'Paraguay',     flag: 'py', conf: 'CONMEBOL' },
    { name: 'Bélgica',      flag: 'be', conf: 'UEFA' },
    { name: 'Italia',       flag: 'it', conf: 'UEFA' },
    { name: 'Suiza',        flag: 'ch', conf: 'UEFA' },
  ],
};

// Fix Group J - France can't be in two groups
GROUPS.J[1] = { name: 'Inglaterra', flag: 'gb-eng', conf: 'UEFA' };

// ── SEDES ─────────────────────────────────────────────────────────────────────
const VENUES = [
  'Estadio Azteca, Ciudad de México',
  'SoFi Stadium, Los Ángeles',
  'MetLife Stadium, Nueva York',
  'AT&T Stadium, Dallas',
  'NRG Stadium, Houston',
  'Arrowhead Stadium, Kansas City',
  'BC Place, Vancouver',
  'BMO Field, Toronto',
  'Lumen Field, Seattle',
  'Lincoln Financial Field, Filadelfia',
  'Gillette Stadium, Boston',
  'Hard Rock Stadium, Miami',
];

// ── FECHAS ────────────────────────────────────────────────────────────────────
// Fase de grupos: 11 jun – 26 jun 2026
// Matchday 1: grupos A-F → Jun 11-13, grupos G-L → Jun 14-16
// Matchday 2: +6 días desde MD1
// Matchday 3: todos simultáneos Jun 25-26

const GROUP_KEYS = Object.keys(GROUPS);

function getMatchDate(groupIdx, matchday, slotIdx) {
  // MD1 starts Jun 11, each day covers 2 groups (4 games)
  const md1BaseDay = 11 + Math.floor(groupIdx / 2);
  const dayOffset = (matchday - 1) * 6;
  const date = new Date(`2026-06-${String(md1BaseDay + dayOffset).padStart(2,'0')}T00:00:00`);
  const hours = [14, 17, 20, 23];
  date.setHours(hours[slotIdx % 4], 0, 0, 0);
  return date.toISOString();
}

// ── GENERAR PARTIDOS ──────────────────────────────────────────────────────────
// Fixture round-robin: (0v1),(2v3) → MD1 | (0v2),(1v3) → MD2 | (0v3),(1v2) → MD3
const FIXTURE = [[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]];

const matches = [];
GROUP_KEYS.forEach((group, gIdx) => {
  const teams = GROUPS[group];
  FIXTURE.forEach(([i, j], fIdx) => {
    const matchday = fIdx < 2 ? 1 : fIdx < 4 ? 2 : 3;
    const slotIdx = fIdx % 2;
    const venueIdx = (gIdx * 6 + fIdx) % VENUES.length;
    matches.push({
      id: `${group}${fIdx + 1}`,
      group,
      matchday,
      homeTeam: teams[i].name,
      homeFlag: teams[i].flag,
      awayTeam: teams[j].name,
      awayFlag: teams[j].flag,
      date: getMatchDate(gIdx, matchday, slotIdx),
      venue: VENUES[venueIdx],
      status: 'scheduled',
      homeScore: null,
      awayScore: null,
      phase: 'Fase de Grupos'
    });
  });
});

// ── USUARIOS ──────────────────────────────────────────────────────────────────
const DEPARTMENTS = ['Ventas','IT','Marketing','Finanzas','RH','Operaciones'];

async function createUsers() {
  const users = [
    { name: 'Admin',          email: 'admin@empresa.com', password: 'admin123', department: 'IT',         isAdmin: true },
    { name: 'Carlos Ruiz',    email: 'demo@empresa.com',  password: 'demo123',  department: 'Ventas',     isAdmin: false },
    { name: 'Ana García',     email: 'ana@empresa.com',   password: 'demo123',  department: 'Marketing',  isAdmin: false },
    { name: 'Luis Pérez',     email: 'luis@empresa.com',  password: 'demo123',  department: 'Finanzas',   isAdmin: false },
    { name: 'María López',    email: 'maria@empresa.com', password: 'demo123',  department: 'RH',         isAdmin: false },
    { name: 'José Hernández', email: 'jose@empresa.com',  password: 'demo123',  department: 'IT',         isAdmin: false },
    { name: 'Laura Martínez', email: 'laura@empresa.com', password: 'demo123',  department: 'Operaciones',isAdmin: false },
    { name: 'Roberto Silva',  email: 'roberto@empresa.com',password:'demo123',  department: 'Ventas',     isAdmin: false },
  ];

  return Promise.all(users.map(async (u) => ({
    id: uuidv4(),
    name: u.name,
    email: u.email,
    password: await bcrypt.hash(u.password, 10),
    department: u.department,
    isAdmin: u.isAdmin,
    points: 0,
    exactPredictions: 0,
    partialPredictions: 0,
    createdAt: new Date().toISOString()
  })));
}

// ── SEED ──────────────────────────────────────────────────────────────────────
async function seed() {
  console.log('🌱 Sembrando datos...');

  // Check if already seeded
  const existingUsers = fs.existsSync(path.join(DATA_DIR, 'users.json'))
    ? JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'users.json'), 'utf8'))
    : [];

  if (existingUsers.length > 0) {
    console.log('⚠️  Ya existen datos. Usa --force para reiniciar.');
    if (!process.argv.includes('--force')) return;
  }

  const users = await createUsers();
  fs.writeFileSync(path.join(DATA_DIR, 'users.json'), JSON.stringify(users, null, 2));
  console.log(`✅ ${users.length} usuarios creados`);

  fs.writeFileSync(path.join(DATA_DIR, 'matches.json'), JSON.stringify(matches, null, 2));
  console.log(`✅ ${matches.length} partidos generados`);

  if (!fs.existsSync(path.join(DATA_DIR, 'predictions.json'))) {
    fs.writeFileSync(path.join(DATA_DIR, 'predictions.json'), '[]');
  }
  if (!fs.existsSync(path.join(DATA_DIR, 'chat.json'))) {
    fs.writeFileSync(path.join(DATA_DIR, 'chat.json'), '[]');
  }

  console.log('\n🏆 PRODE Mundial 2026 listo!\n');
  console.log('   Admin:  admin@empresa.com  /  admin123');
  console.log('   Demo:   demo@empresa.com   /  demo123');
  console.log('\n   Arranca con:  npm start\n');
}

seed().catch(console.error);
