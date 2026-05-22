# Contributing to stackyrd-nano

Thank you for your interest in contributing to `stackyrd-nano`! We welcome contributions of all kinds — bug fixes, new features, documentation improvements, and more. This guide will help you get started.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [How to Contribute](#how-to-contribute)
3. [Project Structure](#project-structure)
4. [Development Setup](#development-setup)
5. [Coding Standards](#coding-standards)
6. [Testing](#testing)
7. [Submitting Pull Requests](#submitting-pull-requests)

---

## Code of Conduct

This project follows a standard open-source code of conduct. Please be respectful and considerate in all interactions.

---

## How to Contribute

- **Bug Reports**: Open an [issue](https://github.com/diameter-tscd/stackyrd-nano/issues) with a clear description, steps to reproduce, and expected vs. actual behavior.
- **Feature Requests**: Open an [issue](https://github.com/diameter-tscd/stackyrd-nano/issues) to discuss your idea before implementing.
- **Pull Requests**: Fork the repo, create a feature branch, make your changes, and open a PR against `main`.

---

## Project Structure

```
stackyrd-nano/
├── cmd/app/          # Application entry point
├── config/           # Configuration files
├── internal/         # Internal packages (not exported)
├── pkg/              # Public/shared packages
├── scripts/          # Build and utility scripts
├── tests/            # Integration and e2e tests
├── docs_wiki/        # Extended documentation
└── .github/          # CI/CD workflows
```

---

## Development Setup

### Prerequisites

- **Go 1.21+**
- **Git**

### Steps

```bash
# Clone the repository
git clone https://github.com/diameter-tscd/stackyrd-nano.git
cd stackyrd-nano

# Install dependencies
go mod download

# Make your changes on a new branch
git checkout -b feature/my-change

# Run the application locally
go run cmd/app/main.go

# Build for production
go run scripts/build/build.go
```

---

## Coding Standards

- Follow standard [Go conventions](https://go.dev/doc/effective_go).
- Keep functions small and focused.
- Write clear, descriptive commit messages.
- Do not push secrets or credentials — use environment variables or config files.
- Keep the project's existing structure and patterns when adding new code.

---

## Testing

- Ensure existing tests pass before submitting:
  ```bash
  go test ./...
  ```
- Add tests for new functionality where applicable.
- Place unit tests alongside the code they test.

---

## Submitting Pull Requests

1. Fork and clone the repository.
2. Create a descriptive branch name (e.g., `feature/jwt-refresh` or `fix/config-panic`).
3. Make your changes, adhering to the coding standards above.
4. Run `go test` and confirm everything passes.
5. Open a PR against `main` with a clear description of what was changed and why.
6. Keep PRs focused and moderate in size.

---

Thank you for helping make `stackyrd-nano` better!
