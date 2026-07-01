# Contributing to Expense Tracker Pro

Thank you for contributing to Expense Tracker Pro! As an enterprise-grade SaaS project, we maintain high standards for code quality, architectural integrity, and testing.

## Code Standards & Linting
* **Backend**: Node.js code must pass ESLint (`npm --prefix backend run lint`). We use standard CommonJS modules.
* **Frontend**: React code must pass ESLint (`npm --prefix frontend run lint`). We use modern ESM and Vite.
* **Formatting**: Ensure your code is formatted properly and preserves existing documentation/comments.

## Git Workflow
1. **Branching**: Use descriptive branch names prefixed with `feature/`, `bugfix/`, or `refactor/`.
2. **Pull Requests**:
   - Write clear description explaining *what* changed and *why*.
   - Ensure the CI/CD build, tests, and lint checks pass on your branch before requesting reviews.
3. **Commits**: Follow conventional commits (e.g. `feat: add api docs`, `fix: resolving memory leak`).

## Testing Requirements
* Any changes to business logic or database queries should be covered by automated tests.
* Run backend tests locally with `npm --prefix backend run test`.

## Release & Versioning
* We follow Semantic Versioning (SemVer): `MAJOR.MINOR.PATCH`.
* Release branches must merge back into `main` after validation.
