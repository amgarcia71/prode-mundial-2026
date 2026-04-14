const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const days = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

function formatDate(iso) {
  const d = new Date(iso);
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDateFull(iso) {
  const d = new Date(iso);
  return `${days[d.getDay()]} ${d.getDate()} de ${months[d.getMonth()].charAt(0).toUpperCase() + months[d.getMonth()].slice(1)} ${d.getFullYear()}`;
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

function flagUrl(code, size = 80) {
  return `https://flagcdn.com/w${size}/${code}.png`;
}

function pointsBadge(points) {
  if (points === 3) return '<span class="badge badge-gold">+3 pts</span>';
  if (points === 1) return '<span class="badge badge-silver">+1 pt</span>';
  if (points === 0) return '<span class="badge badge-zero">0 pts</span>';
  return '';
}

function matchResult(match) {
  if (match.status !== 'finished') return null;
  const h = match.homeScore, a = match.awayScore;
  if (h > a) return 'home';
  if (a > h) return 'away';
  return 'draw';
}

function predictionResult(pred) {
  if (!pred || pred.points === null) return null;
  return pred.points;
}

module.exports = { formatDate, formatTime, formatDateFull, timeAgo, flagUrl, pointsBadge, matchResult, predictionResult };
