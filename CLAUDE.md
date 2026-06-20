# CLAUDE.md

This file gives Claude context about the md-todo project.

## What this is

A zero-dependency, no-build, client-side Kanban board that reads and writes local Markdown checklist files. It runs as a static web app served over HTTP and uses the browser File System Access API to read/write `.md` files directly on the user's machine.

## How to run

No build step. No npm install. Just serve the root directory over HTTP:

```bash
# macOS helper
./start.command

# Python
python -m http.server 8000

# Node
npx http-server .
```

Open `http://localhost:8000` in a Chromium-based browser (Chrome, Edge, Opera). Firefox and Safari do not support the File System Access API.

## Architecture

Pure ES modules, no framework, no bundler.

| File | Role |
|---|---|
| `index.html` | App shell and all static HTML (sidebar, board, modals) |
| `src/styles.css` | All styling — dark/light theme via `.light-theme` class on `<body>` |
| `src/main.js` | Central state (`state` object), render orchestration, save logic |
| `src/file-system.js` | File System Access API wrappers + IndexedDB for persisting handles across sessions |
| `src/parser.js` | Parses Markdown into structured `{ columns, tasks }` data and compiles it back |
| `src/components/sidebar.js` | Sidebar rendering — connected files, project selector |
| `src/components/kanban.js` | Board columns, task cards, drag-and-drop |
| `src/components/modal.js` | Task edit/create modal |

### State shape

```js
state = {
  projects: [],           // { id, label, name, type, handle, fileName, data, permissionGranted }
  selectedProjectIds: [], // project IDs active on the board
  searchQuery: '',
  hideCompleted: false,
  activeTask: null,
  activeProjectId: null,
  projectColors: {}
}
```

### Markdown conventions

- `## Heading` → kanban column
- `- [ ] Task` / `- [x] Task` → task card (completed or not)
- Indented `  - [ ]` under a task → subtask
- `#tag` tokens in task text → tags

### Data flow

1. User connects a file/folder → `addProjectHandle()` in `main.js`
2. `file-system.js` reads raw text; `parser.js` parses it into `project.data`
3. User drags a card or edits a task → state is mutated in memory
4. `saveProjectToDisk()` calls `compileMarkdown()` and writes back via File System Access API

## Active work

- Branch `claude/mobile-git-integration-b27y97` — adding GitHub API integration so the app works on mobile and online without requiring local file access. The approach: PAT-based auth stored in localStorage, GitHub Contents API for reads/writes, new connection type in the sidebar alongside the existing local file/folder options.

## Coding conventions

- No build tools, no TypeScript, no framework — keep it that way unless there's a strong reason
- Vanilla ES modules only (`type="module"` in the script tag)
- Avoid adding external CDN dependencies unless absolutely necessary
- DOM manipulation is direct (no virtual DOM); HTML structure lives in `index.html` and components inject into named container elements
- `renderApp()` is the main re-render entry point — call it after any state mutation
- New UI panels follow the existing pattern: static HTML in `index.html`, wired up in `initializeApp()` in `main.js`
