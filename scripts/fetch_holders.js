/**
 * fetch_holders.js — Refresh top holder balances + circulation stats on-chain
 * Runs bi-weekly via GitHub Actions. Uses balanceOf calls (~100 RPC calls total).
 */
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC = 'https://api.avax.network/ext/bc/C/rpc';
const provider = new ethers.JsonRpcProvider(RPC);

const LIL_TOKEN = '0x22683BbaDD01473969F23709879187705a253763';
const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];
const TOTAL_SUPPLY = 1_350_000_000;
const ROOT = path.join(__dirname, '..');
const htmlPath = path.join(ROOT, 'index.html');

const fmt = v => Math.round(Number(ethers.formatEther(v)));
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function fmtNum(n) { return n.toLocaleString('en-US'); }

// Metadata preserved across refreshes
const KNOWN_META = {
  '0x000000000000000000000000000000000000dEaD': { n: 'Burn Address', t: 'contract', tl: 'Burn', tc: 'burn' },
  '0x8acc49857A1259D25eb3CA0aa15B398D0E149EF2': { n: 'Pharaoh LP (LIL/WAVAX)', t: 'contract', tl: 'LP', tc: 'lp' },
  '0x7A4D20261a765Bd9bA67D49FBf8189843eEC3393': { n: 'MultiLockMoat (Locker)', t: 'contract', tl: 'Contract', tc: 'contract' },
  '0x2Bf32c61786b8A7b8035a029a82a23bE556DE537': { n: 'Earningsbaystaking', t: 'contract', tl: 'Stake (no lock)', tc: 'holder' },
  '0x5b5a1503f491B2935BF757b21d2832a2B3D0df44': { n: 'DAO LIL', t: 'team', tl: 'DAO', tc: 'team' },
  '0x950a98dd06c898950460b0D1FCaD75D4A23Ff373': { n: 'EarningsBay Protocol', t: 'contract', tl: 'Contract', tc: 'contract' },
  '0x60B615967Db702Be1c4470982E47d5f0A20F88E7': { n: 'Stars Arena User', t: 'holder' },
  '0xfE85C993605Dd02FFD2b0B7db041f51071e45cd1': { n: 'Treasury', t: 'team', tl: 'Team', tc: 'team' },
  '0x660862D49E92f80f29E56C2770027E8d83e97882': { n: 'Treasury Helper (Pharaoh)', t: 'team', tl: 'Team', tc: 'team' },
  '0x244A4a90e148Ec318a85f8C138A274e16FFE3032': { n: 'Pharaoh Team Multisig', t: 'team', tl: 'Team', tc: 'team' },
  '0x88de50B233052e4Fb783d4F6db78Cc34fEa3e9FC': { n: 'Odos Router V2', t: 'contract', tl: 'Contract', tc: 'contract' },
};

