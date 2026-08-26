export interface IProject {
    id?: number;
    name: string;
    description?: string | null;
    createdAt: string;
    createdBy: number;
    leaderId?: number | null;
    status: ProjectStatus;
    links?: ProjectLink[] | null;
    memberCount?: number;
    members?: ProjectMemberSummary[];
}

export interface ProjectMemberSummary {
    userId: number;
    roles: string[];
    user?: { id: number; name: string; email: string } | null;
}

export interface ProjectLink {
    label: string;
    url: string;
}

export enum ProjectStatus {
    ACTIVE = 'active',
    COMPLETED = 'completed',
    ARCHIVED = 'archived',
    ON_HOLD = 'on_hold'
}

export class Project {
    public id?: number;
    public name: string;
    public description?: string | null;
    public createdAt: string;
    public createdBy: number;
    public leaderId?: number | null;
    public status: ProjectStatus;
    public links?: ProjectLink[] | null;
    public memberCount?: number;
    public members?: ProjectMemberSummary[];

    constructor(data: IProject) {
        this.id = data.id;
        this.name = data.name;
        this.description = data.description;
        this.createdAt = data.createdAt;
        this.createdBy = data.createdBy;
        this.leaderId = data.leaderId;
        this.status = data.status;
        this.links = data.links;
        this.memberCount = data.memberCount;
        this.members = data.members;
    }

    toJSON(): any {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            createdAt: this.createdAt,
            createdBy: this.createdBy,
            leaderId: this.leaderId,
            status: this.status,
            links: this.links,
            memberCount: this.memberCount,
            members: this.members,
        };
    }

    static fromPrisma(data: any): Project {
        return new Project({
            id: data.id,
            name: data.name,
            description: data.description,
            createdAt: data.createdAt,
            createdBy: data.createdBy,
            leaderId: data.leaderId,
            status: data.status as ProjectStatus,
            links: data.links ? (data.links as unknown as ProjectLink[]) : null,
            memberCount: data._count?.members ?? data.members?.length ?? undefined,
            members: Array.isArray(data.members)
                ? data.members.map((m: any) => ({
                      userId: m.userId,
                      roles: m.roles ?? [],
                      user: m.user ?? null,
                  }))
                : undefined,
        });
    }

    static create(data: Omit<IProject, 'id' | 'createdAt'>): Project {
        return new Project({
            ...data,
            createdAt: new Date().toISOString(),
        });
    }
}
