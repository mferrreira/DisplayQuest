import { WeeklyReport } from '../models/WeeklyReport';
import { WeeklyReportRepository, IWeeklyReportRepository } from '../repositories/WeeklyReportRepository';
import { UserRepository } from '../repositories/UserRepository';
import { DailyLogRepository } from '../repositories/DailyLogRepository';
import { createIdentityAccessModule, IdentityAccessModule } from '@/backend/modules/identity-access';

export interface IWeeklyReportService {
  findById(id: number): Promise<WeeklyReport | null>;
  findAll(): Promise<WeeklyReport[]>;
  create(data: Omit<WeeklyReport, 'id' | 'createdAt'>, creatorId: number): Promise<WeeklyReport>;
  update(id: number, data: Partial<WeeklyReport>, userId: number): Promise<WeeklyReport>;
  delete(id: number, userId: number): Promise<void>;
  findByUserId(userId: number): Promise<WeeklyReport[]>;
  findByWeekRange(startDate: Date, endDate: Date): Promise<WeeklyReport[]>;
  findByYear(year: number): Promise<WeeklyReport[]>;
  findByUserAndWeek(userId: number, weekStart: Date, weekEnd: Date): Promise<WeeklyReport | null>;
  findCurrentWeekReports(): Promise<WeeklyReport[]>;
  findPastWeekReports(): Promise<WeeklyReport[]>;
  generateWeeklyReport(userId: number, weekStart: Date, weekEnd: Date): Promise<WeeklyReport>;
  updateReportSummary(id: number, summary: string, userId: number): Promise<WeeklyReport>;
  getReportStatistics(): Promise<any>;
  canUserManageReport(reportId: number, userId: number): Promise<boolean>;
  canUserViewReport(reportId: number, userId: number): Promise<boolean>;
}

export class WeeklyReportService implements IWeeklyReportService {
  private identityAccess: IdentityAccessModule;

  constructor(
    private weeklyReportRepository: IWeeklyReportRepository,
    private userRepository: UserRepository,
    private dailyLogRepository: DailyLogRepository
  ) {
    this.weeklyReportRepository = weeklyReportRepository || new WeeklyReportRepository();
    this.userRepository = userRepository || new UserRepository();
    this.dailyLogRepository = dailyLogRepository || new DailyLogRepository();
    this.identityAccess = createIdentityAccessModule();

  }

  async findById(id: number): Promise<WeeklyReport | null> {
    return await this.weeklyReportRepository.findById(id);
  }

  async findAll(): Promise<WeeklyReport[]> {
    return await this.weeklyReportRepository.findAll();
  }

  async create(data: Partial<WeeklyReport>, creatorId: number): Promise<WeeklyReport> {
    if(!data.userId || !data.weekStart || !data.weekEnd)
      throw new Error('Usuário não identificado!')
    

    const user = await this.userRepository.findById(data.userId);
    if (!user) {
      throw new Error('User not found');
    }

    const existingReport = await this.weeklyReportRepository.findByUserAndWeek(
      data.userId,
      data.weekStart,
      data.weekEnd
    );
    if (existingReport) {
      throw new Error('Weekly report already exists for this week');
    }

    const report = WeeklyReport.create(data);
    return await this.weeklyReportRepository.create(report);
  }

  async update(id: number, data: Partial<WeeklyReport>, userId: number): Promise<WeeklyReport> {
    const existingReport = await this.weeklyReportRepository.findById(id);
    if (!existingReport) {
      throw new Error('Weekly report not found');
    }

    const canManage = await this.canUserManageReport(id, userId);
    if (!canManage) {
      throw new Error('User does not have permission to update this report');
    }

    const updatedReport = new WeeklyReport({
      id: existingReport.id,
      userId: data.userId ?? existingReport.userId,
      userName: data.userName ?? existingReport.userName,
      weekStart: data.weekStart ?? existingReport.weekStart,
      weekEnd: data.weekEnd ?? existingReport.weekEnd,
      totalLogs: data.totalLogs ?? existingReport.totalLogs,
      summary: data.summary ?? existingReport.summary,
      createdAt: existingReport.createdAt
    });

    updatedReport.validate();
    return await this.weeklyReportRepository.update(id, updatedReport);
  }

