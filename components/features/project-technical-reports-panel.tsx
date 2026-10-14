"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2 } from "lucide-react"
import { useToast } from "@/contexts/use-toast"
import { TECHNICAL_REPORT_TYPES, type TechnicalReportType } from "@/backend/domain"
import {
  listTechnicalReports,
  saveTechnicalReport,
  type TechnicalReport,
} from "@/lib/api/project-technical-reports"

/**
 * V5-9 (DEC-70/139/167) — relatórios técnicos do projeto.
 *
 * Um texto editável por par (projeto × tipo, DEC-70). A leitura é a do autenticado; a
 * edição aparece só para quem o diálogo reconhece como gestão/líder (DEC-139) e o
 * servidor decide de verdade — o 403 volta na frase do use case. Os tokens de tipo vêm
 * do domínio (`TECHNICAL_REPORT_TYPES`): a tela não tem vocabulário próprio (lição
 * DEC-96), só os rótulos de exibição.
 *
 * A geração do DOCX por membro é o passo seguinte do plano (V5-9b); este painel é o
 * texto que ela preenche.
 */

const TYPE_LABELS: Record<TechnicalReportType, string> = {
  parcial: "Parcial",
  "tecnico-final": "Técnico-final",
  final: "Final",
}

interface ProjectTechnicalReportsPanelProps {
  projectId: number
  canManage: boolean
}

export function ProjectTechnicalReportsPanel({
  projectId,
  canManage,
}: ProjectTechnicalReportsPanelProps) {
  const { toast } = useToast()
  const [reports, setReports] = useState<Map<string, TechnicalReport>>(new Map())
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingType, setSavingType] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await listTechnicalReports(projectId)
      const byType = new Map(rows.map((row) => [row.type, row]))
      setReports(byType)
      setDrafts((current) => {
        const next: Record<string, string> = { ...current }
        for (const type of TECHNICAL_REPORT_TYPES) {
          next[type] = byType.get(type)?.content ?? ""
        }
        return next
      })
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao carregar relatórios",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [projectId, toast])

  useEffect(() => {
    load()
  }, [load])

  async function handleSave(type: TechnicalReportType) {
    setSavingType(type)
    try {
      const saved = await saveTechnicalReport(projectId, {
        type,
        content: drafts[type] ?? "",
      })
      setReports((current) => new Map(current).set(type, saved))
      toast({
        title: "Relatório salvo",
        description: `Texto do relatório ${TYPE_LABELS[type]} atualizado.`,
      })
    } catch (error) {
      // Rejeição tratada: handler async sem catch devolve promise rejeitada que o Vitest
      // reporta como Unhandled Rejection e derruba o gate (medido no V4-4b, DEC-85).
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao salvar relatório",
        variant: "destructive",
      })
    } finally {
      setSavingType(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Relatórios técnicos
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription>
          Um texto editável por tipo — Parcial, Técnico-final e Final. O líder e a gestão do
          projeto editam; o documento oficial é gerado a partir deste texto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {TECHNICAL_REPORT_TYPES.map((type) => {
          const label = TYPE_LABELS[type]
          const saved = reports.get(type)
          return (
            <div key={type} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">Relatório {label}</Label>
                {canManage && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={savingType !== null}
                    aria-label={`Salvar relatório ${label}`}
                    onClick={() => handleSave(type)}
                  >
                    {savingType === type && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar
                  </Button>
                )}
              </div>
              <Textarea
                rows={4}
                aria-label={`Texto do relatório ${label}`}
                placeholder="Nenhum texto salvo."
                value={drafts[type] ?? ""}
                disabled={!canManage || savingType !== null}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [type]: event.target.value }))
                }
              />
              {saved && (
                <p className="text-xs text-muted-foreground">
                  Atualizado em {new Date(saved.updatedAt).toLocaleDateString("pt-BR")}
                </p>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
