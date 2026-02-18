export interface IIssue {
    id?: number;
    title: string;
    description: string;
    status: IssueStatus;
    priority: IssuePriority;
    category?: string | null;
    reporterId: number;
    assigneeId?: number | null;
    createdAt?: Date;
    updatedAt?: Date;
    resolvedAt?: Date | null;
}

export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type IssuePriority = 'low' | 'medium' | 'high' | 'urgent';

export class Issue {
    public id?: number;
    public title: string;
    public description: string;
    public status: IssueStatus;
    public priority: IssuePriority;
    public category?: string | null;
    public reporterId: number;
    public assigneeId?: number | null;
    public createdAt?: Date;
    public updatedAt?: Date;
    public resolvedAt?: Date | null;

    constructor(data: IIssue) {
        this.id = data.id;
        this.title = data.title;
        this.description = data.description;
        this.status = data.status;
        this.priority = data.priority;
        this.category = data.category;
        this.reporterId = data.reporterId;
        this.assigneeId = data.assigneeId;
        this.createdAt = data.createdAt;
        this.updatedAt = data.updatedAt;
        this.resolvedAt = data.resolvedAt;
    }

    static create(data: Omit<IIssue, 'id' | 'createdAt' | 'updatedAt' | 'resolvedAt'>): Issue {
        if (!data.title || !data.title.trim()) throw new Error('Título do issue é obrigatório');
        if (!data.description || !data.description.trim()) throw new Error('Descrição do issue é obrigatória');
        return new Issue({
            ...data,
            title: data.title.trim(),
            description: data.description.trim(),
            status: 'open',
            createdAt: new Date(),
            updatedAt: new Date(),
            resolvedAt: null,
        });
    }

    static fromPrisma(data: any): Issue {
        return new Issue({
            id: data.id,
            title: data.title,
            description: data.description,
            status: data.status as IssueStatus,
            priority: data.priority as IssuePriority,
            category: data.category,
            reporterId: data.reporterId,
            assigneeId: data.assigneeId,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            resolvedAt: data.resolvedAt,
        });
    }

    toPrisma(): any {
        return {
            id: this.id,
            title: this.title,
            description: this.description,
            status: this.status,
            priority: this.priority,
            category: this.category,
            reporterId: this.reporterId,
            assigneeId: this.assigneeId,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            resolvedAt: this.resolvedAt,
        };
    }

    toJSON(): any {
        return {
            id: this.id,
            title: this.title,
            description: this.description,
            status: this.status,
            priority: this.priority,
            category: this.category,
            reporterId: this.reporterId,
            assigneeId: this.assigneeId,
            createdAt: this.createdAt?.toISOString(),
            updatedAt: this.updatedAt?.toISOString(),
            resolvedAt: this.resolvedAt?.toISOString(),
        };
    }
}
