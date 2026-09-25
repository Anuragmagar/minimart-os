# MiniMart OS — Assumptions

This file records assumptions made during implementation.

Every assumption requires:
- ID
- date
- task
- assumption
- reason
- impact
- status
- resolution

## Template

### ASM-001
Date: 2026-09-25
Task: 00.01 — Repository Initialization
Assumption: Git repository is initialized with default branch `main`.
Reason: Git was not yet initialized; `main` is the modern default and Task 00.05 CI will target the default branch.
Impact: Repository history starts on `main`. Renaming the branch later is trivial.
Status: active
Resolution:

### ASM-002
Date: 2026-09-25
Task: 00.01 — Repository Initialization
Assumption: Environment templates are provided at repo root (development infrastructure, consumed by root docker-compose) and services/api/.env.example (application-level configuration).
Reason: docker-compose.yml lives at the repository root; the backend service will read application configuration from its own environment.
Impact: Task 00.02 (Docker) and Task 00.03 (Backend Bootstrap) may extend these templates.
Status: active
Resolution:

### ASM-003
Date: 2026-09-25
Task: 00.02 — Docker Development Environment
Assumption: Development container images are pinned to postgres:17-alpine and redis:7-alpine.
Reason: Reproducible dev environment; alpine variants keep image size small. Version selection is a tooling choice, not a business rule.
Impact: If a later phase requires a different PostgreSQL major for a feature, the pin can be bumped via an explicit reviewed change.
Status: active
Resolution:

### ASM-004
Date: 2026-09-25
Task: 00.03 — Backend Bootstrap
Assumption: Backend test and lint tooling uses the NestJS 12 scaffold defaults (Vitest, oxlint, Prettier) rather than Jest/ESLint.
Reason: The scaffold is the current idiomatic NestJS setup; no doc mandates a specific unit test or linter framework.
Impact: CI (Task 00.05) must invoke these scripts. Docs may reference vitest/oxlint going forward.
Status: active
Resolution:

### ASM-005
Date: 2026-09-25
Task: 00.03 — Backend Bootstrap
Assumption: Typed backend configuration is implemented with @nestjs/config plus a typed configuration factory in src/config/configuration.ts.
Reason: AGENTS.md lists configuration as a bootstrap requirement without prescribing a library; @nestjs/config is the standard NestJS approach.
Impact: Later backend tasks (02.01+) may evolve validation and structure of configuration.
Status: active
Resolution:

### ASM-006
Date: 2026-09-25
Task: 00.04 — Flutter Bootstrap
Assumption: Flutter app uses organization `com.minimart` and project/package name `pos` in apps/pos.
Reason: `com.minimart` matches the project's reverse-domain identity intent; `pos` is the short app identifier. No doc prescribed a specific org/project name.
Impact: Package/bundle identifiers (and later platform signing identities) derive from `com.minimart`; renaming later is disruptive, so treat `pos`/`com.minimart` as the app identity unless explicitly changed.
Status: active
Resolution:

### ASM-007
Date: 2026-09-25
Task: 00.04 — Flutter Bootstrap
Assumption: Routing/DI foundation uses the documented stack GoRouter + GetIt + Injectable with generated `injection.config.dart`; BLoC/Cubit, Drift (SQLite), Dio, and Freezed are intentionally deferred to their later phases.
Reason: ARCHITECTURE.md names these technologies; the 00.04 plan limits scope to routing + DI foundation. Injectable 3.x names the config output after the annotated file (`injection.config.dart`).
Impact: Route table and DI registrations will grow in later phases; BLoC providers and repositories get registered through the same container.
Status: active
Resolution:

### ASM-008
Date: 2026-09-25
Task: 00.05 — CI Foundation
Assumption: CI is implemented as a GitHub Actions workflow in .github/workflows/ci.yml.
Reason: The repository tracks branch `main` and no CI provider is documented anywhere in /brain or /docs; GitHub Actions is the default for Flutter/NestJS monorepos and needs no external account beyond the (future) GitHub remote.
Impact: When the repo is pushed to another CI provider, the workflow must be ported (a small config change). Live CI execution cannot be verified until a remote exists; commands were verified locally instead.
Status: resolved
Resolution: 2026-09-25 — Initial commit pushed to https://github.com/Anuragmagar/minimart-os; CI run 36087189717 executed all three jobs green (Backend 22s, Flutter Windows build 4m31s, Flutter format/analyze/test 1m35s).

### ASM-009
Date: 2026-09-25
Task: 00.06 — Foundation Audit
Assumption: The Task 00.06 audit report (brain/FOUNDATION_AUDIT.md) serves as the Foundation compatibility review referenced by AGENTS.md section 9 ("subject to the Foundation compatibility review before being treated as locked"), and the proposed stack is treated as LOCKED for Phase 01+.
Reason: AGENTS.md defers locking the stack to a compatibility review; this audit verified toolchain health, dependency resolution, builds, tests, and architecture alignment with a PASS verdict, and no other review mechanism is defined.
Impact: Subsequent phases must not silently switch stack components; any change requires a recorded decision (see/docs/decisions/). Follow-up actions (initial commit, GitHub remote, CI activation) remain open.
Status: active
Resolution:
