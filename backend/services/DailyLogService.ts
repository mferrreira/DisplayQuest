import { DailyLogRepository } from '../repositories/DailyLogRepository';
import { DailyLog } from '../models/DailyLog';

export class DailyLogService {
    constructor(private repo: DailyLogRepository) {}

    async findById(id: number): Promise<DailyLog | null> {
        return await this.repo.findById(id);
    }

    async findAll(): Promise<DailyLog[]> {
        return await this.repo.findAll();
    }

    async create(data: any): Promise<DailyLog> {
        const user = await this.repo.findUserById(data.userId);
        if (!user) {
            throw new Error("Usuário não encontrado");
        }

        if (!data.userId || !data.date) {
            throw new Error("userId e date são obrigatórios");
        }

        const dailyLog = DailyLog.create({
            userId: data.userId,
            projectId: data.projectId || null,
            date: new Date(data.date),
            note: data.note || null,
            workSessionId: data.workSessionId || null
        });

        if (!dailyLog.isValid()) {
            throw new Error("Dados inválidos para o log diário");
        }

        const createdLog = await this.repo.create(dailyLog);

        return createdLog;
    }

    async update(id: number, data: Partial<DailyLog>): Promise<DailyLog> {
        const currentLog = await this.repo.findById(id);
        if (!currentLog) {
            throw new Error("Log diário não encontrado");
        }

        Object.assign(currentLog, data);

        if (!currentLog.isValid()) {
            throw new Error("Dados inválidos para atualização");
        }

        const updatedLog = await this.repo.update(currentLog);

        return updatedLog;
    }

    async delete(id: number): Promise<void> {
        const log = await this.repo.findById(id);
        if (!log) {
            throw new Error("Log diário não encontrado");
        }

        await this.repo.delete(id);
    }

    async findByUserId(userId: number): Promise<DailyLog[]> {
        return await this.repo.findByUserId(userId);
    }

    async findByProjectId(projectId: number): Promise<DailyLog[]> {
        return await this.repo.findByProjectId(projectId);
    }

    async findByWorkSessionId(workSessionId: number): Promise<DailyLog | null> {
        return await this.repo.findByWorkSessionId(workSessionId);
    }

    async findByDateRange(userId: number, startDate: Date, endDate: Date): Promise<DailyLog[]> {
        return await this.repo.findByDateRange(userId, startDate, endDate);
    }

    async findByDate(userId: number, date: Date): Promise<DailyLog[]> {
        return await this.repo.findByDate(userId, date);
    }

    async createFromWorkSession(workSessionData: any): Promise<DailyLog> {

        const dailyLogData = {
            userId: workSessionData.userId,
            projectId: workSessionData.projectId || null,
            date: new Date(),
            note: this.generateNoteFromWorkSession(workSessionData),
            workSessionId: workSessionData.id
        };

        return await this.create(dailyLogData);
    }

    private generateNoteFromWorkSession(workSessionData: any): string {
        const duration = workSessionData.duration ? 
            `${Math.floor(workSessionData.duration / 60)} minutos` : 
            'duração não calculada';
        
        const activity = workSessionData.activity ? 
            `Atividade: ${workSessionData.activity}` : 
            '';
        
        const location = workSessionData.location ? 
            `Local: ${workSessionData.location}` : 
            '';

        return [
            `Sessão de trabalho finalizada - ${duration}`,
            activity,
            location
        ].filter(Boolean).join('\n');
    }

    async getWeeklySummary(userId: number, weekStart: Date, weekEnd: Date): Promise<{
        totalLogs: number;
        logs: DailyLog[];
        summary: string;
    }> {
        const logs = await this.findByDateRange(userId, weekStart, weekEnd);
        
        let summary = "";
        if (logs.length > 0) {
            const projects = [...new Set(logs.map(log => log.projectId).filter(Boolean))];
            summary = `Total de ${logs.length} registros na semana. `;
            if (projects.length > 0) {
                summary += `Projetos envolvidos: ${projects.length}.`;
            }
        } else {
            summary = "Nenhum registro encontrado para esta semana.";
        }

        return {
            totalLogs: logs.length,
            logs,
            summary
        };
    }
}
