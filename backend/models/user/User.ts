import { users, UserRole, ProfileVisibility } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export interface IUser {
    id?: number;
    name: string;
    email: string;
    points?: number;
    completedTasks?: number;
    password?: string | null;
    status?: string;
    weekHours?: number;
    createdAt?: Date;
    currentWeekHours?: number;
    profileVisibility?: ProfileVisibility;
    bio?: string | null;
    avatar?: string | null;
    roles?: UserRole[];
}

export class User {
    public id?: number;
    public name: string;
    public email: string;
    public points: number;
    public completedTasks: number;
    public password: string | null;
    public status: string;
    public weekHours: number;
    public currentWeekHours: number;
    public profileVisibility: ProfileVisibility;
    public bio: string | null;
    public avatar: string | null;
    public roles: UserRole[];
    public createdAt?: Date;

    constructor(data: IUser | User) {
        this.id = data.id;
        this.name = data.name;
        this.email = data.email;
        this.points = data.points || 0;
        this.completedTasks = data.completedTasks || 0;
        this.password = data.password || null;
        this.status = data.status || 'pending';
        this.weekHours = data.weekHours || 0;
        this.currentWeekHours = data.currentWeekHours || 0;
        this.profileVisibility = data.profileVisibility || 'public';
        this.bio = data.bio || null;
        this.avatar = data.avatar || null;
        this.roles = [...(data.roles || [])];
        this.createdAt = data.createdAt;
    }

    static create(data: Omit<IUser, 'id' | 'createdAt'>): User {
        return new User({
            ...data,
            points: 0,
            completedTasks: 0,
            status: 'pending',
            weekHours: 0,
            currentWeekHours: 0,
            profileVisibility: 'public',
            roles: data.roles || [],
            createdAt: new Date(),
        });
    }

    static fromPrisma(data: users): User {
        return new User({
            id: data.id,
            name: data.name,
            email: data.email,
            points: data.points,
            completedTasks: data.completedTasks,
            password: data.password,
            status: data.status,
            weekHours: data.weekHours,
            createdAt: data.createdAt,
            currentWeekHours: data.currentWeekHours,
            profileVisibility: data.profileVisibility,
            bio: data.bio,
            avatar: data.avatar,
            roles: data.roles,
        });
    }

    toPrisma(): Omit<users, 'id' | 'createdAt'> {
        return {
            name: this.name,
            email: this.email,
            points: this.points,
            completedTasks: this.completedTasks,
            password: this.password,
            status: this.status,
            weekHours: this.weekHours,
            currentWeekHours: this.currentWeekHours,
            profileVisibility: this.profileVisibility,
            bio: this.bio,
            avatar: this.avatar,
            roles: this.roles,
        };
    }

    async setPassword(password: string): Promise<void> {
        if (!password || password.length < 6) {
            throw new Error('Senha deve ter pelo menos 6 caracteres');
        }
        this.password = await bcrypt.hash(password, 10);
    }

    hasRole(role: UserRole): boolean {
        return this.roles.includes(role);
    }

    hasAnyRole(roles: UserRole[]): boolean {
        return roles.some((role) => this.roles.includes(role));
    }

    canLogin(): boolean {
        return this.status === 'active';
    }

    toPublicObject() {
        return {
            id: this.id,
            name: this.name,
            email: this.email,
            points: this.points,
            completedTasks: this.completedTasks,
            status: this.status,
            weekHours: this.weekHours,
            currentWeekHours: this.currentWeekHours,
            profileVisibility: this.profileVisibility,
            bio: this.bio,
            avatar: this.avatar,
            roles: this.roles,
            createdAt: this.createdAt,
        };
    }

    toJSON(): any {
        return this.toPublicObject();
    }
}
