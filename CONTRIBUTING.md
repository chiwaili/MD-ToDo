# Contributing

Thanks for your interest in contributing to md-todo!

## Making changes

- No build step. Edit files directly and refresh the browser.
- `src/main.js` is the entry point — start there to understand state and rendering.
- See `CLAUDE.md` for a full architecture overview.

## What we'd welcome

- Mobile / responsive layout improvements
- GitHub integration so files can be read from and saved to a GitHub repo
- Better markdown compatibility (e.g. GFM task lists in more edge cases)
- Smarter folder discovery logic (multi-file projects)
- Keyboard shortcuts and accessibility (ARIA, focus management)
- Additional task metadata (due dates, priority levels)
- Firefox / Safari support (requires a fallback for the File System Access API)

## Guidelines

- Keep it dependency-free. No npm packages, no bundler, no framework.
- Match the existing code style: vanilla ES modules, direct DOM manipulation.
- Test manually in Chrome before submitting — there are no automated tests yet.
- Keep PRs focused. One feature or fix per PR.

## Submitting

Open a pull request against `main`. Describe what you changed and why. Screenshots are helpful for UI changes.
