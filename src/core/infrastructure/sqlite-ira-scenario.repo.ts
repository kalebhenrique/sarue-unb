import type { IraScenario } from '../domain/entities/ira-scenario';
import type { IIraScenarioRepository } from '../domain/interfaces/ira-scenario-repo.interface';
import { InMemoryIraScenarioRepository } from './in-memory-ira-scenario.repo';
import { getDatabase } from './sqlite-feed.repo';
import { parseIraScenarioJson } from './persistence-codec';

const SCENARIO_ROW_ID = 'current';

// Espelho em memória para ambientes sem Tauri (prévia web e testes)
const fallbackRepo = new InMemoryIraScenarioRepository();

export class SqliteIraScenarioRepository implements IIraScenarioRepository {
  async getScenario(): Promise<IraScenario | null> {
    const db = await getDatabase();
    if (!db) return fallbackRepo.getScenario();

    try {
      const result = await db.select<{ payload: string }[]>(
        'SELECT payload FROM ira_scenario WHERE id = $1 LIMIT 1;',
        [SCENARIO_ROW_ID],
      );
      if (result && result.length > 0 && result[0].payload) {
        return parseIraScenarioJson(result[0].payload);
      }
      return null;
    } catch (e) {
      console.warn('[SqliteIraScenarioRepository] Falha ao ler cenário:', e);
      return fallbackRepo.getScenario();
    }
  }

  async saveScenario(scenario: IraScenario): Promise<void> {
    const db = await getDatabase();
    if (!db) return fallbackRepo.saveScenario(scenario);

    const payload = JSON.stringify(scenario);
    try {
      await db.execute(
        `INSERT INTO ira_scenario (id, payload, updated_at) VALUES ($1, $2, $3)
         ON CONFLICT(id) DO UPDATE SET payload = $2, updated_at = $3;`,
        [SCENARIO_ROW_ID, payload, scenario.updatedAt],
      );
    } catch (e) {
      console.warn('[SqliteIraScenarioRepository] Falha ao salvar cenário:', e);
      await fallbackRepo.saveScenario(scenario);
    }
  }

  async clearScenario(): Promise<void> {
    const db = await getDatabase();
    if (!db) return fallbackRepo.clearScenario();

    try {
      await db.execute('DELETE FROM ira_scenario WHERE id = $1;', [SCENARIO_ROW_ID]);
    } catch (e) {
      console.warn('[SqliteIraScenarioRepository] Falha ao limpar cenário:', e);
    }
    await fallbackRepo.clearScenario();
  }
}
