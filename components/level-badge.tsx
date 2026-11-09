import { cn } from "@/lib/utils";
import { formatLevel, LEVEL_LABEL } from "@/lib/rubric";

// Runway level colors run green (R0) to red (R5); a range is striped toward its ceiling.
export const LEVEL_BG = ["bg-emerald-600", "bg-lime-600", "bg-amber-500", "bg-orange-500", "bg-red-600", "bg-rose-900"];
const LEVEL_HEX = ["#059669", "#65a30d", "#f59e0b", "#f97316", "#dc2626", "#881337"];

export function LevelBadge({ level, ceiling, size = "md", label = false }: { level: number | null; ceiling?: number | null; size?: "sm" | "md" | "lg"; label?: boolean }) {
  if (level === null) return <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">N/A</span>;
  const isRange = ceiling != null && ceiling !== level;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        title={isRange ? `R${level} if every unknown gate is "no"; up to R${ceiling} if not` : LEVEL_LABEL[level]}
        className={cn(
          "relative inline-flex items-center overflow-hidden rounded-md font-semibold tabular-nums text-white shadow-sm",
          LEVEL_BG[level],
          size === "sm" && "px-1.5 py-0.5 text-xs",
          size === "md" && "px-2 py-0.5 text-sm",
          size === "lg" && "px-3 py-1 text-2xl",
          isRange && (size === "lg" ? "pr-6" : "pr-4"),
        )}
      >
        {formatLevel(level, ceiling ?? null)}
        {isRange && (
          <span
            aria-hidden
            className={cn("absolute inset-y-0 right-0", size === "lg" ? "w-3.5" : "w-2")}
            style={{ backgroundImage: `repeating-linear-gradient(135deg, ${LEVEL_HEX[ceiling!]} 0 4px, rgb(255 255 255 / 0.85) 4px 6px)` }}
          />
        )}
      </span>
      {label && <span className="text-sm font-medium">{LEVEL_LABEL[level]}{isRange ? ` to ${LEVEL_LABEL[ceiling!]}?` : ""}</span>}
    </span>
  );
}

export const fmtRange = (r: { min: number; max: number; unit: string } | null | undefined) =>
  !r ? "Unknown" : r.min === r.max ? `${r.min} ${r.unit}` : `${r.min}–${r.max} ${r.unit}`;
