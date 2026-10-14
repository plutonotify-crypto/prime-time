// One scoring rule for every mini-game, so rounds feel consistent.
//   base 100 + speed bonus (up to 50)  ×  streak multiplier (+10% per streak step, max ×1.5)  ×  round multiplier
// Highest possible per answer: 150 × 1.5 × mult = 225 × mult (the server's sanity cap is built on this).

export function award({ correct, elapsed, window, streak, mult }) {
  if (!correct) return { points: 0, streak: 0, bonus: 0, sm: 1 };
  const bonus = Math.round(50 * Math.max(0, 1 - elapsed / window));
  const sm = 1 + Math.min(streak, 5) * 0.1;
  return { points: Math.round((100 + bonus) * sm * mult), streak: streak + 1, bonus, sm };
}
