# Contribuindo com o Saruê UnB

Ficamos muito felizes com o seu interesse em ajudar a construir o **Saruê UnB**! Este projeto é feito por e para estudantes da UnB, e toda contribuição — seja reportando bugs, sugerindo melhorias, aprimorando o design ou escrevendo código — é muito bem-vinda.

Antes de começar, por favor leia nosso [Código de Conduta](CODE_OF_CONDUCT.md).

---

## 🧭 Como Você Pode Contribuir?

- **Encontrou um bug?** Abra uma [Issue](../../issues) detalhando o ocorrido, o seu sistema operacional, passos para reproduzir e prints/logs do erro.
- **Tem uma ideia ou sugestão?** Abra uma Issue para discutirmos a proposta antes de você começar a implementar, garantindo alinhamento com a arquitetura e visão do produto.
- **Quer programar?** Explore as Issues abertas, especialmente as marcadas com a tag `good first issue`. Comente na Issue avisando que vai assumir a tarefa para evitar retrabalho de outros contribuidores!

---

## 🛠️ Configuração do Ambiente Local

### Pré-requisitos

1. **Node.js & pnpm**:
   - **Node.js**: v20+ (recomendado v22 LTS)
   - **pnpm**: v10+ (`npm install -g pnpm@latest` ou `brew install pnpm`)
2. **Rust & Ferramentas do Tauri 2** _(necessários para rodar o app desktop)_:
   - Toolchain Rust estável: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
   - Dependências nativas de compilação da sua plataforma:
     - **macOS**: ferramentas de linha de comando do Xcode:

       ```bash
       xcode-select --install
       ```

     - **Debian / Ubuntu / Pop!\_OS / Linux Mint** (dependências do WebKitGTK e compilação do Tauri):

       ```bash
       sudo apt update
       sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
       ```

     - **Arch Linux / Manjaro**:

       ```bash
       sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget openssl librsvg libappindicator-gtk3
       ```

     - **Fedora / RHEL**:

       ```bash
       sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget
       ```

3. **Android SDK & NDK** _(opcional — necessário apenas para desenvolvimento e build Android)_:
   - **JDK 17+** (ex.: `brew install openjdk@17` ou o JBR incluso no Android Studio).
   - **Android SDK & NDK**: podem ser instalados via Android Studio (_SDK Manager → SDK Tools → NDK (Side by side) + Android SDK Platform-Tools_) ou via `sdkmanager`.
     - O wrapper `scripts/tauri-cli.mjs` detecta automaticamente o SDK em `~/Library/Android/sdk` (macOS) ou pelas variáveis `ANDROID_HOME` / `ANDROID_SDK_ROOT` e `NDK_HOME` / `ANDROID_NDK_HOME`, configurando os compiladores C/Clang e `llvm-ar` do NDK para compilar crates nativas como `libsodium-sys` (Stronghold).
   - **Targets Rust para Android**:

     ```bash
     rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
     ```

   - **Gerar projeto Android local** _(como `src-tauri/gen` é ignorado no Git, rode uma vez após clonar)_:

     ```bash
     pnpm android:init
     ```

### Passo a Passo (Fork & Clone)

1. Faça um **Fork** deste repositório no GitHub.
2. Clone o seu fork na sua máquina:

   ```bash
   git clone https://github.com/SEU-USUARIO/sarue-unb.git
   cd sarue-unb
   ```

3. Adicione o repositório oficial como `upstream`:

   ```bash
   git remote add upstream https://github.com/kalebhenrique/sarue-unb.git
   ```

4. Instale as dependências:

   ```bash
   pnpm install
   ```

---

## 💻 Executando o Projeto

O Saruê UnB oferece dois modos principais de desenvolvimento:

- **Modo Navegador (Frontend Rápido)**:
  Para prototipar interfaces e componentes sem precisar compilar o backend Rust, utilizando dados mockados e adapters em memória:

  ```bash
  pnpm dev
  ```

- **Modo Desktop Completo (Tauri + Rust)**:
  Para testar integrações com o cofre criptográfico, banco SQLite e comandos nativos em Rust:

  ```bash
  pnpm tauri dev
  ```

- **Modo Android (USB-C com HMR ou Emulador)**:
  Para rodar no celular físico conectado via USB (sem precisar abrir o Android Studio):
  1. No celular, ative **Opções do desenvolvedor → Depuração USB**.
  2. Conecte via USB, selecione o modo **"Transferência de arquivos / Android Auto"** na notificação do Android e autorize o alerta **"Permitir depuração USB?"**.
  3. Execute (o script configura `adb reverse` nas portas `1420` e `1421` automaticamente):

  ```bash
  pnpm android:dev
  ```

- **Popular Banco de Dados de Desenvolvimento**:
  O projeto adota uma política de **isolamento estrito entre desenvolvimento e produção**. Para preencher turmas, feed de avisos/tarefas, histórico escolar e simulação de IRA fictícios no SQLite de desenvolvimento:

  ```bash
  pnpm seeds

  # Caso queira resetar o banco de dev antes de reinserir os dados
  pnpm seeds --clean
  ```

---

## 📡 Scrapers do SIGAA (Standalone)

Os scrapers de extração pública do SIGAA podem ser executados isoladamente via Node.js, sem depender do app desktop:

```bash
# Executa todos os scrapers de turmas, cursos e calendário
pnpm run scrape:all

# Ou execute individualmente:
pnpm run scrape:grade       # Departamentos e turmas ofertadas
pnpm run scrape:courses     # Catálogo de 150+ cursos e matrizes curriculares
pnpm run scrape:calendar    # Calendário acadêmico
pnpm run scrape:professors  # Catálogo de docentes (roda trimestralmente via CI/CD)
```

---

## 🧪 Verificação & Testes

