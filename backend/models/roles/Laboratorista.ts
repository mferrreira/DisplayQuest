import { User, BaseUser } from '../user/User';

export class Laboratorista extends User {
    constructor(baseUser: BaseUser) {
        super(baseUser);
        if (!this.hasRole('LABORATORISTA')) {
            this.addRole('LABORATORISTA');
        }
    }

    getRoleDisplayName(): string {
        return 'Laboratorista';
    }

    canManageUsers(): boolean {
        return false;
    }

    canManageProjects(): boolean {
        return false;
    }

    canManageTasks(): boolean {
        return false;
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
        return false;
    }

    getRoleSpecificPermissions(): string[] {
        return [
            'manage_rewards',
            'manage_laboratory',
            'approve_users',
            'approve_purchases',
            'complete_public_tasks',
            'create_issues',
            'resolve_issues',
            'manage_lab_schedule',
            'manage_lab_equipment',
            'view_lab_reports',
            'assign_lab_responsibilities'
        ];
    }

    canManageLabSchedule(): boolean {
        return true;
    }

    canManageLabEquipment(): boolean {
        return true;
    }

    canViewLabReports(): boolean {
        return true;
    }

    canAssignLabResponsibilities(): boolean {
        return true;
    }

    canManageLabEvents(): boolean {
        return true;
    }

    canAccessLabData(): boolean {
        return true;
    }

    canManageLabInventory(): boolean {
        return true;
    }

    canViewAllLabData(): boolean {
        return true;
    }

    getRolePriority(): number {
        return 3;
    }

    getRoleColor(): string {
        return '#059669';
    }

    getRoleIcon(): string {
        return '🔬';
    }
}
