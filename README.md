# Vibe Benchmark Tool

Local web tool for comparing Mac build/test time across real projects.

## Run

```bash
npm start
```

Then open `http://127.0.0.1:4317`.

## Behavior

- `Pull latest` refuses dirty worktrees, then fetches and fast-forward pulls.
- Presets with an expected fork verify `origin` before pulling, then run `git pull --ff-only origin main`.
- Custom repo paths use the checkout's normal branch tracking with `git pull --ff-only`.
- `Start benchmark` runs the selected command, streams live output, and reports elapsed wall time.
- Commands run from the selected repo path.
- Pulls are fast-forward only, so local changes or divergent branches stop the pull instead of merging.

## Fork presets

- Hermes Agent fork: `/Users/greg/dev/hermes-agent`, expected origin `github.com/flowforgelab/hermes-agent`. The preset uses the repo's `scripts/run_tests.sh` wrapper with `HERMES_TEST_WORKERS=10` for local Mac benchmarking.
- OpenClaw fork: `/Users/greg/dev/openclaw`, expected origin `github.com/flowforgelab/openclaw`.
