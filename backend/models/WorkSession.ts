import { work_sessions } from '@prisma/client';

export class WorkSession {
    public id?: number;
    public userId: number;
    public userName: string;
    public startTime: Date;
    public endTime?: Date | null;
    public duration?: number | null;
    public activity?: string | null;
    public location?: string | null;
    public projectId?: number | null;
    public status: string;
    public createdAt?: Date;
    public updatedAt?: Date;

    constructor(
        userId: number,
        userName: string,
        startTime: Date = new Date(),
        endTime?: Date | null,
        duration?: number | null,
        activity?: string | null,
        location?: string | null,
        projectId?: number | null,
        status: string = 'active',
        id?: number,
        createdAt?: Date,
        updatedAt?: Date,
    ) {
        this.userId = userId;
        this.userName = userName;
        this.startTime = startTime;
        this.endTime = endTime;
        this.duration = duration;
        this.activity = activity;
        this.location = location;
        this.projectId = projectId;
        this.status = status;
        this.id = id;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    static create(
        userId: number,
        userName: string,
        activity?: string,
        location?: string,
        projectId?: number,
    ): WorkSession {
        if (!userId || !userName?.trim()) {
            throw new Error('Dados inválidos para criar sessão de trabalho');
        }

        return new WorkSession(
            userId,
            userName,
            new Date(),
            null,
            null,
            activity,
            location,
            projectId,
            'active',
        );
    }

    static fromPrisma(data: work_sessions): WorkSession {
        return new WorkSession(
            data.userId,
            data.userName,
            data.startTime,
            data.endTime,
            data.duration,
            data.activity,
            data.location,
            data.projectId,
            data.status,
            data.id,
            data.createdAt,
            data.updatedAt,
        );
    }

    toPrisma(): Omit<work_sessions, 'id' | 'createdAt' | 'updatedAt'> {
        return {
            userId: this.userId,
            userName: this.userName,
            startTime: this.startTime,
            endTime: this.endTime || null,
            duration: this.duration || null,
            activity: this.activity || null,
            location: this.location || null,
            projectId: this.projectId || null,
            status: this.status,
        };
    }

    toJSON(): any {
        return {
            id: this.id,
            userId: this.userId,
            userName: this.userName,
            startTime: this.startTime,
            endTime: this.endTime,
            duration: this.duration,
            activity: this.activity,
            location: this.location,
            projectId: this.projectId,
            status: this.status,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}
