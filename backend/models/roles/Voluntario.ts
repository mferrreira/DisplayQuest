import { User, BaseUser } from '../user/User';

export class Voluntario extends User {
    constructor(baseUser: BaseUser) {
        super(baseUser);
        if (!this.hasRole('VOLUNTARIO')) {
            this.addRole('VOLUNTARIO');
        }
    }

    getRoleDisplayName(): string {
        return 'Voluntário';
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
        return false;
    }

    canManageLaboratory(): boolean {
        return false;
    }

    canApproveUsers(): boolean {
        return false;
    }

    canApprovePurchases(): boolean {
        return false;
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
        return false;
    }

    getRoleSpecificPermissions(): string[] {
        return [
            'complete_public_tasks',
            'create_issues',
            'view_public_projects',
            'participate_in_activities',
            'earn_points',
            'view_leaderboard',
            'access_volunteer_resources',
            'join_projects'
        ];
    }

    canViewPublicProjects(): boolean {
        return true;
    }

    canParticipateInActivities(): boolean {
        return true;
    }

    canEarnPoints(): boolean {
        return true;
    }

    canViewLeaderboard(): boolean {
        return true;
    }

    canAccessVolunteerResources(): boolean {
        return true;
    }

    canJoinProjects(): boolean {
        return true;
    }

    canViewVolunteerDashboard(): boolean {
        return true;
    }

    canTrackVolunteerHours(): boolean {
        return true;
    }

    canViewVolunteerAchievements(): boolean {
        return true;
    }

    getRolePriority(): number {
        return 7;
    }

    getRoleColor(): string {
        return '#16A34A';
    }

    getRoleIcon(): string {
        return '🙋‍♂️';
    }
}
