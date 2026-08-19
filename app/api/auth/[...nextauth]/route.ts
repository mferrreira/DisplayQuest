import NextAuth, { type AuthOptions, type SessionStrategy } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "@/lib/database/prisma"
import bcrypt from "bcryptjs"

const SESSION_MAX_AGE = 60 * 60 * 48 // 2 days
const SLIDING_WINDOW_THRESHOLD = 60 * 60 * 24 // refresh if less than 24h left

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email e senha são obrigatórios.")
        }
        const user = await prisma.users.findUnique({ where: { email: credentials.email.toLowerCase() } })
        if (!user || !user.password) {
          throw new Error("Usuário não encontrado ou senha não definida.")
        }
        const isValid = await bcrypt.compare(credentials.password, user.password)
        if (!isValid) {
          throw new Error("Senha incorreta.")
        }
        
        if (user.status !== "active") {
          throw new Error("Sua conta ainda não foi aprovada. Entre em contato com um administrador ou laboratorista.")
        }
        
        const { password, ...safeUser } = user
        return safeUser as any 
      },
    }),
  ],
  session: {
    strategy: "jwt" as SessionStrategy,
    maxAge: SESSION_MAX_AGE,
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user, trigger, session }: { token: any; user?: any, trigger?: any, session?: any }) {
      if (user) {
        token.id = (user as any).id
        token.roles = (user as any).roles
        token.name = (user as any).name
        token.email = (user as any).email
        token.avatar = (user as any).avatar
        token.bio = (user as any).bio
        token.profileVisibility = (user as any).profileVisibility
        token.points = (user as any).points
        token.completedTasks = (user as any).completedTasks
        token.weekHours = (user as any).weekHours
        token.currentWeekHours = (user as any).currentWeekHours
        token.status = (user as any).status
        token.iat = Math.floor(Date.now() / 1000)
      }

      if (trigger === "update" && session?.user) {
        token.name = session.user.name
        token.email = session.user.email
        token.avatar = session.user.avatar
        token.bio = session.user.bio
        token.profileVisibility = session.user.profileVisibility
        token.points = session.user.points
        token.completedTasks = session.user.completedTasks
        token.weekHours = session.user.weekHours
        token.currentWeekHours = session.user.currentWeekHours
        token.roles = session.user.roles
        token.status = session.user.status
      }

      // Sliding window: extend token expiry if user is active
      const now = Math.floor(Date.now() / 1000)
      const tokenAge = now - (token.iat || 0)
      const timeLeft = SESSION_MAX_AGE - tokenAge
      if (timeLeft < SLIDING_WINDOW_THRESHOLD && token.id) {
        token.iat = now
      }
      
      return token
    },
    async session({ session, token }: { session: any; token: any }) {
      if (!token?.id) return session

      try {
        const dbUser = await prisma.users.findUnique({
          where: { id: token.id },
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            bio: true,
            profileVisibility: true,
            points: true,
            completedTasks: true,
            weekHours: true,
            currentWeekHours: true,
            roles: true,
            status: true,
          },
        })

        if (!dbUser) return session

        session.user = {
          ...session.user,
          ...dbUser,
        }
      } catch (err) {
        console.error("Session callback: DB query failed, falling back to token data", err)
        // Fall back to token data instead of returning empty session
        session.user = {
          id: token.id,
          name: token.name,
          email: token.email,
          avatar: token.avatar,
          bio: token.bio,
          profileVisibility: token.profileVisibility,
          points: token.points,
          completedTasks: token.completedTasks,
          weekHours: token.weekHours,
          currentWeekHours: token.currentWeekHours,
          roles: token.roles,
          status: token.status,
        }
      }

      return session
    },
  },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST } 
