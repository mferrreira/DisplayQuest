import { prisma } from '@/lib/database/prisma';
import { Prisma } from '@prisma/client';
import { Badge, UserBadge } from '../models/Badge';
import { BadgeCategory } from '../models/Badge';

export interface IBadgeRepository {
    findById(id: number): Promise<Badge | null>;
    findAll(): Promise<Badge[]>;
    findByCategory(category: BadgeCategory): Promise<Badge[]>;
    findActive(): Promise<Badge[]>;
    create(badge: Badge): Promise<Badge>;
    update(badge: Badge): Promise<Badge>;
    delete(id: number): Promise<void>;
    findByCreator(createdBy: number): Promise<Badge[]>;
    findAutomatic(): Promise<Badge[]>;
    findManual(): Promise<Badge[]>;
}

export interface IUserBadgeRepository {
    findById(id: number): Promise<UserBadge | null>;
    findByUserId(userId: number): Promise<UserBadge[]>;
    findByBadgeId(badgeId: number): Promise<UserBadge[]>;
    findByUserAndBadge(userId: number, badgeId: number): Promise<UserBadge | null>;
    create(userBadge: UserBadge): Promise<UserBadge>;
    delete(id: number): Promise<void>;
    deleteByUserAndBadge(userId: number, badgeId: number): Promise<void>;
    findRecentByUserId(userId: number, limit?: number): Promise<UserBadge[]>;
    findEarnedByUser(userId: number): Promise<UserBadge[]>;
    findAwardedByAdmin(userId: number): Promise<UserBadge[]>;
    getUserBadgeCount(userId: number): Promise<number>;
    getBadgeEarners(badgeId: number): Promise<UserBadge[]>;
}

export class BadgeRepository implements IBadgeRepository {
    async findById(id: number): Promise<Badge | null> {
        const badge = await prisma.badges.findUnique({
            where: { id },
            include: {
                creator: true,
                userBadges: {
                    include: {
                        user: true,
                        awarder: true
                    }
                }
            }
        });

        return badge ? Badge.fromPrisma(badge) : null;
    }

