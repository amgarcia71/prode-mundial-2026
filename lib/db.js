const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

function readJSON(file) {
  const filePath = path.join(DATA_DIR, file);
  if (!fs.existsSync(filePath)) return [];
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return []; }
}

function writeJSON(file, data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

// Users
const getUsers = () => readJSON('users.json');
const getUser = (id) => getUsers().find(u => u.id === id);
const getUserByEmail = (email) => getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
function saveUser(user) {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === user.id);
  if (idx >= 0) users[idx] = user; else users.push(user);
  writeJSON('users.json', users);
}

// Matches
const getMatches = () => readJSON('matches.json');
const getMatch = (id) => getMatches().find(m => m.id === id);
function saveMatch(match) {
  const matches = getMatches();
  const idx = matches.findIndex(m => m.id === match.id);
  if (idx >= 0) matches[idx] = match; else matches.push(match);
  writeJSON('matches.json', matches);
}

// Predictions
const getPredictions = () => readJSON('predictions.json');
const getPrediction = (userId, matchId) => getPredictions().find(p => p.userId === userId && p.matchId === matchId);
const getPredictionsByUser = (userId) => getPredictions().filter(p => p.userId === userId);
const getPredictionsByMatch = (matchId) => getPredictions().filter(p => p.matchId === matchId);
function savePrediction(pred) {
  const preds = getPredictions();
  const idx = preds.findIndex(p => p.id === pred.id);
  if (idx >= 0) preds[idx] = pred; else preds.push(pred);
  writeJSON('predictions.json', preds);
}

// Chat
const getMessages = () => readJSON('chat.json');
function saveMessage(msg) {
  const msgs = getMessages();
  msgs.push(msg);
  writeJSON('chat.json', msgs);
}

module.exports = {
  getUsers, getUser, getUserByEmail, saveUser,
  getMatches, getMatch, saveMatch,
  getPredictions, getPrediction, getPredictionsByUser, getPredictionsByMatch, savePrediction,
  getMessages, saveMessage
};
