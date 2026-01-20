import { User, BaseUser } from '../user/User';

export class Coordenador extends User {
    constructor(baseUser: BaseUser) {
        super(baseUser);
        if (!this.hasRole('COORDENADOR')) {
            this.addRole('COORDENADOR');
        }
    }

    getRoleDisplayName(): string {
        return 'Coordenador';
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
        return true;
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
        return true;
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
            'manage_laboratory',
            'approve_users',
            'approve_purchases',
            'complete_public_tasks',
            'create_issues',
            'resolve_issues',
            'award_badges',
            'view_all_data',
            'manage_system_settings',
            'access_admin_panel'
        ];
    }

    canAccessAdminPanel(): boolean {
        return true;
    }

    canManageSystemSettings(): boolean {
        return true;
    }

    canViewAllData(): boolean {
        return true;
    }

    canManageAllProjects(): boolean {
        return true;
    }

    canManageAllUsers(): boolean {
        return true;
    }

    canOverridePermissions(): boolean {
        return true;
    }

    getRolePriority(): number {
        return 1;
    }

    getRoleColor(): string {
        return '#DC2626';
    }

    getRoleIcon(): string {
        return '👑';
    }
}
