/**
 * clean-arch G0 — dependency-cruiser configuration (SPEC §3: RG-01..RG-06 + RG-10).
 *
 * Gate: `npm run arch:check` (ARCHITECTURE.md §4). Shell entry: scripts/arch-check.sh.
 *
 * HOW THIS FILE IS ORGANISED
 *   1. Layer regexes — the target tree of SPEC §2.
 *   2. ALLOW_LIST (DEC-01) — the existing debt, one entry per IMPORTER file, each one
 *      carrying the wave/batch task that deletes it. OND9-B3 asserts the list is empty.
 *      Exempting a rule for a *named file* is deliberate: a debt with a name and an owner,
 *      not a widened regex that would also hide future violations.
 *   3. Rules generated per module, so "cross-module" is explicit rather than implied.
 *
 * TWO THINGS THAT WILL SILENTLY BLIND THIS GATE IF CHANGED — both verified empirically
 * on 2026-09-23 (batch 0.1) before the numbers were trusted:
 *   • `--ts-config tsconfig.json` is required, otherwise `@/lib/...` counts as an external
 *     module and no rule matches anything.
 *   • `--ts-pre-compilation-deps` is required, otherwise `import type { X } from
 *     "@prisma/client"` — exactly the SPEC §2.4 leaks — is erased before analysis. Related:
 *     `node_modules` must stay OUT of `options.exclude` (excluding a module deletes the
 *     edge to it) while `doNotFollow` keeps the recursion out.
 */

/** Modules under backend/modules/<name>. Adding a module is a deliberate edit here. */
const MODULES = [
  "gamification",
  "identity-access",
  "lab-operations",
  "notifications",
  "project-management",
  "project-membership",
  "reporting",
  "store",
  "task-management",
  "user-management",
  "work-execution",
];

/* -------------------------------------------------------------------------- */
/* 1. Layer regexes (SPEC §2)                                                  */
/* -------------------------------------------------------------------------- */

const LAYER = {
  domainCore: "^backend/domain/",
  composition: "^backend/composition/",
  repositories: "^backend/repositories/",
  models: "^backend/models/",
  prisma: "^node_modules/@prisma/",
  next: "^node_modules/next/",
  /** Upper layers (excluding the HTTP adapters, which RG-06 owns). */
  frontend: "^(?:components|contexts|features|hooks|entities|shared)/|^app/(?!api/)",
  appApi: "^app/api/",
  outward: "^(?:app|components|contexts|features|hooks|entities|shared)/",
  lib: "^lib/",
};

/** RG-01: the shared core knows no ORM, framework, HTTP or adapter. */
const FORBIDDEN_FOR_CORE = [
  LAYER.prisma,
  LAYER.next,
  LAYER.lib,
  LAYER.outward,
  LAYER.repositories,
  LAYER.models,
  LAYER.composition,
  "^backend/modules/",
];

/** RG-03: application may reach backend/domain + its own module only (SPEC §4.5 — contracts
 * and ports reference domain types and local types, never `backend/models`). */
const FORBIDDEN_FOR_APPLICATION = [
  LAYER.prisma,
  LAYER.next,
  LAYER.lib,
  LAYER.outward,
  LAYER.repositories,
  LAYER.models,
  LAYER.composition,
];

/** RG-04/RG-10: an adapter never calls the composition root or another module's factory. */
const FORBIDDEN_FOR_INFRASTRUCTURE = [
  LAYER.next,
  LAYER.outward,
  LAYER.composition,
  "^backend/modules/[^/]+/index",
];

/** RG-06: route handlers parse/authorise/HTTP; the backend is reached via composition root. */
const FORBIDDEN_FOR_ROUTES = [
  LAYER.prisma,
  "^lib/database/prisma",
  LAYER.repositories,
  LAYER.models,
  "^backend/modules/",
];

/* -------------------------------------------------------------------------- */
/* 2. Allow list (DEC-01)                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Baseline re-measured 2026-09-23 at the end of ONDA 0 with this list emptied:
 * 26 violations (575 modules, 2085 dependencies) — the breakdown is recorded in STATE.json
 * (baseline.archViolationsFinalList). Every one of them is exempted here by naming the
 * importer file, and OND9-B3 runs the gate with this object EMPTY.
 * The first measurement inside OND0-B1 reported 23 with an earlier, narrower rule set; the
 * number above is the comparable one.
 */
const ALLOW_LIST = {
  // RG-06 — routes still reaching Prisma / a repository / a module factory (PLAN §2.6).
  // OND9-B1: FECHADA — `app/api/health/route.ts` passou a ler a saude pela composition root
  // (checkDatabaseHealth) e nao instancia mais um PrismaClient proprio.
  "rg06-routes": [],

  // RG-03 — cleared by batch 0.4. OND8-B4: a ultima entrada (store port -> backend/models,
  // GAP-01) FOI FECHADA — a porta devolve IReward/IPurchase puros e a rota parou de chamar
  // toPrisma() (OND8-B3).
  "rg03-application-store": [],

  // RG-04 — gateways/publishers importing another module's factory (PLAN §2.2).
  // OND9-B1: TODAS FECHADAS — os gateways LEGADOS (seams do golden/contract, DEC-15/19)
  // passaram a declarar INTERFACES ESTRUTURAIS LOCAIS (NotificationsModuleLike /
  // IdentityAccessModuleLike) no lugar do import (type-only) da factory de outro modulo;
  // os modulos reais continuam estruturalmente atributiveis e os testes estao intactos.
  "rg04-infrastructure-task-management": [],
  "rg04-infrastructure-project-management": [],
  "rg04-infrastructure-reporting": [],
  "rg04-infrastructure-lab-operations": [],
  "rg04-infrastructure-user-management": [],

  // RG-02 — gamification "domain" that instantiates repositories (PLAN §2.3).
  // OND9-B1: FECHADA — os engines LEGADOS (seam do contract 6.3) foram MOVIDOS de
  // gamification/domain/engines para gamification/infrastructure/legacy-engines (a nova
  // wiring usa as regras puras de backend/domain/gamification; nenhum importador restante).
  "rg02-module-domain-gamification": [],

  // rg06b — page-level ORM type import, discovered during OND0-B1 (not in PLAN §2; see DEC-08).
  // OND8-B4: FECHADA — a pagina loja/gerenciar passou a usar os tipos de frontend de
  // contexts/types (sem Prisma); nenhum import de ORM sobrou no frontend.
  "rg06b-frontend-no-orm": [],
};

