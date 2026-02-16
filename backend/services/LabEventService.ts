import { LabEvent } from '../models/LabEvent';
import { LabEventRepository, ILabEventRepository } from '../repositories/LabEventRepository';
import { UserRepository } from '../repositories/UserRepository';
import { createIdentityAccessModule, IdentityAccessModule } from '@/backend/modules/identity-access';

export interface ILabEventService {
    findById(id: number): Promise<LabEvent | null>;
    findAll(): Promise<LabEvent[]>;
    create(data: Omit<LabEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<LabEvent>;
    update(id: number, data: Partial<LabEvent>): Promise<LabEvent>;
    delete(id: number): Promise<void>;
    getEventsByDate(date: Date): Promise<LabEvent[]>;
    getEventsByUser(userId: number): Promise<LabEvent[]>;
    getEventsByDateRange(startDate: Date, endDate: Date): Promise<LabEvent[]>;
    canUserCreateEvent(userId: number): Promise<boolean>;
    canUserViewEvent(eventId: number, userId: number): Promise<boolean>;
}

export class LabEventService implements ILabEventService {
    private identityAccess: IdentityAccessModule;

    constructor(
        private labEventRepo: ILabEventRepository,
        private userRepo: UserRepository,
    ) {
        this.identityAccess = createIdentityAccessModule();
    }

    async findById(id: number): Promise<LabEvent | null> {
        return await this.labEventRepo.findById(id);
    }

    async findAll(): Promise<LabEvent[]> {
        return await this.labEventRepo.findAll();
    }

    async create(data: Omit<LabEvent, 'id' | 'createdAt' | 'updatedAt'>): Promise<LabEvent> {
        const user = await this.userRepo.findById(data.userId);
        if (!user) {
            throw new Error("Usuário não encontrado");
        }

        const canCreate = await this.canUserCreateEvent(data.userId);
        if (!canCreate) {
            throw new Error("Usuário não tem permissão para criar eventos");
        }

        const labEvent = LabEvent.create(data);
        return await this.labEventRepo.create(labEvent);
    }

    async update(id: number, data: Partial<LabEvent>): Promise<LabEvent> {
        const existingEvent = await this.labEventRepo.findById(id);
        if (!existingEvent) {
            throw new Error("Evento não encontrado");
        }

        const canUpdate = await this.canUserViewEvent(id, data.userId || existingEvent.userId);
        if (!canUpdate) {
            throw new Error("Usuário não tem permissão para atualizar este evento");
        }

        if (data.note !== undefined) {
            existingEvent.updateNote(data.note);
        }
        if (data.date !== undefined) {
            existingEvent.updateDate(data.date);
        }

        return await this.labEventRepo.update(existingEvent);
    }

    async delete(id: number): Promise<void> {
        const existingEvent = await this.labEventRepo.findById(id);
        if (!existingEvent) {
            throw new Error("Evento não encontrado");
        }

        await this.labEventRepo.delete(id);
    }

    async getEventsByDate(date: Date): Promise<LabEvent[]> {
        return await this.labEventRepo.findByDate(date);
    }

    async getEventsByUser(userId: number): Promise<LabEvent[]> {
        return await this.labEventRepo.findByUser(userId);
    }

    async getEventsByDateRange(startDate: Date, endDate: Date): Promise<LabEvent[]> {
        return await this.labEventRepo.findByDateRange(startDate, endDate);
    }

    async canUserCreateEvent(userId: number): Promise<boolean> {
        const user = await this.userRepo.findById(userId);
        if (!user) return false;

        return user.status === 'active';
    }

    async canUserViewEvent(eventId: number, userId: number): Promise<boolean> {
        const user = await this.userRepo.findById(userId);
        if (!user) return false;

        const event = await this.labEventRepo.findById(eventId);
        if (!event) return false;

        if (event.userId === userId) return true;

        const hasAdminRole = this.identityAccess.hasAnyRole(user.roles, ['COORDENADOR', 'GERENTE', 'LABORATORISTA']);

        return hasAdminRole;
    }
}
