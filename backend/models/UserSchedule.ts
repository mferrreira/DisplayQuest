export interface IUserSchedule {
    id?: number;
    userId: number;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    createdAt?: Date;
}

export class UserSchedule {
    public id?: number;
    public userId: number;
    public dayOfWeek: number;
    public startTime: string;
    public endTime: string;
    public createdAt?: Date;

    constructor(data: IUserSchedule) {
        this.id = data.id;
        this.userId = data.userId;
        this.dayOfWeek = data.dayOfWeek;
        this.startTime = data.startTime;
        this.endTime = data.endTime;
        this.createdAt = data.createdAt;
    }

    static create(data: Omit<IUserSchedule, 'id' | 'createdAt'>): UserSchedule {
        return new UserSchedule({ ...data, createdAt: new Date() });
    }

    static fromPrisma(data: any): UserSchedule {
        return new UserSchedule({
            id: data.id,
            userId: data.userId,
            dayOfWeek: data.dayOfWeek,
            startTime: data.startTime,
            endTime: data.endTime,
            createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
        });
    }

    toJSON(): any {
        return {
            id: this.id,
            userId: this.userId,
            dayOfWeek: this.dayOfWeek,
            startTime: this.startTime,
            endTime: this.endTime,
            createdAt: this.createdAt?.toISOString(),
        };
    }

    toPrisma(): any {
        return {
            id: this.id,
            userId: this.userId,
            dayOfWeek: this.dayOfWeek,
            startTime: this.startTime,
            endTime: this.endTime,
            createdAt: this.createdAt,
        };
    }
}