// Every tolerated violation must name the wave/batch that removes it (AGENT.md §4:
// "allow-list sem dono = defeito"). This runs at config load, so an ownerless exemption
// breaks the gate instead of rotting silently.
for (const [ruleName, entries] of Object.entries(ALLOW_LIST)) {
  for (const entry of entries) {
    if (
      !entry ||
      typeof entry.from !== "string" ||
      typeof entry.task !== "string" ||
      !/^OND\d/.test(entry.task)
    ) {
      throw new Error(
        `.dependency-cruiser.js: allow-list entry in "${ruleName}" needs a "from" and an ONDxx-Bxx "task"`,
      );
    }
  }
}

const exemptImporters = (name) => {
  const entries = ALLOW_LIST[name] || [];
  return entries.length > 0 ? entries.map((entry) => entry.from).join("|") : undefined;
};

/* -------------------------------------------------------------------------- */
/* 3. Rules                                                                    */
/* -------------------------------------------------------------------------- */

const rules = [
  // RG-01 — shared pure core.
  {
    name: "rg01-domain-core-no-external",
    severity: "error",
    comment: "RG-01: backend/domain is the pure core (SPEC §1.1 Dependency Rule).",
    from: { path: LAYER.domainCore },
    to: { path: FORBIDDEN_FOR_CORE.join("|") },
  },

  // RG-06 — HTTP adapters.
  {
    name: "rg06-routes",
    severity: "error",
    comment:
      "RG-06: app/api/** reaches the backend only through backend/composition/root (+ backend/domain, lib/api, lib/auth).",
    from: { path: LAYER.appApi, pathNot: exemptImporters("rg06-routes") },
    to: { path: FORBIDDEN_FOR_ROUTES.join("|") },
  },

  // Extension of SPEC §3 proposed in OND0-B1 (DEC-08): the same ORM leak seen from the
  // frontend. SPEC only regulates app/api, so this rule is additive and clearly named.
  {
    name: "rg06b-frontend-no-orm",
    severity: "error",
    comment: "DEC-08: components/features/entities/app(page) must not import the ORM either.",
    from: { path: LAYER.frontend, pathNot: exemptImporters("rg06b-frontend-no-orm") },
    to: { path: [LAYER.prisma, "^lib/database/prisma"].join("|") },
  },

  // RG-05 is a permission, not a prohibition: backend/composition may reach anything.
];

for (const moduleName of MODULES) {
  rules.push(
    // RG-02 — a module's own domain stays pure too.
    {
      name: `rg02-module-domain-${moduleName}`,
      severity: "error",
      comment: `RG-02: backend/modules/${moduleName}/domain holds no repository, no model, no I/O.`,
      from: {
        path: `^backend/modules/${moduleName}/domain/`,
        pathNot: exemptImporters(`rg02-module-domain-${moduleName}`),
      },
      to: { path: FORBIDDEN_FOR_CORE.join("|") },
    },
    // RG-03 — application depends on domain + its own ports only.
    {
      name: `rg03-application-${moduleName}`,
      severity: "error",
      comment: `RG-03: backend/modules/${moduleName}/application may only reach backend/domain and its own module.`,
      from: {
        path: `^backend/modules/${moduleName}/application/`,
        pathNot: exemptImporters(`rg03-application-${moduleName}`),
      },
      to: {
        path: [
          ...FORBIDDEN_FOR_APPLICATION,
          // own infrastructure: the adapter is injected, never imported
          `^backend/modules/${moduleName}/infrastructure/`,
          // another module: cross-module goes through the composition root or events
          `^backend/modules/(?!${moduleName}/)`,
        ].join("|"),
      },
    },
    // RG-04 + RG-10 — infrastructure implements ports; it never reaches the composition
    // root, another module, or another module's factory.
    {
      name: `rg04-infrastructure-${moduleName}`,
      severity: "error",
      comment: `RG-04/RG-10: backend/modules/${moduleName}/infrastructure is an adapter, not a caller of other modules.`,
      from: {
        path: `^backend/modules/${moduleName}/infrastructure/`,
        pathNot: exemptImporters(`rg04-infrastructure-${moduleName}`),
      },
      to: {
        path: [...FORBIDDEN_FOR_INFRASTRUCTURE, `^backend/modules/(?!${moduleName}/)`].join("|"),
      },
    },
  );
}

module.exports = {
  options: {
    // Also passed as the CLI flag by both gate entry points: the config key alone was
    // verified NOT to surface `import type` edges.
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    // node_modules stays OUT of `exclude` on purpose (see the header note).
    exclude: { path: "(^\\.next/|^public/|^\\.git/)" },
  },

  forbidden: rules,
};
