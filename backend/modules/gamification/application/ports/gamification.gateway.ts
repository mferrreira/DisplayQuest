import type {
  AwardBadgeCommand,
  GamificationAwardResult,
  UserProgression,
  AwardFromTaskCompletionCommand,
  AwardFromWorkSessionCommand,
  CreateBadgeCommand,
  UpdateBadgeCommand,
} from "@/backend/modules/gamification/application/contracts"
import type { Badge, UserBadge } from "@/backend/models/Badge"

export interface GamificationGateway {
  awardFromWorkSession(command: AwardFromWorkSessionCommand): Promise<GamificationAwardResult>
  awardFromTaskCompletion(command: AwardFromTaskCompletionCommand): Promise<GamificationAwardResult>
  getUserProgression(userId: number): Promise<UserProgression>
  listBadges(): Promise<Badge[]>
  getBadgeById(id: number): Promise<Badge | null>
  createBadge(command: CreateBadgeCommand): Promise<Badge>
  updateBadge(command: UpdateBadgeCommand): Promise<Badge>
  deleteBadge(id: number): Promise<void>
  listUserBadges(userId: number): Promise<UserBadge[]>
  listRecentUserBadges(userId: number, limit?: number): Promise<UserBadge[]>
  awardBadge(command: AwardBadgeCommand): Promise<UserBadge>
  removeUserBadge(userId: number, badgeId: number): Promise<void>
  evaluateUserBadges(userId: number): Promise<Badge[]>
}
