# GitHub Actions handoff — WI-02 project, 2026-10-17

## Purpose
Get useful Linux/Windows CI checks without falsely claiming production readiness.
The project is NOT_READY. The existing workflow previously ran floating `npm install`, contrary to FI-02 reviewed-lock policy. It has been replaced with distinct offline and locked-runtime jobs.

## Setup
1. Create an **empty private** GitHub repository named `video-ai-flow` under your own account. Do not upload cloud/API keys, real user media, .env files, SQLite DBs or credentials. The GitHub connector available to this session cannot create new repositories; no repository was altered here.
2. Extract `ContentStudio/` directory, from the extracted directory run `git init -b main; git add .; git commit -m "Import ContentStudio WI-02 and GitHub CI"; git remote add origin https://github.com/USERNAME/video-ai-flow.git; git push -u origin main`. Configure Git credentials with the official GitHub CLI or credential manager; never paste tokens into chat.
3. GitHub Actions > `ContentStudio CI`: Ubuntu offline suite runs on push. Until a reviewed `package-lock.json` exists, `locked-runtime-linux` MUST fail with an explicit lock diagnostic. This is expected and honest (NOT_READY).
4. GitHub Actions > `Prepare npm lockfile (manual)` > Run workflow. It resolves package metadata without running package lifecycle scripts and uploads an artifact. Download, inspect versions/integrity/licenses and commit the result in a separate PR or reviewed commit. If resolution fails, inspect its log for missing/unpublished package versions; **never fabricate a lockfile**.
5. Next push runs `npm ci --ignore-scripts`, Vite build, Fastify HTTP, SDK and npm audit. If real HyperFrames needs lifecycle/native setup, install on a controlled Windows host after reviewing package scripts; CI does not substitute an actual renderer test.
6. To test Windows GitHub-hosted runners, manually run `ContentStudio CI` with `include_windows=true`. This consumes runner minutes and might incur usage charges depending on account/billing.

## Important boundaries
- `test:all:batched` runs Node/offline tests including FFmpeg fixtures, not a real GPU or AI provider.
- `locked-runtime` will not run when its lock check fails. CI should display that failure; don't replace it with nonreproducible `npm install`.
- GitHub-hosted runners do not verify HyperFrames production 35-minute 1080p MP4, Windows desktop browser UX or durable post-crash recovery on the user's machine.
- `npm ci --ignore-scripts` is a security-first default; if a reviewed package needs postinstall, evaluate it before allowing it in an isolated environment.
- CI does NOT release automatically and must never be interpreted as `RELEASE_READY`.
- No new app dependencies, queue or DB migrations were added.
