import NextAuth, { type NextAuthOptions } from 'next-auth';
import GitHubProvider from 'next-auth/providers/github';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from './db';

const isDev = process.env.NODE_ENV === 'development';

const providers: NextAuthOptions['providers'] = [];

// GitHub OAuth (production + dev if configured)
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  providers.push(
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    })
  );
}

// Dev-only credentials provider — sign in as any seeded user
if (isDev) {
  providers.push(
    CredentialsProvider({
      id: 'dev-login',
      name: 'Dev Login',
      credentials: {
        username: { label: 'Username', type: 'text', placeholder: 'demouser' },
      },
      async authorize(credentials) {
        if (!credentials?.username) return null;
        const user = await prisma.user.findUnique({
          where: { username: credentials.username },
        });
        if (!user) return null;
        return { id: String(user.githubId), name: user.username, image: user.avatarUrl };
      },
    })
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
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
          (session as any).userId = dbUser.id;
          (session as any).username = dbUser.username;
        }
      }
      return session;
    },
    async jwt({ token, profile, user }) {
      if (profile) {
        token.sub = String((profile as any).id);
      }
      // Dev credentials: user.id is the githubId string
      if (user && !profile) {
        token.sub = user.id;
      }
      return token;
    },
  },
  pages: {
    signIn: '/api/auth/signin',
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
  const s = session as any;
  if (!s.userId) return null;
  return { userId: s.userId as string, username: s.username as string };
}
