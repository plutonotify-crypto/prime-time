// Everything the game knows about Amazon lives here, in one place, so the
// team screens, the projector and the server all agree. Facts come straight
// from the presentation.

export const BRAND = { name: 'Prime Time', tag: 'The Amazon Diversification Game' };

/** Milliseconds between "host starts the round" and "round begins". */
export const INTRO_MS = 8000;

const BCG = ['Star', 'Question Mark', 'Cash Cow', 'Dog'];

export const ROUNDS = [
  // ───────────────────────────── ROUND 1 ─────────────────────────────
  {
    id: 'portfolio', type: 'choice', layout: 'bcg', emoji: '🧭',
    title: 'Portfolio Sort', subtitle: 'BCG growth-share matrix',
    rules: [
      'A business unit appears. Tap the BCG quadrant it belongs to.',
      'Fast answers earn a speed bonus. Chain correct answers for a streak multiplier.',
    ],
    duration: 75, itemTime: 9000, bonusWindow: 6000, mult: 1,
    prompt: 'Which BCG quadrant?',
    items: [
      { q: 'AWS', opts: BCG, a: 0, why: 'High market growth and dominant share: a Star.' },
      { q: 'Digital Advertising', opts: BCG, a: 0, why: 'Fast growth and industry-leading margins: a Star.' },
      { q: 'North American E-Commerce', opts: BCG, a: 2, why: 'Mature market, strong cash flow: a Cash Cow.' },
      { q: 'Fulfillment by Amazon (FBA)', opts: BCG, a: 2, why: 'Third-party seller services throw off cash: a Cash Cow.' },
      { q: 'Whole Foods / Amazon Fresh', opts: BCG, a: 1, why: 'High growth but heavy capex to win share: a Question Mark.' },
      { q: 'One Medical', opts: BCG, a: 1, why: 'Competitive, capital hungry healthcare: a Question Mark.' },
      { q: 'Amazon Halo', opts: BCG, a: 3, why: 'Discontinued: the synergies never showed up. A Dog.' },
      { q: 'Amazon Care', opts: BCG, a: 3, why: 'Discontinued experiment, no integration synergies. A Dog.' },
    ],
    fact: 'Stars like AWS and advertising generate the margins that fund the Question Marks.',
  },

  // ───────────────────────────── ROUND 2 ─────────────────────────────
  {
    id: 'flywheel', type: 'order', emoji: '🎡',
    title: 'Flywheel Factory', subtitle: 'Order the sequence',
    rules: [
      'Tap the cards in the right order to fill the numbered slots. Tap a slot to take a card back.',
      'Lock it in when you are ready. A perfect order and a quick finish score the most.',
    ],
    duration: 80, mult: 1,
    puzzles: [
      {
        title: 'Spin the Amazon flywheel', time: 38000,
        prompt: 'Put the virtuous cycle in order, starting with low prices.',
        items: [
          'Low prices attract customer traffic',
          'Third-party merchants join Marketplace and FBA',
          'More volume builds logistics density and lowers unit cost',
          'The huge traffic base creates ad inventory',
          'Enterprises demand AWS cloud compute',
        ],
      },
      {
        title: 'Build the empire in order', time: 38000,
        prompt: 'Which came first? Order the five expansion phases.',
        items: [
          'Pure-play e-commerce',
          'Marketplace and FBA',
          'AWS cloud launch',
          'Prime streaming and search ads',
          'Whole Foods, MGM and One Medical',
        ],
        labels: ['1994–2000', '2000–2006', '2006–2012', '2012–2017', '2017–today'],
      },
    ],
    fact: 'Each phase built infrastructure that became the launchpad for the next one.',
  },

  // ───────────────────────────── ROUND 3 ─────────────────────────────
  {
    id: 'deals', type: 'choice', layout: 'list', emoji: '🤝',
    title: 'Deal Desk', subtitle: 'Acquisitions and Porter’s tests',
    rules: [
      'Eight quick questions about the acquisitions. Four answers each, one is right.',
      'Answer order is shuffled for every team, so no peeking at your neighbour.',
    ],
    duration: 80, itemTime: 14000, bonusWindow: 8000, mult: 1,
    prompt: 'Deal Desk',
    items: [
      { q: 'What did Amazon pay for Whole Foods Market?', opts: ['$13.7B', '$8.5B', '$3.9B', '$1.7B'], a: 0, why: 'A $13.7B bet on a physical footprint and cold-chain logistics.' },
      { q: 'What did MGM Studios cost?', opts: ['$13.7B', '$8.5B', '$3.9B', '$1.7B'], a: 1, why: '$8.5B for a catalog of 4,000+ films.' },
      { q: 'What did One Medical cost?', opts: ['$13.7B', '$8.5B', '$3.9B', '$1.7B'], a: 2, why: '$3.9B for primary care clinics and a digital health layer.' },
      { q: 'Which deal did Amazon abandon in 2024 under EU antitrust pressure?', opts: ['iRobot', 'MGM Studios', 'Whole Foods', 'One Medical'], a: 0, why: 'The $1.7B iRobot acquisition was dropped.' },
      { q: 'Which acquisition brought a catalog of over 4,000 films?', opts: ['One Medical', 'Whole Foods', 'MGM Studios', 'iRobot'], a: 2, why: 'MGM strengthens Prime Video against rival streamers.' },
      { q: 'Which Porter tests did Whole Foods and MGM pass?', opts: ['Cost-of-Entry and Better-Off', 'Attractiveness only', 'Neither of them', 'Better-Off only'], a: 0, why: 'They supplied logistics and media assets that reduced churn across Prime.' },
      { q: 'Which deal still faces a Better-Off challenge?', opts: ['Whole Foods', 'MGM Studios', 'One Medical', 'AWS'], a: 2, why: 'It needs deep integration with Amazon Pharmacy and insurers.' },
      { q: 'When does Amazon turn to M&A instead of building?', opts: ['When organic entry faces structural barriers', 'Whenever cash is idle', 'Only for tiny startups', 'Never, it only builds'], a: 0, why: 'Acquisitions secure physical assets, networks and content libraries.' },
    ],
    fact: 'Whole Foods and MGM passed Porter’s tests. One Medical is still proving its Better-Off case.',
  },

  // ───────────────────────────── ROUND 4 ─────────────────────────────
  {
    id: 'risk', type: 'swipe', emoji: '⚖️',
    title: 'Risk or Reward', subtitle: 'Swipe the strategy',
    rules: [
      'Cards appear one by one. Swipe left for a RISK, right for a REWARD.',
      'On a PC use the arrow keys or the big buttons. Speed counts!',
    ],
    duration: 70, itemTime: 7000, bonusWindow: 4500, mult: 1,
    items: [
      { q: 'Prime bundles shipping, streaming and grocery savings so customers rarely leave', a: 'reward', why: 'Ecosystem lock-in raises switching costs.' },
      { q: 'AWS and advertising profits fund aggressive retail pricing', a: 'reward', why: 'Cross-subsidization is a competitive weapon.' },
      { q: 'Amazon hosts third-party merchants while selling its own private-label rivals', a: 'risk', why: 'The dual role invites antitrust scrutiny.' },
      { q: 'FBA turns warehouse overhead into a high-margin merchant service', a: 'reward', why: 'An economy of scope.' },
      { q: 'The EC and FTC question how Amazon uses merchant data', a: 'risk', why: 'Seen as a conflict of interest (EC 2020, FTC 2023).' },
      { q: 'AWS profits cushion Amazon when inflation squeezes retail margins', a: 'reward', why: 'Portfolio diversification buys resilience.' },
      { q: 'The $1.7B iRobot deal was abandoned under EU pressure', a: 'risk', why: 'Regulation limits inorganic expansion.' },
      { q: 'Prime Video viewing sharpens sponsored-ad targeting', a: 'reward', why: 'A data monetization loop.' },
      { q: 'Halo and Amazon Care were shut down', a: 'risk', why: 'Negative-NPV ventures: capital misallocation.' },
      { q: 'Whole Foods stores double as pickup and return hubs', a: 'reward', why: 'Cuts last-mile cost and drives foot traffic.' },
      { q: 'Coordination costs rise non-linearly across many industries', a: 'risk', why: 'Williamson: span of control gets strained.' },
      { q: 'Every service added to Prime raises customer lifetime value', a: 'reward', why: 'Higher LTV and lower price sensitivity.' },
      { q: 'Regulators could force AWS to be unbundled from retail', a: 'risk', why: 'Structural breakup risk.' },
      { q: 'A conglomerate discount erodes shareholder value', a: 'risk', why: 'Too much scope without synergy destroys value.' },
    ],
    fact: 'Cross-subsidization is Amazon’s superpower and its antitrust problem at the same time.',
  },

  // ───────────────────────────── ROUND 5 ─────────────────────────────
  {
    id: 'boardroom', type: 'choice', layout: 'list', emoji: '👔',
    title: 'Boardroom Finale', subtitle: 'Prime Day: every point counts double',
    rules: [
      'Eight boardroom questions on theory, strategy and the roadmap.',
      'PRIME DAY RULE: every point in this round is worth DOUBLE. Anything can still happen.',
    ],
    duration: 90, itemTime: 14000, bonusWindow: 8000, mult: 2,
    prompt: 'Boardroom',
    items: [
      { q: 'Which Porter test asks whether 1 + 1 > 2?', opts: ['Better-Off test', 'Cost-of-Entry test', 'Attractiveness test', 'Five Forces test'], a: 0, why: 'The combined firm must be worth more than the parts.' },
      { q: 'Amazon is classified as which kind of diversified firm?', opts: ['Related-Linked', 'Unrelated conglomerate', 'Single business', 'Related-Constrained'], a: 0, why: 'Units share platforms and central capabilities.' },
      { q: 'In VRIO, what does the “O” stand for?', opts: ['Organizationally embedded', 'Operationally efficient', 'Optimally priced', 'Outsourced'], a: 0, why: 'Valuable, Rare, Inimitable, Organizationally embedded.' },
      { q: 'Ansoff: new products in new markets is called...', opts: ['Diversification', 'Market penetration', 'Product development', 'Market development'], a: 0, why: 'The riskiest vector of the Ansoff matrix.' },
      { q: 'Which principle says: build it internally, then sell it externally?', opts: ['Invent and Simplify', 'Customer Obsession', 'Bias for Action', 'Frugality'], a: 0, why: 'AWS is the poster child.' },
      { q: 'Which segment produces most of Amazon’s operating income?', opts: ['AWS', 'North America', 'International', 'Advertising'], a: 0, why: 'AWS is the profit engine of the group.' },
      { q: 'What is recommended for Whole Foods and Fresh stores?', opts: ['Micro-fulfillment hubs', 'Sell them off', 'Close half of them', 'Rebrand them as MGM'], a: 0, why: 'Optimise last-mile logistics, not just run stores.' },
      { q: 'What sustains Amazon’s advantage, according to the verdict?', opts: ['Portfolio discipline and genuine synergies', 'Buying every competitor', 'Staying in one industry', 'Cutting all prices'], a: 0, why: 'Disciplined scope beats uncoordinated expansion.' },
    ],
    fact: 'Portfolio discipline turns scope into advantage.',
  },
];

/** How many items a round contains (for progress bars). */
export function countOf(cfg) {
  return cfg.items ? cfg.items.length : cfg.puzzles ? cfg.puzzles.length : 0;
}

/** Highest score a team can legally reach in one round (used by the server as a sanity cap). */
export function maxScoreOf(cfg) {
  if (cfg.type === 'order') return cfg.puzzles.length * 900 * cfg.mult;
  return cfg.items.length * 225 * cfg.mult;
}
