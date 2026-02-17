import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/database/prisma"
import { BadgeRulesEngine } from "@/backend/modules/gamification/domain/engines/badge-rules.engine"
import { BadgeEngine } from "@/backend/modules/gamification/domain/engines/badge.engine"
import { BadgeRepository, UserBadgeRepository } from "@/backend/repositories/BadgeRepository"
import { UserRepository } from "@/backend/repositories/UserRepository"
import type {
  AwardBadgeCommand,
  AwardFromTaskCompletionCommand,
  AwardFromWorkSessionCommand,
  ChestCatalogItem,
  ClaimQuestRewardCommand,
  ClaimQuestRewardResult,
  CreateBadgeCommand,
  GamificationAwardResult,
  GamificationSourceType,
  OpenChestCommand,
  OpenChestResult,
  QuestRewardPayload,
  UpdateUserGamificationProfileCommand,
  UpdateBadgeCommand,
  UserInventoryItem,
  UserStoryArc,
  UserQuest,
  UserGamificationProfile,
  UserProgression,
  UserWallet,
} from "@/backend/modules/gamification/application/contracts"
import type { GamificationGateway } from "@/backend/modules/gamification/application/ports/gamification.gateway"

const LEVEL_XP_STEP = 100
const ELO_BY_MIN_LEVEL = [
  { minLevel: 100, elo: "CHALLENGER" },
  { minLevel: 90, elo: "GRAO_MESTRE" },
  { minLevel: 80, elo: "MESTRE" },
  { minLevel: 70, elo: "DIAMANTE" },
  { minLevel: 65, elo: "OURO_I" },
  { minLevel: 60, elo: "OURO_II" },
  { minLevel: 55, elo: "OURO_III" },
  { minLevel: 50, elo: "PRATA_I" },
  { minLevel: 45, elo: "PRATA_II" },
  { minLevel: 40, elo: "PRATA_III" },
  { minLevel: 35, elo: "BRONZE_I" },
  { minLevel: 30, elo: "BRONZE_II" },
  { minLevel: 25, elo: "BRONZE_III" },
  { minLevel: 20, elo: "FERRO_I" },
  { minLevel: 15, elo: "FERRO_II" },
  { minLevel: 10, elo: "FERRO_III" },
  { minLevel: 5, elo: "MADEIRA_I" },
  { minLevel: 1, elo: "MADEIRA_II" },
] as const

type ChestDropEntry = {
  itemKey: string
  itemName: string
  rarity: string
  weight: number
  qtyMin: number
  qtyMax: number
}

type ChestDefinition = ChestCatalogItem & {
  minDrops: number
  maxDrops: number
  drops: ChestDropEntry[]
}

type ArchetypeModifiers = {
  xpMultiplier: number
  coinMultiplier: number
  pointsMultiplier: number
  questTrophyBonus: number
  chestDiscountRate: number
  extraChestDropChance: number
}

const DEFAULT_CHEST_DEFINITIONS: ChestDefinition[] = [
  {
    id: "iron-starter",
    name: "Baú de Ferro",
    description: "Baú básico para aventureiros iniciantes.",
    rarity: "common",
    priceCoins: 120,
    minDrops: 1,
    maxDrops: 2,
    drops: [
      { itemKey: "iron-shield", itemName: "Escudo de Ferro", rarity: "common", weight: 42, qtyMin: 1, qtyMax: 1 },
      { itemKey: "stamina-potion", itemName: "Poção de Fôlego", rarity: "common", weight: 35, qtyMin: 1, qtyMax: 2 },
      { itemKey: "scribe-scroll", itemName: "Pergaminho de Registro", rarity: "uncommon", weight: 18, qtyMin: 1, qtyMax: 1 },
      { itemKey: "ember-core", itemName: "Núcleo de Brasa", rarity: "rare", weight: 5, qtyMin: 1, qtyMax: 1 },
    ],
  },
  {
    id: "arcane-elite",
    name: "Baú Arcano",
    description: "Equipamento refinado para agentes de elite.",
    rarity: "rare",
    priceCoins: 340,
    minDrops: 2,
    maxDrops: 3,
    drops: [
      { itemKey: "mana-sigil", itemName: "Sigilo de Mana", rarity: "uncommon", weight: 35, qtyMin: 1, qtyMax: 2 },
      { itemKey: "rune-blade", itemName: "Lâmina Rúnica", rarity: "rare", weight: 32, qtyMin: 1, qtyMax: 1 },
      { itemKey: "storm-cape", itemName: "Manto da Tempestade", rarity: "rare", weight: 23, qtyMin: 1, qtyMax: 1 },
      { itemKey: "oracle-lens", itemName: "Lente do Oráculo", rarity: "epic", weight: 10, qtyMin: 1, qtyMax: 1 },
    ],
  },
  {
    id: "celestial-mythic",
    name: "Baú Celestial",
    description: "Relíquias lendárias para os mais dedicados.",
    rarity: "epic",
    priceCoins: 800,
    minDrops: 3,
    maxDrops: 4,
    drops: [
      { itemKey: "solar-aegis", itemName: "Égide Solar", rarity: "epic", weight: 38, qtyMin: 1, qtyMax: 1 },
      { itemKey: "void-hammer", itemName: "Martelo do Vazio", rarity: "epic", weight: 28, qtyMin: 1, qtyMax: 1 },
      { itemKey: "astral-crown", itemName: "Coroa Astral", rarity: "legendary", weight: 14, qtyMin: 1, qtyMax: 1 },
      { itemKey: "phoenix-emblem", itemName: "Emblema da Fênix", rarity: "legendary", weight: 12, qtyMin: 1, qtyMax: 1 },
      { itemKey: "mythic-fragment", itemName: "Fragmento Mítico", rarity: "rare", weight: 8, qtyMin: 1, qtyMax: 2 },
    ],
  },
]

export class PrismaGamificationGateway implements GamificationGateway {
  private readonly badgeEngine: BadgeEngine
  private readonly badgeRulesEngine: BadgeRulesEngine
  private readonly userRepository: UserRepository

  constructor() {
    this.badgeEngine = new BadgeEngine(new BadgeRepository(), new UserBadgeRepository())
    this.badgeRulesEngine = new BadgeRulesEngine()
    this.userRepository = new UserRepository()
  }

  async awardFromWorkSession(command: AwardFromWorkSessionCommand): Promise<GamificationAwardResult> {
    const sourceType: GamificationSourceType = "WORK_SESSION_COMPLETED"
    const sourceId = command.workSessionId

    const alreadyAwarded = await this.hasAward(command.userId, sourceType, sourceId)
    if (alreadyAwarded) {
      const progression = await this.getUserProgression(command.userId)
      return {
        userId: command.userId,
        sourceType,
        sourceId,
        pointsAwarded: 0,
        xpAwarded: 0,
        coinsAwarded: 0,
        newProgression: progression,
        alreadyAwarded: true,
      }
    }

    const rawPointsAwarded = this.calculateWorkSessionPoints(command.durationSeconds, command.completedTaskIds)
    const progression = await this.getUserProgression(command.userId)
    const archetypeModifiers = this.getArchetypeModifiers(progression)
    const multipliers = this.getEloMultipliers(progression.elo)
    const pointsAwarded = Math.max(1, Math.floor(rawPointsAwarded * archetypeModifiers.pointsMultiplier))
    const xpAwarded = Math.max(1, Math.floor(pointsAwarded * multipliers.xp * archetypeModifiers.xpMultiplier))
    const coinsAwarded = Math.max(2, Math.floor(pointsAwarded * 0.75 * multipliers.coins * archetypeModifiers.coinMultiplier))

    const newProgression = await this.applyAward(
      command.userId,
      sourceType,
      sourceId,
      pointsAwarded,
      xpAwarded,
      coinsAwarded,
    )

    await this.evaluateUserBadges(command.userId)
    await this.syncStoryArcs(command.userId)

    return {
      userId: command.userId,
      sourceType,
      sourceId,
      pointsAwarded,
      xpAwarded,
      coinsAwarded,
      newProgression,
      alreadyAwarded: false,
    }
  }

