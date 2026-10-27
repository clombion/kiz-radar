# Prompts asked

Each file is a prompt's text, named by its hash (pipeline/prompt.py): the system text, the schema the checker holds
the answer to, and the schema as sent. Answers (pipeline/extract/answers/log.csv, `prompt`) and first reads
(`prompt`) name the hash they answered, and whatever saves one saves its prompt here first (`Prompt.archive`).

Six were made before prompts were known by their hash, each from the files at the commit its answers were made at
(405b9a7); they hold the system text and the schema as sent:

| Hash | Was | Made by |
|---|---|---|
| d911e070aa49010f | prices-v5 | pipeline/extract/ask.py |
| 2be784db5d9944e6 | prices-v5 with first-read-v3 | the two models, and agents following the same files |
| 78cdb3567a987dfc | extract-v1, with vocab.json | Claude Code subagents following the files |
| c4ff68a4bf3f13e6 | rooms-genres-v1, with vocab.json | Claude Code subagents following the files |
| 55938ee7dcb228b1 | merge-review-v1 | Claude Code subagents following the files |
| 7af5fef02cae3622 | merge-review-v2 | Claude Code subagents following the files |
