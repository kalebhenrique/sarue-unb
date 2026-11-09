<h1 align="center">
<strong>Saruê UnB</strong>
</h1>

<p align="center">
    <img alt="Linux" src="https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black">
    <img alt="macOS" src="https://img.shields.io/badge/mac%20os-000000?style=for-the-badge&logo=macos&logoColor=F0F0F0">
    <img alt="Windows" src="https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white">
</p>

Saruê UnB é o **agregador acadêmico definitivo e moderno** para estudantes da [Universidade de Brasília (UnB)](https://www.unb.br), uma aplicação desktop de alta performance em **Tauri 2**, **Rust** e **React 19**. Ele centraliza e revitaliza a rotina universitária ao integrar **SIGAA**, **Aprender 3 (Moodle)** e **Microsoft Teams** em um feed unificado, sem atrito e com foco total em privacidade — mantendo todas as credenciais em um cofre criptográfico local e disponibilizando ferramentas essenciais como o **Monte sua Grade**, **Fluxograma Curricular interativo** de mais de 150 cursos e **Calculadora de IRA**.

---

<p align="center">
    <img alt="Saruê UnB" src="public/sarue-logo.png" width="280">
</p>

## ✨ Funcionalidades Principais

- **Feed Acadêmico Centralizado (SIGAA, Aprender 3 & Teams)**
- **Monte sua Grade com Solver em Rust**
- **Segurança Local-First com IOTA Stronghold**
- **Fluxograma Curricular Interativo**
- **Avaliação de Professores Usando Planilha Externa da Comunidade**
- **Calendário de eventos**
- **Calculadora e Simulador de IRA**
- **Performance Extrema com Dados Estáticos via CDN**
- **Opções de Acessibilidade**

---

## 🤝 Contribuindo & Desenvolvimento

O Saruê UnB é um projeto de código aberto feito por e para estudantes da UnB. Toda contribuição é bem-vinda: código, design, documentação e relatos de bugs.

O guia completo para configurar o ambiente local (Node.js, pnpm, Rust e dependências nativas do Tauri 2), rodar o aplicativo nos modos navegador e desktop, popular o banco de dados de desenvolvimento, executar os scrapers do SIGAA e abrir Pull Requests está em [CONTRIBUTING.md](CONTRIBUTING.md).

Documentação complementar do projeto:

- [ARCHITECTURE.md](ARCHITECTURE.md) — princípios de Clean Architecture e regras de fronteira checadas pelo linter
- [DESIGN.md](DESIGN.md) — identidade visual neobrutalista com tema de material escolar e adesivos, tipografia **Plus Jakarta Sans**
- [PRIVACY.md](PRIVACY.md) — política de privacidade

---

## 🏛️ Arquitetura

O projeto adota os princípios de **Clean Architecture** (Arquitetura Hexagonal), mantendo o domínio de negócios desacoplado do framework de apresentação e de detalhes de infraestrutura:

```
src/
  core/
    domain/          # Entidades (Course, FeedItem, Grade, Scenario...) e portas (I*Repository)
    application/     # Casos de uso do produto (sincronização, solver, cálculo de IRA)
    infrastructure/  # Adapters (Tauri IPC, Stronghold, SQLite, In-Memory) e bindings gerados
    container.ts     # Composition root (injeção de dependência por ambiente)
  components/        # Componentes de interface e primitivos UI estilo shadcn
  screens/           # Telas do app (Dashboard, Grade, Cursos, Meu Curso, Calculadora IRA, Configurações)
  scrapers/          # Scrapers standalone do SIGAA para execução em CI/CD
src-tauri/           # Backend Rust: driver de I/O, cofre Stronghold, SQLite, solver e commands IPC
```

---

## 📄 Licença

Distribuído sob a licença **Apache-2.0**. Consulte o arquivo [LICENSE](LICENSE) para mais detalhes.
