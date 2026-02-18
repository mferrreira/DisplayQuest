export interface ILabResponsibility {
    id?: number;
    userId: number;
    userName: string;
    startTime: Date;
    endTime?: Date | null;
    notes?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
}

export class LabResponsibility {
    public id?: number;
    public userId: number;
    public userName: string;
    public startTime: Date;
    public endTime?: Date | null;
    public notes?: string | null;
    public createdAt?: Date;
    public updatedAt?: Date;

    constructor(data: ILabResponsibility) {
        this.id = data.id;
        this.userId = data.userId;
        this.userName = data.userName;
        this.startTime = data.startTime;
        this.endTime = data.endTime;
        this.notes = data.notes;
        this.createdAt = data.createdAt;
        this.updatedAt = data.updatedAt;
    }

    static create(data: Omit<ILabResponsibility, 'id' | 'createdAt' | 'updatedAt'>): LabResponsibility {
        return new LabResponsibility({
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    }

    static fromPrisma(data: any): LabResponsibility {
        return new LabResponsibility({
            id: data.id,
            userId: data.userId,
            userName: data.userName,
            startTime: new Date(data.startTime),
            endTime: data.endTime ? new Date(data.endTime) : null,
            notes: data.notes,
            createdAt: undefined,
            updatedAt: undefined,
        });
    }

    toJSON(): any {
        const now = Date.now();
        const end = this.endTime ? this.endTime.getTime() : now;
        const durationInMinutes = Math.floor((end - this.startTime.getTime()) / (1000 * 60));

        return {
            id: this.id,
            userId: this.userId,
            userName: this.userName,
            startTime: this.startTime.toISOString(),
            endTime: this.endTime?.toISOString() || null,
            notes: this.notes,
            createdAt: this.createdAt?.toISOString(),
            updatedAt: this.updatedAt?.toISOString(),
            duration: durationInMinutes,
            isActive: !this.endTime,
        };
    }

    toPrisma(): any {
        return {
            id: this.id,
            userId: this.userId,
            userName: this.userName,
            startTime: this.startTime.toISOString(),
            endTime: this.endTime ? this.endTime.toISOString() : null,
            notes: this.notes,
        };
    }
}
