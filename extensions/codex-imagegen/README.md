# Codex imagegen

Loads the pinned `@howaboua/pi-codex-imagegen` companion, replacing this package's
former `openai_image` implementation and `/openai-image` command. Remove any
separately enabled companion copy, run `npm ci`, and restart Pi.

Use `imagegen` in ordinary Pi or `tools.image_gen__imagegen` in Code/Notebook.
Authenticate with `/login openai-codex`. Images save beneath the workspace in
`.pi/openai-codex-images`; old Better OpenAI `image` settings no longer apply.
See the dependency's README for reference-image and proxy configuration.
