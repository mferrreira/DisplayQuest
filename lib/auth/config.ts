import { type AuthOptions, type SessionStrategy } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { civilMonthOfInstant } from "@/backend/domain/time/civil-day"
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
        // V5-3 (DEC-137): a chave da capa do perfil viaja com a sessão, como o avatar — é ela que o
        // cartão "Meu Perfil" usa para mostrar a capa e quebrar o cache do navegador.
        token.bannerKey = (user as any).bannerKey
        token.bio = (user as any).bio
        token.profileVisibility = (user as any).profileVisibility
        // V5-4a (DEC-138): os campos abertos. O CPF não entra no token nem na sessão.
        token.registrationNumber = (user as any).registrationNumber
        token.course = (user as any).course
        token.scholarshipType = (user as any).scholarshipType
        token.fundingAgency = (user as any).fundingAgency
        token.fundingAgencyOther = (user as any).fundingAgencyOther
        token.level = (user as any).level
        token.points = (user as any).points
        // plan-v9 S01 (ADR-001): o placar do mes viaja com a sessao como o saldo — o cabecalho
        // (S06, ADR-007) mostra este numero, e nao o de todos os usuarios.
        token.currentMonthPoints = (user as any).currentMonthPoints
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
        token.bannerKey = session.user.bannerKey
        token.bio = session.user.bio
        token.profileVisibility = session.user.profileVisibility
        token.registrationNumber = session.user.registrationNumber
        token.course = session.user.course
        token.scholarshipType = session.user.scholarshipType
        token.fundingAgency = session.user.fundingAgency
        token.fundingAgencyOther = session.user.fundingAgencyOther
        token.level = session.user.level
        token.points = session.user.points
        token.currentMonthPoints = session.user.currentMonthPoints
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
            bannerKey: true,
            bio: true,
            profileVisibility: true,
            // V5-4a (DEC-138): os dados de pessoa que o perfil mostra. O CPF fica FORA da sessão
            // de propósito: ela vive em cookie, e o CPF é o único campo com leitura restrita —
            // ele sai por `GET /api/users/[id]/profile`, que decide o direito a cada chamada.
            registrationNumber: true,
            course: true,
            scholarshipType: true,
            fundingAgency: true,
            fundingAgencyOther: true,
            level: true,
            points: true,
            // plan-v9 S06 (ADR-007): o placar do mes em curso — o numero que a pila do cabecalho
            // conta e que o Quadro de Lideranca ordena. Sem ele aqui, o header leria `undefined`
            // e a pilula deixaria de existir.
            currentMonthPoints: true,
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
          // plan-v9 S06 (R4, DEC-132): o mes do quadro e nomeado pelo servidor, com a aritmetica
          // de dia civil do dominio — o navegador nao deduz mes (`new Date("2026-10")` e
          // meia-noite UTC e o rotulo viraria setembro). E isto que re-tariza a pila do cabecalho
          // na virada sem animar a queda (R13).
          currentMonth: civilMonthOfInstant(new Date()),
        }
      } catch (err) {
        console.error("Session callback: DB query failed, falling back to token data", err)
        // Fall back to token data instead of returning empty session
        session.user = {
          id: token.id,
          name: token.name,
          email: token.email,
          avatar: token.avatar,
          bannerKey: token.bannerKey,
          bio: token.bio,
          profileVisibility: token.profileVisibility,
          registrationNumber: token.registrationNumber,
          course: token.course,
          scholarshipType: token.scholarshipType,
          fundingAgency: token.fundingAgency,
          fundingAgencyOther: token.fundingAgencyOther,
          level: token.level,
          points: token.points,
          currentMonthPoints: token.currentMonthPoints,
          completedTasks: token.completedTasks,
          weekHours: token.weekHours,
          currentWeekHours: token.currentWeekHours,
          roles: token.roles,
          status: token.status,
          // O mes continua nomeado pelo servidor mesmo quando a leitura do banco falhou: e o
          // cabecalho quem usa, e um cabecalho sem mes nao re-tariza na virada.
          currentMonth: civilMonthOfInstant(new Date()),
        }
      }

      return session
    },
  },
}
