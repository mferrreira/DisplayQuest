"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Plus } from "lucide-react"
import { IssueManagement } from "@/components/features/issue-management"
import { IssueForm } from "@/components/forms/issue-form"

export function IssuesTab() {
  const [showIssueForm, setShowIssueForm] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setShowIssueForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Reclamação
        </Button>
      </div>

      <IssueManagement />

      <Dialog open={showIssueForm} onOpenChange={setShowIssueForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reportar Nova Reclamação</DialogTitle>
          </DialogHeader>
          <IssueForm
            onSuccess={() => setShowIssueForm(false)}
            onCancel={() => setShowIssueForm(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
