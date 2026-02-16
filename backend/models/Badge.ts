import { badges, user_badges } from '@prisma/client';

export interface IBadge {
    id?: number;
    name: string;
    description: string;
    icon?: string | null | undefined;
    color?: string | null | undefined;
    category: BadgeCategory;
    criteria?: IBadgeCriteria | null;
    isActive: boolean;
    createdAt?: Date;
    createdBy: number;
}

export interface IBadgeCriteria {
    points?: number;
    tasks?: number;
    projects?: number;
    workSessions?: number;
    weeklyHours?: number;
    consecutiveDays?: number;
    specialCondition?: string;
}

export type BadgeCategory = 'achievement' | 'milestone' | 'special' | 'social';

export interface IUserBadge {
    id?: number;
    userId: number;
    badgeId: number;
    earnedAt?: Date;
    earnedBy?: number | null;
}

export class Badge {
    public id?: number;
    public name: string;
    public description: string;
    public icon?: string | null | undefined;
    public color?: string | null | undefined;
    public category: BadgeCategory;
    public criteria?: IBadgeCriteria | null;
    public isActive: boolean;
    public createdAt?: Date;
    public createdBy: number;

    constructor(data: IBadge) {
        this.id = data.id;
        this.name = data.name;
        this.description = data.description;
        this.icon = data.icon;
        this.color = data.color;
        this.category = data.category;
        this.criteria = data.criteria;
        this.isActive = data.isActive;
        this.createdAt = data.createdAt;
        this.createdBy = data.createdBy;
    }

    static create(data: Omit<IBadge, 'id' | 'createdAt'>): Badge {
        return new Badge({
            ...data,
            isActive: true,
            createdAt: new Date(),
        });
    }

    static fromPrisma(data: badges): Badge {
        return new Badge({
            id: data.id,
            name: data.name,
            description: data.description,
            icon: data.icon,
            color: data.color,
            category: data.category as BadgeCategory,
            criteria: data.criteria as IBadgeCriteria | null,
            isActive: data.isActive,
            createdAt: data.createdAt,
            createdBy: data.createdBy,
        });
    }

    toPrisma(): Omit<badges, 'id' | 'createdAt'> {
        return {
            name: this.name,
            description: this.description,
            icon: this.icon ?? null,
            color: this.color ?? null,
            category: this.category,
            criteria: this.criteria as any,
            isActive: this.isActive,
            createdBy: this.createdBy,
        };
    }

    checkCriteria(userStats: {
        points?: number;
        completedTasks?: number;
        completedProjects?: number;
        workSessions?: number;
        weeklyHours?: number;
        consecutiveDays?: number;
    }): boolean {
        if (!this.criteria) return true;

        const criteria = this.criteria;

        if (criteria.points && (userStats.points || 0) < criteria.points) return false;
        if (criteria.tasks && (userStats.completedTasks || 0) < criteria.tasks) return false;
        if (criteria.projects && (userStats.completedProjects || 0) < criteria.projects) return false;
        if (criteria.workSessions && (userStats.workSessions || 0) < criteria.workSessions) return false;
        if (criteria.weeklyHours && (userStats.weeklyHours || 0) < criteria.weeklyHours) return false;
        if (criteria.consecutiveDays && (userStats.consecutiveDays || 0) < criteria.consecutiveDays) return false;

        return true;
    }
}

export class UserBadge {
    public id?: number;
    public userId: number;
    public badgeId: number;
    public earnedAt: Date;
    public earnedBy?: number | null | undefined;

    constructor(data: IUserBadge) {
        this.id = data.id;
        this.userId = data.userId;
        this.badgeId = data.badgeId;
        this.earnedAt = data.earnedAt || new Date();
        this.earnedBy = data.earnedBy;
    }

    static create(data: Omit<IUserBadge, 'id' | 'earnedAt'>): UserBadge {
        return new UserBadge({
            ...data,
            earnedAt: new Date(),
        });
    }

    static fromPrisma(data: user_badges): UserBadge {
        return new UserBadge({
            id: data.id,
            userId: data.userId,
            badgeId: data.badgeId,
            earnedAt: data.earnedAt,
            earnedBy: data.earnedBy,
        });
    }

    toPrisma(): Omit<user_badges, 'id'> {
        return {
            userId: this.userId,
            badgeId: this.badgeId,
            earnedAt: this.earnedAt,
            earnedBy: this.earnedBy ?? null,
        };
    }

}