    async findAll(): Promise<Badge[]> {
        const badges = await prisma.badges.findMany({
            include: {
                creator: true,
                userBadges: {
                    include: {
                        user: true,
                        awarder: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return badges.map(badge => Badge.fromPrisma(badge));
    }

    async findByCategory(category: BadgeCategory): Promise<Badge[]> {
        const badges = await prisma.badges.findMany({
            where: { category },
            include: {
                creator: true,
                userBadges: {
                    include: {
                        user: true,
                        awarder: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return badges.map(badge => Badge.fromPrisma(badge));
    }

    async findActive(): Promise<Badge[]> {
        const badges = await prisma.badges.findMany({
            where: { isActive: true },
            include: {
                creator: true,
                userBadges: {
                    include: {
                        user: true,
                        awarder: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return badges.map(badge => Badge.fromPrisma(badge));
    }

    async create(badge: Badge): Promise<Badge> {
        const data = badge.toPrisma();
        const created = await prisma.badges.create({
            data: {
                ...data,
                criteria: data.criteria == null
                    ? Prisma.JsonNull
                    : (data.criteria as Prisma.InputJsonValue),
            },
            include: {
                creator: true,
                userBadges: {
                    include: {
                        user: true,
                        awarder: true
                    }
                }
            }
        });

        return Badge.fromPrisma(created);
    }

    async update(badge: Badge): Promise<Badge> {
        if (!badge.id) {
            throw new Error("Badge ID é obrigatório para atualização");
        }

        const data = badge.toPrisma();
        const updated = await prisma.badges.update({
            where: { id: badge.id },
            data: {
                ...data,
                criteria: data.criteria == null
                    ? Prisma.JsonNull
                    : (data.criteria as Prisma.InputJsonValue),
            },
            include: {
                creator: true,
                userBadges: {
                    include: {
                        user: true,
                        awarder: true
                    }
                }
            }
        });

        return Badge.fromPrisma(updated);
    }

    async delete(id: number): Promise<void> {
        await prisma.badges.delete({
            where: { id }
        });
    }

    async findByCreator(createdBy: number): Promise<Badge[]> {
        const badges = await prisma.badges.findMany({
            where: { createdBy },
            include: {
                creator: true,
                userBadges: {
                    include: {
                        user: true,
                        awarder: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return badges.map(badge => Badge.fromPrisma(badge));
    }

    async findAutomatic(): Promise<Badge[]> {
        const badges = await prisma.badges.findMany({
            where: {
                isActive: true,
                criteria: { not: Prisma.AnyNull }
            },
            include: {
                creator: true,
                userBadges: {
                    include: {
                        user: true,
                        awarder: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return badges.map(badge => Badge.fromPrisma(badge));
    }

    async findManual(): Promise<Badge[]> {
        const badges = await prisma.badges.findMany({
            where: {
                isActive: true,
                criteria: { equals: Prisma.AnyNull }
            },
            include: {
                creator: true,
                userBadges: {
                    include: {
                        user: true,
                        awarder: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return badges.map(badge => Badge.fromPrisma(badge));
    }
}

export class UserBadgeRepository implements IUserBadgeRepository {
    async findById(id: number): Promise<UserBadge | null> {
        const userBadge = await prisma.user_badges.findUnique({
            where: { id },
            include: {
                user: true,
                badge: true,
                awarder: true
            }
        });

        return userBadge ? UserBadge.fromPrisma(userBadge) : null;
    }

    async findByUserId(userId: number): Promise<UserBadge[]> {
        const userBadges = await prisma.user_badges.findMany({
            where: { userId },
            include: {
                user: true,
                badge: true,
                awarder: true
            },
            orderBy: { earnedAt: 'desc' }
        });

        return userBadges.map(userBadge => UserBadge.fromPrisma(userBadge));
    }

    async findByBadgeId(badgeId: number): Promise<UserBadge[]> {
        const userBadges = await prisma.user_badges.findMany({
            where: { badgeId },
            include: {
                user: true,
                badge: true,
                awarder: true
            },
            orderBy: { earnedAt: 'desc' }
        });

        return userBadges.map(userBadge => UserBadge.fromPrisma(userBadge));
    }

    async findByUserAndBadge(userId: number, badgeId: number): Promise<UserBadge | null> {
        const userBadge = await prisma.user_badges.findUnique({
            where: {
                userId_badgeId: {
                    userId,
                    badgeId
                }
            },
            include: {
                user: true,
                badge: true,
                awarder: true
            }
        });

        return userBadge ? UserBadge.fromPrisma(userBadge) : null;
    }

    async create(userBadge: UserBadge): Promise<UserBadge> {
        const data = userBadge.toPrisma();
        const created = await prisma.user_badges.create({
            data,
            include: {
                user: true,
                badge: true,
                awarder: true
            }
        });

        return UserBadge.fromPrisma(created);
    }

    async delete(id: number): Promise<void> {
        await prisma.user_badges.delete({
            where: { id }
        });
    }

    async deleteByUserAndBadge(userId: number, badgeId: number): Promise<void> {
        await prisma.user_badges.delete({
            where: {
                userId_badgeId: {
                    userId,
                    badgeId
                }
            }
        });
    }

    async findRecentByUserId(userId: number, limit: number = 10): Promise<UserBadge[]> {
        const userBadges = await prisma.user_badges.findMany({
            where: { userId },
            include: {
                user: true,
                badge: true,
                awarder: true
            },
            orderBy: { earnedAt: 'desc' },
            take: limit
        });

        return userBadges.map(userBadge => UserBadge.fromPrisma(userBadge));
    }

    async findEarnedByUser(userId: number): Promise<UserBadge[]> {
        const userBadges = await prisma.user_badges.findMany({
            where: {
                userId,
                earnedBy: null
            },
            include: {
                user: true,
                badge: true,
                awarder: true
            },
            orderBy: { earnedAt: 'desc' }
        });

        return userBadges.map(userBadge => UserBadge.fromPrisma(userBadge));
    }

    async findAwardedByAdmin(userId: number): Promise<UserBadge[]> {
        const userBadges = await prisma.user_badges.findMany({
            where: {
                userId,
                earnedBy: { not: null }
            },
            include: {
                user: true,
                badge: true,
                awarder: true
            },
            orderBy: { earnedAt: 'desc' }
        });

        return userBadges.map(userBadge => UserBadge.fromPrisma(userBadge));
    }

    async getUserBadgeCount(userId: number): Promise<number> {
        return await prisma.user_badges.count({
            where: { userId }
        });
    }

    async getBadgeEarners(badgeId: number): Promise<UserBadge[]> {
        const userBadges = await prisma.user_badges.findMany({
            where: { badgeId },
            include: {
                user: true,
                badge: true,
                awarder: true
            },
            orderBy: { earnedAt: 'desc' }
        });

        return userBadges.map(userBadge => UserBadge.fromPrisma(userBadge));
    }
}
