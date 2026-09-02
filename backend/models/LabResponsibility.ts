export interface ILabResponsibility {
    id?: number;
    userId: number;
    userName: string;
    startTime: Date;
    endTime?: Date | null;
    pausedAt?: Date | null;
    totalPausedMs?: number;
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
    public pausedAt: Date | null;
    public totalPausedMs: number;
    public notes?: string | null;
    public createdAt?: Date;
    public updatedAt?: Date;

    constructor(data: ILabResponsibility) {
        this.id = data.id;
        this.userId = data.userId;
        this.userName = data.userName;
        this.startTime = data.startTime;
        this.endTime = data.endTime;
        this.pausedAt = data.pausedAt ?? null;
        this.totalPausedMs = data.totalPausedMs ?? 0;
        this.notes = data.notes;
        this.createdAt = data.createdAt;
        this.updatedAt = data.updatedAt;
    }

    static create(data: Omit<ILabResponsibility, 'id' | 'createdAt' | 'updatedAt'>): LabResponsibility {
        return new LabResponsibility({
            ...data,
            pausedAt: null,
            totalPausedMs: 0,
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
            pausedAt: data.pausedAt ? new Date(data.pausedAt) : null,
            totalPausedMs: data.totalPausedMs ?? 0,
            notes: data.notes,
            createdAt: undefined,
            updatedAt: undefined,
        });
    }

    /** True when the responsibility has started and is currently paused (has not ended). */
    get isPaused(): boolean {
        return !!this.pausedAt && !this.endTime;
    }

    /** Pause: mark the current running stretch as paused (no-op if already paused/ended). */
    pause(): void {
        if (this.endTime) throw new Error("Responsabilidade já foi encerrada");
        if (this.pausedAt) throw new Error("Responsabilidade já estava pausada");
        this.pausedAt = new Date();
        this.updatedAt = new Date();
    }

    /** Resume: fold the paused stretch into totalPausedMs and clear pausedAt. */
    resume(): void {
        if (!this.pausedAt) throw new Error("Responsabilidade não está pausada");
        const now = new Date();
        this.totalPausedMs += Math.max(0, now.getTime() - this.pausedAt.getTime());
        this.pausedAt = null;
        this.updatedAt = now;
    }

    /** Active (non-paused) elapsed ms from startTime up to now (or endTime if ended). */
    get effectiveDurationMs(): number {
        const start = this.startTime.getTime();
        const end = this.endTime ? this.endTime.getTime() : Date.now();
        let activeMs = Math.max(0, end - start) - this.totalPausedMs;
        if (this.pausedAt) activeMs -= Math.max(0, Date.now() - this.pausedAt.getTime());
        return Math.max(0, activeMs);
    }

    toJSON(): any {
        const activeMs = this.effectiveDurationMs;
        const durationInMinutes = Math.floor(activeMs / (1000 * 60));

        return {
            id: this.id,
            userId: this.userId,
            userName: this.userName,
            startTime: this.startTime.toISOString(),
            endTime: this.endTime?.toISOString() || null,
            notes: this.notes,
            pausedAt: this.pausedAt?.toISOString() || null,
            totalPausedMs: this.totalPausedMs,
            createdAt: this.createdAt?.toISOString(),
            updatedAt: this.updatedAt?.toISOString(),
            duration: durationInMinutes,
            isActive: !this.endTime,
            isPaused: this.isPaused,
        };
    }

    toPrisma(): any {
        return {
            id: this.id,
            userId: this.userId,
            userName: this.userName,
            startTime: this.startTime.toISOString(),
            endTime: this.endTime ? this.endTime.toISOString() : null,
            pausedAt: this.pausedAt ? this.pausedAt.toISOString() : null,
            totalPausedMs: this.totalPausedMs,
            notes: this.notes,
        };
    }
}
