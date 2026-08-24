# Legacy Map — every legacy artifact → fate

Rule: no legacy file may be deleted unless it appears here with a fate, and every epic's swap task
must reconcile against this table. `E<n>` = epic that owns the removal. "Repoint" = change imports,
file dies at E10 cleanup if zero imports remain.

| Legacy artifact | Fate | Owner |
|---|---|---|
| `contexts/api-client.ts` (fetchAPI, 13 domain APIs, silent unwrap, dead calls) | Dead calls removed per-domain; file deleted E10 | E2–E9 |
| `BadgesAPI.award` (POST /api/badges/award — NO ROUTE) | Remove call site when badge-manager rebuilds | E8 |
| `UserProfilesAPI.searchUsers` (GET /api/users/search — NO ROUTE) | Remove call site in member pickers | E4/E8 |
| `WorkSessionsAPI.getWeeklyHours` empty stub (:473) | Not carried into features/work-sessions | E3 |
| `contexts/task-context.tsx` (+ fetchUsers coupling :148,:183; raw-fetch approve/reject :166,:201) | Replaced by features/tasks hooks | E2 |
| `contexts/project-context.tsx` | features/projects | E4 |
| `contexts/user-context.tsx` (hardcoded role list :35–47 dup of features.ts) | features/users + hasFeatureAccess only | E8/E9 |
| `contexts/reward-context.tsx` (role drift :68 omits GERENTE) | features/rewards; fix via features.ts unify | E6 |
| `contexts/work-sessions-context.tsx` ({data} unwrap defensive Array.isArray) | features/work-sessions | E3 |
| `contexts/responsibility-context.tsx`, `laboratory-schedule-context.tsx`, `lab-events-context.tsx`, `lab-notices-context.tsx`, `issue-context.tsx` | features/laboratory | E5 |
| `contexts/weekly-report-context.tsx` (client-fabricated report objects) | features/reports; server aggregation instead | E7 |
| `contexts/notification-context.tsx` (EMPTY provider passthrough; hook raw fetch) | features/notifications (T1.4b) | E1 |
| `contexts/auth-context.tsx` (thin wrapper; EMPTY Provider :16–18) | useSession directly / shared auth helper | E1 |
| `contexts/types.ts` (577 lines, drifts from Prisma) | Type imports repoint to entities/ domain-by-domain | E2–E9 |
| `contexts/use-toast.ts` + `components/ui/use-toast.ts` (duplicate) | sonner only | E1 |
| `contexts/use-mobile.tsx` + `components/ui/use-mobile.tsx` (duplicate) | shared/hooks/use-media-query | E10 |
| `hooks/use-work-sessions.ts` (re-export shim), `use-daily-logs.ts`, `use-project-members.ts` | feature hooks replace; shims deleted with their domain | E3/E4/E5 |
| `components/ui/modern-button.tsx` (duplicate of button) | delete | E10 |
| `components/ui/floating-session-timer.tsx` | rebuilt → features/work-sessions/components | E3 |
| `app/dashboard/laboratorio/page.tsx` (738ln monolith, ROLE_PRIORITY inline :32, window.confirm :274/:297, double render :367/:556) | split into features/laboratory pages | E5 |
| `app/dashboard/weekly-reports/page.tsx` (N+1 loop :105–133) | features/reports page | E7 |
| `app/dashboard/loja/page.tsx` (494ln; defunct "used" status :217) + `loja/gerenciar/page.tsx` | features/store pages | E6 |
| `components/admin/*` (ModernAdminPanel monolith etc.) | features/admin | E8 |
| `components/features/*` not covered above (kanban-board 367ln optimistic mirror :39/:71–73, task dialogs, project-* ×9, issue-management, volunteers-management…) | migrate with owning epic | E2/E4/E5 |
| `components/forms/*` mixed RHF vs useState | RHF+Zod parity per epic | E2–E9 |
| `.eslintrc.json` path-scoped overrides for 5 legacy files | Convert to basename NOW (T1.1); remove entry as each file rebuilds clean | E1→E9 |
| Junk deps: immer, fs, path ("latest"), unused radix/embla/cmdk/input-otp/react-day-picker? | prune after zero-import proof | E10 |
| Dev DB purchase rows id=1 "delivered", id=2 "processing" | PENDING USER DECISION — do NOT touch data autonomously | backlog |
| Orphan columns tasks.order/parentId (+FK/index) in live DB, not in schema | PENDING USER DECISION — optional cleanup migration | backlog |

Import-count-zero verification (per domain): `grep -rn "<legacy-symbol>" app components contexts --include="*.tsx" --include="*.ts"` must return nothing outside the legacy file itself before its CP.
