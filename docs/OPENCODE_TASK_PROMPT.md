# OpenCode Task Prompt

Read:
- AGENTS.md
- brain/BRAIN.md
- brain/CURRENT_STATE.md
- relevant brain documents
- relevant plan file

Execute ONLY the specified task.

Before coding:
1. inspect repository
2. inspect dependencies
3. identify affected files
4. check existing implementation
5. identify blocking ambiguity

If blocking ambiguity exists, stop and report it.

Otherwise:
1. implement the task
2. run required tests/checks
3. inspect final diff
4. verify acceptance criteria
5. perform self-audit
6. update CURRENT_STATE.md
7. append AUDIT_LOG.md
8. report completion

Do not continue to the next task.
