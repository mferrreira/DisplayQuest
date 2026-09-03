"use client"

/**
 * Login (E1/T1.5) — RHF+Zod per constitution §2; inline field errors + aria wiring.
 * Auth errors from the credentials provider surface in the alert above the form.
 */
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { signIn } from "next-auth/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AlertCircle, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"

const loginSchema = z.object({
  email: z.string().min(1, "Informe o email").email("Email inválido"),
  password: z.string().min(1, "Informe a senha"),
})

type LoginFormValues = z.infer<typeof loginSchema>

export default function LoginPage() {
  const [authError, setAuthError] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()
  const {
    register: registerField,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  const onSubmit = async (values: LoginFormValues) => {
    setAuthError("")

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email: values.email.toLowerCase(),
        password: values.password,
      })
      if (result?.error) {
        setAuthError(result.error)
      } else {
        router.push("/dashboard")
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Falha ao fazer login")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Login</CardTitle>
          <CardDescription>Digite suas credenciais para acessar sua conta</CardDescription>
        </CardHeader>
        <CardContent>
          {authError && (
            <Alert variant="destructive" className="mb-4" role="alert">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{authError}</AlertDescription>
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
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
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
              {isSubmitting ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-muted-foreground">
            Não tem uma conta?{" "}
            <Link href="/register" className="text-primary underline">
              Registrar
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
