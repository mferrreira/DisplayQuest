import { Card } from "@/components/ui/card";
import { UserWeeklyHoursTable } from "@/components/ui/user-weekly-hours-table";
import React from "react";
import type { WorkSession } from "@/contexts/types";

interface AdminWeeklyHoursTableProps {
  users: any[];
  sessions: WorkSession[];
}

export const AdminWeeklyHoursTable: React.FC<AdminWeeklyHoursTableProps> = ({ users, sessions }) => (
  <Card className="mb-6 border-blue-200 bg-blue-50">
    <UserWeeklyHoursTable users={users} sessions={sessions} />
  </Card>
); 
