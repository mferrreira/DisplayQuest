"use client"

/**
 * plan-v24 S01 — o formulário "Esqueci minha senha" (rota pública, sem sessão).
 *
 * RHF+Zod como o cadastro (constitution §2): os rótulos que a tela mostra são os que os
 * testes procuram, e as mensagens de validação são as MESMAS do formulário de cadastro.
 * Depois do envio a tela mostra a mensagem neutra congelada no domínio — ela não diz se o
 * email existe (ADR-002, INV2). O binário da rota responde; a tela repete a resposta, não
 * reimplementa a frase.
 */
import Link from "next/link"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AlertCircle, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { fetchAPI } from "@/contexts/api-client"
import { PASSWORD_RESET_NEUTRAL_MESSAGE } from "@/backend/domain"

const forgotSchema = z.object({
  email: z.string().min(1, "Informe o email").email("Email inválido"),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
})

type ForgotFormValues = z.infer<typeof forgotSchema>

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const {
    register: registerField,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotFormValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "", password: "" },
  })

  const onSubmit = async (values: ForgotFormValues) => {
    setError("")

    try {
      const data = await fetchAPI<{ message: string }>("/api/password-reset-requests", {
        method: "POST",
        body: JSON.stringify({ email: values.email.toLowerCase(), password: values.password }),
      })
      setSent(true)
      return data
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar a solicitação")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        {sent ? (
          <CardContent className="pt-6">
            <div className="space-y-4 text-center" role="status">
              <h1 className="text-2xl font-bold">Esqueci minha senha</h1>
              <p className="text-sm">{PASSWORD_RESET_NEUTRAL_MESSAGE}</p>
              <Link href="/login" className="text-primary underline text-sm">
                Voltar ao login
              </Link>
            </div>
          </CardContent>
        ) : (
          <>
            <CardHeader className="space-y-1">
              <h1 className="text-2xl font-bold">Esqueci minha senha</h1>
              <CardDescription>
                Informe seu email e a nova senha. A gestão de contas aprova a solicitação.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <Alert variant="destructive" className="mb-4" role="alert">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="nome@exemplo.com"
                    autoComplete="email"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? "email-error" : undefined}
                    {...registerField("email")}
                  />
                  {errors.email ? (
                    <p id="email-error" className="text-sm text-destructive">
                      {errors.email.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Nova senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      className="pr-10"
                      aria-invalid={Boolean(errors.password)}
                      aria-describedby={errors.password ? "password-error" : undefined}
                      {...registerField("password")}
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {errors.password ? (
                    <p id="password-error" className="text-sm text-destructive">
                      {errors.password.message}
                    </p>
                  ) : null}
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Enviando..." : "Enviar solicitação"}
                </Button>
              </form>
            </CardContent>
            {/* O footer só existe no estado de formulário. No sucesso, o link único é o
                "Voltar ao login" da mensagem; dois caminhos para /login na mesma tela
                brigam entre si (achado da review S01). */}
            <CardFooter className="flex justify-center">
              <p className="text-sm text-muted-foreground">
                Lembrou a senha?{" "}
                <Link href="/login" className="text-primary underline">
                  Entrar
                </Link>
              </p>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  )
}
