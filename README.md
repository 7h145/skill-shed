# skill-shed

Assorted agent skills.

These skills are not tied to a specific boxed/containerized setup or agent
harness. They are meant to be useful building blocks that an agent can load when
relevant.

## Included skills

- [`markdown-preview`](./skills/markdown-preview/) — preview an ordered tree of
  Markdown files as one live browser-rendered document, with recursive updates,
  print-friendly output, and optional raw TeX output through Pandoc.

## Install

Follow the documentation for your agent harness. For example, for the
[Pi coding agent](https://pi.dev), see the
[skills documentation](https://pi.dev/docs/latest/skills) and
[package management documentation](https://pi.dev/docs/latest/packages).

Pi example: install from GitHub as a Pi package:

```bash
pi install git:github.com/7h145/skill-shed
```

Or install with [npm skills](https://www.npmjs.com/package/skills):

```bash
npx skills add 7h145/skill-shed
```

Or just copy the skill directories into wherever your agent harness loads
skills from.

## Usage

Follow the documentation for your agent harness. For example, for the
[Pi coding agent](https://pi.dev), see the
[skills documentation](https://pi.dev/docs/latest/skills).

Pi example: skills are loaded on demand when relevant. You can also invoke them
explicitly:

```text
/skill:markdown-preview preview the markdown/ directory
```

See each skill directory for detailed instructions and examples.

## Development

Install all skill dependencies from the repository root, then run the checks
and tests:

```bash
npm install
npm run check
npm test
```
