import { prisma } from '@/lib/database/prisma';
import { Issue, IssueStatus, IssuePriority } from '../models/Issue';

export interface IIssueRepository {
    findById(id: number): Promise<Issue | null>;
    findAll(): Promise<Issue[]>;
    findByStatus(status: IssueStatus): Promise<Issue[]>;
    findByPriority(priority: IssuePriority): Promise<Issue[]>;
    findByReporter(reporterId: number): Promise<Issue[]>;
    findByAssignee(assigneeId: number): Promise<Issue[]>;
    findByCategory(category: string): Promise<Issue[]>;
    create(issue: Issue): Promise<Issue>;
    update(issue: Issue): Promise<Issue>;
    delete(id: number): Promise<void>;
    findOpen(): Promise<Issue[]>;
    findInProgress(): Promise<Issue[]>;
    findResolved(): Promise<Issue[]>;
    findClosed(): Promise<Issue[]>;
    findOverdue(): Promise<Issue[]>;
    findRecent(limit?: number): Promise<Issue[]>;
    getIssueStatistics(): Promise<{
        total: number;
        open: number;
        inProgress: number;
        resolved: number;
        closed: number;
        overdue: number;
        averageResolutionTime: number;
    }>;
}

export class IssueRepository implements IIssueRepository {
    async findById(id: number): Promise<Issue | null> {
        const issue = await prisma.issues.findUnique({
            where: { id },
            include: {
                reporter: true,
                assignee: true
            }
        });

        return issue ? Issue.fromPrisma(issue) : null;
    }

    async findAll(): Promise<Issue[]> {
        const issues = await prisma.issues.findMany({
            include: {
                reporter: true,
                assignee: true
            },
            orderBy: { createdAt: 'desc' }
        });

        return issues.map(issue => Issue.fromPrisma(issue));
    }

    async findByStatus(status: IssueStatus): Promise<Issue[]> {
        const issues = await prisma.issues.findMany({
            where: { status },
            include: {
                reporter: true,
                assignee: true
            },
            orderBy: { createdAt: 'desc' }
        });

        return issues.map(issue => Issue.fromPrisma(issue));
    }

    async findByPriority(priority: IssuePriority): Promise<Issue[]> {
        const issues = await prisma.issues.findMany({
            where: { priority },
            include: {
                reporter: true,
                assignee: true
            },
            orderBy: { createdAt: 'desc' }
        });

        return issues.map(issue => Issue.fromPrisma(issue));
    }

    async findByReporter(reporterId: number): Promise<Issue[]> {
        const issues = await prisma.issues.findMany({
            where: { reporterId },
            include: {
                reporter: true,
                assignee: true
            },
            orderBy: { createdAt: 'desc' }
        });

        return issues.map(issue => Issue.fromPrisma(issue));
    }

    async findByAssignee(assigneeId: number): Promise<Issue[]> {
        const issues = await prisma.issues.findMany({
            where: { assigneeId },
            include: {
                reporter: true,
                assignee: true
            },
            orderBy: { createdAt: 'desc' }
        });

        return issues.map(issue => Issue.fromPrisma(issue));
    }

    async findByCategory(category: string): Promise<Issue[]> {
        const issues = await prisma.issues.findMany({
            where: { category },
            include: {
                reporter: true,
                assignee: true
            },
            orderBy: { createdAt: 'desc' }
        });

        return issues.map(issue => Issue.fromPrisma(issue));
    }

    async create(issue: Issue): Promise<Issue> {
        const data = issue.toPrisma();
        const created = await prisma.issues.create({
            data,
            include: {
                reporter: true,
                assignee: true
            }
        });

        return Issue.fromPrisma(created);
    }

    async update(issue: Issue): Promise<Issue> {
        if (!issue.id) {
            throw new Error("Issue ID é obrigatório para atualização");
        }

        const data = issue.toPrisma();
        const updated = await prisma.issues.update({
            where: { id: issue.id },
            data: {
                ...data,
                updatedAt: new Date()
            },
            include: {
                reporter: true,
                assignee: true
            }
        });

        return Issue.fromPrisma(updated);
    }

    async delete(id: number): Promise<void> {
        await prisma.issues.delete({
            where: { id }
        });
    }

    async findOpen(): Promise<Issue[]> {
        return await this.findByStatus('open');
    }

    async findInProgress(): Promise<Issue[]> {
        return await this.findByStatus('in_progress');
    }

    async findResolved(): Promise<Issue[]> {
        return await this.findByStatus('resolved');
    }

    async findClosed(): Promise<Issue[]> {
        return await this.findByStatus('closed');
    }

    async findOverdue(): Promise<Issue[]> {
        const allIssues = await this.findAll();
        return allIssues.filter(issue => this.isIssueOverdue(issue));
    }

    async findRecent(limit: number = 10): Promise<Issue[]> {
        const issues = await prisma.issues.findMany({
            include: {
                reporter: true,
                assignee: true
            },
            orderBy: { createdAt: 'desc' },
            take: limit
        });

        return issues.map(issue => Issue.fromPrisma(issue));
    }

    async getIssueStatistics(): Promise<{
        total: number;
        open: number;
        inProgress: number;
        resolved: number;
        closed: number;
        overdue: number;
        averageResolutionTime: number;
    }> {
        const allIssues = await this.findAll();
        
        const total = allIssues.length;
        const open = allIssues.filter(i => i.status === 'open').length;
        const inProgress = allIssues.filter(i => i.status === 'in_progress').length;
        const resolved = allIssues.filter(i => i.status === 'resolved').length;
        const closed = allIssues.filter(i => i.status === 'closed').length;
        const overdue = allIssues.filter(i => this.isIssueOverdue(i)).length;

        // Calculate average resolution time
        const resolvedIssues = allIssues.filter(i => i.resolvedAt && i.createdAt);
        const totalResolutionTime = resolvedIssues.reduce((sum, issue) => {
            const resolutionTime = this.getIssueResolutionTimeInDays(issue);
            return sum + (resolutionTime || 0);
        }, 0);
        const averageResolutionTime = resolvedIssues.length > 0 
            ? totalResolutionTime / resolvedIssues.length 
            : 0;

        return {
            total,
            open,
            inProgress,
            resolved,
            closed,
            overdue,
            averageResolutionTime: Math.round(averageResolutionTime)
        };
    }

    private getIssueResolutionTimeInDays(issue: Issue): number | null {
        if (!issue.resolvedAt || !issue.createdAt) return null;
        return Math.floor((issue.resolvedAt.getTime() - issue.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    }

    private getIssueAgeInDays(issue: Issue): number {
        if (!issue.createdAt) return 0;
        return Math.floor((Date.now() - issue.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    }

    private isIssueOverdue(issue: Issue): boolean {
        if (issue.status === 'resolved' || issue.status === 'closed') return false;
        const thresholds: Record<IssuePriority, number> = {
            low: 30,
            medium: 14,
            high: 7,
            urgent: 2,
        };
        return this.getIssueAgeInDays(issue) > thresholds[issue.priority];
    }
}
