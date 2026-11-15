'use strict';
/* =========================================================
   SILENT CONTRACT — Story campaign "The Meridian Ledger",
   elusive targets, starting locations, NPC chatter
   ========================================================= */
const HANDLER = 'Iris';
const CAMPAIGN = [
  { ci: 0, name: 'Sir Edmund Vale', title: 'Meridian Treasurer', brief: 'Welcome back, Agent. A charity gala in Kensington is a front for laundering money for a syndicate called Meridian. Their treasurer, Sir Edmund Vale, keeps the books. Close them permanently.', debrief: 'Vale\'s phone had a single encrypted contact: "Paris". Meridian is bigger than we thought.' },
  { ci: 1, name: 'Céline Marchand', title: 'Fashion Mogul & Courier', brief: 'Vale\'s contact is Céline Marchand. Her models carry Meridian data drives sewn into the hems of couture. Tonight is her biggest show. Make it her last.', debrief: 'Marchand\'s drives point to a summit in Dubai. Someone is buying an army.' },
  { ci: 2, name: 'Khalid Al-Farsi', title: 'Arms Broker', brief: 'Khalid Al-Farsi is selling Meridian a private military company at the Sky Palace Summit. Stop the sale, and the seller.', debrief: 'The PMC contracts were countersigned in Tokyo. Meridian wants technology too.' },
  { ci: 3, name: 'Hiro Kanzaki', title: 'Tech Thief', brief: 'Hiro Kanzaki stole a surveillance AI from his own employer and is auctioning it to Meridian at midnight. Neither the AI nor Kanzaki should leave the tower.', debrief: 'The auction money was wired to a hedge fund on Park Avenue. Follow the money.' },
  { ci: 4, name: 'Grant Whitlock', title: 'Hedge Fund King', brief: 'Grant Whitlock moves Meridian\'s money through Wall Street. He\'s throwing a penthouse party for the people he plans to bankrupt. Cancel the party.', debrief: 'Whitlock\'s files mention "the Cardinal" in Rome. Meridian has a council, Agent. Eleven seats.' },
  { ci: 5, name: 'Cardinal Lucio Bassi', title: 'Meridian Councillor', brief: 'Lucio Bassi isn\'t a real cardinal, but he is a real councillor. He launders Meridian\'s reputation through a hilltop wine gala. Pour him something special.', debrief: 'Bassi\'s cellar held ledgers going back forty years. The council meets in Monaco next.' },
  { ci: 6, name: 'Viktor Orlov', title: 'Casino Owner', brief: 'Viktor Orlov hosts Meridian\'s council at his casino. He also runs their blackmail files. The house always wins. Not tonight.', debrief: 'Orlov\'s safe held a shipping manifest for Marrakech. Weapons, again.' },
  { ci: 7, name: 'Yasmine Haddad', title: 'Smuggler Queen', brief: 'Yasmine Haddad moves Meridian\'s weapons through the souks. She\'s closing a deal in a riad tonight. Close it for her.', debrief: 'Haddad\'s buyers were film producers in Mumbai. An odd cover for something big.' },
  { ci: 8, name: 'Rajan Kapoor', title: 'Film Producer & Propagandist', brief: 'Rajan Kapoor makes blockbusters and, on the side, Meridian\'s deepfakes. Tonight is his premiere. Give the critics something to write about.', debrief: 'Kapoor was rendering fake footage of a Brazilian minister. Rio is next.' },
  { ci: 9, name: 'Diego Carvalho', title: 'Cartel Boss', brief: 'Diego Carvalho is Meridian\'s muscle in South America, hiding behind a carnival mask. Unmask him permanently.', debrief: 'Carvalho\'s men answered to a triad in Hong Kong. The council is getting nervous.' },
  { ci: 10, name: 'Madam Lian Wu', title: 'Triad Matriarch', brief: 'Lian Wu runs Meridian\'s Asian operations from the Golden Dragon tower. She has doubled her guards since Rio. Be patient.', debrief: 'Wu\'s encrypted drive mentions a defector in Berlin selling Meridian out to everyone.' },
  { ci: 11, name: 'Klaus Reiter', title: 'Double Agent', brief: 'Klaus Reiter is selling Meridian\'s secrets and ours at a techno club. Whoever he works for, he\'s a loose end. Tie it.', debrief: 'Reiter\'s list named the council\'s security chief, sailing in Sydney this weekend.' },
  { ci: 12, name: 'Brooke Halloran', title: 'Meridian Security Chief', brief: 'Brooke Halloran protects the council. She\'s at the Harbour Yacht Club and she knows someone is hunting them. Expect her to be careful.', debrief: 'Halloran\'s yacht logs point to a palace on the Bosphorus and an intelligence swap.' },
  { ci: 13, name: 'Selim Aksoy', title: 'Spymaster', brief: 'Selim Aksoy is trading every name in Meridian for immunity. That list includes ours. He doesn\'t leave the palace.', debrief: 'Aksoy\'s last call was to Venice. The chairman, "the Doge", is holding a masquerade.' },
  { ci: 14, name: 'The Doge', title: 'Chairman of Meridian', brief: 'This is it, Agent. The Doge chairs Meridian from behind a mask in a Venetian palazzo. Nobody has ever seen his face. End this.', debrief: 'Meridian is finished. The ledger is closed. Take some time off, Agent. You\'ve earned it.' }
];

