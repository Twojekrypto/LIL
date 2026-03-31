/**
 * update_html.js — Post-fetch: embed fresh data into index.html + update history.json
 * Run AFTER fetch_onchain.js has generated data/*.json and data/embed_data.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const htmlPath = path.join(ROOT, 'index.html');
const embedPath = path.join(ROOT, 'data', 'embed_data.js');
const histPath = path.join(ROOT, 'data', 'history.json');
const lockPath = path.join(ROOT, 'data', 'lock_data.json');
const stakePath = path.join(ROOT, 'data', 'stake_data.json');

// ── Lock multiplier interpolation (mirrors index.html LOCK_POINTS) ──
const LOCK_POINTS = [
  { days: 1, mult: 2.04 }, { days: 7, mult: 2.11 },
  { days: 30, mult: 2.31 }, { days: 90, mult: 2.73 },
  { days: 180, mult: 3.23 }, { days: 365, mult: 4.00 },
  { days: 730, mult: 5.00 },
];

function getLockMultiplier(days) {
  if (days <= 1) return LOCK_POINTS[0].mult;
  if (days >= 730) return LOCK_POINTS[LOCK_POINTS.length - 1].mult;
  for (let i = 0; i < LOCK_POINTS.length - 1; i++) {
    const p1 = LOCK_POINTS[i], p2 = LOCK_POINTS[i + 1];
    if (days >= p1.days && days <= p2.days) {
      const t = (days - p1.days) / (p2.days - p1.days);
      return p1.mult + t * (p2.mult - p1.mult);
    }
  }
  return 2.0;
}

function main() {
  console.log('📝 Updating index.html with fresh data...');

  // Read files
  let html = fs.readFileSync(htmlPath, 'utf8');
  const embed = fs.readFileSync(embedPath, 'utf8');
  const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const stakeData = JSON.parse(fs.readFileSync(stakePath, 'utf8'));

  // Extract arrays from embed_data.js
  const lockMatch = embed.match(/const LOCK_DATA = (\[.*?\]);/s);
  const stakeMatch = embed.match(/const STAKE_DATA = (\[.*?\]);/s);
  const rawPortfolioMatch = embed.match(/const RAW_PORTFOLIO = (\[.*?\]);/s);
  if (!lockMatch || !stakeMatch) {
    console.error('❌ Could not parse embed_data.js'); process.exit(1);
  }

  // 1. Replace LOCK_DATA, STAKE_DATA, and RAW_PORTFOLIO in HTML
  html = html.replace(/const LOCK_DATA = \[.*?\];/s, 'const LOCK_DATA = ' + lockMatch[1] + ';');
  html = html.replace(/const STAKE_DATA = \[.*?\];/s, 'const STAKE_DATA = ' + stakeMatch[1] + ';');
  if (rawPortfolioMatch) {
    // Update existing RAW_PORTFOLIO or inject it after STAKE_DATA
    if (html.includes('const RAW_PORTFOLIO')) {
      html = html.replace(/const RAW_PORTFOLIO = \[.*?\];/s, 'const RAW_PORTFOLIO = ' + rawPortfolioMatch[1] + ';');
    } else {
      // Inject after STAKE_DATA line
      html = html.replace(
        /(const STAKE_DATA = \[.*?\];)/s,
        '$1\n        const RAW_PORTFOLIO = ' + rawPortfolioMatch[1] + ';'
      );
    }
    console.log('  RAW_PORTFOLIO embedded (burned + points data)');
  }

  // 2. Compute and update AVG_LOCK_MULTIPLIER
  let totalWeightedMult = 0, totalAmount = 0, totalDays = 0;
  lockData.lockers.forEach(locker => {
    locker.locks.forEach(lock => {
      const mult = getLockMultiplier(lock.durationDays);
      totalWeightedMult += lock.amount * mult;
      totalDays += lock.amount * lock.durationDays;
      totalAmount += lock.amount;
    });
  });
  const avgMult = totalAmount > 0 ? (totalWeightedMult / totalAmount).toFixed(2) : '3.21';
  const avgDays = totalAmount > 0 ? Math.round(totalDays / totalAmount) : 206;
  html = html.replace(
    /const AVG_LOCK_MULTIPLIER = [\d.]+;.*$/m,
    `const AVG_LOCK_MULTIPLIER = ${avgMult}; // ~${avgDays} days average`
  );
  console.log(`  AVG_LOCK_MULTIPLIER = ${avgMult} (~${avgDays} days)`);

  // 3. Update dates
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  const dateStr = `${dd}.${mm}.${yyyy}`;

  html = html.replace(/ON-CHAIN DATA \(fetched [\d.]+\)/, `ON-CHAIN DATA (fetched ${dateStr})`);
  html = html.replace(/Data from [\d.]+\.\d+\.\d+\./, `Data from ${dateStr}.`);

  // 4. Update circulation stats (Locked / Staked)
  // Use authoritative Moat contract totals
  const moatTotals = stakeData.moatTotals || {};
  const totalStaked = moatTotals.totalStaked || stakeData.stakers.reduce((s, x) => s + x.totalStaked, 0);
  const totalLocked = moatTotals.totalLocked || lockData.lockers.reduce((s, x) => s + x.totalLocked, 0);
  const totalBurned = moatTotals.totalBurned || 0;
  const lockedStaked = totalStaked + totalLocked;
  const effSupply = 986812159;
  const pct = (lockedStaked / effSupply * 100).toFixed(1);

  html = html.replace(
    /🔒 Locked \/ Staked<\/div>\s*<div class="value blue">[\d,]+<\/div>\s*<div[^>]*>[\d.]+%/,
    (m) => m.replace(/[\d,]+<\/div>/, lockedStaked.toLocaleString('en-US') + '</div>').replace(/[\d.]+%/, pct + '%')
  );
  console.log(`  Locked+Staked: ${lockedStaked.toLocaleString()} (${pct}%)`);

  // Write HTML
  fs.writeFileSync(htmlPath, html);
  console.log('  ✅ index.html updated');

  // 5. Update history.json
  const isoDate = `${yyyy}-${mm}-${dd}`;
  const history = JSON.parse(fs.readFileSync(histPath, 'utf8'));
  const entry = {
    date: isoDate,
    staked: totalStaked,
    locked: totalLocked,
    burned: totalBurned,
    stakers: stakeData.stakers.length,
    lockers: lockData.lockers.length,
  };

  if (history.entries.length && history.entries[history.entries.length - 1].date === isoDate) {
    history.entries[history.entries.length - 1] = entry;
    console.log(`  ✅ history.json: updated existing entry for ${isoDate}`);
  } else {
    history.entries.push(entry);
    console.log(`  ✅ history.json: appended entry for ${isoDate}`);
  }
  fs.writeFileSync(histPath, JSON.stringify(history, null, 2));

  console.log('\n🎉 All done!');
  console.log(`  Staked: ${totalStaked.toLocaleString()}, Locked: ${totalLocked.toLocaleString()}`);
  console.log(`  Stakers: ${stakeData.stakers.length}, Lockers: ${lockData.lockers.length}`);
}

main();
