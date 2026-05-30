# Vibe Benchmark Tool

Local web tool for comparing Mac build/test time across real projects.

## Run

```bash
npm start
```

Then open `http://127.0.0.1:4317`.

## Behavior

- `Pull latest` runs `git status --short && git fetch --prune && git pull --ff-only`.
- `Start benchmark` runs the selected command and reports elapsed wall time.
- Commands run from the selected repo path.
- Pulls are fast-forward only, so local changes or divergent branches stop the pull instead of merging.
