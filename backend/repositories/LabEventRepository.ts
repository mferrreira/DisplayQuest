import { prisma } from '@/lib/database/prisma';
import { LabEvent } from '../models/LabEvent';

export interface ILabEventRepository {
    findById(id: number): Promise<LabEvent | null>;
    findAll(): Promise<LabEvent[]>;
    create(labEvent: LabEvent): Promise<LabEvent>;
    update(labEvent: LabEvent): Promise<LabEvent>;
    delete(id: number): Promise<void>;
    findByDate(date: Date): Promise<LabEvent[]>;
    findByUser(userId: number): Promise<LabEvent[]>;
    findByDateRange(startDate: Date, endDate: Date): Promise<LabEvent[]>;
}

export class LabEventRepository implements ILabEventRepository {
    private getIncludeOptions() {
        return {
            user: true
        };
    }

    async findById(id: number): Promise<LabEvent | null> {
        const labEvent = await prisma.lab_events.findUnique({
            where: { id },
            include: this.getIncludeOptions()
        });

        return labEvent ? LabEvent.fromPrisma(labEvent) : null;
    }

    async findAll(): Promise<LabEvent[]> {
        const labEvents = await prisma.lab_events.findMany({
            include: this.getIncludeOptions(),
            orderBy: { date: 'desc' }
        });

        return labEvents.map(labEvent => LabEvent.fromPrisma(labEvent));
    }

    async create(labEvent: LabEvent): Promise<LabEvent> {
        const errors = this.validateLabEvent(labEvent);
        if (errors.length > 0) {
            throw new Error(`Dados inválidos: ${errors.join(', ')}`);
        }

        const data = labEvent.toPrisma();
        const created = await prisma.lab_events.create({
            data: {
                userId: data.userId,
                userName: data.userName,
                date: data.date,
                note: data.note,
                createdAt: new Date()
            },
            include: this.getIncludeOptions()
        });

        return LabEvent.fromPrisma(created);
    }

    async update(labEvent: LabEvent): Promise<LabEvent> {
        if (!labEvent.id) {
            throw new Error("ID do evento é obrigatório para atualização");
        }

        const errors = this.validateLabEvent(labEvent);
        if (errors.length > 0) {
            throw new Error(`Dados inválidos: ${errors.join(', ')}`);
        }

        const data = labEvent.toPrisma();
        const updated = await prisma.lab_events.update({
            where: { id: labEvent.id },
            data: {
                userId: data.userId,
                userName: data.userName,
                date: data.date,
                note: data.note
            },
            include: this.getIncludeOptions()
        });

        return LabEvent.fromPrisma(updated);
    }

    async delete(id: number): Promise<void> {
        await prisma.lab_events.delete({
            where: { id }
        });
    }

    async findByDate(date: Date): Promise<LabEvent[]> {
        // Find all events for the given day (ignoring time)
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);

        const labEvents = await prisma.lab_events.findMany({
            where: {
                date: {
                    gte: start,
                    lte: end,
                },
            },
            include: this.getIncludeOptions(),
            orderBy: { date: 'asc' }
        });

        return labEvents.map(labEvent => LabEvent.fromPrisma(labEvent));
    }

    async findByUser(userId: number): Promise<LabEvent[]> {
        const labEvents = await prisma.lab_events.findMany({
            where: { userId },
            include: this.getIncludeOptions(),
            orderBy: { date: 'desc' }
        });

        return labEvents.map(labEvent => LabEvent.fromPrisma(labEvent));
    }

    async findByDateRange(startDate: Date, endDate: Date): Promise<LabEvent[]> {
        const labEvents = await prisma.lab_events.findMany({
            where: {
                date: {
                    gte: startDate,
                    lte: endDate,
                },
            },
            include: this.getIncludeOptions(),
            orderBy: { date: 'asc' }
        });

        return labEvents.map(labEvent => LabEvent.fromPrisma(labEvent));
    }

    private validateLabEvent(labEvent: LabEvent): string[] {
        const errors: string[] = [];
        if (!labEvent.userId || labEvent.userId <= 0) errors.push("ID do usuário é obrigatório");
        if (!labEvent.userName || labEvent.userName.trim().length === 0) errors.push("Nome do usuário é obrigatório");
        if (!labEvent.date || isNaN(labEvent.date.getTime())) errors.push("Data do evento inválida");
        if (!labEvent.note || labEvent.note.trim().length === 0) errors.push("Nota do evento é obrigatória");
        return errors;
    }
}
