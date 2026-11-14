import type { IraScenario } from '../domain/entities/ira-scenario';
import type { IIraScenarioRepository } from '../domain/interfaces/ira-scenario-repo.interface';
import { parseIraScenarioJson } from './persistence-codec';

// Espelho em localStorage para a prévia web (fora do Tauri): o cenário sobrevive
// a recarregamentos no dev, sem banco.
const STORAGE_KEY = 'sarue_ira_scenario_v1';
const LEGACY_STORAGE_KEY = 'unb_aggregator_ira_scenario_v1';

export class InMemoryIraScenarioRepository implements IIraScenarioRepository {
  private scenarioInMemory: IraScenario | null | undefined;

  async getScenario(): Promise<IraScenario | null> {
    if (this.scenarioInMemory !== undefined) {
      return this.scenarioInMemory;
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw) {
          const parsed = parseIraScenarioJson(raw);
          if (parsed) {
            this.scenarioInMemory = parsed;
            return parsed;
          }
        }
      } catch {}
    }

    return null;
  }

  async saveScenario(scenario: IraScenario): Promise<void> {
    this.scenarioInMemory = scenario;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(scenario));
      } catch {}
    }
  }

  async clearScenario(): Promise<void> {
    this.scenarioInMemory = null;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {}
    }
  }
}
