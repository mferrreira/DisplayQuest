"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Download, Loader2 } from "lucide-react"
import { useToast } from "@/contexts/use-toast"
import { TECHNICAL_REPORT_TYPES, type TechnicalReportType } from "@/backend/domain"
import {
  draftTechnicalReport,
  generateTechnicalReports,
  listTechnicalReports,
  saveTechnicalReport,
  technicalReportFileUrl,
  type GeneratedTechnicalReportFile,
  type TechnicalReport,
} from "@/lib/api/project-technical-reports"

/**
 * V5-9 (DEC-70/139/167/168) — relatórios técnicos do projeto.
 *
 * Um texto editável por par (projeto × tipo, DEC-70). A leitura é a do autenticado; a
 * edição e a geração aparecem só para quem o diálogo reconhece como gestão/líder
 * (DEC-139) e o servidor decide de verdade — o 403 volta na frase do use case. Os
 * tokens de tipo vêm do domínio (`TECHNICAL_REPORT_TYPES`): a tela não tem vocabulário
 * próprio (lição DEC-96), só os rótulos de exibição.
 *
 * V5-9b: "Gerar DOCX" dispara a geração lote (um documento oficial por membro ATIVO,
 * DEC-139) e a tela mostra o download de cada arquivo gerado nesta sessão. DEC-173: o
 * botão não exige texto salvo — sem texto o documento sai pré-preenchido com as tabelas
 * em branco. DEC-180 (conserto pedido pelo dono): quando o texto em edição difere do
 * salvo, o botão salva antes de gerar — o documento sai do que a pessoa vê, e o rascunho
 * de IA aplicado no editor não fica mais de fora do documento.
 *
 * V5-9c: "Rascunhar com IA" pede o texto às três fontes do plano e o aplica no editor
 * SEM salvar (salvar é decisão humana). O rascunho não atropela edição em andamento:
 * texto digitado e não salvo é trabalho do humano e é preservado com aviso.
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
  const [generatingType, setGeneratingType] = useState<string | null>(null)
  const [draftingType, setDraftingType] = useState<string | null>(null)
  // Arquivos gerados nesta sessão (a chave do bucket é estável e regenerar sobrescreve;
  // não há listagem de bucket na seam, então a tela anuncia o que acabou de gerar).
  const [generated, setGenerated] = useState<Record<string, GeneratedTechnicalReportFile[]>>({})

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

  async function handleGenerate(type: TechnicalReportType) {
    setGeneratingType(type)
    try {
      // DEC-180 (conserto pedido pelo dono: "o texto, mesmo gerado pela IA, não tá sendo
      // injetado no documento"): o servidor gera do conteúdo SALVO, e o rascunho de IA entra
      // no editor sem salvar — quem rascunhava e gerava recebia tabelas em branco. O botão
      // agora salva o texto em edição antes de gerar quando ele difere do salvo: o documento
      // sai do que a pessoa vê. Editor igual ao salvo (ou vazio sem linha) não escreve nada.
      const editor = drafts[type] ?? ""
      const savedContent = reports.get(type)?.content ?? ""
      if (editor !== savedContent) {
        const saved = await saveTechnicalReport(projectId, { type, content: editor })
        setReports((current) => new Map(current).set(type, saved))
      }
      const files = await generateTechnicalReports(projectId, type)
      setGenerated((current) => ({ ...current, [type]: files }))
      toast({
        title: "Documentos gerados",
        description: `${files.length} arquivo(s) — um por membro ativo do projeto.`,
      })
    } catch (error) {
      // Rejeição tratada (DEC-85): handler async sem catch derruba o gate (V4-4b).
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao gerar documentos",
        variant: "destructive",
      })
    } finally {
      setGeneratingType(null)
    }
  }

  async function handleDraft(type: TechnicalReportType) {
    setDraftingType(type)
    try {
      const draft = await draftTechnicalReport(projectId, type)
      const current = drafts[type] ?? ""
      const savedContent = reports.get(type)?.content ?? ""
      if (current !== "" && current !== savedContent) {
        // O rascunho não atropela edição em andamento: o texto digitado e não salvo é
        // trabalho do humano, e sobrescrevê-lo em silêncio perderia conteúdo.
        toast({
          title: "Rascunho não aplicado",
          description: "O texto em edição não foi sobrescrito — salve ou limpe antes de rascunhar.",
        })
      } else {
        setDrafts((currentDrafts) => ({ ...currentDrafts, [type]: draft }))
        toast({
          title: "Rascunho criado",
          description: "Revise o texto — nada foi salvo até você clicar em Salvar.",
        })
      }
    } catch (error) {
      // Rejeição tratada (DEC-85).
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao gerar rascunho",
        variant: "destructive",
      })
    } finally {
      setDraftingType(null)
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
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={draftingType !== null}
                      aria-label={`Rascunhar relatório ${label} com IA`}
                      onClick={() => handleDraft(type)}
                    >
                      {draftingType === type && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Rascunhar com IA
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={savingType !== null}
                      title="O texto em edição é salvo antes de gerar; sem texto, o documento sai pré-preenchido com as tabelas em branco"
                      aria-label={`Gerar documentos do relatório ${label}`}
                      onClick={() => handleGenerate(type)}
                    >
                      {generatingType === type && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Gerar DOCX
                    </Button>
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
                  </div>
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
              {saved && generated[type] && generated[type].length > 0 && (
                <ul className="space-y-1" aria-label={`Documentos gerados do relatório ${label}`}>
                  {generated[type].map((file) => (
                    <li key={file.key}>
                      <a
                        href={technicalReportFileUrl(projectId, saved.id, file.userId)}
                        download={file.fileName}
                        className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />
                        {file.memberName}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