async function main() {
  console.log('🔄 LIL Holders & Circulation Refresh\n');
  const lilToken = new ethers.Contract(LIL_TOKEN, ERC20_ABI, provider);

  // 1. Read current HOLDERS_DATA from index.html to get list of addresses
  let html = fs.readFileSync(htmlPath, 'utf8');
  const holdersMatch = html.match(/const HOLDERS_DATA = \[([\s\S]*?)\];/);
  if (!holdersMatch) { console.error('❌ HOLDERS_DATA not found'); process.exit(1); }

  // Parse existing entries to preserve metadata
  const existingEntries = [];
  const entryRegex = /\{a:'([^']+)',b:(\d+),n:([^,]+),t:'([^']+)'(?:,tl:'([^']+)')?(?:,tc:'([^']+)')?\}/g;
  let m;
  while ((m = entryRegex.exec(holdersMatch[1])) !== null) {
    existingEntries.push({
      a: m[1],
      b: parseInt(m[2]),
      n: m[3] === 'null' ? null : m[3].replace(/'/g, ''),
      t: m[4],
      tl: m[5] || undefined,
      tc: m[6] || undefined,
    });
  }
  console.log(`  Found ${existingEntries.length} existing holders`);

  // 2. Fetch fresh balances for all addresses
  console.log('  Fetching balances on-chain...');
  const updated = [];
  for (let i = 0; i < existingEntries.length; i++) {
    const entry = existingEntries[i];
    try {
      // Normalize address (fix bad checksums from Avascan copy-paste)
      let checksumAddr;
      try { checksumAddr = ethers.getAddress(entry.a); }
      catch { checksumAddr = ethers.getAddress(entry.a.toLowerCase()); }
      const bal = await lilToken.balanceOf(checksumAddr);
      const newBal = fmt(bal);

      // Preserve known metadata or use existing
      const meta = KNOWN_META[entry.a] || {};
      updated.push({
        a: entry.a,
        b: newBal,
        n: meta.n || entry.n,
        t: meta.t || entry.t,
        tl: meta.tl || entry.tl,
        tc: meta.tc || entry.tc,
      });

      if (newBal !== entry.b) {
        const delta = newBal - entry.b;
        const sign = delta > 0 ? '+' : '';
        console.log(`    ${(entry.n || entry.a.slice(0, 10)).padEnd(30)} ${fmtNum(entry.b)} → ${fmtNum(newBal)} (${sign}${fmtNum(delta)})`);
      }
    } catch (e) {
      console.log(`    ⚠ ${entry.a.slice(0, 10)}: ${e.message}`);
      updated.push(entry); // Keep old data
    }

    if ((i + 1) % 10 === 0) await sleep(100);
  }

  // Sort by balance desc
  updated.sort((a, b) => b.b - a.b);

  // 3. Build new HOLDERS_DATA string
  const holdersStr = updated.map(h => {
    let s = `{a:'${h.a}',b:${h.b},n:${h.n ? "'" + h.n + "'" : 'null'},t:'${h.t}'`;
    if (h.tl) s += `,tl:'${h.tl}'`;
    if (h.tc) s += `,tc:'${h.tc}'`;
    s += '}';
    return '            ' + s;
  }).join(',\n');

  html = html.replace(
    /const HOLDERS_DATA = \[[\s\S]*?\];/,
    `const HOLDERS_DATA = [\n${holdersStr},\n        ];`
  );

  // 4. Extract key values and update circulation section
  const burnEntry = updated.find(h => h.a === '0x000000000000000000000000000000000000dEaD');
  const lpEntry = updated.find(h => h.a === '0x8acc49857A1259D25eb3CA0aa15B398D0E149EF2');
  const daoEntry = updated.find(h => h.a === '0x5b5a1503f491B2935BF757b21d2832a2B3D0df44');
  const treasuryEntry = updated.find(h => h.a === '0xfE85C993605Dd02FFD2b0B7db041f51071e45cd1');
  const treasuryHelper = updated.find(h => h.a === '0x660862D49E92f80f29E56C2770027E8d83e97882');
  const pharaohMultisig = updated.find(h => h.a === '0x244A4a90e148Ec318a85f8C138A274e16FFE3032');

  const burnAmt = burnEntry?.b || 363187841;
  const lpAmt = lpEntry?.b || 353508945;
  const effSupply = TOTAL_SUPPLY - burnAmt;
  const teamDao = (daoEntry?.b || 0) + (treasuryEntry?.b || 0) + (treasuryHelper?.b || 0) + (pharaohMultisig?.b || 0);

  // Read current locked/staked from HTML (set by update_html.js)
  const lsMatch = html.match(/🔒 Locked \/ Staked<\/div>\s*<div class="value blue">([\d,]+)<\/div>/);
  const lockedStaked = lsMatch ? parseInt(lsMatch[1].replace(/,/g, '')) : 469500442;
  const freeFloat = effSupply - lockedStaked - lpAmt - teamDao;

  console.log(`\n📊 Circulation:`);
  console.log(`  Burned:        ${fmtNum(burnAmt)}`);
  console.log(`  Effective:     ${fmtNum(effSupply)}`);
  console.log(`  Locked+Staked: ${fmtNum(lockedStaked)} (${(lockedStaked / effSupply * 100).toFixed(1)}%)`);
  console.log(`  LP:            ${fmtNum(lpAmt)} (${(lpAmt / effSupply * 100).toFixed(1)}%)`);
  console.log(`  Team/DAO:      ${fmtNum(teamDao)} (${(teamDao / effSupply * 100).toFixed(1)}%)`);
  console.log(`  Free Float:    ${fmtNum(freeFloat)} (${(freeFloat / effSupply * 100).toFixed(1)}%)`);

  // Update BURN_AMOUNT constant
  html = html.replace(/const BURN_AMOUNT = \d+;/, `const BURN_AMOUNT = ${burnAmt};`);
  html = html.replace(/const EFFECTIVE_SUPPLY = TOTAL_SUPPLY - BURN_AMOUNT;.*$/, `const EFFECTIVE_SUPPLY = TOTAL_SUPPLY - BURN_AMOUNT; // ${fmtNum(effSupply)} — post-burn`);

  // Update circulation HTML values
  html = html.replace(/(🔥 Burned<\/div>\s*<div class="value red">)[\d,]+/, `$1${fmtNum(burnAmt)}`);
  html = html.replace(/(Effective Supply \(post-burn\)<\/div>\s*<div class="value green">)[\d,]+/, `$1${fmtNum(effSupply)}`);
  html = html.replace(/(💧 LP \(Pharaoh\)<\/div>\s*<div class="value amber">)[\d,]+/, `$1${fmtNum(lpAmt)}`);
  html = html.replace(/(💧 LP \(Pharaoh\)[\s\S]*?<div class="value amber">[\d,]+<\/div>\s*<div[^>]*>)[\d.]+%/, `$1${(lpAmt / effSupply * 100).toFixed(1)}%`);
  html = html.replace(/(👥 Team \/ DAO<\/div>\s*<div class="value"[^>]*>)[\d,]+/, `$1${fmtNum(teamDao)}`);
  html = html.replace(/(👥 Team \/ DAO[\s\S]*?<div class="value"[^>]*>[\d,]+<\/div>\s*<div[^>]*>)[\d.]+%/, `$1${(teamDao / effSupply * 100).toFixed(1)}%`);
  html = html.replace(/(🟢 Free Float<\/div>\s*<div class="value green">)[\d,]+/, `$1${fmtNum(freeFloat)}`);
  html = html.replace(/(🟢 Free Float[\s\S]*?<div class="value green">[\d,]+<\/div>\s*<div[^>]*>)[\d.]+%/, `$1${(freeFloat / effSupply * 100).toFixed(1)}%`);

  // Update fallback values in loadMoatData
  html = html.replace(/moatData\.burned = \d+;/, `moatData.burned = ${burnAmt};`);

  // Update holder count in header
  const holderCount = updated.filter(h => h.t === 'holder').length;
  html = html.replace(/top 100 of \d+/, `top ${updated.length} of ${updated.length}`);

  // Update the Avascan comment date
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  html = html.replace(/Top 100 Holders Data \(from Avascan, [\d.]+\)/, `Top 100 Holders Data (from on-chain, ${dd}.${mm}.${yyyy})`);

  fs.writeFileSync(htmlPath, html);
  console.log('\n✅ index.html updated with fresh holder balances and circulation stats');
}

main().catch(e => { console.error('❌', e); process.exit(1); });
