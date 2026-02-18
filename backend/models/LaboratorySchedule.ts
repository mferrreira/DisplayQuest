export interface ILaboratorySchedule {
    id?: number;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    notes?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
}

export class LaboratorySchedule {
    public id?: number;
    public dayOfWeek: number;
    public startTime: string;
    public endTime: string;
    public notes?: string | null;
    public createdAt?: Date;
    public updatedAt?: Date;

    constructor(data: ILaboratorySchedule) {
        this.id = data.id;
        this.dayOfWeek = data.dayOfWeek;
        this.startTime = data.startTime;
        this.endTime = data.endTime;
        this.notes = data.notes;
        this.createdAt = data.createdAt;
        this.updatedAt = data.updatedAt;
    }

    static create(data: Omit<ILaboratorySchedule, 'id' | 'createdAt' | 'updatedAt'>): LaboratorySchedule {
        return new LaboratorySchedule({ ...data, createdAt: new Date(), updatedAt: new Date() });
    }

    static fromPrisma(data: any): LaboratorySchedule {
        return new LaboratorySchedule({
            id: data.id,
            dayOfWeek: data.dayOfWeek,
            startTime: data.startTime,
            endTime: data.endTime,
            notes: data.notes,
            createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
            updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined,
        });
    }

    toJSON(): any {
        return {
            id: this.id,
            dayOfWeek: this.dayOfWeek,
            startTime: this.startTime,
            endTime: this.endTime,
            notes: this.notes,
            createdAt: this.createdAt?.toISOString(),
            updatedAt: this.updatedAt?.toISOString(),
        };
    }

    toPrisma(): any {
        return {
            id: this.id,
            dayOfWeek: this.dayOfWeek,
            startTime: this.startTime,
            endTime: this.endTime,
            notes: this.notes,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}