  async delete(id: number, userId: number): Promise<void> {
    const report = await this.weeklyReportRepository.findById(id);
    if (!report) {
      throw new Error('Weekly report not found');
    }

    const canManage = await this.canUserManageReport(id, userId);
    if (!canManage) {
      throw new Error('User does not have permission to delete this report');
    }

    await this.weeklyReportRepository.delete(id);
  }

  async findByUserId(userId: number): Promise<WeeklyReport[]> {
    return await this.weeklyReportRepository.findByUserId(userId);
  }

  async findByWeekRange(startDate: Date, endDate: Date): Promise<WeeklyReport[]> {
    return await this.weeklyReportRepository.findByWeekRange(startDate, endDate);
  }

  async findByYear(year: number): Promise<WeeklyReport[]> {
    return await this.weeklyReportRepository.findByYear(year);
  }

  async findByUserAndWeek(userId: number, weekStart: Date, weekEnd: Date): Promise<WeeklyReport | null> {
    return await this.weeklyReportRepository.findByUserAndWeek(userId, weekStart, weekEnd);
  }

  async findCurrentWeekReports(): Promise<WeeklyReport[]> {
    return await this.weeklyReportRepository.findCurrentWeekReports();
  }

  async findPastWeekReports(): Promise<WeeklyReport[]> {
    return await this.weeklyReportRepository.findPastWeekReports();
  }

  async generateWeeklyReport(userId: number, weekStart: Date, weekEnd: Date): Promise<WeeklyReport> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const existingReport = await this.weeklyReportRepository.findByUserAndWeek(userId, weekStart, weekEnd);
    if (existingReport) {
      return existingReport;
    }

    const dailyLogs = await this.dailyLogRepository.findByDateRange(userId, weekStart, weekEnd);
    const totalLogs = dailyLogs.length;

    const reportData = {
      userId,
      userName: user.name,
      weekStart,
      weekEnd,
      totalLogs,
      summary: null
    };

    const report = WeeklyReport.create(reportData);
    return await this.weeklyReportRepository.create(report);
  }

  async updateReportSummary(id: number, summary: string, userId: number): Promise<WeeklyReport> {
    const report = await this.weeklyReportRepository.findById(id);
    if (!report) {
      throw new Error('Weekly report not found');
    }

    const canManage = await this.canUserManageReport(id, userId);
    if (!canManage) {
      throw new Error('User does not have permission to update this report');
    }

    report.updateSummary(summary);
    return await this.weeklyReportRepository.update(id, report);
  }

  async getReportStatistics(): Promise<any> {
    const allReports = await this.weeklyReportRepository.findAll();
    const currentYear = new Date().getFullYear();
    const currentYearReports = await this.weeklyReportRepository.findByYear(currentYear);

    const totalReports = allReports.length;
    const currentYearTotal = currentYearReports.length;
    const averageLogsPerReport = totalReports > 0 
      ? allReports.reduce((sum, report) => sum + report.totalLogs, 0) / totalReports 
      : 0;

    const reportsWithSummary = allReports.filter(report => report.summary && report.summary.trim().length > 0).length;
    const summaryRate = totalReports > 0 ? (reportsWithSummary / totalReports) * 100 : 0;

    return {
      totalReports,
      currentYearTotal,
      averageLogsPerReport: Math.round(averageLogsPerReport * 100) / 100,
      reportsWithSummary,
      summaryRate: Math.round(summaryRate * 100) / 100
    };
  }

  async canUserManageReport(reportId: number, userId: number): Promise<boolean> {
    const report = await this.weeklyReportRepository.findById(reportId);
    if (!report) return false;

    const user = await this.userRepository.findById(userId);
    if (!user) return false;

    if (this.identityAccess.hasPermission(user.roles, 'MANAGE_USERS')) {
      return true;
    }

    if (report.userId === userId) {
      return true;
    }

    return false;
  }

  async canUserViewReport(reportId: number, userId: number): Promise<boolean> {
    const report = await this.weeklyReportRepository.findById(reportId);
    if (!report) return false;

    const user = await this.userRepository.findById(userId);
    if (!user) return false;

    if (this.identityAccess.hasPermission(user.roles, 'MANAGE_USERS')) {
      return true;
    }

    if (report.userId === userId) {
      return true;
    }

    if (this.identityAccess.hasAnyRole(user.roles, ['LABORATORISTA'])) {
      return true;
    }

    return false;
  }
}
