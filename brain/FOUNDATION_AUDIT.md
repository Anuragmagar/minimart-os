# MiniMart OS — Foundation Audit

Audit of repository, tooling, architecture, and dependency compatibility for Phase 00 (Foundation). No business features audited or changed.

- Date: 2026-09-25
- Scope: Tasks 00.01–00.05 artifacts, toolchain, dependency resolution, architecture alignment
- Method: inspection of repository, live execution of verification scripts and CI gate commands, dependency resolvers (`flutter pub outdated`, `npm outdated`, `npm audit`), reference against `/brain/*.md` and `/docs/decisions/*.md`

## Toolchain & Environment

| Component | Version | Status |
|---|---|---|
| Git | 2.51.0.windows.1 | OK |
| Docker Engine | 29.7.2 | OK |
| Docker Compose | v5.4.0 | OK |
| Node.js | v24.21.0 | OK (CI pins 24) |
| npm | 11.19.0 | OK |
| Flutter | 3.44.0 stable (2026-05-15) | OK |
| Dart | 3.12.0 | OK |
| Visual Studio (Windows) | Build Tools 2022 17.14.22 | OK (Windows app builds) |

`flutter doctor`: No issues found.

## Repository Structure

Structure matches the documented monorepo layout (README, apps/, services/, packages/, brain/, docs/, plans/, infrastructure/). Verified:
- `apps/pos` — Flutter app (lib/, test/, windows/, .gitignore)
- `services/api` — NestJS 12 backend (esm, strict TS)
- `packages/` — empty shared-packages placeholder (intended; unused until needed)
- `infrastructure/docker` + `infrastructure/scripts` — dev/compose tooling
- `.github/workflows/ci.yml` — CI foundation
- Root `.gitattributes` — LF normalization for deterministic formatting

Ignore rules verified with `git check-ignore`: `services/api/dist` (root:12), `services/api/node_modules` (root:11), `apps/pos/build` (apps/pos:33), `apps/pos/.dart_tool` (apps/pos:29), `*.tsbuildinfo` (root:22). No untracked build artifact would be committed.

## Verification & Tooling Scripts

- `infrastructure/scripts/verify-foundation.ps1` — RESULT: ALL CHECKS PASSED.
- `infrastructure/scripts/verify-docker.ps1` — RESULT: ALL CHECKS PASSED (0 skipped), exit 0, live cycle verified (up → write probes → down → re-up → persistence probes → final down; containers removed, volumes retained). Postgres and Redis both healthy.

## CI Foundation

`.github/workflows/ci.yml` (yaml-lint: valid) — backend (format:check, lint, build, unit, e2e), flutter-checks (format, analyze, test), flutter-windows-build (debug build). Every command was executed locally and is green. Live execution requires a GitHub remote (ASM-008).

## Architecture Alignment

Compared foundation artifacts against `/brain/BRAIN.md`, `/brain/ARCHITECTURE.md`, `/docs/decisions/*.md`:
- Modular monolith (ADR-001): scaffold is a single NestJS app; no service fragmentation. OK.
- PostgreSQL centralized (ADR-002): dev postgres:17-alpine provisioned; no fake storage. OK.
- Offline-first POS / Drift+SQLite (ADR-003): deferred by plan; Flutter foundation does not contradict. OK.
- Flutter (ADR-004), REST /api/v1 (ADR-005), backend RBAC (ADR-006), inventory ledger (ADR-007): not yet implemented; no conflicting choices introduced. OK.
- Frontend layering, DI/routing (GoRouter, GetIt+Injectable), backend flow Controller → Service → Domain → Prisma: foundation layout (feature-first `lib/src/features`, `lib/src/router`, `lib/src/di`) is compatible. OK.
- No floating-point money, ledger inventory, financial immutability: nothing in Phase 00 touches these. OK.

## Dependency Compatibility

Flutter (`flutter pub outdated`): all direct dependencies current. Only `build_runner 2.15.1` vs latest `2.16.1` (non-resolvable pin without conflict); transitive minors (intl, meta, clock, analyzer, etc.) are at latest resolvable. No upgradable direct deps. Compatible.

Backend (`npm outdated`, `npm audit`): all locked deps at `Wanted`. Five dev-only packages offer newer majors (typescript 7, vitest 5, @vitest/coverage-v8 5, vite-tsconfig-paths 6, @types/node 26) — held on NestJS 12-compatible majors; revisit on a future NestJS upgrade. `npm audit`: 0 vulnerabilities. Compatible.

Infra images: postgres:17-alpine, redis:7-alpine — current stable majors, healthy in live probe. Compatible.

Windows build: `flutter build windows --debug` produces `pos.exe`. Compatible.

## Findings & Risks

- F-01 (LOW) — `verify-docker.ps1` sets `$ErrorActionPreference="Stop"`; if its output is piped through `2>&1`/`*>` in the same PowerShell 5.1 process, docker CLI stderr progress becomes a terminating `NativeCommandError` and the script aborts. Invoked directly (documented usage) it passes all checks, exit 0. Recommendation: invoke as `powershell -File ...\verify-docker.ps1`; optionally harden the script to send native stderr to `$null` in a later tooling task.
- F-02 (INFO) — Repository has no initial commit (git init on `main`, all files untracked) by design; first commit + push to a GitHub remote activates CI execution (ASM-008) and removes this audit's CI limitation.
- F-03 (INFO) — `services/api` has no local `.gitignore` (CLI scaffold ran `--skip-git`); root ignore rules fully cover it (verified). Optional self-contained improvement, not required.
- F-04 (INFO) — `docs/requirements/` contains only a placeholder README; no approved requirement artifacts (SRS, NEPAL_COMPLIANCE) exist yet. Not blocking; Phase 01+ tasks must record requirements for business features.
- F-05 (LOW) — `flutter-checks` CI job runs analyze/test on ubuntu; tests are device-independent so behavioral coverage holds; the Windows-targeted job separately validates desktop build. No action needed.
- F-06 (INFO) — Backend dev-dependency majors (typescript 7, vitest 5) will require review when upgrading the NestJS major; pin-review cap removed at upgrade time.

## Verdict

PASS. The repository, tooling, and stack are sound, mutually compatible, and green. Per AGENTS.md, this audit constitutes the Foundation compatibility review: the proposed stack (Flutter 3.44 / Dart 3.12, NestJS 12, PostgreSQL 17, Redis 7, GoRouter 18, GetIt 9, Injectable 3, Drift, Prisma, Docker Compose) is treated as LOCKED unless a later phase records an override. Phase 00 is complete. No blocking issues.

## Recommendations (non-blocking)

1. Create the initial commit and push to a GitHub remote to activate CI; confirm workflow green.
2. Harden `verify-docker.ps1` native stderr handling (F-01) in a small tooling follow-up.
3. Keep `docs/requirements/` artifacts updated as Phase 01 business requirements are approved.