import React from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui";

export interface FilterSelectProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  /** Filtro engajado (valor diferente do padrão): trigger vira azul cheio. */
  active?: boolean;
  /** Alinhamento horizontal do menu suspenso em relação ao trigger. */
  align?: "start" | "center" | "end";
}

/**
 * Select compacto do mural (@DESIGN.md "Filtro Select"): trigger na altura
 * dos botões sm do feed (34px), rótulo em cima — mesma linguagem dos filtros
 * da Grade. Com filtro ativo, segue o padrão dos filtros de estado de
 * Disciplinas: cor cheia da família.
 */
export const FilterSelect: React.FC<FilterSelectProps> = ({
  label,
  value,
  options,
  onChange,
  active = false,
  align = "center",
}) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs font-bold text-neutral-700">{label}</span>
    <Select
      value={value}
      items={options}
      onValueChange={(next) => {
        if (!next) return;
        onChange(next);
      }}
    >
      <SelectTrigger
        className={`h-[34px] w-auto px-3 ${
          active
            ? "bg-neo-blue text-white hover:bg-neo-blueHover"
            : "bg-paper"
        }`}
      >
        <SelectValue>
          {options.find((option) => option.value === value)?.label ?? value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align={align} className="max-w-[calc(100vw-2rem)]">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);
