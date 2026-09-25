# MiniMart OS — Current State

## Project Status
Phase: 00 — Foundation
Current Task: 00.06 — Foundation Audit (completed)
Overall Status: IN PROGRESS

## Completed Phases
- Phase 00 — Foundation (00.01–00.06): repository, Docker dev infra, backend + Flutter bootstrap, CI, audit. Compatibility review PASS — proposed stack treated as locked.

## Completed Tasks
- 00.01 — Repository Initialization (git repo, .gitignore, env templates, structure verification)
- 00.02 — Docker Development Environment (postgres + redis dev services, health checks, persistence)
- 00.03 — Backend Bootstrap (NestJS API, typed config, health endpoint, lint, tests)
- 00.04 — Flutter Bootstrap (Windows app, GoRouter routing foundation, GetIt + Injectable DI, tests)
- 00.05 — CI Foundation (GitHub Actions: backend + Flutter format/lint/test jobs, Windows build job)
- 00.06 — Foundation Audit (toolchain, structure, architecture, dependency compatibility; report in brain/FOUNDATION_AUDIT.md)

## Backend
NestJS 12 API in services/api (TypeScript strict, ESM). Configuration via @nestjs/config with typed factory; GET /health endpoint; oxlint + Prettier; Vitest unit and e2e tests. DB integration not yet added.

## CI
GitHub Actions workflow at .github/workflows/ci.yml: backend job (node 24, npm ci, format:check, lint, build, unit, e2e), flutter-checks job (ubuntu: pub get, dart format check, analyze, test), flutter-windows-build job (windows-latest: pub get, flutter build windows --debug). All commands verified locally green. Live CI execution pending a GitHub remote (ASM-008).

## Flutter
Flutter 3.44 (Dart 3.12) Windows POS app in apps/pos (name: pos, org com.minimart). Routing via GoRouter (initial '/'); DI via GetIt + Injectable (generated injection.config.dart); entry point initializes DI then runs MaterialApp.router. HomePage placeholder renders. flutter analyze clean (0 issues), unit/widget tests pass (2/2), Windows debug build produces pos.exe. BLoC/Cubit, Drift, Dio, Freezed not yet added (later phases).

## Database
Development infra ready: docker-compose.yml provides postgres:17-alpine and redis:7-alpine with health checks and persisted volumes.

## Offline Sync
Not started.

## Testing
Not started.

## Deployment
Production: not started. Development infrastructure (postgres + redis via Docker Compose) is operational.

## Known Issues
None.

## Technical Debt
None.

## Pending Decisions
None.

## Assumptions
See `/brain/ASSUMPTIONS.md`.

## Last Audit
2026-09-25 — Task 00.06 completed; Phase 00 closed. Full report: `/brain/FOUNDATION_AUDIT.md`.

## Last Updated
2026-09-25 — Task 00.06 completed.
