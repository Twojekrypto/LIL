const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC = 'https://api.avax.network/ext/bc/C/rpc';
const provider = new ethers.JsonRpcProvider(RPC);

// ── Contracts ──
const MOAT_ADDR   = '0x7A4D20261a765Bd9bA67D49FBf8189843eEC3393';
const EB_PROTO    = '0x950a98dd06c898950460b0D1FCaD75D4A23Ff373';
const EB_STAKE    = '0x2Bf32c61786b8A7b8035a029a82a23bE556DE537';
const LIL_TOKEN   = '0x22683BbaDD01473969F23709879187705a253763';

// Known top 100 holder addresses (from existing HOLDERS_DATA)
const TOP100 = [
  '0x000000000000000000000000000000000000dEaD',
  '0x8acc49857A1259D25eb3CA0aa15B398D0E149EF2',
  '0x7A4D20261a765Bd9bA67D49FBf8189843eEC3393',
  '0x2Bf32c61786b8A7b8035a029a82a23bE556DE537',
  '0x5b5a1503f491B2935BF757b21d2832a2B3D0df44',
  '0x28DA3DdE285D8F1f87B2D858f89961Bb8B9Af180',
  '0x950a98dd06c898950460b0D1FCaD75D4A23Ff373',
  '0x8afF5e5527845f2a1A0a6b7d727Db22f7b6C99A7',
  '0x60B615967Db702Be1c4470982E47d5f0A20F88E7',
  '0xF1B1C792487e47B2580a5639190287aE0d26968e',
  '0x7Cc4d060738EDD2DA04f58f0d832A8e00b595eAd',
  '0x9b26fFC2A359ca46A36024D9820BB02045FEB3A0',
  '0x7Ecd5f3964121F7B4a631A4515EafB05B4DFebbE',
  '0x0ba64D006093845b4D77bDfC6E5fD8fe8e57CBE2',
  '0x4d86B5A1a65B4097f1B94C9b8995D793A16C03C1',
  '0x1CE8538df8341Ef84C239D7894D3c02E3AcF9Be6',
  '0xbA109916A5f1381845d6FC4a2758C1abD196ff93',
  '0xB39EDf83279177F8399Ba8583B104F532f7D52Ff',
  '0xfE85C993605Dd02FFD2b0B7db041f51071e45cd1',
  '0x9d4b9c2Ab573d0316609326521E18fB37f0ec392',
  '0xdf9C3Dc94f1Ab2f44da4A313ed0AC74465F1c3f2',
  '0x886A94c3f534813586c59Cc0091f0640e4777F97',
  '0x5D8652226E1BcBe99897f18a4c9b8995d793A16C',
  '0x3f31fCd1BE6b4B019Dc75ED77965309652Cbb2Ad',
  '0x211eF567C3DB15E5553B1D02abde685fD642c560',
  '0x151104237Df519386E05BeCa007398F08751e1CC',
  '0x06833acCC167D7d27508832D1538916b075188a8',
  '0xfF0ddb910Dd9356ACE9Bc4AB4fc46de233C7ccf6',
  '0x10a6B3F80bC4405260c1ac85Ef0b4C1f86C039b5',
  '0x3737AB1829d1496d3bd6fc4DEc599Ff0F72f81A7',
  '0xf84825664e8A056D41E14fCB04FC67e7F9427DbA',
  '0xB09406633B8b62087732404073a6668b26D244Bf',
  '0xBd85dB7baD1A5B54AE2c979E631a5e6067d8833C',
  '0x75dAC2A468A4A1Db7d715D6f6a93a566fCe0361e',
  '0xe673d59ed552D6D417ea508233397197daA2645b',
];