  async awardFromTaskCompletion(command: AwardFromTaskCompletionCommand): Promise<GamificationAwardResult> {
    const sourceType: GamificationSourceType = "TASK_COMPLETED"
    const sourceId = command.taskId

    const alreadyAwarded = await this.hasAward(command.userId, sourceType, sourceId)
    if (alreadyAwarded) {
      const progression = await this.getUserProgression(command.userId)
      return {
        userId: command.userId,
        sourceType,
        sourceId,
        pointsAwarded: 0,
        xpAwarded: 0,
        coinsAwarded: 0,
        newProgression: progression,
        alreadyAwarded: true,
      }
    }

    const rawPointsAwarded =
      command.taskPoints === undefined || command.taskPoints === null
        ? 10
        : Math.floor(command.taskPoints)
    const progression = await this.getUserProgression(command.userId)
    const archetypeModifiers = this.getArchetypeModifiers(progression)
    const multipliers = this.getEloMultipliers(progression.elo)
    const pointsAwarded = Math.max(1, Math.floor(rawPointsAwarded * archetypeModifiers.pointsMultiplier))
    const xpAwarded = Math.max(1, Math.floor(pointsAwarded * multipliers.xp * archetypeModifiers.xpMultiplier))
    const coinsAwarded = Math.max(1, Math.floor((pointsAwarded / 2) * multipliers.coins * archetypeModifiers.coinMultiplier))

    const newProgression = await this.applyAward(
      command.userId,
      sourceType,
      sourceId,
      pointsAwarded,
      xpAwarded,
      coinsAwarded,
    )

    await this.evaluateUserBadges(command.userId)
    await this.syncStoryArcs(command.userId)

    return {
      userId: command.userId,
      sourceType,
      sourceId,
      pointsAwarded,
      xpAwarded,
      coinsAwarded,
      newProgression,
      alreadyAwarded: false,
    }
  }

