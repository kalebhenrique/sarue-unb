/**
 * Patch notes do Saruê UnB.
 *
 * Como publicar uma nova versão:
 *  1. Atualize `version` em `src-tauri/tauri.conf.json` e `package.json`.
 *  2. Adicione um objeto NO TOPO do array `PATCH_NOTES` com a mesma versão.
 *
 * A entrada cuja `version` for igual à versão instalada do app recebe o selo
 * "Atual" automaticamente — nada mais precisa ser alterado.
 */

export interface PatchNotesEntry {
  /** Versão no formato semver, ex.: "0.1.0" — igual à versão do release. */
  version: string;
  /** Data de publicação, exibida como texto livre. */
  date: string;
  /** Título curto da versão. */
  title: string;
  /** Lista de novidades, melhorias e correções. */
  items: string[];
}

export const PATCH_NOTES: PatchNotesEntry[] = [
  {
    version: "0.4.0",
    date: "09/11/2026",
    title: "Nova Tela de Calendário e Gerenciamento de Notas e Faltas",
    items: [
      "Nova tela de Calendário (obrigado @MauroSon).",
      "Gerenciamento de notas e faltas de disciplinas (obrigado @MauroSon).",
      "Melhorias de interface e usabilidade nas telas Montar Grade e Calcular IRA",
      "Mais estabilidade na integração com Microsoft Teams",
      "Resolução de diversos bugs",
      "Extra: criação do perfil oficial do Instagram, @sarueapp",
    ],
  },
  {
    version: "0.3.5",
    date: "06/11/2026",
    title: "Badges no Ícone e Atualizador",
    items: [
      "Notificações no ícone: contador de pendências no ícone do aplicativo (Dock e barra de tarefas) enquanto estiver aberto.",
      "Correção no processo de atualização e reinicialização automática no Windows e macOS.",
      "Documentação e guias de contribuição aprimorados.",
    ],
  },
  {
    version: "0.3.4",
    date: "05/11/2026",
    title: "Redesenho de Avaliações e Correções no Windows",
    items: [
      "Catálogo de Docentes mais neutra: foco nos relatos da comunidade e taxa de recomendação, evitando enviesar por notas numéricas isoladas.",
      "Correção no empacotamento Windows para resolução de falha de conexão.",
    ],
  },
  {
    version: "0.3.3",
    date: "03/11/2026",
    title: "Compatibilidade com a Microsoft Store e Privacidade",
    items: [
      "Suporte à distribuição pela Microsoft Store.",
      "Publicação da Política de Privacidade oficial detalhando a arquitetura local-first e cofre criptográfico.",
      "Melhorias e ajustes no fluxo de compilação e empacotamento para Windows.",
    ],
  },
  {
    version: "0.3.2",
    date: "31/10/2026",
    title: "Otimização de Espaço, Performance e Sincronização",
    items: [
      "Aplicativo 45% mais leve: download mais rápido e menos espaço ocupado no computador.",
      "Sincronização mais rápida: scraping otimizado com cache de sessão no SIGAA e paralelização no Aprender3.",
      "Meu Curso: cálculo dinâmico da porcentagem de integralização mais realista, simulação de matrizes e outros cursos.",
      "Banco de dados: migrações nativas no SQLite.",
      "Agora é possível acessar Meu Curso sem login escolhendo curso e matriz manualmente",
    ],
  },
  {
    version: "0.3.1",
    date: "29/10/2026",
    title: "Correções na Tela Meu Curso e no Scraping de Cursos",
    items: [
      "Correção de erro da tela Meu Curso não funcionar offline.",
      "Seleção manual de matriz curricular preservada sem ser sobrescrita na sincronização.",
      "Correção de erro do sistema não identificar corretamente cursos iguais com turnos distintos (obrigado @MauroSon).",
      "Proteção contra falhas ou emissão incompleta do histórico do SIGAA.",
    ],
  },
  {
    version: "0.3.0",
    date: "28/10/2026",
    title: "Avaliação de Professores, Modo Escuro e Acessibilidade",
    items: [
      "Avaliação de Professores: notas e relatos via planilha pública da comunidade (obrigado @MauroSon).",
      "Modo escuro em toda a interface.",
      "Envio de feedback e reporte de bugs diretamente pelo app.",
      "Opção de manter o app aberto em segundo plano na bandeja.",
      "Configurações: interface aprimorada, mais amigável e intuitiva.",
      "Feed aprimorado com seleção múltipla de itens.",
      "Tela de carregamento com esqueleto visual da plataforma.",
      "Opções de acessibilidade (redução de animações e escala da interface).",
      "Nova seção de contribuidores em Configurações.",
    ],
  },
  {
    version: "0.2.2",
    date: "22/10/2026",
    title: "Hotfix: Estabilidade Gerais",
    items: [
      "Calculadora de IRA: correção de travamento ao exibir cenários simulados na plataforma Windows.",
      "Adição de nova tela de error.",
    ],
  },
  {
    version: "0.2.1",
    date: "22/10/2026",
    title: "Segurança do Cofre, Correções no IRA e Atualizador Integrado",
    items: [
      "Atualizações automáticas: verificação em segundo plano ao sincronizar com indicador visual na barra lateral.",
      "Cofre seguro resiliente: migração protegida com backup atômico e prevenção de perda de dados.",
      "Calculadora de IRA corrigida: separação precisa de créditos reais e cálculo ponderado oficial (CEG 0001/2020).",
      "Projeções futuras: indexação progressiva de semestres simulados para estimativas confiáveis.",
      "Efeitos sonoros de clique opcional",
    ],
  },
  {
    version: "0.2.0",
    date: "21/10/2026",
    title: "Gerenciamento de Currículo e Grades por Semestre",
    items: [
      "Editor de currículo: adicione, edite ou busque disciplinas no catálogo da UnB.",
      "Optativas de interesse destacadas em lilás tanto na lista quanto no mapa.",
      "Envio direto de disciplinas do currículo para o Montar Grade.",
      "Grades salvas de forma independente para cada semestre.",
      "Inicialização automática com o sistema nas Configurações.",
      "Alerta de última semana para trancamento parcial e geral.",
      "Notas de matérias equivalentes visíveis diretamente no fluxograma.",
    ],
  },
  {
    version: "0.1.1",
    date: "21/10/2026",
    title: "Melhorias de UI, UX e estabilidade",
    items: [
      "Feed: ordenação corrigida com itens recentes primeiro.",
      "Disciplinas: cabeçalho padronizado e carregamento com skeleton.",
      "Configurações: tecla Enter para salvar credenciais.",
      "Teams: login concentrado nas Configurações.",
      "Aprender 3: ignora automaticamente turmas institucionais.",
      "Notificação toast ao concluir sincronização.",
      "Windows: correções em links externos e campos de senha.",
    ],
  },
  {
    version: "0.1.0",
    date: "19/10/2026",
    title: "Lançamento inicial",
    items: [
      "Cofre seguro local para SIGAA, Aprender 3 e Teams.",
      "Feed integrado de avisos, tarefas e prazos.",
      "Montador de Grade com resolução de conflitos e exportação PNG.",
      "Meu Curso: fluxograma interativo, pré-requisitos e histórico.",
      "Calculadora de IRA com simulação de notas futuras.",
      "Sincronização sob demanda e atualizador integrado.",
    ],
  },
];