const KNOWN = {
  '0x000000000000000000000000000000000000dead': { n: 'Burn Address', t: 'burn' },
  '0x8acc49857a1259d25eb3ca0aa15b398d0e149ef2': { n: 'Pharaoh LP (LIL/WAVAX)', t: 'lp' },
  '0x7a4d20261a765bd9ba67d49fbf8189843eec3393': { n: 'MultiLockMoat (Locker)', t: 'contract' },
  '0x2bf32c61786b8a7b8035a029a82a23be556de537': { n: 'Earningsbaystaking', t: 'contract' },
  '0x5b5a1503f491b2935bf757b21d2832a2b3d0df44': { n: 'DAO LIL', t: 'team' },
  '0x950a98dd06c898950460b0d1fcad75d4a23ff373': { n: 'EarningsBay Protocol', t: 'contract' },
  '0x60b615967db702be1c4470982e47d5f0a20f88e7': { n: 'Stars Arena User', t: 'holder' },
  '0xfe85c993605dd02ffd2b0b7db041f51071e45cd1': { n: 'Treasury', t: 'team' },
};

// ABIs
const MOAT_ABI = [
  'function activeUserCount() view returns (uint256)',
  'function getActiveUsers(uint256 start, uint256 end) view returns (address[])',
  'function userInfo(address) view returns (uint256 stakedAmount, uint256 totalUserBurn, uint256 stakingPoints, uint256 burnPoints, uint256 activeLockCount)',
  'function getUserAllLocks(address) view returns (uint256[] amounts, uint256[] ends, uint256[] points, uint256[] originalDurations, uint256[] lastUpdated, bool[] active)',
  'function totalStaked() view returns (uint256)',
  'function totalLocked() view returns (uint256)',
  'function totalBurned() view returns (uint256)',
  'function getTotalAmounts() view returns (uint256 _totalStaked, uint256 _totalLocked, uint256 _totalBurned, uint256 _totalInContract)',
];

