import NextAuth, { type NextAuthOptions } from 'next-auth';
import GitHubProvider from 'next-auth/providers/github';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from './db';
import {
  getDeterministicDevGithubId,
  getDevTestAccountConfig,
  shouldAutoCreateDevTestAccount,
  shouldEnableDevLogin,
} from './auth-policy';

const enableDevLogin = shouldEnableDevLogin(process.env);
const devTestAccount = getDevTestAccountConfig(process.env);

const providers: NextAuthOptions['providers'] = [];

function normalizeUsername(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

// GitHub OAuth (production + dev if configured)
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  providers.push(
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    })
  );
}

// Dev-only credentials provider — sign in as a seeded user or an explicitly configured local test account
if (enableDevLogin) {
  providers.push(
    CredentialsProvider({
      id: 'dev-login',
      name: 'Dev Login',
      credentials: {
        username: { label: 'Username', type: 'text', placeholder: devTestAccount.username },
      },
      async authorize(credentials) {
        const requestedUsername = normalizeUsername(credentials?.username);
        if (!requestedUsername) return null;

        let user = await prisma.user.findUnique({ where: { username: requestedUsername } });

        if (!user && shouldAutoCreateDevTestAccount(requestedUsername, process.env)) {
          const githubId = getDeterministicDevGithubId(devTestAccount.username);
          const conflictingUser = await prisma.user.findUnique({
            where: { githubId },
            select: { username: true },
          });

          if (conflictingUser && conflictingUser.username !== devTestAccount.username) {
            return null;
          }

          user = await prisma.user.upsert({
            where: { username: devTestAccount.username },
            update: {
              displayName: devTestAccount.displayName,
              avatarUrl: devTestAccount.avatarUrl,
              profilePublic: devTestAccount.profilePublic,
            },
            create: {
              githubId,
              username: devTestAccount.username,
              displayName: devTestAccount.displayName,
              avatarUrl: devTestAccount.avatarUrl,
              profilePublic: devTestAccount.profilePublic,
            },
          });

          await prisma.userStat.upsert({
            where: { userId: user.id },
            update: { lastSyncedAt: new Date() },
            create: { userId: user.id },
          });
        }

        if (!user) return null;
        return { id: String(user.githubId), name: user.username, image: user.avatarUrl };
      },
    })
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  callbacks: {
    async signIn({ account, profile }) {
      // Dev credentials provider — user already exists in DB
      if (account?.provider === 'dev-login') {
        return true;
      }

      if (!account || account.provider !== 'github' || !profile) {
        return false;
      }
      const ghProfile = profile as { id?: number; login?: string; avatar_url?: string; name?: string };
      if (!ghProfile.id || !ghProfile.login) {
        return false;
      }

      await prisma.user.upsert({
        where: { githubId: ghProfile.id },
        update: {
          username: ghProfile.login,
          displayName: ghProfile.name || ghProfile.login,
          avatarUrl: ghProfile.avatar_url,
        },
        create: {
          githubId: ghProfile.id,
          username: ghProfile.login,
          displayName: ghProfile.name || ghProfile.login,
          avatarUrl: ghProfile.avatar_url,
        },
      });

      return true;
    },
    async session({ session, token }) {
      if (token.sub) {
        const dbUser = await prisma.user.findFirst({
          where: { githubId: parseInt(token.sub, 10) },
        });
        if (dbUser) {
          const sessionWithUser = session as typeof session & {
            userId?: string;
            username?: string;
            avatarUrl?: string | null;
            displayName?: string;
          };
          sessionWithUser.userId = dbUser.id;
          sessionWithUser.username = dbUser.username;
          sessionWithUser.avatarUrl = dbUser.avatarUrl;
          sessionWithUser.displayName = dbUser.displayName || dbUser.username;
        }
      }
      return session;
    },
    async jwt({ token, profile, user }) {
      if (profile) {
        const profileWithId = profile as { id?: number };
        if (typeof profileWithId.id === 'number') {
          token.sub = String(profileWithId.id);
        }
      }
      // Dev credentials: user.id is the githubId string
      if (user && !profile) {
        token.sub = user.id;
      }
      return token;
    },
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);

/** Helper to get the authenticated user's DB id from a session. */
export async function getSessionUser() {
  const { getServerSession } = await import('next-auth/next');
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const s = session as typeof session & {
    userId?: string;
    username?: string;
    avatarUrl?: string | null;
    displayName?: string;
  };
  if (!s.userId) return null;
  return {
    userId: s.userId,
    username: s.username || '',
    avatarUrl: s.avatarUrl || null,
    displayName: s.displayName || s.username || '',
  };
}
