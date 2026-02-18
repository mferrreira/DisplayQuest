export interface ILabEvent {
    id?: number;
    userId: number;
    userName: string;
    date: Date;
    note: string;
    createdAt?: Date;
}

export class LabEvent {
    public id?: number;
    public userId: number;
    public userName: string;
    public date: Date;
    public note: string;
    public createdAt?: Date;

    constructor(data: ILabEvent) {
        this.id = data.id;
        this.userId = data.userId;
        this.userName = data.userName;
        this.date = data.date;
        this.note = data.note;
        this.createdAt = data.createdAt;
    }

    static create(data: Omit<ILabEvent, 'id' | 'createdAt'>): LabEvent {
        return new LabEvent({ ...data, createdAt: new Date() });
    }

    static fromPrisma(data: any): LabEvent {
        return new LabEvent({
            id: data.id,
            userId: data.userId,
            userName: data.userName,
            date: new Date(data.date),
            note: data.note,
            createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
        });
    }

    toJSON(): any {
        return {
            id: this.id,
            userId: this.userId,
            userName: this.userName,
            date: this.date.toISOString(),
            note: this.note,
            createdAt: this.createdAt?.toISOString(),
        };
    }

    toPrisma(): any {
        return {
            id: this.id,
            userId: this.userId,
            userName: this.userName,
            date: this.date,
            note: this.note,
            createdAt: this.createdAt,
        };
    }
}
