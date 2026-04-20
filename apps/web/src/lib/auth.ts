import NextAuth, { type NextAuthOptions } from 'next-auth';
import GitHubProvider from 'next-auth/providers/github';
import { prisma } from './db';

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
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
    async jwt({ token, profile }) {
      if (profile) {
        token.sub = String((profile as any).id);
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
