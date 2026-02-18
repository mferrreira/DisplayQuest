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
  nextLevelXp: number
  progressToNextLevel: number
}

export interface GamificationAwardResult {
  userId: number
  sourceType: GamificationSourceType
  sourceId: number
  pointsAwarded: number
  xpAwarded: number
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
