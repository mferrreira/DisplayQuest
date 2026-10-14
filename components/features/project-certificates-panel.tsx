"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Download, Loader2 } from "lucide-react"
import { useToast } from "@/contexts/use-toast"
import { useAuth } from "@/contexts/auth-context"
import { monthNameLong, previousMonth } from "@/backend/domain"
import { listProjectMembers, type ProjectMember } from "@/lib/api/project-members"
import {
  certificateFileUrl,
  generateCertificate,
  listCertificates,
  type ProjectCertificate,
} from "@/lib/api/project-certificates"
import { todayDateOnly } from "@/lib/date-only"

/**
 * ProjectCertificatesPanel — atestados de frequência do projeto (V5-10b, DEC-75/170/171).
 *
 * O painel do detalhe do projeto, ao lado do de relatórios técnicos — o dono pediu a
 * geração aqui ("ou ter a opção de gerar no dialog dos detalhes de projeto"). A leitura da
 * lista é a do autenticado e é SÓ METADADO: o CPF mora apenas no PDF, que sai pela rota
 * gateada (DEC-171). Quem gera é a própria pessoa OU a gestão do projeto — a tela mostra o
 * botão para os dois casos e o servidor decide de verdade (o 403 chega na frase do use case).
 *
 * O mês de referência é `AAAA-MM` e o default é o ANTERIOR ao de hoje (DEC-171): o corpo
 * do oficial atesta frequência integral durante o mês, e mês em curso não pode ser atestado
 * como integral. Regenerar sobrescreve o mesmo PDF (DEC-170) — por isso o botão de quem já
 * tem atestado no mês é "Regenerar".
 */

function monthKey(civilDay: string): string {
  return civilDay.slice(0, 7)
}

export function ProjectCertificatesPanel({
  projectId,
  canManage,
}: {
  projectId: number
  canManage: boolean
}) {
  const { toast } = useToast()
  const { user } = useAuth()
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [certificates, setCertificates] = useState<Map<string, ProjectCertificate>>(new Map())
  const [month, setMonth] = useState(() => previousMonth(todayDateOnly()))
  const [loading, setLoading] = useState(true)
  const [generatingUserId, setGeneratingUserId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [memberRows, certificateRows] = await Promise.all([
        listProjectMembers(projectId).catch(() => []),
        listCertificates(projectId),
      ])
      setMembers(memberRows)
      setCertificates(
        new Map(certificateRows.map((certificate) => [`${certificate.userId}:${certificate.month}`, certificate])),
      )
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao carregar atestados",
      })
    } finally {
      setLoading(false)
    }
  }, [projectId, toast])

  useEffect(() => {
    void load()
  }, [load])

  // Só membro ATIVO entra na conta: sair do projeto apaga o vínculo, e o atestado é do
  // vínculo ativo (DEC-149).
  const activeMembers = useMemo(
    () => members.filter((member) => member.situacao === "ATIVO"),
    [members],
  )

  async function handleGenerate(member: ProjectMember) {
    setGeneratingUserId(member.userId)
    try {
      const certificate = await generateCertificate(projectId, { userId: member.userId, month })
      setCertificates((current) => new Map(current).set(`${certificate.userId}:${certificate.month}`, certificate))
      toast({
        title: "Atestado gerado",
        description: `${member.userName ?? "Membro"} — ${monthNameLong(certificate.month)}`,
      })
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao gerar atestado",
      })
    } finally {
      setGeneratingUserId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Atestados de frequência</CardTitle>
        <CardDescription>
          Um PDF oficial por membro ativo e mês de referência — regenerar sobrescreve.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="certificate-month" className="text-sm">
            Mês de referência
          </Label>
          <input
            id="certificate-month"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : activeMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            O projeto não tem membros ativos — o atestado é do vínculo ativo.
          </p>
        ) : (
          <ul className="space-y-2">
            {activeMembers.map((member) => {
              const certificate = certificates.get(`${member.userId}:${month}`)
              const canGenerate = canManage || member.userId === user?.id
              return (
                <li key={member.userId} className="flex items-center justify-between gap-2">
                  <span className="text-sm">{member.userName ?? `Usuário ${member.userId}`}</span>
                  <span className="flex items-center gap-2">
                    {certificate && (
                      <a
                        href={certificateFileUrl(projectId, certificate.id)}
                        download={certificate.fileName}
                        className="inline-flex items-center gap-1 text-sm text-primary underline"
                      >
                        <Download className="h-4 w-4" />
                        Baixar
                      </a>
                    )}
                    {canGenerate && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={generatingUserId !== null}
                        aria-label={
                          certificate
                            ? `Regenerar atestado de ${member.userName ?? `usuário ${member.userId}`}`
                            : `Gerar atestado de ${member.userName ?? `usuário ${member.userId}`}`
                        }
                        onClick={() => handleGenerate(member)}
                      >
                        {generatingUserId === member.userId && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {certificate ? "Regenerar" : "Gerar atestado"}
                      </Button>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
