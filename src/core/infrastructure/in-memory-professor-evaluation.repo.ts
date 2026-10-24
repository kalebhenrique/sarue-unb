import type { ProfessorEvaluation } from '../domain/entities/professor-evaluation';
import {
  PROFESSOR_EVALUATIONS_CSV_URL,
  parseProfessorEvaluationsCsv,
} from '../domain/entities/professor-evaluation';
import type { IProfessorEvaluationRepository } from '../domain/interfaces/professor-evaluation-repo.interface';

const DEMO_EVALUATIONS_CSV = `Carimbo de data/hora,Campus que cursou a disciplina?,Disciplina (ou código),Modalidade,"Semestre que cursou? 2024/2, etc",Qual departamento ou curso da disciplina?,Professor (a),Didática do professor em uma escala de 0 a 10?,Nível de dificuldade da disciplina?,Carga de atividades e leitura?,Material disponibilizado?,Recomendaria para outro aluno?,Feedback sincero ✨,"Método de avaliação? (Prova, trabalho, apresentação, participação, projeto etc.)",Monitor?,Cobra presença?,Como foi? (opcional),Professor se importa com os alunos?,Realmente aprendeu o conteúdo da disciplina?
27/02/2025 21:37:15,Campus Darcy,CIC0002 - Fundamentos Teóricos da Computação,🏫 Presencial,2024/2,CIC,Daniel de Paula Porto,10,"🟡 Fácil – Tem desafios, mas nada absurdo.",🟡Moderada – Dá para administrar bem o tempo.,✅ Suficiente e bem organizado – Dá para estudar só com ele.,✅ Sim,Se importa muito com os alunos e com o ensino. Indico a todos.,Provas e Trabalhos,✅ Sim,🟢 Tranquilo com chamada,✅ Passei,⭐ Muito,"⭐ Sim, quase tudo"
27/02/2025 21:38:21,Campus Darcy,Física Teórica,🏫 Presencial,2024.2,Agronomia,Galina Gulis,10,"🟡 Fácil – Tem desafios, mas nada absurdo.",🟢Muito leve – Pouca leitura e exercícios tranquilos,✅ Suficiente e bem organizado – Dá para estudar só com ele.,✅ Sim,"Explica muito bem e a prova é basicamente questões da lista de exercícios que ela passa antes.",Provas,✅ Sim,🟢 Tranquilo com chamada,✅ Passei,⭐ Muito,🙂 Aprendi grande parte
27/02/2025 22:14:26,Campus Darcy,Teoria Sociológica Clássica 1,🏫 Presencial,2024.2,SOL - Sociologia,Zakia Ismail,9,"🟡 Fácil – Tem desafios, mas nada absurdo.",🟠Intensa – Requer organização para dar conta.,✅ Suficiente e bem organizado – Dá para estudar só com ele.,✅ Sim,"Essa professora é maravilhosa e ensina muito bem, porém achei meio puxado por ter três seminários com relatório cada e uma prova discursiva. Ela cobra presença mas é bem compreensiva.",Provas e Apresentações,❌ Não,🔴 Rigoroso com chamada,✅ Passei,⭐ Muito,"⭐ Sim, quase tudo"
27/02/2025 22:38:34,Campus Darcy,Introdução à Economia,🏫 Presencial,2024/1,ECO - Economia,Deborah Reis,9,"🟡 Fácil – Tem desafios, mas nada absurdo.",🟡Moderada – Dá para administrar bem o tempo.,✅ Suficiente e bem organizado – Dá para estudar só com ele.,🔄 Depende do professor,"Nunca cobrou chamada e os controles eram tranquilos de fazer, dava pra tirar uma boa nota só estudando pelos slides super organizados.",Provas e Projetos,✅ Sim,🟢 Tranquilo com chamada,✅ Passei,⭐ Muito,🙂 Aprendi grande parte
27/02/2025 21:46:19,Campus Darcy,FAV0018,🏫 Presencial,2024/2,Medicina Veterinária,Gino Rocha,1,🔥 Muito dificil – Só os fortes sobrevivem,🟠Intensa – Requer organização para dar conta.,❌ Inexistente – Tem que procurar na internet.,❌ Não,"Provas nada coerentes com o conteúdo e metodologia de ensino difícil de acompanhar.",Provas,❌ Não,🔴 Rigoroso com chamada,❌ Reprovei,😶 Nada,❌ Não aprendi o conteúdo`;

export class InMemoryProfessorEvaluationRepository
  implements IProfessorEvaluationRepository
{
  private cache: ProfessorEvaluation[] | null = null;

  constructor(private seedEvaluations?: ProfessorEvaluation[]) {
    if (seedEvaluations) {
      this.cache = [...seedEvaluations];
    }
  }

  async getEvaluations(forceRefresh = false): Promise<ProfessorEvaluation[]> {
    if (this.seedEvaluations) {
      return [...this.seedEvaluations];
    }

    if (!forceRefresh && this.cache && this.cache.length > 0) {
      return this.cache;
    }

    // Dentro do Tauri, fetch do webview para hosts externos pende até o
    // loader do WebKitGTK desistir: falhou o comando Rust? Devolve vazio —
    // a tela mostra estado de erro com "Tentar novamente", nunca demo
    // passando por dado real. Fora do Tauri (dev no browser), busca com prazo.
    if (typeof fetch !== 'undefined' && !this.isTauriRuntime()) {
      try {
        const res = await fetch(PROFESSOR_EVALUATIONS_CSV_URL, {
          cache: forceRefresh ? 'no-store' : 'default',
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
          const csvText = await res.text();
          const parsed = parseProfessorEvaluationsCsv(csvText);
          if (parsed.length > 0) {
            this.cache = parsed;
            return parsed;
          }
        }
      } catch {
        // Fallback para semente local em caso de falta de rede ou bloqueio
      }
    }

    if (this.isTauriRuntime()) {
      return [];
    }

    const demo = parseProfessorEvaluationsCsv(DEMO_EVALUATIONS_CSV);
    this.cache = demo;
    return demo;
  }

  private isTauriRuntime(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }
}
