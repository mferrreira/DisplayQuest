import { User, BaseUser } from '../user/User';

export class Gerente extends User {
    constructor(baseUser: BaseUser) {
        super(baseUser);
        if (!this.hasRole('GERENTE')) {
            this.addRole('GERENTE');
        }
    }

    getRoleDisplayName(): string {
        return 'Gerente';
    }

    canManageUsers(): boolean {
        return true;
    }

    canManageProjects(): boolean {
        return true;
    }

    canManageTasks(): boolean {
        return true;
    }

    canManageRewards(): boolean {
        return true;
    }

    canManageLaboratory(): boolean {
        return false;
    }

    canApproveUsers(): boolean {
        return true;
    }

    canApprovePurchases(): boolean {
        return true;
    }

    canCompletePublicTasks(): boolean {
        return true;
    }

    canCreateIssues(): boolean {
        return true;
    }

    canResolveIssues(): boolean {
        return false;
    }

    canAwardBadges(): boolean {
        return true;
    }

    getRoleSpecificPermissions(): string[] {
        return [
            'manage_users',
            'manage_projects',
            'manage_tasks',
            'manage_rewards',
            'approve_users',
            'approve_purchases',
            'complete_public_tasks',
            'create_issues',
            'award_badges',
            'view_management_dashboard',
            'manage_team_performance',
            'access_reports'
        ];
    }

    canViewManagementDashboard(): boolean {
        return true;
    }

    canManageTeamPerformance(): boolean {
        return true;
    }

    canAccessReports(): boolean {
        return true;
    }

    canManageProjectBudgets(): boolean {
        return true;
    }

    canAssignProjectManagers(): boolean {
        return true;
    }

    canViewFinancialReports(): boolean {
        return true;
    }

    getRolePriority(): number {
        return 2;
    }

    getRoleColor(): string {
        return '#7C3AED';
    }

    getRoleIcon(): string {
        return '👔';
    }
}
