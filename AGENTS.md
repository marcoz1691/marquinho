# AGENTS.md

## Cursor Cloud specific instructions

This repository currently contains **no application code**. It holds only:

- `README.md` — a placeholder containing a name.
- `assessment.txt` — a written specification for a Currency Conversion REST API plus a manual test plan. This is an assessment/interview document, not runnable code.

There is nothing to install, build, lint, test, or run:

- No dependency manifests (`package.json`, `requirements.txt`, `go.mod`, `pom.xml`, etc.).
- No source files, build configuration, or `.cursor/environment.json`.

As a result there is no development environment to set up. The startup/update script is intentionally a no-op. If real application code is added later (for example, an implementation of the Currency Conversion API described in `assessment.txt`), update the update script with the appropriate dependency install command and document how to run/lint/test/build the service here.