const EB_ABI = [
  'function userInfo(address) view returns (uint256 stakedAmount, uint256 rewardDebt)',
  'function totalStaked() view returns (uint256)',
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
const fmt = v => Number(ethers.formatEther(v));

// ── Scan state persistence ──
const SCAN_STATE_PATH = path.join(__dirname, '..', 'data', 'scan_state.json');

function loadScanState() {
  try {
    return JSON.parse(fs.readFileSync(SCAN_STATE_PATH, 'utf8'));
  } catch {
    return {
      ebProto: { lastBlock: 58_834_678, depositors: [] },
      ebStake: { lastBlock: 59_473_982, depositors: [] },
    };
  }
}

function saveScanState(state) {
  fs.writeFileSync(SCAN_STATE_PATH, JSON.stringify(state, null, 2));
}

// ── Incremental Transfer event scanner ──
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

// Known contract creation blocks
const CONTRACT_CREATION = {
  [EB_PROTO.toLowerCase()]: 58_834_778,
  [EB_STAKE.toLowerCase()]: 59_474_082,
};

async function findNewDepositors(targetAddr, label, startFromBlock) {
  console.log(`\n🔍 Scanning Transfer events → ${label} (from block ${startFromBlock})...`);
  const toPadded = '0x' + targetAddr.slice(2).toLowerCase().padStart(64, '0');

  const currentBlock = await provider.getBlockNumber();
  const depositors = new Set();
  const CHUNK = 2048;

  const totalChunks = Math.ceil((currentBlock - startFromBlock) / CHUNK);
  if (totalChunks <= 0) {
    console.log(`  ✅ Already up to date, no new blocks to scan`);
    return { depositors, lastBlock: currentBlock };
  }
  console.log(`  Scanning ${totalChunks} chunks (${startFromBlock} → ${currentBlock})...`);

  let scanned = 0;
  for (let from = startFromBlock; from <= currentBlock; from += CHUNK) {
    const to = Math.min(from + CHUNK - 1, currentBlock);
    try {
      const logs = await provider.getLogs({
        address: LIL_TOKEN,
        topics: [TRANSFER_TOPIC, null, toPadded],
        fromBlock: from, toBlock: to,
      });
      for (const log of logs) {
        depositors.add(ethers.getAddress('0x' + log.topics[1].slice(26)));
      }
    } catch (e) {
      // Split on error
      const mid = Math.floor((from + to) / 2);
      for (const [f, t] of [[from, mid], [mid + 1, to]]) {
        try {
          const logs = await provider.getLogs({
            address: LIL_TOKEN,
            topics: [TRANSFER_TOPIC, null, toPadded],
            fromBlock: f, toBlock: t,
          });
          for (const log of logs) {
            depositors.add(ethers.getAddress('0x' + log.topics[1].slice(26)));
          }
        } catch (e2) {
          console.log(`  ⚠ Skip ${f}-${t}: ${e2.message?.slice(0, 80)}`);
        }
      }
      await sleep(100);
    }

    scanned++;
    if (scanned % 200 === 0 || from + CHUNK > currentBlock) {
      process.stdout.write(`  ${scanned}/${totalChunks} chunks (${depositors.size} new depositors)\r`);
    }
    if (scanned % 30 === 0) await sleep(50);
  }

  console.log(`  ✅ ${depositors.size} new depositors found for ${label}                `);
  return { depositors, lastBlock: currentBlock };
}

async function main() {
  console.log('🚀 LIL On-Chain Data Fetcher (v4 — incremental scan)');
  const block = await provider.getBlockNumber();
  console.log(`  Block: ${block}`);

  const moat = new ethers.Contract(MOAT_ADDR, MOAT_ABI, provider);
  const ebProto = new ethers.Contract(EB_PROTO, EB_ABI, provider);
  const ebStake = new ethers.Contract(EB_STAKE, EB_ABI, provider);
  const lilToken = new ethers.Contract(LIL_TOKEN, ERC20_ABI, provider);

  // Verify contract totals
  const [ebProtoTotal, ebStakeTotal, moatTotals] = await Promise.all([
    ebProto.totalStaked().catch(() => 0n),
    ebStake.totalStaked().catch(() => 0n),
    moat.getTotalAmounts().catch(() => [0n, 0n, 0n, 0n]),
  ]);
  const moatContractStaked = fmt(moatTotals[0]);
  const moatContractLocked = fmt(moatTotals[1]);
  const moatContractBurned = fmt(moatTotals[2]);
  const moatContractInContract = fmt(moatTotals[3]);
  console.log(`  Moat totalStaked:  ${Math.round(moatContractStaked).toLocaleString()} LIL`);
  console.log(`  Moat totalLocked:  ${Math.round(moatContractLocked).toLocaleString()} LIL`);
  console.log(`  Moat totalBurned:  ${Math.round(moatContractBurned).toLocaleString()} LIL`);
  console.log(`  Moat inContract:   ${Math.round(moatContractInContract).toLocaleString()} LIL`);
  console.log(`  EB Protocol totalStaked: ${Math.round(fmt(ebProtoTotal)).toLocaleString()} LIL`);
  console.log(`  EB Staking totalStaked:  ${Math.round(fmt(ebStakeTotal)).toLocaleString()} LIL`);

  // ── 1. Get all Moat active users (cheap: ~3 calls) ──
  console.log('\n🔒 Fetching Moat active users...');
  const count = Number(await moat.activeUserCount());
  let moatUsers = [];
  for (let i = 0; i < count; i += 50) {
    const batch = await moat.getActiveUsers(i, Math.min(i + 50, count));
    moatUsers.push(...batch);
    await sleep(200);
  }
  console.log(`  ${moatUsers.length} active users`);

  // ── 2. Load cached depositors + incremental scan for new ones ──
  const scanState = loadScanState();
  const cachedProtoDepositors = new Set(scanState.ebProto.depositors);
  const cachedStakeDepositors = new Set(scanState.ebStake.depositors);
  console.log(`\n📦 Cached depositors: ${cachedProtoDepositors.size} EB Proto, ${cachedStakeDepositors.size} EB Stake`);

  // Only scan blocks since last run
  const protoResult = await findNewDepositors(EB_PROTO, 'EB Protocol', scanState.ebProto.lastBlock + 1);
  const stakeResult = await findNewDepositors(EB_STAKE, 'EB Staking', scanState.ebStake.lastBlock + 1);

  // Merge cached + new
  const allProtoDepositors = new Set([...cachedProtoDepositors, ...protoResult.depositors]);
  const allStakeDepositors = new Set([...cachedStakeDepositors, ...stakeResult.depositors]);
  console.log(`\n📋 Total depositors: ${allProtoDepositors.size} EB Proto, ${allStakeDepositors.size} EB Stake`);

  // ── 3. Build master address list ──
  const allAddrs = new Set(moatUsers.map(a => a));
  TOP100.forEach(a => allAddrs.add(a));
  allProtoDepositors.forEach(a => allAddrs.add(a));
  allStakeDepositors.forEach(a => allAddrs.add(a));
  const masterList = [...allAddrs];
  console.log(`\n📋 Master address list: ${masterList.length} unique addresses`);

  // ── 4. Batch fetch ALL data for each address ──
  console.log('\n⚡ Fetching all user data (locks, stakes, balances)...');
  const lockPositions = [];
  const stakeMap = {};
  const portfolio = {};

  let ebProtoSum = 0, ebStakeSum = 0, moatStakeSum = 0;

  for (let i = 0; i < masterList.length; i++) {
    const addr = masterList[i];
    const lc = addr.toLowerCase();
    const kn = KNOWN[lc];

    try {
      const [moatInfo, moatLocks, ebProtoInfo, ebStakeInfo, walBal] = await Promise.all([
        moat.userInfo(addr).catch(() => null),
        moat.getUserAllLocks(addr).catch(() => null),
        ebProto.userInfo(addr).catch(() => [0n, 0n]),
        ebStake.userInfo(addr).catch(() => [0n, 0n]),
        lilToken.balanceOf(addr).catch(() => 0n),
      ]);

      const moatStaked = moatInfo ? fmt(moatInfo.stakedAmount) : 0;
      const ebProtoStaked = fmt(ebProtoInfo[0]);
      const ebStakeStaked = fmt(ebStakeInfo[0]);
      const walletBal = fmt(walBal);

      moatStakeSum += moatStaked;
      ebProtoSum += ebProtoStaked;
      ebStakeSum += ebStakeStaked;

      // Process locks
      let totalLocked = 0;
      const locks = [];
      if (moatLocks && moatLocks.amounts) {
        for (let j = 0; j < moatLocks.amounts.length; j++) {
          if (!moatLocks.active[j]) continue;
          const amt = fmt(moatLocks.amounts[j]);
          if (amt <= 0) continue;
          totalLocked += amt;
          locks.push({
            amount: Math.round(amt),
            endTs: Number(moatLocks.ends[j]),
            durationDays: Math.round(Number(moatLocks.originalDurations[j]) / 86400),
          });
        }
      }

      if (locks.length > 0) {
        lockPositions.push({
          a: addr, n: kn?.n || null, t: kn?.t || 'holder',
          totalLocked: Math.round(totalLocked),
          lockCount: locks.length,
          locks,
        });
      }

      // Stake data
      const totalStaked = Math.round(moatStaked) + Math.round(ebProtoStaked) + Math.round(ebStakeStaked);
      if (totalStaked > 0) {
        stakeMap[addr] = {
          a: addr, n: kn?.n || null, t: kn?.t || 'holder',
          moatStake: Math.round(moatStaked),
          ebProto: Math.round(ebProtoStaked),
          ebStake: Math.round(ebStakeStaked),
          totalStaked,
        };
      }

      // Portfolio data (skip contracts)
      const CONTRACT_ADDRS = new Set([
        MOAT_ADDR.toLowerCase(), EB_PROTO.toLowerCase(), EB_STAKE.toLowerCase(),
        '0x8acc49857a1259d25eb3ca0aa15b398d0e149ef2', // LP
        '0x000000000000000000000000000000000000dead', // Burn
      ]);
      if (!CONTRACT_ADDRS.has(lc)) {
        portfolio[addr] = {
          a: addr, n: kn?.n || null, t: kn?.t || 'holder',
          wallet: Math.round(walletBal),
          locked: Math.round(totalLocked),
          staked: totalStaked,
          total: Math.round(walletBal) + Math.round(totalLocked) + totalStaked,
        };
      }

    } catch (e) {
      console.log(`  ⚠ ${addr.slice(0, 8)}: ${e.message}`);
    }

    if ((i + 1) % 5 === 0) {
      process.stdout.write(`  ${i + 1}/${masterList.length}\r`);
      await sleep(50);
    }
  }

  // Sort arrays
  const lockArr = lockPositions.sort((a, b) => b.totalLocked - a.totalLocked);
  const stakeArr = Object.values(stakeMap).sort((a, b) => b.totalStaked - a.totalStaked);
  const portfolioArr = Object.values(portfolio).sort((a, b) => b.total - a.total);

  const now = new Date().toISOString();

  console.log(`\n\n✅ Results:`);
  console.log(`  Lockers: ${lockArr.length} (${lockArr.reduce((s, l) => s + l.totalLocked, 0).toLocaleString()} LIL locked)`);
  console.log(`  Stakers: ${stakeArr.length} (${stakeArr.reduce((s, l) => s + l.totalStaked, 0).toLocaleString()} LIL staked)`);
  console.log(`  Portfolio: ${portfolioArr.length} addresses`);

  // Verification
  console.log(`\n🔎 Verification (discovered vs on-chain):`);
  console.log(`  EB Protocol: ${Math.round(ebProtoSum).toLocaleString()} discovered / ${Math.round(fmt(ebProtoTotal)).toLocaleString()} on-chain`);
  console.log(`  EB Staking:  ${Math.round(ebStakeSum).toLocaleString()} discovered / ${Math.round(fmt(ebStakeTotal)).toLocaleString()} on-chain`);
  const protoPct = (ebProtoSum / fmt(ebProtoTotal) * 100).toFixed(1);
  const stakePct = (ebStakeSum / fmt(ebStakeTotal) * 100).toFixed(1);
  console.log(`  Coverage: EB Proto ${protoPct}%, EB Stake ${stakePct}%`);

  // ── Save scan state (for next incremental run) ──
  saveScanState({
    ebProto: { lastBlock: protoResult.lastBlock, depositors: [...allProtoDepositors] },
    ebStake: { lastBlock: stakeResult.lastBlock, depositors: [...allStakeDepositors] },
    updatedAt: now,
  });
  console.log('  📦 Scan state cached for next run');

  // ── Write output ──
  const dataDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const moatTotalsData = {
    totalStaked: Math.round(moatContractStaked),
    totalLocked: Math.round(moatContractLocked),
    totalBurned: Math.round(moatContractBurned),
    totalInContract: Math.round(moatContractInContract),
  };

  const lockData = { fetchedAt: now, block, lockers: lockArr };
  const stakeData = { fetchedAt: now, block, moatTotals: moatTotalsData, stakers: stakeArr };
  const portfolioData = { fetchedAt: now, block, holders: portfolioArr };

  fs.writeFileSync(path.join(dataDir, 'lock_data.json'), JSON.stringify(lockData, null, 2));
  fs.writeFileSync(path.join(dataDir, 'stake_data.json'), JSON.stringify(stakeData, null, 2));
  fs.writeFileSync(path.join(dataDir, 'portfolio_data.json'), JSON.stringify(portfolioData, null, 2));

  // Embeddable JS
  const js = `// Auto-generated ${now} block ${block}\nconst LOCK_DATA = ${JSON.stringify(lockArr)};\nconst STAKE_DATA = ${JSON.stringify(stakeArr)};\nconst PORTFOLIO_DATA = ${JSON.stringify(portfolioArr)};\n`;
  fs.writeFileSync(path.join(dataDir, 'embed_data.js'), js);

  console.log(`  Files: data/lock_data.json, data/stake_data.json, data/portfolio_data.json, data/embed_data.js`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
