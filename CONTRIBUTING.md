# Contributing Guide

## 1. Branch Strategy

Do not develop directly on `main`.

- Feature: `feat/<short-name>`
- Fix: `fix/<short-name>`
- Refactor: `refactor/<short-name>`

Examples:
- `feat/menu-drag-group`
- `fix/login-token`

## 2. Start Work

```bash
git checkout main
git pull
git checkout -b feat/your-feature
```

## 3. Commit Style

Use clear commit prefixes:

- `feat:` new feature
- `fix:` bug fix
- `refactor:` code refactor
- `docs:` documentation updates
- `chore:` maintenance

Examples:

```bash
git add .
git commit -m "feat: add cross-group menu drag and save order"
```

## 4. Push And Open PR

```bash
git push -u origin feat/your-feature
```

Then open a Pull Request to merge into `main`.

PR checklist:
- explain what changed
- include screenshots for UI changes
- mention any DB/data impact

## 5. Keep Branch Up To Date

Before merge, sync latest `main`:

```bash
git checkout main
git pull
git checkout feat/your-feature
git rebase main
```

If conflicts happen, resolve files and continue:

```bash
git add .
git rebase --continue
```

After rebase, update remote branch:

```bash
git push -f
```

## 6. Pull Latest Team Changes

```bash
git checkout main
git pull
```

## 7. Rules (Important)

- Do not commit secrets (tokens/passwords/keys)
- Do not commit local DB/log/temp files
- Do not force-push `main`
- Do not merge your own PR without review (recommended team rule)

## 8. Project Run Quick Start

```bash
npm run init-db
npm start
```

Login page:
- `http://127.0.0.1:8080/login.html`

Default admin (local dev):
- username: `admin`
- password: `admin123`
