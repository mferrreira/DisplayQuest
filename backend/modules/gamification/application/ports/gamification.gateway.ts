import type {
  AwardBadgeCommand,
  GamificationAwardResult,
  UpdateUserGamificationProfileCommand,
  UserGamificationProfile,
  UserProgression,
  UserWallet,
  AwardFromTaskCompletionCommand,
  AwardFromWorkSessionCommand,
  ChestCatalogItem,
  ClaimQuestRewardCommand,
  ClaimQuestRewardResult,
  CreateBadgeCommand,
  OpenChestCommand,
  OpenChestResult,
  UserInventoryItem,
  UserStoryArc,
  UserQuest,
  UpdateBadgeCommand,
} from "@/backend/modules/gamification/application/contracts"
import type { Badge, UserBadge } from "@/backend/models/Badge"

export interface GamificationGateway {
  awardFromWorkSession(command: AwardFromWorkSessionCommand): Promise<GamificationAwardResult>
  awardFromTaskCompletion(command: AwardFromTaskCompletionCommand): Promise<GamificationAwardResult>
  getUserProgression(userId: number): Promise<UserProgression>
  getUserWallet(userId: number): Promise<UserWallet>
  getUserProfile(userId: number): Promise<UserGamificationProfile>
  updateUserProfile(command: UpdateUserGamificationProfileCommand): Promise<UserGamificationProfile>
  listAvailableQuestsForUser(userId: number): Promise<UserQuest[]>
  claimQuestReward(command: ClaimQuestRewardCommand): Promise<ClaimQuestRewardResult>
  listUserInventory(userId: number): Promise<UserInventoryItem[]>
  listUserStoryArcs(userId: number): Promise<UserStoryArc[]>
  listChestCatalog(): Promise<ChestCatalogItem[]>
  openChest(command: OpenChestCommand): Promise<OpenChestResult>
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
