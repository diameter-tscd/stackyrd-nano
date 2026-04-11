<div align="center">
  <img src=".assets/stackyrd_logo.PNG" alt="stackyrd" style="width: 50%; max-width: 400px;"/>
</div>
<div align="center">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"/>
  <img src="https://img.shields.io/badge/go-1.21%2B-00ADD8.svg" alt="Go Version"/>
  <img src="https://img.shields.io/badge/build-passing-brightgreen.svg" alt="Build Status"/>
  <img src="https://img.shields.io/badge/github-diameter--tscd/stackyrd-181717.svg" alt="GitHub Repo"/>
</div>
<br>

stackyrd is a lightweight, production-ready application framework featuring modular architecture, comprehensive monitoring, real-time dashboards, and extensive infrastructure integrations. Built for scalability and ease of deployment.

## Quick Start

### Prerequisites
- Go 1.21+

### Installation & Run

```bash
# Clone the repository
git clone https://github.com/diameter-tscd/stackyrd.git
cd stackyrd

# Install dependencies
go mod download

# Run the application
go run cmd/app/main.go
```

## Screenshots

### Console
![Backend Console](.assets/Recording_Console.gif)

## Key Features

- **Modular Services**: Enable/disable services via configuration
- **Security**: API encryption, authentication, and access controls
- **Build Tools**: Automated build scripts with backup and archiving
- **Structured Logging**: Comprehensive console logging with color-coded output

## Documentation

**[Full Documentation](docs_wiki/)** - Comprehensive guides and references

## License

Apache License Version 2.0: [LICENSE](LICENSE)

---

**Powered by diameter-tscd.**