  async getUserProgression(userId: number): Promise<UserProgression> {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, points: true },
    })

    if (!user) {
      throw new Error("Usuário não encontrado")
    }

    const profile = await this.ensureProfile(userId)
    const wallet = await this.ensureWallet(userId)

    const xp = Math.max(0, profile.xpTotal)
    const level = this.getLevelByXp(xp)
    const nextLevelXp = level * LEVEL_XP_STEP
    const previousLevelXp = Math.max(0, (level - 1) * LEVEL_XP_STEP)
    const progressToNextLevel = Math.min(
      100,
      Math.floor(((xp - previousLevelXp) / (nextLevelXp - previousLevelXp)) * 100),
    )

    return {
      userId: user.id,
      points: user.points,
      xp,
      level,
      elo: profile.elo || this.getEloByLevel(level),
      coins: wallet.coins,
      trophies: profile.trophies,
      archetype: profile.archetype,
      title: profile.title,
      displayName: profile.displayName,
      nextLevelXp,
      progressToNextLevel: Number.isFinite(progressToNextLevel) ? Math.max(0, progressToNextLevel) : 0,
    }
  }

  async getUserWallet(userId: number): Promise<UserWallet> {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { id: true },
    })
    if (!user) {
      throw new Error("Usuário não encontrado")
    }

    const wallet = await this.ensureWallet(userId)
    return {
      userId,
      coins: wallet.coins,
      updatedAt: wallet.updatedAt.toISOString(),
    }
  }

  async getUserProfile(userId: number): Promise<UserGamificationProfile> {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { id: true },
    })
    if (!user) {
      throw new Error("Usuário não encontrado")
    }

    const profile = await this.ensureProfile(userId)
    return {
      userId,
      displayName: profile.displayName,
      archetype: profile.archetype,
      title: profile.title,
      bioRpg: profile.bioRpg,
      lore: profile.lore,
      elo: profile.elo,
      level: profile.level,
      xpTotal: profile.xpTotal,
      trophies: profile.trophies,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    }
  }

  async updateUserProfile(command: UpdateUserGamificationProfileCommand): Promise<UserGamificationProfile> {
    const user = await prisma.users.findUnique({
      where: { id: command.userId },
      select: { id: true },
    })
    if (!user) {
      throw new Error("Usuário não encontrado")
    }

    await this.ensureProfile(command.userId)

    const cleanText = (value: string | null | undefined, maxLen: number) => {
      if (value === undefined) return undefined
      if (value === null) return null
      const normalized = value.trim()
      if (!normalized) return null
      return normalized.slice(0, maxLen)
    }

    const updated = await prisma.gamification_profiles.update({
      where: { userId: command.userId },
      data: {
        displayName: cleanText(command.data.displayName, 80),
        archetype: cleanText(command.data.archetype, 60),
        title: cleanText(command.data.title, 80),
        bioRpg: cleanText(command.data.bioRpg, 500),
        lore: cleanText(command.data.lore, 3000),
      },
    })

    return {
      userId: command.userId,
      displayName: updated.displayName,
      archetype: updated.archetype,
      title: updated.title,
      bioRpg: updated.bioRpg,
      lore: updated.lore,
      elo: updated.elo,
      level: updated.level,
      xpTotal: updated.xpTotal,
      trophies: updated.trophies,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    }
  }

  async listAvailableQuestsForUser(userId: number): Promise<UserQuest[]> {
    await this.ensureProfile(userId)
    await this.ensureDefaultQuestDefinitions()

    const progression = await this.getUserProgression(userId)
    const now = new Date()

    const definitions = await prisma.gamification_quest_definitions.findMany({
      where: {
        active: true,
        OR: [
          { startsAt: null },
          { startsAt: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { endsAt: null },
              { endsAt: { gte: now } },
            ],
          },
        ],
      },
      orderBy: [{ questType: "asc" }, { id: "asc" }],
    })

    const visibleDefinitions = definitions.filter((definition) => {
      const minLevel = definition.minLevel ?? 1
      if (progression.level < minLevel) return false
      if (!definition.minElo) return true
      return this.compareElo(progression.elo, definition.minElo) >= 0
    })

    const questIds = visibleDefinitions.map((quest) => quest.id)
    const currentProgress = questIds.length
      ? await prisma.gamification_quest_progress.findMany({
          where: { userId, questId: { in: questIds } },
        })
      : []
    const progressByQuestId = new Map(currentProgress.map((item) => [item.questId, item]))

    const quests: UserQuest[] = []

    for (const definition of visibleDefinitions) {
      const { targetValue, computedProgress } = await this.resolveQuestProgress({
        userId,
        requirements: definition.requirements,
      })

      const upserted = await prisma.gamification_quest_progress.upsert({
        where: {
          userId_questId: { userId, questId: definition.id },
        },
        create: {
          userId,
          questId: definition.id,
          targetValue,
          progressValue: Math.min(computedProgress, targetValue),
          status: computedProgress >= targetValue ? "COMPLETED" : "IN_PROGRESS",
          startedAt: new Date(),
          completedAt: computedProgress >= targetValue ? new Date() : null,
          expiresAt: definition.endsAt ?? null,
        },
        update: {
          targetValue,
          progressValue: Math.min(computedProgress, targetValue),
          status:
            progressByQuestId.get(definition.id)?.claimedAt
              ? "CLAIMED"
              : computedProgress >= targetValue
                ? "COMPLETED"
                : "IN_PROGRESS",
          completedAt:
            progressByQuestId.get(definition.id)?.claimedAt
              ? progressByQuestId.get(definition.id)?.completedAt ?? new Date()
              : computedProgress >= targetValue
                ? progressByQuestId.get(definition.id)?.completedAt ?? new Date()
                : null,
          expiresAt: definition.endsAt ?? null,
        },
      })

      quests.push(this.toUserQuest(definition, upserted))
    }

    return quests
  }

  async claimQuestReward(command: ClaimQuestRewardCommand): Promise<ClaimQuestRewardResult> {
    const quest = await prisma.gamification_quest_definitions.findUnique({
      where: { id: command.questId },
    })
    if (!quest || !quest.active) {
      throw new Error("Quest não encontrada")
    }

    await this.listAvailableQuestsForUser(command.userId)

    const currentProgress = await prisma.gamification_quest_progress.findUnique({
      where: {
        userId_questId: {
          userId: command.userId,
          questId: command.questId,
        },
      },
    })

    if (!currentProgress) {
      throw new Error("Quest não iniciada")
    }
    if (currentProgress.claimedAt) {
      throw new Error("Recompensa da quest já resgatada")
    }
    if (currentProgress.progressValue < currentProgress.targetValue) {
      throw new Error("Quest ainda não concluída")
    }

    const progressionBeforeClaim = await this.getUserProgression(command.userId)
    const archetypeModifiers = this.getArchetypeModifiers(progressionBeforeClaim)
    const baseReward = this.normalizeQuestRewards(quest.rewards)
    const reward = this.applyArchetypeQuestModifiers(baseReward, archetypeModifiers)
    const now = new Date()

    await prisma.$transaction(async (tx) => {
      const [profile, wallet] = await Promise.all([
        this.ensureProfile(command.userId, tx),
        this.ensureWallet(command.userId, tx),
      ])

      const nextXp = Math.max(0, profile.xpTotal + reward.xp)
      const nextLevel = this.getLevelByXp(nextXp)
      const nextElo = this.getEloByLevel(nextLevel)

      await tx.gamification_profiles.update({
        where: { userId: command.userId },
        data: {
          xpTotal: nextXp,
          level: nextLevel,
          elo: nextElo,
          trophies: profile.trophies + reward.trophies,
        },
      })

      await tx.gamification_wallets.update({
        where: { userId: command.userId },
        data: {
          coins: wallet.coins + reward.coins,
        },
      })

      await tx.users.update({
        where: { id: command.userId },
        data: {
          points: {
            increment: Math.max(1, Math.floor((reward.xp / 2) * archetypeModifiers.pointsMultiplier)),
          },
        },
      })

      await tx.gamification_quest_progress.update({
        where: {
          userId_questId: {
            userId: command.userId,
            questId: command.questId,
          },
        },
        data: {
          status: "CLAIMED",
          claimedAt: now,
          completedAt: currentProgress.completedAt ?? now,
        },
      })

      await tx.history.create({
        data: {
          entityType: "USER",
          entityId: command.userId,
          action: "GAMIFICATION_QUEST_CLAIM",
          performedBy: command.userId,
          description: `GAMIFICATION:QUEST_CLAIM:${command.questId}`,
          oldValues: Prisma.JsonNull,
          newValues: {
            questId: command.questId,
            rewards: reward,
          },
          metadata: {
            domain: "gamification",
            questId: command.questId,
            rewards: reward,
          },
        },
      })
    })

    const refreshedProgress = await prisma.gamification_quest_progress.findUnique({
      where: {
        userId_questId: {
          userId: command.userId,
          questId: command.questId,
        },
      },
    })
    if (!refreshedProgress) {
      throw new Error("Falha ao recuperar progresso da quest")
    }

    const progression = await this.getUserProgression(command.userId)
    await this.syncStoryArcs(command.userId)
    return {
      quest: this.toUserQuest(quest, refreshedProgress),
      rewardsGranted: reward,
      progression,
    }
  }

  async listUserInventory(userId: number): Promise<UserInventoryItem[]> {
    const items = await prisma.gamification_inventory_items.findMany({
      where: { userId },
      orderBy: [{ rarity: "asc" }, { acquiredAt: "desc" }],
    })

    return items.map((item) => ({
      id: item.id,
      itemKey: item.itemKey,
      itemName: item.itemName,
      rarity: item.rarity,
      quantity: item.quantity,
      acquiredAt: item.acquiredAt.toISOString(),
    }))
  }

  async listUserStoryArcs(userId: number): Promise<UserStoryArc[]> {
    await this.ensureDefaultStoryArcs()
    let progression = await this.getUserProgression(userId)
    const now = new Date()

    const storyArcs = await prisma.gamification_story_arcs.findMany({
      where: { active: true },
      orderBy: [{ chapter: "asc" }, { id: "asc" }],
    })

    const arcIds = storyArcs.map((arc) => arc.id)
    const existingProgress = arcIds.length
      ? await prisma.gamification_story_progress.findMany({
          where: { userId, storyArcId: { in: arcIds } },
        })
      : []
    const progressByArc = new Map(existingProgress.map((item) => [item.storyArcId, item]))
    const metadataByArcId = new Map(storyArcs.map((arc) => [arc.id, this.parseStoryArcMetadata(arc.metadata)]))
    const completedArcCodes = new Set<string>()

    for (const arc of storyArcs) {
      const metadata = metadataByArcId.get(arc.id)
      const totalSteps = Math.max(1, metadata?.steps.length || metadata?.totalSteps || 1)
      const progress = progressByArc.get(arc.id)
      if (progress && (progress.status === "COMPLETED" || progress.completedSteps >= totalSteps)) {
        completedArcCodes.add(arc.code)
      }
    }

    const result: UserStoryArc[] = []

    for (const arc of storyArcs) {
      const metadata = metadataByArcId.get(arc.id) ?? this.parseStoryArcMetadata(arc.metadata)
      const totalSteps = Math.max(1, metadata.steps.length || metadata.totalSteps || 1)
      const minLevel = Math.max(1, Number.isFinite(metadata.minLevel) ? Number(metadata.minLevel) : 1)
      const minElo = typeof metadata.minElo === "string" && metadata.minElo.trim() ? metadata.minElo.trim().toUpperCase() : null
      const requiredArcCodes = metadata.dependsOnArcCodes.filter((code) => code !== arc.code)
      const unmetArcDependencies = requiredArcCodes.filter((code) => !completedArcCodes.has(code))
      const startsAt = arc.startsAt
      const endsAt = arc.endsAt
      const hasStarted = !startsAt || startsAt.getTime() <= now.getTime()
      const hasNotEnded = !endsAt || endsAt.getTime() >= now.getTime()
      const seasonAvailable = hasStarted && hasNotEnded

      const current = progressByArc.get(arc.id)
      const progressionEligible = progression.level >= minLevel && (!minElo || this.compareElo(progression.elo, minElo) >= 0)
      const dependencyEligible = unmetArcDependencies.length === 0
      const unlocked = seasonAvailable && progressionEligible && dependencyEligible
      const isAlreadyCompleted = current?.status === "COMPLETED" || (current?.completedSteps ?? 0) >= totalSteps
      const baseStatus = isAlreadyCompleted ? "COMPLETED" : unlocked ? "IN_PROGRESS" : "LOCKED"
      const baselineCompleted = Math.max(0, current?.completedSteps ?? 0)
      let achievedCompleted = baselineCompleted

      if (unlocked && !isAlreadyCompleted && metadata.steps.length > 0 && baselineCompleted < totalSteps) {
        for (let stepIndex = baselineCompleted; stepIndex < totalSteps; stepIndex += 1) {
          const step = metadata.steps[stepIndex]
          if (!step) break

          const completed = await this.isStoryStepCompleted({
            userId,
            progression,
            requirement: step.requirement,
          })
          if (!completed) break
          achievedCompleted = stepIndex + 1
        }
      }

      const persisted = await prisma.$transaction(async (tx) => {
        const currentRow = await tx.gamification_story_progress.upsert({
          where: {
            userId_storyArcId: { userId, storyArcId: arc.id },
          },
          create: {
            userId,
            storyArcId: arc.id,
            status: baseStatus,
            currentStep: isAlreadyCompleted ? totalSteps : unlocked ? 1 : 0,
            completedSteps: isAlreadyCompleted ? totalSteps : 0,
            startedAt: isAlreadyCompleted || unlocked ? new Date() : null,
            completedAt: isAlreadyCompleted ? new Date() : null,
            metadata: Prisma.JsonNull,
          },
          update: {
            status: isAlreadyCompleted
              ? "COMPLETED"
              : unlocked
                ? current?.status === "LOCKED"
                  ? "IN_PROGRESS"
                  : current?.status || "IN_PROGRESS"
                : "LOCKED",
            startedAt: isAlreadyCompleted || unlocked ? current?.startedAt ?? new Date() : current?.startedAt ?? null,
            completedAt: isAlreadyCompleted ? current?.completedAt ?? new Date() : current?.completedAt ?? null,
          },
        })

        if (isAlreadyCompleted) {
          return await tx.gamification_story_progress.update({
            where: {
              userId_storyArcId: { userId, storyArcId: arc.id },
            },
            data: {
              status: "COMPLETED",
              completedSteps: totalSteps,
              currentStep: totalSteps,
              completedAt: currentRow.completedAt ?? new Date(),
              startedAt: currentRow.startedAt ?? new Date(),
            },
          })
        }

        if (!unlocked) {
          return currentRow
        }

        const fromStep = Math.max(0, currentRow.completedSteps)
        const toStep = Math.max(fromStep, achievedCompleted)

        if (toStep > fromStep) {
          for (let stepIndex = fromStep; stepIndex < toStep; stepIndex += 1) {
            const step = metadata.steps[stepIndex]
            if (step?.reward) {
              await this.applyStoryStepReward({
                tx,
                userId,
                reward: step.reward,
                arcCode: arc.code,
                stepIndex: stepIndex + 1,
              })
            }
          }
        }

        const finalStatus = toStep >= totalSteps ? "COMPLETED" : "IN_PROGRESS"
        return await tx.gamification_story_progress.update({
          where: {
            userId_storyArcId: { userId, storyArcId: arc.id },
          },
          data: {
            completedSteps: toStep,
            currentStep: Math.min(totalSteps, toStep + 1),
            status: finalStatus,
            completedAt: finalStatus === "COMPLETED" ? currentRow.completedAt ?? new Date() : null,
            startedAt: currentRow.startedAt ?? new Date(),
          },
        })
      })

      if (persisted.completedSteps > baselineCompleted) {
        progression = await this.getUserProgression(userId)
      }
      if (persisted.status === "COMPLETED" || persisted.completedSteps >= totalSteps) {
        completedArcCodes.add(arc.code)
      }

      const normalizedCompletedSteps = Math.max(0, persisted.completedSteps)
      const nextStep = normalizedCompletedSteps < metadata.steps.length
        ? metadata.steps[normalizedCompletedSteps]
        : null
      const nextObjective =
        persisted.status === "COMPLETED"
          ? null
          : this.describeStoryRequirement(nextStep?.requirement)
      const unlockRequirement = persisted.status === "LOCKED"
        ? this.describeArcUnlockRequirement({
            minLevel,
            minElo,
            unmetArcDependencies,
            startsAt,
            endsAt,
            now,
          })
        : null

      result.push({
        storyArcId: arc.id,
        code: arc.code,
        title: arc.title,
        description: arc.description,
        chapter: arc.chapter,
        status: persisted.status,
        currentStep: Math.max(0, persisted.currentStep),
        completedSteps: normalizedCompletedSteps,
        totalSteps,
        progressPercent: Math.min(100, Math.floor((normalizedCompletedSteps / totalSteps) * 100)),
        nextObjective,
        unlockRequirement,
        startsAt: arc.startsAt?.toISOString() ?? null,
        endsAt: arc.endsAt?.toISOString() ?? null,
      })
    }

    return result
  }

  async listChestCatalog(): Promise<ChestCatalogItem[]> {
    await this.ensureDefaultChestDefinitions()
    const chests = await prisma.gamification_chest_definitions.findMany({
      where: { active: true },
      orderBy: [{ priceCoins: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        rarity: true,
        priceCoins: true,
      },
    })

    return chests.map((chest) => ({
      id: chest.id,
      name: chest.name,
      description: chest.description || "",
      rarity: chest.rarity,
      priceCoins: chest.priceCoins,
    }))
  }

  async openChest(command: OpenChestCommand): Promise<OpenChestResult> {
    await this.ensureDefaultChestDefinitions()
    const chest = await prisma.gamification_chest_definitions.findUnique({
      where: { id: command.chestId },
      include: {
        drops: {
          where: { active: true },
          orderBy: { id: "asc" },
        },
      },
    })
    if (!chest) {
      throw new Error("Baú não encontrado")
    }
    if (!chest.active) {
      throw new Error("Baú indisponível")
    }
    if (!Array.isArray(chest.drops) || chest.drops.length === 0) {
      throw new Error("Baú sem drop table configurada")
    }

    const quantity = Math.max(1, Math.min(10, Math.floor(command.quantity || 1)))
    const progression = await this.getUserProgression(command.userId)
    const archetypeModifiers = this.getArchetypeModifiers(progression)
    const discountedUnitPrice = Math.max(1, Math.floor(chest.priceCoins * (1 - archetypeModifiers.chestDiscountRate)))
    const totalCost = discountedUnitPrice * quantity
    const allDrops: OpenChestResult["drops"] = []

    await prisma.$transaction(async (tx) => {
      const wallet = await this.ensureWallet(command.userId, tx)
      if (wallet.coins < totalCost) {
        throw new Error(`Moedas insuficientes. Necessário: ${totalCost}`)
      }

      await tx.gamification_wallets.update({
        where: { userId: command.userId },
        data: { coins: wallet.coins - totalCost },
      })

      for (let i = 0; i < quantity; i += 1) {
        const rollDrops = this.rollChestDrops({
          id: chest.id,
          name: chest.name,
          description: chest.description || "",
          rarity: chest.rarity,
          priceCoins: chest.priceCoins,
          minDrops: chest.minDrops,
          maxDrops: chest.maxDrops,
          drops: chest.drops.map((drop) => ({
            itemKey: drop.itemKey,
            itemName: drop.itemName,
            rarity: drop.rarity,
            weight: drop.weight,
            qtyMin: drop.qtyMin,
            qtyMax: drop.qtyMax,
          })),
        }, archetypeModifiers.extraChestDropChance)
        for (const drop of rollDrops) {
          allDrops.push(drop)
          await tx.gamification_inventory_items.upsert({
            where: {
              userId_itemKey: {
                userId: command.userId,
                itemKey: drop.itemKey,
              },
            },
            create: {
              userId: command.userId,
              itemKey: drop.itemKey,
              itemName: drop.itemName,
              rarity: drop.rarity,
              quantity: drop.quantity,
              metadata: Prisma.JsonNull,
              sourceType: "CHEST_OPEN",
              sourceRefId: `${chest.id}:${Date.now()}`,
            },
            update: {
              quantity: {
                increment: drop.quantity,
              },
              rarity: drop.rarity,
              itemName: drop.itemName,
              sourceType: "CHEST_OPEN",
              sourceRefId: `${chest.id}:${Date.now()}`,
            },
          })
        }
      }

      await tx.history.create({
        data: {
          entityType: "USER",
          entityId: command.userId,
          action: "GAMIFICATION_CHEST_OPEN",
          performedBy: command.userId,
          description: `GAMIFICATION:CHEST_OPEN:${chest.id}`,
          oldValues: Prisma.JsonNull,
          newValues: {
            chestId: chest.id,
            quantity,
            spentCoins: totalCost,
            baseUnitPrice: chest.priceCoins,
            discountedUnitPrice,
            discountRate: archetypeModifiers.chestDiscountRate,
            drops: allDrops,
          },
          metadata: {
            domain: "gamification",
            chestId: chest.id,
            quantity,
            spentCoins: totalCost,
            baseUnitPrice: chest.priceCoins,
            discountedUnitPrice,
            discountRate: archetypeModifiers.chestDiscountRate,
          },
        },
      })
    })

    const wallet = await this.getUserWallet(command.userId)
    await this.syncStoryArcs(command.userId)
    return {
      chestId: chest.id,
      chestName: chest.name,
      quantity,
      spentCoins: totalCost,
      baseUnitPrice: chest.priceCoins,
      discountedUnitPrice,
      discountRate: archetypeModifiers.chestDiscountRate,
      wallet,
      drops: allDrops,
    }
  }

  async listBadges() {
    return await this.badgeEngine.findAll()
  }

  async getBadgeById(id: number) {
    return await this.badgeEngine.findById(id)
  }

  async createBadge(command: CreateBadgeCommand) {
    return await this.badgeEngine.create(command)
  }

  async updateBadge(command: UpdateBadgeCommand) {
    return await this.badgeEngine.update(command.id, command.data)
  }

  async deleteBadge(id: number) {
    await this.badgeEngine.delete(id)
  }

  async listUserBadges(userId: number) {
    return await this.badgeEngine.getUserBadges(userId)
  }

  async listRecentUserBadges(userId: number, limit?: number) {
    return await this.badgeEngine.getRecentUserBadges(userId, limit)
  }

  async awardBadge(command: AwardBadgeCommand) {
    return await this.badgeEngine.awardBadgeToUser(command.badgeId, command.userId, command.awardedBy)
  }

  async removeUserBadge(userId: number, badgeId: number) {
    await this.badgeEngine.removeBadgeFromUser(userId, badgeId)
  }

  async evaluateUserBadges(userId: number) {
    const user = await this.userRepository.findById(userId)
    if (!user) {
      throw new Error("Usuário não encontrado")
    }

    return await this.badgeRulesEngine.evaluateUserForBadges(user)
  }

  private async applyAward(
    userId: number,
    sourceType: GamificationSourceType,
    sourceId: number,
    pointsAwarded: number,
    xpAwarded: number,
    coinsAwarded: number,
  ): Promise<UserProgression> {
    await prisma.$transaction(async (tx) => {
      const [profile, wallet] = await Promise.all([
        this.ensureProfile(userId, tx),
        this.ensureWallet(userId, tx),
      ])

      const nextXp = Math.max(0, profile.xpTotal + xpAwarded)
      const nextLevel = this.getLevelByXp(nextXp)
      const nextElo = this.getEloByLevel(nextLevel)

      await tx.gamification_profiles.update({
        where: { userId },
        data: {
          xpTotal: nextXp,
          level: nextLevel,
          elo: nextElo,
        },
      })

      await tx.gamification_wallets.update({
        where: { userId },
        data: {
          coins: wallet.coins + Math.max(0, coinsAwarded),
        },
      })

      await tx.users.update({
        where: { id: userId },
        data: {
          points: {
            increment: pointsAwarded,
          },
        },
      })

      await tx.history.create({
        data: {
          entityType: "USER",
          entityId: userId,
          action: "GAMIFICATION_AWARD",
          performedBy: userId,
          description: this.buildAwardDescription(sourceType, sourceId),
          oldValues: Prisma.JsonNull,
          newValues: {
            sourceType,
            sourceId,
            pointsAwarded,
            xpAwarded,
            coinsAwarded,
          },
          metadata: {
            domain: "gamification",
            sourceType,
            sourceId,
            pointsAwarded,
            xpAwarded,
            coinsAwarded,
          },
        },
      })
    })

    return await this.getUserProgression(userId)
  }

  private async hasAward(userId: number, sourceType: GamificationSourceType, sourceId: number) {
    const existing = await prisma.history.findFirst({
      where: {
        entityType: "USER",
        entityId: userId,
        action: "GAMIFICATION_AWARD",
        description: this.buildAwardDescription(sourceType, sourceId),
      },
      select: { id: true },
    })

    return Boolean(existing)
  }

  private buildAwardDescription(sourceType: GamificationSourceType, sourceId: number) {
    return `GAMIFICATION:${sourceType}:${sourceId}`
  }

  private calculateWorkSessionPoints(durationSeconds?: number | null, completedTaskIds?: number[]) {
    const durationHours = Math.max(0, (durationSeconds || 0) / 3600)
    const durationBonus = Math.min(40, Math.floor(durationHours * 10))
    const taskBonus = Math.min(30, (completedTaskIds?.length || 0) * 5)
    const basePoints = 10
    return Math.max(1, basePoints + durationBonus + taskBonus)
  }

  private getLevelByXp(xp: number) {
    return Math.floor(Math.max(0, xp) / LEVEL_XP_STEP) + 1
  }

  private getEloByLevel(level: number) {
    const normalizedLevel = Math.max(1, level)
    const band = ELO_BY_MIN_LEVEL.find((entry) => normalizedLevel >= entry.minLevel)
    return band?.elo || "MADEIRA_II"
  }

  private getEloMultipliers(elo: string) {
    if (elo.startsWith("CHALLENGER") || elo.startsWith("GRAO_MESTRE")) return { xp: 2, coins: 2 }
    if (elo.startsWith("MESTRE")) return { xp: 1.9, coins: 1.9 }
    if (elo.startsWith("DIAMANTE")) return { xp: 1.7, coins: 1.7 }
    if (elo.startsWith("OURO")) return { xp: 1.5, coins: 1.5 }
    if (elo.startsWith("PRATA")) return { xp: 1.35, coins: 1.35 }
    if (elo.startsWith("BRONZE")) return { xp: 1.2, coins: 1.2 }
    if (elo.startsWith("FERRO")) return { xp: 1.1, coins: 1.1 }
    return { xp: 1, coins: 1 }
  }

  private getArchetypeModifiers(progression: UserProgression): ArchetypeModifiers {
    const archetype = (progression.archetype || "").trim().toUpperCase()
    const points = Math.max(0, progression.points)
    const xp = Math.max(0, progression.xp)
    const trophies = Math.max(0, progression.trophies)
    const coins = Math.max(0, progression.coins)
    const level = Math.max(1, progression.level)

    const base: ArchetypeModifiers = {
      xpMultiplier: 1,
      coinMultiplier: 1,
      pointsMultiplier: 1,
      questTrophyBonus: 0,
      chestDiscountRate: 0,
      extraChestDropChance: 0,
    }

    if (archetype.includes("ARQUEIRO")) {
      return {
        ...base,
        xpMultiplier: 1 + Math.min(0.25, 0.06 + xp / 20000),
        coinMultiplier: 1 + Math.min(0.1, points / 5000),
        pointsMultiplier: 1 + Math.min(0.15, points / 4000),
        extraChestDropChance: Math.min(0.18, 0.03 + points / 6000),
      }
    }

    if (archetype.includes("PALADINO")) {
      return {
        ...base,
        xpMultiplier: 1 + Math.min(0.12, level / 200),
        coinMultiplier: 1 + Math.min(0.08, trophies / 200),
        pointsMultiplier: 1 + Math.min(0.1, points / 6000),
        questTrophyBonus: trophies >= 10 ? 1 : 0,
      }
    }

    if (archetype.includes("MAGO")) {
      return {
        ...base,
        xpMultiplier: 1 + Math.min(0.28, 0.07 + xp / 12000),
        coinMultiplier: 1 + Math.min(0.08, level / 150),
        pointsMultiplier: 1 + Math.min(0.1, xp / 30000),
      }
    }

    if (archetype.includes("ALQUIMISTA")) {
      return {
        ...base,
        xpMultiplier: 1 + Math.min(0.1, level / 250),
        coinMultiplier: 1 + Math.min(0.2, 0.08 + coins / 12000),
        pointsMultiplier: 1 + Math.min(0.08, points / 7000),
        chestDiscountRate: Math.min(0.22, 0.05 + points / 5000),
        extraChestDropChance: Math.min(0.1, points / 9000),
      }
    }

    if (archetype.includes("BARDO")) {
      return {
        ...base,
        xpMultiplier: 1 + Math.min(0.12, level / 140),
        coinMultiplier: 1 + Math.min(0.2, 0.06 + trophies / 300),
        pointsMultiplier: 1 + Math.min(0.1, trophies / 500),
        questTrophyBonus: trophies >= 20 ? 1 : 0,
      }
    }

    return {
      ...base,
      xpMultiplier: 1 + Math.min(0.08, level / 220),
      coinMultiplier: 1 + Math.min(0.06, points / 10000),
      pointsMultiplier: 1 + Math.min(0.05, level / 300),
    }
  }

  private applyArchetypeQuestModifiers(
    reward: Required<QuestRewardPayload>,
    modifiers: ArchetypeModifiers,
  ): Required<QuestRewardPayload> {
    const adjustedXp = Math.max(0, Math.floor(reward.xp * modifiers.xpMultiplier))
    const adjustedCoins = Math.max(0, Math.floor(reward.coins * modifiers.coinMultiplier))
    const adjustedTrophies = Math.max(
      0,
      reward.trophies + (reward.trophies > 0 ? modifiers.questTrophyBonus : 0),
    )

    return {
      xp: adjustedXp,
      coins: adjustedCoins,
      trophies: adjustedTrophies,
    }
  }

  private compareElo(current: string, required: string) {
    const currentRank = ELO_BY_MIN_LEVEL.find((entry) => current.startsWith(entry.elo))?.minLevel ?? 0
    const requiredRank = ELO_BY_MIN_LEVEL.find((entry) => required.startsWith(entry.elo))?.minLevel ?? 0
    return currentRank - requiredRank
  }

  private async resolveQuestProgress({
    userId,
    requirements,
  }: {
    userId: number
    requirements: Prisma.JsonValue | null
  }) {
    const req = (requirements as { metric?: string; target?: number }) || {}
    const metric = typeof req.metric === "string" ? req.metric.toUpperCase() : "TASKS_COMPLETED"
    const targetValue = Math.max(1, Number.isFinite(req.target) ? Number(req.target) : 1)

    if (metric === "WORK_SESSIONS_COMPLETED") {
      const count = await prisma.work_sessions.count({
        where: { userId, status: "completed" },
      })
      return { targetValue, computedProgress: count }
    }

    if (metric === "WORK_HOURS") {
      const sessions = await prisma.work_sessions.findMany({
        where: { userId, status: "completed" },
        select: { duration: true },
      })
      const totalHours = sessions.reduce((sum, session) => sum + (session.duration || 0), 0)
      return { targetValue, computedProgress: Math.floor(totalHours) }
    }

    if (metric === "POINTS") {
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: { points: true },
      })
      return { targetValue, computedProgress: user?.points || 0 }
    }

    const completedTasks = await prisma.tasks.count({
      where: {
        assignedTo: userId,
        OR: [{ completed: true }, { status: "completed" }],
      },
    })
    return { targetValue, computedProgress: completedTasks }
  }

  private normalizeQuestRewards(rawRewards: Prisma.JsonValue | null): Required<QuestRewardPayload> {
    const rewards = (rawRewards as QuestRewardPayload) || {}
    return {
      xp: Math.max(0, Number.isFinite(rewards.xp) ? Number(rewards.xp) : 0),
      coins: Math.max(0, Number.isFinite(rewards.coins) ? Number(rewards.coins) : 0),
      trophies: Math.max(0, Number.isFinite(rewards.trophies) ? Number(rewards.trophies) : 0),
    }
  }

  private toUserQuest(
    definition: {
      id: number
      code: string
      title: string
      description: string | null
      questType: string
      scope: string
      rewards: Prisma.JsonValue | null
    },
    progress: {
      status: string
      progressValue: number
      targetValue: number
      startedAt: Date
      completedAt: Date | null
      claimedAt: Date | null
      expiresAt: Date | null
    },
  ): UserQuest {
    const normalizedProgress = Math.max(0, progress.progressValue)
    const normalizedTarget = Math.max(1, progress.targetValue)
    return {
      questId: definition.id,
      code: definition.code,
      title: definition.title,
      description: definition.description,
      questType: definition.questType,
      scope: definition.scope,
      status: progress.status,
      progressValue: normalizedProgress,
      targetValue: normalizedTarget,
      progressPercent: Math.min(100, Math.floor((normalizedProgress / normalizedTarget) * 100)),
      startedAt: progress.startedAt?.toISOString() ?? null,
      completedAt: progress.completedAt?.toISOString() ?? null,
      claimedAt: progress.claimedAt?.toISOString() ?? null,
      expiresAt: progress.expiresAt?.toISOString() ?? null,
      rewards: this.normalizeQuestRewards(definition.rewards),
    }
  }

  private rollChestDrops(chest: ChestDefinition, extraDropChance = 0): OpenChestResult["drops"] {
    const dropCount = chest.minDrops + Math.floor(Math.random() * (chest.maxDrops - chest.minDrops + 1))
    const drops: OpenChestResult["drops"] = []

    for (let i = 0; i < dropCount; i += 1) {
      const selected = this.pickWeightedDrop(chest.drops)
      const quantity = selected.qtyMin + Math.floor(Math.random() * (selected.qtyMax - selected.qtyMin + 1))
      drops.push({
        itemKey: selected.itemKey,
        itemName: selected.itemName,
        rarity: selected.rarity,
        quantity,
      })
    }

    if (extraDropChance > 0 && Math.random() < extraDropChance) {
      const bonus = this.pickWeightedDrop(chest.drops)
      const quantity = bonus.qtyMin + Math.floor(Math.random() * (bonus.qtyMax - bonus.qtyMin + 1))
      drops.push({
        itemKey: bonus.itemKey,
        itemName: bonus.itemName,
        rarity: bonus.rarity,
        quantity,
      })
    }

    return drops
  }

  private pickWeightedDrop(entries: ChestDropEntry[]): ChestDropEntry {
    const totalWeight = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0)
    if (totalWeight <= 0) return entries[0]

    let roll = Math.random() * totalWeight
    for (const entry of entries) {
      roll -= Math.max(0, entry.weight)
      if (roll <= 0) return entry
    }

    return entries[entries.length - 1]
  }

  private parseStoryArcMetadata(rawMetadata: Prisma.JsonValue | null) {
    const metadata = (rawMetadata as {
      totalSteps?: number
      minLevel?: number
      minElo?: string
      dependsOnArcCodes?: string[]
      steps?: Array<{
        requirement?: {
          metric?: string
          target?: number
          itemKey?: string
          minLevel?: number
          minElo?: string
          questCode?: string
        }
        reward?: {
          xp?: number
          coins?: number
          trophies?: number
          itemKey?: string
          itemName?: string
          itemRarity?: string
          itemQuantity?: number
        }
      }>
    } | null) || {}

    return {
      totalSteps: Number.isFinite(metadata.totalSteps) ? Math.max(1, Number(metadata.totalSteps)) : undefined,
      minLevel: Number.isFinite(metadata.minLevel) ? Math.max(1, Number(metadata.minLevel)) : 1,
      minElo: typeof metadata.minElo === "string" ? metadata.minElo : undefined,
      dependsOnArcCodes: Array.isArray(metadata.dependsOnArcCodes)
        ? metadata.dependsOnArcCodes
            .map((value) => String(value || "").trim().toUpperCase())
            .filter(Boolean)
        : [],
      steps: Array.isArray(metadata.steps) ? metadata.steps : [],
    }
  }

  private describeArcUnlockRequirement({
    minLevel,
    minElo,
    unmetArcDependencies,
    startsAt,
    endsAt,
    now,
  }: {
    minLevel?: number
    minElo?: string | null
    unmetArcDependencies?: string[]
    startsAt?: Date | null
    endsAt?: Date | null
    now?: Date
  }) {
    const referenceNow = now ?? new Date()
    const requirements: string[] = []
    const dependencies = Array.isArray(unmetArcDependencies) ? unmetArcDependencies.filter(Boolean) : []
    if (dependencies.length > 0) {
      requirements.push(`Concluir arcos: ${dependencies.join(", ")}`)
    }
    if (minLevel && minLevel > 1) {
      requirements.push(`Nível ${minLevel}+`)
    }
    if (minElo && minElo.trim()) {
      requirements.push(`Elo ${minElo.toUpperCase()}`)
    }
    if (startsAt && startsAt.getTime() > referenceNow.getTime()) {
      requirements.push(`Disponível em ${this.formatStoryDate(startsAt)}`)
    }
    if (endsAt && endsAt.getTime() < referenceNow.getTime()) {
      requirements.push(`Evento encerrado em ${this.formatStoryDate(endsAt)}`)
    }
    return requirements.length > 0 ? requirements.join(" • ") : "Disponível"
  }

  private formatStoryDate(date: Date) {
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  }

  private describeStoryRequirement(requirement?: {
    metric?: string
    target?: number
    itemKey?: string
    minLevel?: number
    minElo?: string
    questCode?: string
  }) {
    if (!requirement) return "Concluir o próximo passo narrativo"
    const metric = String(requirement.metric || "LEVEL").toUpperCase()
    const target = Math.max(1, Number.isFinite(requirement.target) ? Number(requirement.target) : 1)

    if (metric === "TASKS_COMPLETED") {
      return `Concluir ${target} ${target === 1 ? "task" : "tasks"}`
    }
    if (metric === "QUESTS_CLAIMED") {
      if (requirement.questCode) {
        return `Resgatar a quest ${requirement.questCode}`
      }
      return `Resgatar ${target} ${target === 1 ? "quest" : "quests"}`
    }
    if (metric === "ITEM_OWNED") {
      const key = String(requirement.itemKey || "").trim()
      return key ? `Possuir ${target}x ${key}` : `Possuir item narrativo (${target}x)`
    }
    if (metric === "COINS") {
      return `Acumular ${target} moedas`
    }
    return `Alcançar nível ${target}`
  }

  private async isStoryStepCompleted({
    userId,
    progression,
    requirement,
  }: {
    userId: number
    progression: UserProgression
    requirement?: {
      metric?: string
      target?: number
      itemKey?: string
      minLevel?: number
      minElo?: string
      questCode?: string
    }
  }) {
    const metric = (requirement?.metric || "LEVEL").toUpperCase()
    const target = Math.max(1, Number.isFinite(requirement?.target) ? Number(requirement?.target) : 1)

    if (requirement?.minLevel && progression.level < requirement.minLevel) return false
    if (requirement?.minElo && this.compareElo(progression.elo, requirement.minElo) < 0) return false

    if (metric === "LEVEL") {
      return progression.level >= target
    }

    if (metric === "TASKS_COMPLETED") {
      const count = await prisma.tasks.count({
        where: {
          assignedTo: userId,
          OR: [{ completed: true }, { status: "completed" }],
        },
      })
      return count >= target
    }

    if (metric === "QUESTS_CLAIMED") {
      if (requirement?.questCode) {
        const specific = await prisma.gamification_quest_progress.count({
          where: {
            userId,
            status: "CLAIMED",
            quest: { code: requirement.questCode },
          },
        })
        return specific >= target
      }
      const count = await prisma.gamification_quest_progress.count({
        where: { userId, status: "CLAIMED" },
      })
      return count >= target
    }

    if (metric === "COINS") {
      const wallet = await this.ensureWallet(userId)
      return wallet.coins >= target
    }

    if (metric === "ITEM_OWNED") {
      const key = String(requirement?.itemKey || "").trim()
      if (!key) return false
      const item = await prisma.gamification_inventory_items.findUnique({
        where: { userId_itemKey: { userId, itemKey: key } },
      })
      return (item?.quantity || 0) >= target
    }

    return progression.level >= target
  }

  private async applyStoryStepReward({
    tx,
    userId,
    reward,
    arcCode,
    stepIndex,
  }: {
    tx: Prisma.TransactionClient
    userId: number
    reward: {
      xp?: number
      coins?: number
      trophies?: number
      itemKey?: string
      itemName?: string
      itemRarity?: string
      itemQuantity?: number
    }
    arcCode: string
    stepIndex: number
  }) {
    const xp = Math.max(0, Number.isFinite(reward.xp) ? Number(reward.xp) : 0)
    const coins = Math.max(0, Number.isFinite(reward.coins) ? Number(reward.coins) : 0)
    const trophies = Math.max(0, Number.isFinite(reward.trophies) ? Number(reward.trophies) : 0)

    const profile = await this.ensureProfile(userId, tx)
    const wallet = await this.ensureWallet(userId, tx)

    const nextXp = profile.xpTotal + xp
    const nextLevel = this.getLevelByXp(nextXp)
    const nextElo = this.getEloByLevel(nextLevel)

    await tx.gamification_profiles.update({
      where: { userId },
      data: {
        xpTotal: nextXp,
        level: nextLevel,
        elo: nextElo,
        trophies: profile.trophies + trophies,
      },
    })

    await tx.gamification_wallets.update({
      where: { userId },
      data: { coins: wallet.coins + coins },
    })

    const pointsGranted = Math.max(0, Math.floor(xp / 2))
    if (pointsGranted > 0) {
      await tx.users.update({
        where: { id: userId },
        data: {
          points: {
            increment: pointsGranted,
          },
        },
      })
    }

    const itemKey = typeof reward.itemKey === "string" ? reward.itemKey.trim() : ""
    if (itemKey) {
      const itemName = typeof reward.itemName === "string" && reward.itemName.trim() ? reward.itemName.trim() : itemKey
      const itemRarity = typeof reward.itemRarity === "string" && reward.itemRarity.trim() ? reward.itemRarity.trim() : "common"
      const itemQuantity = Math.max(1, Number.isFinite(reward.itemQuantity) ? Number(reward.itemQuantity) : 1)

      await tx.gamification_inventory_items.upsert({
        where: {
          userId_itemKey: { userId, itemKey },
        },
        create: {
          userId,
          itemKey,
          itemName,
          rarity: itemRarity,
          quantity: itemQuantity,
          metadata: Prisma.JsonNull,
          sourceType: "STORY_ARC",
          sourceRefId: `${arcCode}:step-${stepIndex}`,
        },
        update: {
          itemName,
          rarity: itemRarity,
          quantity: { increment: itemQuantity },
          sourceType: "STORY_ARC",
          sourceRefId: `${arcCode}:step-${stepIndex}`,
        },
      })
    }

    await tx.history.create({
      data: {
        entityType: "USER",
        entityId: userId,
        action: "GAMIFICATION_STORY_REWARD",
        performedBy: userId,
        description: `GAMIFICATION:STORY_STEP:${arcCode}:${stepIndex}`,
        oldValues: Prisma.JsonNull,
        newValues: {
          arcCode,
          stepIndex,
          reward: {
            xp,
            coins,
            trophies,
            itemKey: itemKey || null,
          },
        },
        metadata: {
          domain: "gamification",
          arcCode,
          stepIndex,
        },
      },
    })
  }

  private async syncStoryArcs(userId: number) {
    try {
      await this.listUserStoryArcs(userId)
    } catch {
      // Story arcs are supplementary and must not break core reward flows.
    }
  }

  private async ensureProfile(
    userId: number,
    tx: Prisma.TransactionClient | typeof prisma = prisma,
  ) {
    const existing = await tx.gamification_profiles.findUnique({ where: { userId } })
    if (existing) return existing
    return await tx.gamification_profiles.create({
      data: { userId },
    })
  }

  private async ensureWallet(
    userId: number,
    tx: Prisma.TransactionClient | typeof prisma = prisma,
  ) {
    const existing = await tx.gamification_wallets.findUnique({ where: { userId } })
    if (existing) return existing
    return await tx.gamification_wallets.create({
      data: { userId },
    })
  }

  private async ensureDefaultQuestDefinitions() {
    const defaults = [
      {
        code: "DAILY_TASK_2",
        title: "Ritual Diário",
        description: "Conclua 2 tarefas para manter sua sequência de evolução.",
        questType: "DAILY",
        scope: "PROJECT",
        requirements: { metric: "TASKS_COMPLETED", target: 2 },
        rewards: { xp: 80, coins: 35, trophies: 0 },
      },
      {
        code: "WEEKLY_HOURS_4",
        title: "Guardião do Tempo",
        description: "Acumule 4 horas de sessões concluídas no laboratório.",
        questType: "WEEKLY",
        scope: "PROJECT",
        requirements: { metric: "WORK_HOURS", target: 4 },
        rewards: { xp: 180, coins: 90, trophies: 1 },
      },
      {
        code: "WEEKLY_SESSIONS_3",
        title: "Disciplina Arcana",
        description: "Finalize 3 work sessions para ganhar bônus de consistência.",
        questType: "WEEKLY",
        scope: "GLOBAL",
        requirements: { metric: "WORK_SESSIONS_COMPLETED", target: 3 },
        rewards: { xp: 120, coins: 60, trophies: 0 },
      },
    ] as const

    await Promise.all(
      defaults.map((quest) =>
        prisma.gamification_quest_definitions.upsert({
          where: { code: quest.code },
          create: {
            code: quest.code,
            title: quest.title,
            description: quest.description,
            questType: quest.questType,
            scope: quest.scope,
            requirements: quest.requirements,
            rewards: quest.rewards,
            active: true,
          },
          update: {},
        }),
      ),
    )
  }

  private async ensureDefaultChestDefinitions() {
    for (const chest of DEFAULT_CHEST_DEFINITIONS) {
      await prisma.gamification_chest_definitions.upsert({
        where: { id: chest.id },
        create: {
          id: chest.id,
          name: chest.name,
          description: chest.description,
          rarity: chest.rarity,
          priceCoins: chest.priceCoins,
          minDrops: chest.minDrops,
          maxDrops: chest.maxDrops,
          active: true,
        },
        update: {},
      })

      for (const drop of chest.drops) {
        await prisma.gamification_chest_drop_entries.upsert({
          where: {
            chestId_itemKey: {
              chestId: chest.id,
              itemKey: drop.itemKey,
            },
          },
          create: {
            chestId: chest.id,
            itemKey: drop.itemKey,
            itemName: drop.itemName,
            rarity: drop.rarity,
            weight: drop.weight,
            qtyMin: drop.qtyMin,
            qtyMax: drop.qtyMax,
            active: true,
          },
          update: {},
        })
      }
    }
  }

  private async ensureDefaultStoryArcs() {
    const defaults = [
      {
        code: "ARC_ORIGINS",
        title: "As Origens do Laboratório",
        description: "Descubra os fundamentos da guilda e fortaleça sua presença.",
        chapter: 1,
        metadata: {
          totalSteps: 3,
          minLevel: 1,
          dependsOnArcCodes: [],
          steps: [
            {
              requirement: { metric: "TASKS_COMPLETED", target: 1 },
              reward: { xp: 40, coins: 20 },
            },
            {
              requirement: { metric: "QUESTS_CLAIMED", target: 1 },
              reward: { xp: 70, coins: 35, itemKey: "novice-sigil", itemName: "Sigilo do Novato", itemRarity: "common", itemQuantity: 1 },
            },
            {
              requirement: { metric: "LEVEL", target: 4 },
              reward: { xp: 120, coins: 60, trophies: 1 },
            },
          ],
        },
      },
      {
        code: "ARC_ASCENT",
        title: "A Ascensão dos Mentores",
        description: "Supere desafios avançados e prove seu valor para liderar.",
        chapter: 2,
        metadata: {
          totalSteps: 4,
          minLevel: 8,
          dependsOnArcCodes: ["ARC_ORIGINS"],
          steps: [
            {
              requirement: { metric: "TASKS_COMPLETED", target: 6 },
              reward: { xp: 140, coins: 90 },
            },
            {
              requirement: { metric: "QUESTS_CLAIMED", target: 3 },
              reward: { xp: 180, coins: 120 },
            },
            {
              requirement: { metric: "ITEM_OWNED", target: 1, itemKey: "oracle-lens" },
              reward: { xp: 220, coins: 140, itemKey: "mentor-mantle", itemName: "Manto do Mentor", itemRarity: "rare", itemQuantity: 1 },
            },
            {
              requirement: { metric: "LEVEL", target: 12 },
              reward: { xp: 260, coins: 180, trophies: 1 },
            },
          ],
        },
      },
      {
        code: "ARC_CONVERGENCE",
        title: "Convergência Arcana",
        description: "Missões de alta dificuldade para os aventureiros de elite.",
        chapter: 3,
        metadata: {
          totalSteps: 5,
          minLevel: 15,
          dependsOnArcCodes: ["ARC_ASCENT"],
          steps: [
            {
              requirement: { metric: "TASKS_COMPLETED", target: 12 },
              reward: { xp: 280, coins: 180 },
            },
            {
              requirement: { metric: "QUESTS_CLAIMED", target: 6 },
              reward: { xp: 320, coins: 220 },
            },
            {
              requirement: { metric: "ITEM_OWNED", target: 1, itemKey: "astral-crown" },
              reward: { xp: 360, coins: 260, trophies: 1 },
            },
            {
              requirement: { metric: "LEVEL", target: 20 },
              reward: { xp: 420, coins: 320 },
            },
            {
              requirement: { metric: "COINS", target: 1500 },
              reward: { xp: 500, coins: 500, trophies: 2, itemKey: "convergence-relic", itemName: "Relíquia da Convergência", itemRarity: "legendary", itemQuantity: 1 },
            },
          ],
        },
      },
    ] as const

    await Promise.all(
      defaults.map((story) =>
        prisma.gamification_story_arcs.upsert({
          where: { code: story.code },
          create: {
            code: story.code,
            title: story.title,
            description: story.description,
            chapter: story.chapter,
            metadata: story.metadata,
            active: true,
          },
          update: {},
        }),
      ),
    )
  }
}

export function createGamificationGateway() {
  return new PrismaGamificationGateway()
}
