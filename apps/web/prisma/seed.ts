import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_USERS = [
  { githubId: 10001, username: 'demouser', displayName: 'Demo User', avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=demo' },
  { githubId: 10002, username: 'alice', displayName: 'Alice Chen', avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=alice' },
  { githubId: 10003, username: 'bob', displayName: 'Bob Smith', avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=bob' },
  { githubId: 10004, username: 'carol', displayName: 'Carol Reyes', avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=carol' },
  { githubId: 10005, username: 'dave', displayName: 'Dave Kim', avatarUrl: 'https://api.dicebear.com/9.x/thumbs/svg?seed=dave' },
];

const MODELS = ['gpt-4o', 'claude-sonnet-4', 'o4-mini', 'gemini-2.5-pro', 'gpt-4.1'];

const REPOS = [
  'acme/webapp', 'acme/api-server', 'acme/mobile-app', 'oss/react-hooks', 'personal/dotfiles',
  'startup/saas-platform', 'data/ml-pipeline', 'infra/k8s-configs',
];

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomModel() {
  return MODELS[rand(0, MODELS.length - 1)];
}

async function main() {
  console.log('Seeding database...');

  for (const u of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { githubId: u.githubId },
      update: { displayName: u.displayName, avatarUrl: u.avatarUrl, profilePublic: true },
      create: { ...u, profilePublic: true },
    });

    // Create a device
    const device = await prisma.device.upsert({
      where: { tokenId: `dev-${u.username}` },
      update: {},
      create: {
        userId: user.id,
        name: `${u.username}'s laptop`,
        tokenId: `dev-${u.username}`,
        secretHash: 'dev-not-real',
      },
    });

    // Generate 30 days of usage data
    const now = new Date();
    let totalReqs = 0, totalPrompt = 0, totalOutput = 0, totalPremium = 0;
    const dailyTotals: number[] = [];
    let weeklyTokens = 0;

    for (let d = 0; d < 30; d++) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      date.setHours(0, 0, 0, 0);

      const requests = rand(5, 150);
      const promptTokens = requests * rand(200, 2000);
      const outputTokens = requests * rand(100, 1500);
      const premiumRequests = +(requests * (Math.random() * 0.5 + 0.5)).toFixed(2);
      const dailyTokenTotal = promptTokens + outputTokens;

      totalReqs += requests;
      totalPrompt += promptTokens;
      totalOutput += outputTokens;
      totalPremium += premiumRequests;
      dailyTotals.push(dailyTokenTotal);
      if (d < 7) {
        weeklyTokens += dailyTokenTotal;
      }

      await prisma.usageDaily.upsert({
        where: { userId_deviceId_date: { userId: user.id, deviceId: device.id, date } },
        update: { totalRequests: requests, promptTokens, outputTokens, totalTokens: dailyTokenTotal, premiumRequests },
        create: { userId: user.id, deviceId: device.id, date, totalRequests: requests, promptTokens, outputTokens, totalTokens: dailyTokenTotal, premiumRequests },
      });
    }

    const activeThreshold = 10_000;
    let currentStreakDays = 0;
    for (const total of dailyTotals) {
      if (total >= activeThreshold) {
        currentStreakDays += 1;
      } else {
        break;
      }
    }

    let bestStreakDays = 0;
    let run = 0;
    for (const total of dailyTotals) {
      if (total >= activeThreshold) {
        run += 1;
        bestStreakDays = Math.max(bestStreakDays, run);
      } else {
        run = 0;
      }
    }

    const rolling30DayTokens = totalPrompt + totalOutput;

    const topModel = randomModel();

    // Upsert UserStat
    await prisma.userStat.upsert({
      where: { userId: user.id },
      update: { totalRequests: totalReqs, promptTokens: totalPrompt, outputTokens: totalOutput, totalTokens: totalPrompt + totalOutput, weeklyTokens, rolling30DayTokens, premiumRequests: totalPremium, currentStreakDays, bestStreakDays, workspaceCount: rand(2, 8), sessionCount: rand(50, 300), topModel, lastSyncedAt: now },
      create: { userId: user.id, totalRequests: totalReqs, promptTokens: totalPrompt, outputTokens: totalOutput, totalTokens: totalPrompt + totalOutput, weeklyTokens, rolling30DayTokens, premiumRequests: totalPremium, currentStreakDays, bestStreakDays, workspaceCount: rand(2, 8), sessionCount: rand(50, 300), topModel, lastSyncedAt: now },
    });

    // Upsert RepoStats (2–4 repos per user)
    const repoCount = rand(2, 4);
    const userRepos = REPOS.sort(() => Math.random() - 0.5).slice(0, repoCount);
    for (const repo of userRepos) {
      const repoReqs = rand(20, 500);
      const repoPT = repoReqs * rand(300, 1500);
      const repoOT = repoReqs * rand(200, 1000);
      const repoTotal = repoPT + repoOT;
      const repo30d = Math.round(repoTotal * (Math.random() * 0.45 + 0.35));

      await prisma.repoStat.upsert({
        where: { userId_repoIdentity: { userId: user.id, repoIdentity: `github:${repo}` } },
        update: { requests: repoReqs, promptTokens: repoPT, outputTokens: repoOT, totalTokens: repoTotal, tokens30d: repo30d, premiumReqs: +(repoReqs * 0.7).toFixed(1), topModel: randomModel(), isPublic: true, lastSyncedAt: now },
        create: { userId: user.id, repoIdentity: `github:${repo}`, displayMode: 'github', githubRepo: repo, requests: repoReqs, promptTokens: repoPT, outputTokens: repoOT, totalTokens: repoTotal, tokens30d: repo30d, premiumReqs: +(repoReqs * 0.7).toFixed(1), topModel: randomModel(), isPublic: true, lastSyncedAt: now },
      });
    }

    console.log(`  ✓ ${u.username} — ${totalReqs} requests, ${(totalPrompt + totalOutput).toLocaleString()} tokens`);
  }

  console.log('\nDone! You can sign in with any username: demouser, alice, bob, carol, dave');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
