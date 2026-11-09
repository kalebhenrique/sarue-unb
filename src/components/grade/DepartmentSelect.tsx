import React from 'react';
import { Popover } from '@base-ui/react/popover';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { Department } from '@/core';

// Busca sem sensibilidade a acentos, maiúsculas ou pontuação ("ciencias" acha "Ciências")
const normalizeText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export interface DepartmentSelectProps {
  departments: Department[];
  value: string;
  onChange: (id: string) => void;
  /** Sem borda/raio próprios: vira segmento de uma unidade composta (a unidade guarda a borda e o foco). */
  bare?: boolean;
  /** Classes extras para o gatilho quando `bare` (largura, hover). */
  triggerClassName?: string;
}

/**
 * Seletor de departamento com busca interna.
 * Gatilho estilo SelectTrigger + popup com campo de pesquisa e lista filtrável.
 */
export const DepartmentSelect: React.FC<DepartmentSelectProps> = ({
  departments,
  value,
  onChange,
  bare = false,
  triggerClassName,
}) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  // Navegação por setas: índice ativo da lista filtrável (padrão combobox)
  const [activeIndex, setActiveIndex] = React.useState(0);
  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);
  const allDepts = React.useMemo(() => {
    if (departments.some((d) => d.id === 'ALL')) return departments;
    return [{ id: 'ALL', name: 'Todos os departamentos (UnB Geral)' }, ...departments];
  }, [departments]);

  const selectedName = React.useMemo(() => {
    if (!value || value === 'ALL') return 'Todos os departamentos (UnB Geral)';
    return allDepts.find((d) => d.id === value)?.name;
  }, [allDepts, value]);

  const filtered = React.useMemo(() => {
    const q = normalizeText(query);
    if (!q) return allDepts;
    return allDepts.filter((d) => normalizeText(d.name).includes(q));
  }, [allDepts, query]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(''); }}>
      <Popover.Trigger
        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-black focus:outline-hidden transition-[box-shadow,border-color,background-color] cursor-pointer select-none ${
          bare
            ? 'h-full rounded-r-xl focus-visible:ring-2 focus-visible:ring-inset ring-neo-blue'
            : 'h-10 rounded-xl border-2 border-ink bg-paper focus:ring-2 focus:ring-neo-blue'
        } ${triggerClassName ?? ''}`}
      >
        <span className="truncate text-left">{selectedName ?? 'Selecione o departamento'}</span>
        <ChevronDown className={`w-4 h-4 stroke-[2.5] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} className="isolate z-50">
          <Popover.Popup className="relative z-50 w-max min-w-[260px] max-w-[460px] rounded-lg border-2 border-ink bg-canvas text-black outline-hidden origin-(--transform-origin)">
            {/* Busca interna */}
            <div className="p-2 border-b-2 border-black/10">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 stroke-[2.5]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setActiveIndex((i) => Math.max(i - 1, 0));
                    } else if (e.key === 'Home' && filtered.length > 0) {
                      e.preventDefault();
                      setActiveIndex(0);
                    } else if (e.key === 'End' && filtered.length > 0) {
                      e.preventDefault();
                      setActiveIndex(filtered.length - 1);
                    } else if (e.key === 'Enter' && filtered[activeIndex]) {
                      e.preventDefault();
                      pick(filtered[activeIndex].id);
                    }
                  }}
                  role="combobox"
                  aria-expanded={open}
                  aria-controls={open ? 'dept-listbox' : undefined}
                  aria-activedescendant={open ? `dept-option-${filtered[activeIndex]?.id}` : undefined}
                  autoFocus
                  placeholder="Pesquisar departamento…"
                  className="w-full h-8 bg-paper pl-9 pr-3 text-xs font-semibold text-black rounded-lg border-2 border-ink focus:outline-hidden focus:ring-2 focus:ring-neo-blue placeholder:text-neutral-600"
                />
              </div>
            </div>

            {/* Lista filtrável (listbox navegável por setas) */}
            <div id="dept-listbox" role="listbox" className="p-1 max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="p-4 text-center text-xs font-semibold text-neutral-600">
                  Nenhum departamento encontrado
                </p>
              ) : (
                filtered.map((dept, index) => {
                  const isSelected = dept.id === value;
                  const isActive = index === activeIndex;
                  return (
                    <button
                      key={dept.id}
                      id={`dept-option-${dept.id}`}
                      ref={(el) => {
                        if (el && isActive) {
                          el.scrollIntoView({ block: 'nearest' });
                        }
                      }}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => pick(dept.id)}
                      onMouseMove={() => setActiveIndex(index)}
                      className={`relative flex w-full cursor-pointer select-none items-center gap-2 rounded-lg py-1.5 pr-8 pl-2.5 text-xs font-bold focus:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-inset hover:bg-neo-blue hover:text-white data-[active=true]:bg-neo-blue data-[active=true]:text-white data-[selected=true]:font-extrabold transition-colors`}
                      data-active={isActive}
                    >
                      <span className="truncate text-left">{dept.name}</span>
                      {isSelected ? (
                        <Check className="w-4 h-4 stroke-[2.5] absolute right-2" />
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
};
