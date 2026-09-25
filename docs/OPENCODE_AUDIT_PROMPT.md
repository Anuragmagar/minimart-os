# Independent OpenCode Audit Prompt

Perform an independent audit of the specified task.

Read:
- AGENTS.md
- brain/BRAIN.md
- brain/CURRENT_STATE.md
- relevant plan
- brain/AUDIT_LOG.md

Inspect the actual repository and git diff.

Do NOT implement new functionality.

Audit:
1. requirements
2. acceptance criteria
3. architecture
4. business rules
5. database safety
6. security
7. tenant isolation
8. offline/sync behavior
9. tests
10. scope/unintended changes

For each category return PASS or FAIL.

For failures identify:
- exact file
- problem
- why it violates the specification
- severity: CRITICAL/HIGH/MEDIUM/LOW

Return:
AUDIT RESULT
CRITICAL
HIGH
MEDIUM
LOW
UNRELATED CHANGES
MISSING TESTS
SPECIFICATION VIOLATIONS
RECOMMENDED FIXES

Do not fix during the audit.