Execute localmente os testes e linters (TypeScript e Rust) que também são validados automaticamente via GitHub Actions ao abrir Pull Requests:

```bash
# Executa TUDO de uma vez (todos os linters + todos os testes) — recomendado antes de abrir PRs
pnpm check:all # ou apenas: pnpm check

# --- Ou, separadamente ---

# Todos os testes (TypeScript via Vitest + Rust via Cargo)
pnpm test:all

# Todos os linters (TypeScript typecheck + ESLint + Rust fmt & Clippy)
pnpm lint:all

# --- Comandos específicos / individuais ---
pnpm test          # Testes unitários do frontend e use cases (Vitest)
pnpm test:rust     # Testes unitários do backend em Rust
pnpm typecheck     # Checagem estática de tipos (TypeScript)
pnpm lint          # Linting do frontend e regras de fronteira arquitetural (ESLint)
pnpm lint:rust     # Linter e verificação de formatação em Rust (Clippy com -D warnings + rustfmt check)
pnpm format:rust   # Formata o código Rust automaticamente
```

---

## 📦 Compilação de Produção e Preview (Build)

### Desktop (macOS, Linux e Windows)

Para gerar os instaladores e binários executáveis otimizados para o seu sistema operacional (`.dmg` no macOS, `.deb`/`.AppImage` no Linux, `.msi`/`.exe` no Windows):

```bash
pnpm tauri build
```

### Android (APK de Preview e Produção)

- **Build de Preview Local** (gera o APK `arm64-v8a` assinado com nome **`Saruê UnB (Preview)`**, identificador `br.unb.sarue.preview` isolado do app de produção e ícone com a label **`PREVIEW`**):

  ```bash
  pnpm android:preview
  ```

- **Build de Preview + Instalar no Celular via USB**:

  ```bash
  pnpm android:preview:install
  ```

- **Build de Produção Android** (restaura nome `Saruê UnB`, identificador `br.unb.sarue` e ícone oficial):

  ```bash
  pnpm android:build
  ```

---

## 🏛️ Diretrizes de Código & Arquitetura

- **Clean Architecture**: Consulte o [ARCHITECTURE.md](ARCHITECTURE.md). As regras de fronteira são estritas e checadas pelo linter: use cases e UI dependem de contratos e do container de dependências, nunca importe arquivos internos de `infrastructure` diretamente fora de `src/core`.
- **Identidade Visual**: Siga o estilo visual neobrutalista amigável documentado no [DESIGN.md](DESIGN.md).

---

## 🚀 Fluxo de Pull Request

1. Garanta que sua branch `main` local esteja sincronizada com o `upstream`:

   ```bash
   git checkout main
   git pull upstream main
   ```

2. Crie uma branch para o seu trabalho:
   - Novas funcionalidades: `git checkout -b feat/nome-da-feature`
   - Correções de bugs: `git checkout -b fix/nome-do-bug`
   - Manutenção/docs/infra: `git checkout -b chore/descricao`
3. Faça commits atômicos seguindo o padrão **Conventional Commits**:
   - `feat: adiciona filtro por departamento no solver de grade`
   - `fix: corrige cálculo de peso de trancamento no IRA`
   - `docs: atualiza instruções de contribuição`
4. **Validação Obrigatória antes de enviar (Checagem de CI)**:
   Antes de abrir o PR, execute a suíte de verificação local para garantir que os testes e linters passem verde no GitHub Actions:

   ```bash
   pnpm check:all
   ```

   _(Detalhes de cada comando na seção [Verificação & Testes](#-verificação--testes))._

5. Envie a branch para o seu fork:

   ```bash
   git push origin feat/nome-da-feature
   ```

6. Abra o **Pull Request** no GitHub:
   - Descreva com clareza o que foi alterado e o porquê.
   - Para mudanças visuais na interface, inclua **prints ou GIFs** de antes e depois.
   - Vincule a Issue correspondente na descrição (ex: `Closes #42`).

### 🤖 Builds de Preview em Pull Requests (Android e macOS)

Para testar alterações diretamente em dispositivos Android ou Macs sem precisar compilar localmente, o projeto conta com workflows de **Preview Build** no GitHub Actions:

- **Como acionar**: quando um mantenedor adiciona a label **`preview`** ao Pull Request (ou quando novos commits são enviados para um PR que já possui essa label), os workflows **Preview Build (Android)** (`aarch64` APK) e **Preview Build (macOS)** (`aarch64-apple-darwin` DMG) são iniciados automaticamente.
- **Download dos artefatos**: assim que cada build termina, o bot publica e atualiza automaticamente um comentário no PR com os links diretos para download dos artefatos (`.apk` e `.dmg`, mantidos por **14 dias** — é necessário estar logado no GitHub para baixar).
- **Segurança e aprovação para contribuidores externos (forks)**:
  - Os builds de preview rodam no evento `pull_request` com permissão somente-leitura (`contents: read`).
  - Para PRs vindos de forks externos, mesmo após a adição da label `preview`, a execução do workflow permanece aguardando autorização manual de um administrador/mantenedor (**"Approve and run"**) antes de rodar código externo.

---

## 🔒 Privacidade e Segurança Acadêmica

- **Nunca faça commit de dados reais**: credenciais de acesso, cookies de sessão, arquivos `.env` ou matrículas de alunos reais.
- Em prints de Pull Requests ou discussões de Issues, **anonimize qualquer dado pessoal ou nota**.
- O projeto não aceita telemetria, cookies de rastreamento ou bibliotecas de analytics externos.

---

## 💬 Dúvidas ou Ajuda?

Precisa de ajuda para configurar o ambiente ou discutir uma ideia de implementação?
Abra uma [Issue](../../issues) ou participe das discussões com os mantenedores. Toda contribuição é bem-vinda!
