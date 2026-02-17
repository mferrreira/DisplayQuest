export type GamificationSourceType = "WORK_SESSION_COMPLETED" | "TASK_COMPLETED" | "MANUAL_ADJUSTMENT"

export interface AwardFromWorkSessionCommand {
  userId: number
  workSessionId: number
  durationSeconds?: number | null
  completedTaskIds?: number[]
}

export interface AwardFromTaskCompletionCommand {
  userId: number
  taskId: number
  taskPoints?: number
}

export interface UserProgression {
  userId: number
  points: number
  xp: number
  level: number
  elo: string
  coins: number
  trophies: number
  archetype?: string | null
  title?: string | null
  displayName?: string | null
  nextLevelXp: number
  progressToNextLevel: number
}

export interface UserWallet {
  userId: number
  coins: number
  updatedAt: string
}

export interface UserGamificationProfile {
  userId: number
  displayName?: string | null
  archetype?: string | null
  title?: string | null
  bioRpg?: string | null
  lore?: string | null
  elo: string
  level: number
  xpTotal: number
  trophies: number
  createdAt: string
  updatedAt: string
}

export interface UpdateUserGamificationProfileCommand {
  userId: number
  data: {
    displayName?: string | null
    archetype?: string | null
    title?: string | null
    bioRpg?: string | null
    lore?: string | null
  }
}

export interface QuestRewardPayload {
  xp?: number
  coins?: number
  trophies?: number
}

export interface UserQuest {
  questId: number
  code: string
  title: string
  description?: string | null
  questType: string
  scope: string
  status: string
  progressValue: number
  targetValue: number
  progressPercent: number
  startedAt?: string | null
  completedAt?: string | null
  claimedAt?: string | null
  expiresAt?: string | null
  rewards: QuestRewardPayload
}

export interface UserInventoryItem {
  id: number
  itemKey: string
  itemName: string
  rarity: string
  quantity: number
  acquiredAt: string
}

export interface UserStoryArc {
  storyArcId: number
  code: string
  title: string
  description?: string | null
  chapter: number
  status: string
  currentStep: number
  completedSteps: number
  totalSteps: number
  progressPercent: number
  nextObjective?: string | null
  unlockRequirement?: string | null
  startsAt?: string | null
  endsAt?: string | null
}

export interface ChestCatalogItem {
  id: string
  name: string
  description: string
  rarity: string
  priceCoins: number
}

export interface OpenChestCommand {
  userId: number
  chestId: string
  quantity?: number
}

export interface OpenChestResult {
  chestId: string
  chestName: string
  quantity: number
  spentCoins: number
  baseUnitPrice?: number
  discountedUnitPrice?: number
  discountRate?: number
  wallet: UserWallet
  drops: Array<{
    itemKey: string
    itemName: string
    rarity: string
    quantity: number
  }>
}

export interface ClaimQuestRewardCommand {
  userId: number
  questId: number
}

export interface ClaimQuestRewardResult {
  quest: UserQuest
  rewardsGranted: {
    xp: number
    coins: number
    trophies: number
  }
  progression: UserProgression
}

export interface GamificationAwardResult {
  userId: number
  sourceType: GamificationSourceType
  sourceId: number
  pointsAwarded: number
  xpAwarded: number
  coinsAwarded: number
  newProgression: UserProgression
  alreadyAwarded: boolean
}

export interface BadgeCriteriaInput {
  points?: number
  tasks?: number
  projects?: number
  workSessions?: number
  weeklyHours?: number
  consecutiveDays?: number
  specialCondition?: string
}

export interface CreateBadgeCommand {
  name: string
  description: string
  category: "achievement" | "milestone" | "special" | "social"
  icon?: string | null
  color?: string | null
  criteria?: BadgeCriteriaInput | null
  isActive?: boolean
  createdBy: number
}

export interface UpdateBadgeCommand {
  id: number
  data: Partial<CreateBadgeCommand>
}

export interface AwardBadgeCommand {
  badgeId: number
  userId: number
  awardedBy?: number
}
