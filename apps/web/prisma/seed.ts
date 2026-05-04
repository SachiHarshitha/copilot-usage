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
      update: { displayName: u.displayName, avatarUrl: u.avatarUrl },
      create: { ...u },
    });

    // Ensure demo users are visible on leaderboard / badges (opt-in required)
    await prisma.privacySettings.upsert({
      where: { userId: user.id },
      update: { profilePublic: true, leaderboardOptIn: true, badgesEnabled: true },
      create: { userId: user.id, profilePublic: true, leaderboardOptIn: true, badgesEnabled: true },
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

    // Generate canonical usage facts for 30 days.
    const userRepos = REPOS.sort(() => Math.random() - 0.5).slice(0, rand(2, 4));
    for (const repo of userRepos) {
      await prisma.repoVisibilitySettings.upsert({
        where: { userId_repoIdentity: { userId: user.id, repoIdentity: `github:${repo}` } },
        update: { isPublic: true },
        create: { userId: user.id, repoIdentity: `github:${repo}`, isPublic: true },
      });
    }

    const now = new Date();
    let totalReqs = 0;
    let totalTokens = 0;

    for (let d = 0; d < 30; d++) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      date.setHours(0, 0, 0, 0);

      const runs = rand(1, 4);
      for (let i = 0; i < runs; i++) {
        const repo = userRepos[rand(0, userRepos.length - 1)];
        const startedAt = new Date(date);
        startedAt.setHours(rand(0, 23), rand(0, 59), rand(0, 59), 0);
        const endedAt = new Date(startedAt);
        endedAt.setMinutes(endedAt.getMinutes() + rand(1, 45));
        await prisma.agentRun.upsert({
          where: {
            userId_adapter_runExternalId: {
              userId: user.id,
              adapter: 'github-copilot-vscode',
              runExternalId: `${u.username}-${date.toISOString().slice(0, 10)}-${i}`,
            },
          },
          update: {
            provider: 'openai',
            product: 'copilot',
            surface: 'vscode',
            deviceId: device.id,
            startedAt,
            endedAt,
            repoIdentity: `github:${repo}`,
            trustLevel: 'observed',
          },
          create: {
            userId: user.id,
            deviceId: device.id,
            adapter: 'github-copilot-vscode',
            provider: 'openai',
            product: 'copilot',
            surface: 'vscode',
            runExternalId: `${u.username}-${date.toISOString().slice(0, 10)}-${i}`,
            startedAt,
            endedAt,
            repoIdentity: `github:${repo}`,
            trustLevel: 'observed',
          },
        });
      }

      for (const repo of userRepos) {
        if (Math.random() < 0.25) continue;
        const requests = rand(5, 80);
        const promptTokens = requests * rand(250, 1400);
        const outputTokens = requests * rand(150, 900);
        const rowTotalTokens = promptTokens + outputTokens;

        totalReqs += requests;
        totalTokens += rowTotalTokens;

        const modelId = randomModel();
        await prisma.modelUsageDaily.upsert({
          where: {
            userId_deviceId_date_provider_product_surface_modelId_repoIdentity: {
              userId: user.id,
              deviceId: device.id,
              date,
              provider: 'openai',
              product: 'copilot',
              surface: 'vscode',
              modelId,
              repoIdentity: `github:${repo}`,
            },
          },
          update: {
            trustLevel: 'observed',
            requestCount: requests,
            inputTokens: BigInt(promptTokens),
            outputTokens: BigInt(outputTokens),
            totalTokens: BigInt(rowTotalTokens),
            cacheReadTokens: 0n,
            cacheWriteTokens: 0n,
            costMicros: BigInt(rowTotalTokens * rand(1, 4)),
            premiumRequests: +(requests * (Math.random() * 0.4 + 0.4)).toFixed(1),
          },
          create: {
            userId: user.id,
            deviceId: device.id,
            date,
            provider: 'openai',
            product: 'copilot',
            surface: 'vscode',
            modelId,
            repoIdentity: `github:${repo}`,
            trustLevel: 'observed',
            requestCount: requests,
            inputTokens: BigInt(promptTokens),
            outputTokens: BigInt(outputTokens),
            totalTokens: BigInt(rowTotalTokens),
            cacheReadTokens: 0n,
            cacheWriteTokens: 0n,
            costMicros: BigInt(rowTotalTokens * rand(1, 4)),
            premiumRequests: +(requests * (Math.random() * 0.4 + 0.4)).toFixed(1),
          },
        });
      }
    }

    console.log(`  ✓ ${u.username} — ${totalReqs} requests, ${totalTokens.toLocaleString()} tokens`);
  }

  console.log('\nDone! You can sign in with any username: demouser, alice, bob, carol, dave');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
