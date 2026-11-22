import React from 'react';
import { Popover } from '@base-ui/react/popover';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

// Busca sem sensibilidade a acentos, maiúsculas ou pontuação ("computaçao" acha "Computação")
const normalizeText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export interface CourseOption {
  name: string;
  /** Códigos das matrizes do curso — a busca também acha pelo código (ex: 6360). */
  codes?: string[];
}

export interface CourseSelectProps {
  courses: CourseOption[];
  value: string | null;
  onChange: (name: string) => void;
  placeholder?: string;
}

/**
 * Seletor de curso com busca interna — mesma receita do DepartmentSelect
 * (grade): no desktop abre um Popover ancorado; no mobile abre um BottomSheet com busca.
 */
export const CourseSelect: React.FC<CourseSelectProps> = ({
  courses,
  value,
  onChange,
  placeholder = 'Selecione o curso',
}) => {
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
  const [open, setOpen] = React.useState(false);
  const [portalOpen, setPortalOpen] = React.useState(false);
  const openRef = React.useRef(open);
  React.useEffect(() => {
    openRef.current = open;
  }, [open]);

  const [query, setQuery] = React.useState('');
  const mobileSearchRef = React.useRef<HTMLInputElement>(null);
  // Navegação por setas: índice ativo da lista filtrável (padrão combobox)
  const [activeIndex, setActiveIndex] = React.useState(0);
  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const filtered = React.useMemo(() => {
    const q = normalizeText(query);
    if (!q) return courses;
    return courses.filter(
      (c) =>
        normalizeText(c.name).includes(q) ||
        (c.codes ?? []).some((code) => normalizeText(code).includes(q))
    );
  }, [courses, query]);

  const selectedName = React.useMemo(
    () => courses.find((c) => c.name === value)?.name,
    [courses, value]
  );

  const closeSheet = React.useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const pick = (name: string) => {
    onChange(name);
    closeSheet();
    if (!isMobile) {
      setPortalOpen(false);
    }
  };

  const triggerClasses =
    'flex w-full h-10 items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-black rounded-xl border-2 border-ink bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-200 dark:hover:bg-neutral-300 dark:text-slate-50 focus:outline-hidden focus:ring-2 focus:ring-neo-blue transition-[box-shadow,border-color,background-color] cursor-pointer select-none';

  if (isMobile) {
    return (
      <Popover.Root
        open={portalOpen}
        onOpenChange={(next) => {
          if (next) {
            setOpen(true);
            setPortalOpen(true);
          } else {
            closeSheet();
          }
        }}
      >
        <Popover.Trigger
          className={triggerClasses}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Selecionar curso da UnB"
        >
          <span className="truncate text-left">{selectedName ?? placeholder}</span>
          <ChevronDown
            className={`w-4 h-4 stroke-[2.5] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Positioner
            className="contents!"
            style={{ position: 'static', transform: 'none', opacity: 1 }}
          >
            <Popover.Popup className="contents! outline-hidden">
              <BottomSheet
                open={open}
                onClose={closeSheet}
                onExitComplete={() => {
                  if (!openRef.current) {
                    setPortalOpen(false);
                  }
                }}
                role="dialog"
                aria-modal="true"
                aria-label="Selecionar curso"
                backdrop
                backdropClassName="z-[60] md:hidden"
                className="fixed inset-x-0 bottom-0 w-full z-[70] md:hidden"
                dragOnlyOnHandle
              >
                <div className="flex flex-col max-h-[80dvh] pb-[env(safe-area-inset-bottom)]">
                  <div className="px-4 pb-3 border-b-2 border-ink/10 shrink-0">
                    <h2 className="text-base font-extrabold tracking-tight text-black">
                      Curso
                    </h2>
                  </div>

                  <div className="px-4 pt-3 pb-2 shrink-0">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 stroke-[2.5] pointer-events-none" />
                      <input
                        ref={mobileSearchRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Pesquisar curso…"
                        aria-label="Pesquisar curso"
                        className="w-full h-10 bg-paper pl-9 pr-9 text-sm font-semibold text-black rounded-xl border-2 border-ink focus:outline-hidden focus:ring-2 focus:ring-neo-blue placeholder:text-neutral-500"
                      />
                      {query ? (
                        <button
                          type="button"
                          onClick={() => {
                            setQuery('');
                            mobileSearchRef.current?.focus();
                          }}
                          aria-label="Limpar busca de curso"
                          className="cursor-pointer absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-neutral-500 hover:text-black focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue"
                        >
                          <X className="w-4 h-4 stroke-[2.5]" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div
                    role="listbox"
                    aria-label="Lista de cursos"
                    className="px-2 pb-4 overflow-y-auto space-y-0.5 flex-1 min-h-0"
                  >
                    {filtered.length === 0 ? (
                      <p className="p-6 text-center text-sm font-semibold text-neutral-600">
                        Nenhum curso encontrado
                      </p>
                    ) : (
                      filtered.map((course) => {
                        const isSelected = course.name === value;
                        return (
                          <button
                            key={course.name}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => pick(course.name)}
                            className={`relative flex w-full cursor-pointer select-none items-center gap-2 rounded-xl min-h-12 py-3 pr-10 pl-3.5 text-sm font-bold border-2 transition-colors text-left ${
                              isSelected
                                ? 'bg-neo-blue text-white border-ink'
                                : 'bg-transparent text-black border-transparent hover:bg-neutral-100'
                            }`}
                          >
                            <span className="truncate">{course.name}</span>
                            {isSelected ? (
                              <Check className="w-4 h-4 stroke-[2.5] absolute right-3 shrink-0" />
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </BottomSheet>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <Popover.Trigger
        className={triggerClasses}
        aria-label="Selecionar curso da UnB"
      >
        <span className="truncate text-left">{selectedName ?? placeholder}</span>
        <ChevronDown className={`w-4 h-4 stroke-[2.5] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} className="isolate z-50">
          <Popover.Popup className="relative z-50 w-max min-w-[280px] max-w-[520px] rounded-lg border-2 border-ink bg-canvas text-black outline-hidden origin-(--transform-origin)">
            {/* Busca interna */}
            <div className="p-2 border-b-2 border-ink/10">
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
                      pick(filtered[activeIndex].name);
                    }
                  }}
                  role="combobox"
                  aria-expanded={open}
                  aria-controls={open ? 'course-listbox' : undefined}
                  aria-activedescendant={open ? `course-option-${filtered[activeIndex]?.name}` : undefined}
                  autoFocus
                  placeholder="Pesquisar curso…"
                  className="w-full h-8 bg-paper pl-9 pr-3 text-xs font-semibold text-black rounded-lg border-2 border-ink focus:outline-hidden focus:ring-2 focus:ring-neo-blue placeholder:text-neutral-600"
                />
              </div>
            </div>

            {/* Lista filtrável (listbox navegável por setas) */}
            <div id="course-listbox" role="listbox" className="p-1 max-h-64 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="p-4 text-center text-xs font-semibold text-neutral-600">
                  Nenhum curso encontrado para "{query}"
                </p>
              ) : (
                filtered.map((course, index) => {
                  const isSelected = course.name === value;
                  const isActive = index === activeIndex;
                  return (
                    <button
                      key={course.name}
                      id={`course-option-${course.name}`}
                      ref={(el) => {
                        if (el && isActive) {
                          el.scrollIntoView({ block: 'nearest' });
                        }
                      }}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => pick(course.name)}
                      onMouseMove={() => setActiveIndex(index)}
                      className={`relative flex w-full cursor-pointer select-none items-center gap-2 rounded-lg py-1.5 pr-8 pl-2.5 text-xs font-bold focus:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-inset hover:bg-neo-blue hover:text-white data-[active=true]:bg-neo-blue data-[active=true]:text-white data-[selected=true]:font-extrabold transition-colors`}
                      data-active={isActive}
                    >
                      <span className="truncate text-left">{course.name}</span>
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
