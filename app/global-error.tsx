"use client"

/**
 * Root-level error boundary (E1/T1.3). Renders OUTSIDE the root layout, so it must supply its own
 * <html>/<body>. Reserved for catastrophic failures (root layout/provider crash).
 */
import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[app/global-error]", error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Erro crítico na aplicação</h2>
        <p style={{ color: "#666", maxWidth: "28rem", fontSize: "0.875rem" }}>
          A aplicação não pôde ser carregada. Tente recarregar a página.
        </p>
        {error.digest ? (
          <p style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#999" }}>
            ref: {error.digest}
          </p>
        ) : null}
        <button
          onClick={reset}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "0.375rem",
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Recarregar
        </button>
      </body>
    </html>
  )
}
