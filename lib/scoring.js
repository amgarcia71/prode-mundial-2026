function calculatePoints(prediction, result) {
  if (result.homeScore === null || result.awayScore === null) return null;
  if (prediction.homeScore === result.homeScore && prediction.awayScore === result.awayScore) return 3;
  const predWinner = Math.sign(prediction.homeScore - prediction.awayScore);
  const realWinner = Math.sign(result.homeScore - result.awayScore);
  if (predWinner === realWinner) return 1;
  return 0;
}

module.exports = { calculatePoints };
