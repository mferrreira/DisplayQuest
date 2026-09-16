import { prisma } from '@/lib/database/prisma';
import { LabResponsibility } from '../models/LabResponsibility';

export interface ILabResponsibilityRepository {
    findById(id: number): Promise<LabResponsibility | null>;
    findAll(): Promise<LabResponsibility[]>;
    create(labResponsibility: LabResponsibility): Promise<LabResponsibility>;
    update(labResponsibility: LabResponsibility): Promise<LabResponsibility>;
    delete(id: number): Promise<void>;
    findByUserId(userId: number): Promise<LabResponsibility[]>;
    findActiveResponsibility(): Promise<LabResponsibility | null>;
    findByDateRange(startDate: Date, endDate: Date): Promise<LabResponsibility[]>;
    findActiveResponsibilityForUser(userId: number): Promise<LabResponsibility | null>;
    pauseActiveForUser(userId: number): Promise<LabResponsibility | null>;
    resumeForUser(userId: number): Promise<LabResponsibility | null>;
}

export class LabResponsibilityRepository implements ILabResponsibilityRepository {
    private getIncludeOptions() {
        return {
            user: true
        };
    }

    async findById(id: number): Promise<LabResponsibility | null> {
        const labResponsibility = await prisma.lab_responsibilities.findUnique({
            where: { id },
            include: this.getIncludeOptions()
        });

        return labResponsibility ? LabResponsibility.fromPrisma(labResponsibility) : null;
    }

    async findAll(): Promise<LabResponsibility[]> {
        const labResponsibilities = await prisma.lab_responsibilities.findMany({
            include: this.getIncludeOptions(),
            orderBy: { startTime: 'desc' }
        });

        return labResponsibilities.map(labResponsibility => LabResponsibility.fromPrisma(labResponsibility));
    }

    async create(labResponsibility: LabResponsibility): Promise<LabResponsibility> {
        const errors = this.validateLabResponsibility(labResponsibility);
        if (errors.length > 0) {
            throw new Error(`Dados inválidos: ${errors.join(', ')}`);
        }

        const data = labResponsibility.toPrisma();
        const created = await prisma.lab_responsibilities.create({
            data: {
                userId: data.userId,
                userName: data.userName,
                startTime: data.startTime,
                endTime: data.endTime,
                pausedAt: data.pausedAt,
                totalPausedMs: data.totalPausedMs,
                notes: data.notes
            },
            include: this.getIncludeOptions()
        });

        return LabResponsibility.fromPrisma(created);
    }

    async update(labResponsibility: LabResponsibility): Promise<LabResponsibility> {
        if (!labResponsibility.id) {
            throw new Error("ID da responsabilidade é obrigatório para atualização");
        }

        const errors = this.validateLabResponsibility(labResponsibility);
        if (errors.length > 0) {
            throw new Error(`Dados inválidos: ${errors.join(', ')}`);
        }

        const data = labResponsibility.toPrisma();
        const updated = await prisma.lab_responsibilities.update({
            where: { id: labResponsibility.id },
            data: {
                userId: data.userId,
                userName: data.userName,
                startTime: data.startTime,
                endTime: data.endTime,
                pausedAt: data.pausedAt,
                totalPausedMs: data.totalPausedMs,
                notes: data.notes
            },
            include: this.getIncludeOptions()
        });

        return LabResponsibility.fromPrisma(updated);
    }

    async delete(id: number): Promise<void> {
        await prisma.lab_responsibilities.delete({
            where: { id }
        });
    }

    async findByUserId(userId: number): Promise<LabResponsibility[]> {
        const labResponsibilities = await prisma.lab_responsibilities.findMany({
            where: { userId },
            include: this.getIncludeOptions(),
            orderBy: { startTime: 'desc' }
        });

        return labResponsibilities.map(labResponsibility => LabResponsibility.fromPrisma(labResponsibility));
    }

    async findActiveResponsibility(): Promise<LabResponsibility | null> {
        const labResponsibility = await prisma.lab_responsibilities.findFirst({
            where: { endTime: null },
            include: this.getIncludeOptions(),
            orderBy: { startTime: 'desc' }
        });

        return labResponsibility ? LabResponsibility.fromPrisma(labResponsibility) : null;
    }

    async findActiveResponsibilityForUser(userId: number): Promise<LabResponsibility | null> {
        const resp = await prisma.lab_responsibilities.findFirst({
            where: { userId, endTime: null },
            include: this.getIncludeOptions(),
            orderBy: { startTime: 'desc' },
        });
        return resp ? LabResponsibility.fromPrisma(resp) : null;
    }

    async pauseActiveForUser(userId: number): Promise<LabResponsibility | null> {
        const active = await this.findActiveResponsibilityForUser(userId);
        if (!active || active.isPaused) return active ? active : null; // nothing to do if already paused or none
        active.pause();
        return await this.update(active);
    }

    async resumeForUser(userId: number): Promise<LabResponsibility | null> {
        const resp = await prisma.lab_responsibilities.findFirst({
            where: { userId, endTime: null, pausedAt: { not: null } },
            include: this.getIncludeOptions(),
            orderBy: { startTime: 'desc' },
        });
        if (!resp) return null;
        const model = LabResponsibility.fromPrisma(resp);
        model.resume();
        return await this.update(model);
    }

    async findByDateRange(startDate: Date, endDate: Date): Promise<LabResponsibility[]> {
        const startIso = startDate.toISOString();
        const endIso = endDate.toISOString();

        const labResponsibilities = await prisma.lab_responsibilities.findMany({
            where: {
                AND: [
                    { startTime: { lte: endIso } },
                    {
                        OR: [
                            { endTime: null },
                            { endTime: { gte: startIso } }
                        ]
                    }
                ]
            },
            include: this.getIncludeOptions(),
            orderBy: { startTime: 'desc' }
        });

        return labResponsibilities.map(labResponsibility => LabResponsibility.fromPrisma(labResponsibility));
    }

    private validateLabResponsibility(labResponsibility: LabResponsibility): string[] {
        const errors: string[] = [];
        if (!labResponsibility.userId || labResponsibility.userId <= 0) errors.push("ID do usuário é obrigatório");
        if (!labResponsibility.userName || labResponsibility.userName.trim().length === 0) errors.push("Nome do usuário é obrigatório");
        if (!labResponsibility.startTime || isNaN(labResponsibility.startTime.getTime())) errors.push("Horário de início inválido");
        if (labResponsibility.endTime && labResponsibility.endTime <= labResponsibility.startTime) {
            errors.push("Horário de fim deve ser posterior ao início");
        }
        return errors;
    }
}
