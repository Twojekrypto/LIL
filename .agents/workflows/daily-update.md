---
description: Daily LIL data update — fetch on-chain data, update calculator, record daily deltas
---
// turbo-all

# Daily LIL Data Update

## Steps

1. Navigate to the LIL project directory
```bash
cd /Users/adamszybki/Desktop/Draft/LIL
```

2. Run the on-chain data fetch script (grabs holders, locks, stakes from Avalanche C-Chain)
```bash
node scripts/fetch_onchain.js
```

3. Compute current totals from fresh data and display deltas vs previous day
```bash
node -e "
const s = require('./data/stake_data.json');
const l = require('./data/lock_data.json');
const h = require('./data/history.json');
const totalStaked = s.stakers.reduce((sum, x) => sum + x.totalStaked, 0);
const totalLocked = l.lockers.reduce((sum, x) => sum + x.totalLocked, 0);
const totalBurned = 363187841; // update if burn events happen
const prev = h.entries[h.entries.length - 1] || {};
const delta = (cur, old) => { const d = cur - (old || cur); return d >= 0 ? '+' + d.toLocaleString() : d.toLocaleString(); };
console.log('=== LIL Daily Update ===');
console.log('Date:', new Date().toISOString().split('T')[0]);
console.log('Total Staked:', totalStaked.toLocaleString(), '(' + delta(totalStaked, prev.staked) + ')');
console.log('Total Locked:', totalLocked.toLocaleString(), '(' + delta(totalLocked, prev.locked) + ')');
console.log('Total Burned:', totalBurned.toLocaleString(), '(' + delta(totalBurned, prev.burned) + ')');
console.log('Stakers:', s.stakers.length, '| Lockers:', l.lockers.length);
"
```

4. Update calculator values in index.html with freshly computed totals:
   - `totalStaked` input value
   - `totalLocked` input value
   - `totalBurned` input value
   - The avg lock multiplier in the sub label
   - The date in the disclaimer

5. Append today's entry to `data/history.json`:
```bash
node -e "
const fs = require('fs');
const s = require('./data/stake_data.json');
const l = require('./data/lock_data.json');
const totalStaked = s.stakers.reduce((sum, x) => sum + x.totalStaked, 0);
const totalLocked = l.lockers.reduce((sum, x) => sum + x.totalLocked, 0);
const h = JSON.parse(fs.readFileSync('./data/history.json', 'utf8'));
const today = new Date().toISOString().split('T')[0];
if (h.entries.length && h.entries[h.entries.length-1].date === today) {
  h.entries[h.entries.length-1] = { date: today, staked: totalStaked, locked: totalLocked, burned: 363187841, stakers: s.stakers.length, lockers: l.lockers.length };
  console.log('Updated existing entry for', today);
} else {
  h.entries.push({ date: today, staked: totalStaked, locked: totalLocked, burned: 363187841, stakers: s.stakers.length, lockers: l.lockers.length });
  console.log('Added new entry for', today);
}
fs.writeFileSync('./data/history.json', JSON.stringify(h, null, 2));
"
```

6. Commit and push changes
```bash
git add -A && git commit -m "daily: update LIL data $(date +%Y-%m-%d)" && git push
```
