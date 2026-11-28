import React from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui";
import { Heart } from "lucide-react";
import { openExternalUrl } from "@/lib/utils";
import { useTheme } from "@/context/ThemeContext";

interface CodeContributor {
  name: string;
  role: string;
  githubUrl?: string;
  linkedinUrl?: string;
}

const CODE_CONTRIBUTORS: CodeContributor[] = [
  {
    name: "Kaleb Henrique",
    role: "Idealizador e desenvolvedor fullstack",
    githubUrl: "https://github.com/kalebhenrique",
    linkedinUrl: "https://www.linkedin.com/in/kalebhenrique/",
  },
  {
    name: "Mauro Ribeiro",
    role: "Desenvolvedor fullstack",
    githubUrl: "https://github.com/MauroSon",
    linkedinUrl: "https://www.linkedin.com/in/maurorsilva/",
  },
];

const COMMUNITY_CONTRIBUTORS: string[] = [
  "Joel Sena",
  "William Marques",
  "Walisson Silva",
  "Ricardo",
  "membros da Struct-EJ",
];

function formatNamesList(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]}.`;
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}.`;
}

export interface ContributorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ContributorsDialog: React.FC<ContributorsDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { resolvedTheme } = useTheme();
  const githubIcon =
    resolvedTheme === "dark"
      ? "/github-142-svgrepo-com-dark.svg"
      : "/github-142-svgrepo-com.svg";
  const linkedinIcon =
    resolvedTheme === "dark"
      ? "/linkedin-svgrepo-com-dark.svg"
      : "/linkedin-svgrepo-com.svg";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85dvh] flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-lg bg-neo-yellow border-2 border-ink flex items-center justify-center shrink-0">
              <Heart className="w-5 h-5 stroke-[2.5] text-ink" />
            </div>
            <DialogTitle>Contribuidores</DialogTitle>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-5 pr-1 -mr-1 pb-1">
          <section
            aria-labelledby="code-contributors-heading"
            className="space-y-2.5"
          >
            <h3
              id="code-contributors-heading"
              className="text-xs md:text-[11px] font-black uppercase tracking-wider text-neutral-600"
            >
              Contribuidores de código
            </h3>
            <ul className="space-y-2.5">
              {CODE_CONTRIBUTORS.map((contributor) => (
                <li
                  key={contributor.name}
                  className="flex items-center justify-between gap-3 bg-paper border-2 border-ink rounded-lg p-3.5 shadow-neo-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-black leading-snug">
                      {contributor.name}
                    </p>
                    <p className="text-xs font-semibold text-neutral-600 mt-0.5 leading-snug">
                      {contributor.role}
                    </p>
                  </div>
                  {(contributor.githubUrl || contributor.linkedinUrl) && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {contributor.githubUrl && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          title={contributor.githubUrl}
                          aria-label={`GitHub de ${contributor.name}`}
                          onClick={() =>
                            void openExternalUrl(contributor.githubUrl!)
                          }
                          className="w-10 h-10 md:w-8 md:h-8 p-0"
                        >
                          <img
                            src={githubIcon}
                            alt=""
                            className="w-4 h-4 select-none"
                          />
                        </Button>
                      )}
                      {contributor.linkedinUrl && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          title={contributor.linkedinUrl}
                          aria-label={`LinkedIn de ${contributor.name}`}
                          onClick={() =>
                            void openExternalUrl(contributor.linkedinUrl!)
                          }
                          className="w-10 h-10 md:w-8 md:h-8 p-0"
                        >
                          <img
                            src={linkedinIcon}
                            alt=""
                            className="w-4 h-4 select-none"
                          />
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {COMMUNITY_CONTRIBUTORS.length > 0 && (
            <section
              aria-labelledby="community-contributors-heading"
              className="pt-4 border-t-2 border-black/10 space-y-1.5"
            >
              <h3
                id="community-contributors-heading"
                className="text-xs md:text-[11px] font-black uppercase tracking-wider text-neutral-600"
              >
                Também contribuíram
              </h3>
              <p className="text-sm font-semibold text-neutral-700 leading-relaxed">
                {formatNamesList(COMMUNITY_CONTRIBUTORS)}
              </p>
            </section>
          )}
        </div>

        <DialogFooter className="shrink-0">
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => onOpenChange(false)}
          >
            <span>Fechar</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
