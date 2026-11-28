import { describe, it, expect } from "vitest";
import { ParseHistoricoUseCase } from "../application/parse-historico.use-case";
import { ManageAcademicProfileUseCase } from "../application/manage-academic-profile.use-case";
import { InMemoryAcademicProfileRepository } from "../infrastructure/in-memory-academic-profile.repo";
import type { IAcademicProfileRepository } from "../domain/interfaces/academic-profile-repo.interface";

const SYNTHETIC_STANDARD_TEXT = `
Histórico Escolar - Emitido em: 01/01/2026 às 10:00
DEG - Decanato de Ensino de Graduação
Nome: Estudante Exemplo
Matrícula: 200012345
ENGENHARIA DE COMPUTAÇÃO/CIC - BACHARELADO - DIURNO
1741/1 - 2016.1
IRA: 4.1250 MP: 4.0100
2022.1
PROGRAMA DE AVALIAÇÃO SERIADA
Componentes Curriculares Cursados/Cursando
2022.1 ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES
01 APRCIC0004 90 100,0 SS
2022.1 CÁLCULO 1
02 APRMAT0025 90 95,0 MS
2023.1 CÁLCULO 2
01 TRMAT0026 90 50,0 -
2026.1 SINAIS E SISTEMAS EM TEMPO CONTÍNUO
01 MATRENE0067 60 100,0 -
`;

const SYNTHETIC_ANALYTICAL_RUST_TEXT = `
Histórico Escolar - Emitido em: 01/01/2026 às 10:00
Nome: Estudante Exemplo
Matrícula: 200012345
ENGENHARIA DE COMPUTAÇÃO/CIC - BACHARELADO - DIURNO
 1741/1 - 2016.1
 IRA: 4.1250 MP: 4.0100
 2022.1

PROGRAMA DE AVALIAÇÃO SERIADA
Componentes Curriculares Cursados/Cursando
2022.1
 90ALGORITMOS E PROGRAMAÇÃO DE COMPUTADORES APROVADO(A)

CIC0004
 EMENTA: Construção de algoritmos e estruturas de dados.
2022.1
 90CÁLCULO 1 CUMPRIU

MAT0025
 EMENTA: Limites, derivadas e integrais.
2023.1
 90CÁLCULO 2 TRANCADO

MAT0026
 EMENTA: Séries e equações diferenciais.
2026.1
 60SINAIS E SISTEMAS EM TEMPO CONTÍNUO MATRICULADO(A)

ENE0067
 EMENTA: Análise de sistemas lineares invariantes no tempo.
`;

describe("ParseHistoricoUseCase — formatos padrão e analítico (sintéticos)", () => {
  const useCase = new ParseHistoricoUseCase();

  it("extrai corretamente o histórico padrão do SIGAA", async () => {
    const { profile } = await useCase.execute({
      rawText: SYNTHETIC_STANDARD_TEXT,
    });

    expect(profile.matricula).toBe("200012345");
    expect(profile.courseName).toBe("ENGENHARIA DE COMPUTAÇÃO");
    expect(profile.curriculumCode).toBe("1741/1");
    expect(profile.admissionYear).toBe("2022.1");
    expect(profile.shift).toBe("DIURNO");
    expect(profile.ira).toBeCloseTo(4.125, 4);
    expect(profile.mp).toBeCloseTo(4.01, 4);

    const completed = profile.completedDisciplines.filter((d) => d.isCompleted);
    const enrolled = profile.completedDisciplines.filter(
      (d) => d.situation === "MATR",
    );

    expect(completed).toHaveLength(2);
    expect(enrolled).toHaveLength(1);
    expect(profile.trancadaEvents).toHaveLength(1);
  });

  it("extrai corretamente o histórico analítico com ementas (layout pdf-extract Rust)", async () => {
    const { profile } = await useCase.execute({
      rawText: SYNTHETIC_ANALYTICAL_RUST_TEXT,
    });

    expect(profile.matricula).toBe("200012345");
    expect(profile.courseName).toBe("ENGENHARIA DE COMPUTAÇÃO");
    expect(profile.curriculumCode).toBe("1741/1");
    expect(profile.admissionYear).toBe("2022.1");
    expect(profile.ira).toBeCloseTo(4.125, 4);

    const completed = profile.completedDisciplines.filter((d) => d.isCompleted);
    const enrolled = profile.completedDisciplines.filter(
      (d) => d.situation === "MATR",
    );

    expect(completed).toHaveLength(2);
    expect(enrolled).toHaveLength(1);
    expect(profile.trancadaEvents).toHaveLength(1);

    const apc = profile.completedDisciplines.find((d) => d.code === "CIC0004");
    expect(apc?.isCompleted).toBe(true);
    expect(apc?.workloadHours).toBe(90);
    expect(apc?.period).toBe("2022.1");
  });

  it("importFromPdfPath salva o perfil completo via extrator do repositório", async () => {
    const repo: IAcademicProfileRepository = new InMemoryAcademicProfileRepository();
    repo.extractPdfTextFromPath = async () => SYNTHETIC_ANALYTICAL_RUST_TEXT;
    const manage = new ManageAcademicProfileUseCase(repo);

    const { profile } = await manage.importFromPdfPath("/tmp/transcript.pdf");

    expect(profile.matricula).toBe("200012345");
    expect(profile.courseName).toBe("ENGENHARIA DE COMPUTAÇÃO");
    expect(profile.curriculumCode).toBe("1741/1");
    expect(profile.completedDisciplines.filter((d) => d.isCompleted)).toHaveLength(2);

    const saved = await repo.getProfile();
    expect(saved?.matricula).toBe("200012345");
  });
});
