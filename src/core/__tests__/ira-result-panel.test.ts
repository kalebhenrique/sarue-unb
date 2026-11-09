import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IraResultPanel } from '../../components/ira/IraResultPanel';
import type { IraCalculation } from '@/core';

const BASE_CALCULATION: IraCalculation = {
  ira: 3.8,
  rawIra: 3.7,
  correctionOffset: 0.1,
  weightedSum: 150,
  creditsSum: 40,
  weightedCreditsSum: 120,
  mentionCount: 10,
  trancadasObrigatorias: 0,
  trancadasOptativas: 0,
  semesterIras: {},
};

describe('IraResultPanel Hotfix Tests', () => {
  it('não lança erro quando isSimulation é true (deltaAbs é null)', () => {
    // Esse era o bug que crashava no Windows: deltaAbs nulo causava null.toFixed(2)
    expect(() => {
      renderToStaticMarkup(
        React.createElement(IraResultPanel, {
          calculation: BASE_CALCULATION,
          sigaaIra: 3.8,
          isSimulation: true,
          canRestore: true,
          onRestore: () => {},
        }),
      );
    }).not.toThrow();
  });

  it('não lança erro quando sigaaIra é undefined ou nulo', () => {
    expect(() => {
      renderToStaticMarkup(
        React.createElement(IraResultPanel, {
          calculation: BASE_CALCULATION,
          sigaaIra: undefined,
          isSimulation: false,
          canRestore: false,
          onRestore: () => {},
        }),
      );
    }).not.toThrow();
  });

  it('não lança erro quando calculation.ira é null', () => {
    expect(() => {
      renderToStaticMarkup(
        React.createElement(IraResultPanel, {
          calculation: {
            ...BASE_CALCULATION,
            ira: null,
            rawIra: null,
          },
          sigaaIra: 3.5,
          isSimulation: false,
          canRestore: false,
          onRestore: () => {},
        }),
      );
    }).not.toThrow();
  });

  it('renderiza a discrepância corretamente quando houver diferença >= 0.05', () => {
    const html = renderToStaticMarkup(
      React.createElement(IraResultPanel, {
        calculation: {
          ...BASE_CALCULATION,
          ira: 4.2,
        },
        sigaaIra: 3.8,
        isSimulation: false,
        canRestore: false,
        onRestore: () => {},
      }),
    );
    expect(html).toContain('diferença de 0,40');
  });

  it('não renderiza tag de discrepância quando cálculo confere com SIGAA', () => {
    const html = renderToStaticMarkup(
      React.createElement(IraResultPanel, {
        calculation: {
          ...BASE_CALCULATION,
          ira: 3.82,
        },
        sigaaIra: 3.8,
        isSimulation: false,
        canRestore: false,
        onRestore: () => {},
      }),
    );
    expect(html).not.toContain('diferença de');
  });
});
