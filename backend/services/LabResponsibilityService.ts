import { LabResponsibility } from '../models/LabResponsibility';
import { LabResponsibilityRepository, ILabResponsibilityRepository } from '../repositories/LabResponsibilityRepository';
import { UserRepository } from '../repositories/UserRepository';
import { createIdentityAccessModule, IdentityAccessModule } from '@/backend/modules/identity-access';

export interface ILabResponsibilityService {
    findById(id: number): Promise<LabResponsibility | null>;
    findAll(): Promise<LabResponsibility[]>;
    create(data: Omit<LabResponsibility, 'id' | 'createdAt' | 'updatedAt'>): Promise<LabResponsibility>;
    update(id: number, data: Partial<LabResponsibility>): Promise<LabResponsibility>;
    delete(id: number): Promise<void>;
    getResponsibilitiesByUser(userId: number): Promise<LabResponsibility[]>;
    getActiveResponsibility(): Promise<LabResponsibility | null>;
    getResponsibilitiesByDateRange(startDate: Date, endDate: Date): Promise<LabResponsibility[]>;
    startResponsibility(userId: number, userName: string, notes?: string): Promise<LabResponsibility>;
    endResponsibility(id: number, notes?: string): Promise<LabResponsibility>;
    canUserStartResponsibility(userId: number): Promise<boolean>;
    canUserEndResponsibility(userId: number, responsibilityId: number): Promise<boolean>;
}

export class LabResponsibilityService implements ILabResponsibilityService {
    private identityAccess: IdentityAccessModule;

    constructor(
        private labResponsibilityRepo: ILabResponsibilityRepository,
        private userRepo: UserRepository,
    ) {
        this.identityAccess = createIdentityAccessModule();
    }

    async findById(id: number): Promise<LabResponsibility | null> {
        return await this.labResponsibilityRepo.findById(id);
    }

    async findAll(): Promise<LabResponsibility[]> {
        return await this.labResponsibilityRepo.findAll();
    }

    async create(data: Omit<LabResponsibility, 'id' | 'createdAt' | 'updatedAt'>): Promise<LabResponsibility> {
        const user = await this.userRepo.findById(data.userId);
        if (!user) {
            throw new Error("Usuário não encontrado");
        }

        const canStart = await this.canUserStartResponsibility(data.userId);
        if (!canStart) {
            throw new Error("Usuário não tem permissão para iniciar responsabilidades");
        }

        const activeResponsibility = await this.labResponsibilityRepo.findActiveResponsibility();
        if (activeResponsibility) {
            throw new Error("Já existe uma responsabilidade ativa. Finalize a responsabilidade atual antes de iniciar uma nova.");
        }

        const labResponsibility = LabResponsibility.create(data);
        return await this.labResponsibilityRepo.create(labResponsibility);
    }

    async update(id: number, data: Partial<LabResponsibility>): Promise<LabResponsibility> {
        const existingResponsibility = await this.labResponsibilityRepo.findById(id);
        if (!existingResponsibility) {
            throw new Error("Responsabilidade não encontrada");
        }

        if (data.notes !== undefined) {
            existingResponsibility.updateNotes(data.notes!);
        }
        return await this.labResponsibilityRepo.update(existingResponsibility);
    }

    async delete(id: number): Promise<void> {
        const existingResponsibility = await this.labResponsibilityRepo.findById(id);
        if (!existingResponsibility) {
            throw new Error("Responsabilidade não encontrada");
        }

        await this.labResponsibilityRepo.delete(id);
    }

    async getResponsibilitiesByUser(userId: number): Promise<LabResponsibility[]> {
        return await this.labResponsibilityRepo.findByUserId(userId);
    }

    async getActiveResponsibility(): Promise<LabResponsibility | null> {
        return await this.labResponsibilityRepo.findActiveResponsibility();
    }

    async getResponsibilitiesByDateRange(startDate: Date, endDate: Date): Promise<LabResponsibility[]> {
        return await this.labResponsibilityRepo.findByDateRange(startDate, endDate);
    }

    async startResponsibility(userId: number, userName: string, notes?: string): Promise<LabResponsibility> {
        return await this.create({
            userId,
            userName,
            startTime: new Date(),
            endTime: null,
            notes: notes || null
        });
    }

    async endResponsibility(id: number, notes?: string): Promise<LabResponsibility> {
        const existingResponsibility = await this.labResponsibilityRepo.findById(id);
        if (!existingResponsibility) {
            throw new Error("Responsabilidade não encontrada");
        }

        if (!existingResponsibility.isActive()) {
            throw new Error("Responsabilidade já foi finalizada");
        }

        existingResponsibility.endResponsibility(notes);
        return await this.labResponsibilityRepo.update(existingResponsibility);
    }

    async canUserStartResponsibility(userId: number): Promise<boolean> {
        const user = await this.userRepo.findById(userId);
        if (!user) return false;

        const hasPermission = this.identityAccess.hasAnyRole(user.roles, ['COORDENADOR', 'GERENTE']);

        return hasPermission;
    }

    async canUserEndResponsibility(userId: number, responsibilityId: number): Promise<boolean> {
        const user = await this.userRepo.findById(userId);
        if (!user) return false;

        const responsibility = await this.labResponsibilityRepo.findById(responsibilityId);
        if (!responsibility) return false;

        if (responsibility.userId === userId) return true;

        const hasAdminRole = this.identityAccess.hasAnyRole(user.roles, ['COORDENADOR', 'GERENTE', 'LABORATORISTA']);

        return hasAdminRole;
    }
}