const STARTS = [
  { id: 'street', name: 'Main Street', icon: '{i:walk}', req: 0, desc: 'Arrive with the guests.' },
  { id: 'alley', name: 'Back Alley', icon: '{i:moon}', req: 1, desc: 'Slip in near the service entrance.' },
  { id: 'staff', name: 'Staff Room', icon: '{i:glass}', req: 2, outfit: 'waiter', desc: 'Start inside, dressed as a waiter.' },
  { id: 'kitchen', name: 'Kitchen', icon: '{i:chef}', req: 3, outfit: 'chef', desc: 'Start in the kitchen as a chef.' },
  { id: 'security', name: 'Security Office', icon: '{i:shield}', req: 5, outfit: 'guard', desc: 'Start as a guard. Watch the enforcers.' }
];

const Elusive = {
  today() {
    const d = Progress.dayStr(), seed = parseInt(d.replace(/-/g, ''), 10) * 31 + 7;
    const rng = RNG(seed);
    const unlocked = CITIES.map((c, i) => i).filter(i => Game.cityUnlocked(i));
    return { date: d, ci: rng.pick(unlocked.length ? unlocked : [0]), seed: (seed * 2654435761) >>> 0 };
  },
  state() {
    const P = Game.S.prog, e = this.today();
    if (!P.elusive || P.elusive.date !== e.date) P.elusive = { date: e.date, status: 'open', ci: e.ci, seed: e.seed };
    if (P.elusive.ci === undefined) { P.elusive.ci = e.ci; P.elusive.seed = e.seed; }
    return Object.assign({}, e, P.elusive);
  },
  timeLeft() { const n = new Date(), m = new Date(n); m.setHours(24, 0, 0, 0); const ms = m - n; return `${Math.floor(ms / 3.6e6)}h ${Math.floor(ms / 6e4) % 60}m`; }
};

/* ---------- chatter ---------- */
const LINES = {
  guest: ['Have you tried the canapés? Divine.', 'I heard the host owes money to very bad people.', 'This champagne is older than I am.', 'Did you see who just walked in?', 'I only came for the free bar.', 'My yacht is bigger, for the record.', 'Security is tight tonight. Something\'s up.', 'Darling, you look fabulous.', 'I invested in crypto. Don\'t ask.', 'Is that a real Picasso?', 'The band is terrible, isn\'t it?', 'Someone said there\'s a pool on the roof!'],
  hint: [
    t => `${t} never misses a chance to make a toast under the chandelier.`,
    t => `They say ${t} drinks like a fish. Always at the bar.`,
    t => `${t} sneaks out to the balcony to smoke. Filthy habit.`,
    t => `I heard ${t} spends ages in the sauna. Must be stressed.`,
    t => `${t} goes for a swim on the roof every party. Show-off.`,
    t => `${t} inspects the kitchen personally. Doesn't trust the chefs.`,
    t => `Apparently ${t} keeps the good whisky in the office.`
  ],
  staff: ['Table six wants more ice. Again.', 'If I drop this tray, I\'m fired.', 'The chef is in a mood tonight.', 'Two more hours of this...', 'Who keeps leaving coins everywhere?', 'Kitchen\'s through the back, staff only.'],
  guard: ['All quiet on my side.', 'Copy that, moving to the next checkpoint.', 'Keep your eyes open, people.', 'I hate these monkey suits.', 'Nobody goes upstairs without clearance.', 'Did you hear something?', 'Radio check. Over.'],
  target: ['Another drink. The strong stuff.', 'Where is my security? Useless!', 'Get me away from these people.', 'Do you know who I am?', 'Ha! Wonderful party, isn\'t it?'],
  hintStop: { speech: 0, bar: 1, balcony: 2, sauna: 3, pool: 4, kitchen: 5, office: 6 }
};

/* ---------- weekly challenge contract ---------- */
const Weekly = {
  week() { const d = new Date(), j = new Date(d.getFullYear(), 0, 1); return d.getFullYear() * 100 + Math.ceil(((d - j) / 86400000 + j.getDay() + 1) / 7); },
  state() {
    const w = this.week(), P = Game.S.prog;
    if (!P.weeklyPick || P.weeklyPick.week !== w) {
      const rng = RNG(w * 7 + 3), unlocked = CITIES.map((c, i) => i).filter(i => Game.cityUnlocked(i));
      let ids = rng.shuffle(WEEKLY_RULES.map(r => r.id));
      const pick = []; for (const id of ids) { if (pick.length >= 3) break; if ((id === 'accident' && pick.includes('poison')) || (id === 'poison' && pick.includes('accident'))) continue; pick.push(id); }
      P.weeklyPick = { week: w, ci: rng.pick(unlocked.length ? unlocked : [0]), seed: (w * 2246822519) >>> 0, rules: pick };
    }
    const wp = P.weeklyPick;
    return { week: w, ci: wp.ci, seed: wp.seed, rules: wp.rules, done: !!(P.weekly && P.weekly.week === w && P.weekly.done) };
  },
  timeLeft() { const n = new Date(), m = new Date(n); m.setDate(n.getDate() + ((8 - n.getDay()) % 7 || 7)); m.setHours(0, 0, 0, 0); const ms = m - n; return `${Math.floor(ms / 8.64e7)}d ${Math.floor(ms / 3.6e6) % 24}h`; }
};
STOP_INFO.signature = { kind: 'accident', steps: ['Find the city\'s signature object (red outline)', 'Set it up (rig it with a wrench, poison it, or wait under it)', 'Wait for the target to use it'] };
