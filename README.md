# Prime Time: The Amazon Diversification Game

A live, multi-team quiz game built from the presentation. Each group plays on its own PC, and the host projects a live leaderboard.

**5 rounds, about 10 minutes** (2–3 min per round, auto-paced):
1. 🧭 **Portfolio Sort**: put Amazon units into BCG quadrants (Star, Question Mark, Cash Cow, Dog).
2. 🎡 **Flywheel Factory**: put the flywheel and the expansion phases in order.
3. 🤝 **Deal Desk**: acquisitions and Porter's three tests.
4. ⚖️ **Risk or Reward**: swipe strategy cards (keys ← / →).
5. 👔 **Boardroom Finale**: every point counts double. Ends with a podium reveal.

Speed bonuses, streak multipliers, live "+points" pops on the projector, sound effects and confetti are all built in.

## Deploy on Netlify (5 minutes)
1. Put this folder in a GitHub repo and use **Add new site → Import from Git** in Netlify. Netlify installs `@netlify/blobs` and publishes `public/` plus the function automatically.
   - Or from a terminal: `npm install`, then `npx netlify deploy --prod`.
2. In **Site settings → Environment variables** add `HOST_PIN` (for example `mypin`). The default is `amazon`.
3. Open `https://YOUR-SITE.netlify.app/host` on the projector PC, enter the PIN, then click once (this also enables sound).
4. Students open `https://YOUR-SITE.netlify.app` on their PCs and type their group name.

## Run-sheet for the class
- **Before:** open `/host` on the projector. Ask groups to join and show the lobby filling up. Check that every group appears.
- **Start:** press **Space** (or the orange button) to start each round. Each round has an 8-second intro with rules and a 3-2-1 countdown.
- **Between rounds:** the recap shows round winners and a fun fact. Use it to comment. Press **Space** for the next round.
- **After round 5:** press Space for the final, then Space three times to reveal 3rd, 2nd and 1st.
- **Too much time?** Use **End round now**. **Pace** (lobby only) shortens or lengthens all rounds.
- **Mistake or trolling team?** The × next to a team in the lobby removes it. **New game** resets everything.

## Rehearse locally
- `npm run dev` then open http://localhost:8888/host and http://localhost:8888 in several tabs (no install needed, in-memory server).
- Add `?demo` to the URL (host and team tabs in the same browser) to test with no server at all.
- Set Pace to "test (fast)" to run through a full game in about 2 minutes.

## Notes
- Teams that refresh or lose Wi-Fi rejoin automatically with their score kept. A team can join late.
- Scores are computed in the browser and capped server-side, which is fine for a class game but not tamper-proof.
- Game state lives in Netlify Blobs (shared by all PCs). If Blobs is unavailable the function falls back to memory, which can reset when Netlify recycles the function.
- Edit all questions in `public/js/content.mjs`.
