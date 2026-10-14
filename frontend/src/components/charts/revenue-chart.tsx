"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useI18n } from "@/i18n/provider";
import type { Money } from "@gymflow/shared/domain/money";
import { cn } from "@/lib/utils";

export interface ChartPoint {
  key: string;
  /** Full label for tooltips and the table, e.g. "Oct 07, 2026". */
  label: string;
  /** Axis label, e.g. "Oct 07". */
  axisLabel: string;
  amount: Money;
  value: number;
  transactions: number;
  /** Emphasize this point's axis label (e.g. today). */
  highlight?: boolean;
}

const MARGIN = { top: 28, right: 16, bottom: 32, left: 44 };
const MAX_BAR = 24;

/** Clean tick values: steps of 1, 2, 2.5 or 5 × 10^n. */
function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0, 1000];
  const raw = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

function barPath(x: number, baseline: number, width: number, height: number): string {
  const r = Math.min(4, width / 2, height);
  const top = baseline - height;
  return `M${x},${baseline}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${baseline}Z`;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Single-series revenue chart (one hue, no legend — the card title names it).
 * Area for trends, columns for daily totals. Hover or arrow keys show a
 * tooltip; every value is also available in the data table.
 */
export function RevenueChart({
  points,
  variant = "area",
  height = 260,
  label,
  updating = false,
  className,
}: {
  points: ChartPoint[];
  variant?: "area" | "column";
  height?: number;
  /** Accessible name, e.g. "Daily revenue, last 7 days". */
  label: string;
  updating?: boolean;
  className?: string;
}) {
  const { t, f } = useI18n();
  const [containerRef, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();

  const n = points.length;
  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = height - MARGIN.top - MARGIN.bottom;
  const max = Math.max(0, ...points.map((p) => p.value));
  const ticks = niceTicks(max);
  const yMax = ticks[ticks.length - 1] || 1;
  const baseline = MARGIN.top + innerHeight;
  const y = (value: number) => baseline - (value / yMax) * innerHeight;

  const band = n > 0 ? innerWidth / n : 0;
  const x = (index: number) =>
    variant === "column"
      ? MARGIN.left + band * (index + 0.5)
      : MARGIN.left + (n <= 1 ? innerWidth / 2 : (index * innerWidth) / (n - 1));
  const barWidth = Math.max(1, Math.min(MAX_BAR, band - 2, band * 0.7));

  // Axis labels: as many as fit, anchored on the most recent point.
  const maxLabels = Math.max(2, Math.floor(innerWidth / 64));
  const labelStep = Math.max(1, Math.ceil(n / maxLabels));
  const showLabel = (index: number) => (n - 1 - index) % labelStep === 0;

  const peakIndex = points.reduce((best, p, i) => (p.value > (points[best]?.value ?? -1) ? i : best), 0);
  const lastIndex = n - 1;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join("");
  const areaPath = n > 0 ? `${linePath}L${x(lastIndex)},${baseline}L${x(0)},${baseline}Z` : "";

  function indexFromPointer(event: PointerEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    if (variant === "column") return Math.min(n - 1, Math.max(0, Math.floor(px / band)));
    return Math.min(n - 1, Math.max(0, Math.round((px / Math.max(1, innerWidth)) * (n - 1))));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (n === 0) return;
    const current = active ?? lastIndex;
    const next =
      event.key === "ArrowLeft"
        ? Math.max(0, current - 1)
        : event.key === "ArrowRight"
          ? Math.min(lastIndex, current + 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? lastIndex
              : null;
    if (next !== null) {
      event.preventDefault();
      setActive(next);
    } else if (event.key === "Escape") {
      setActive(null);
    }
  }

  const activePoint = active !== null ? points[active] : null;
  const tooltipLeft = active !== null ? Math.min(Math.max(x(active), 84), Math.max(84, width - 84)) : 0;
  const tooltipTop = activePoint ? Math.max(8, y(activePoint.value) - 14) : 0;

  const directLabels: number[] = [];
  if (n > 0 && points[lastIndex].value > 0) directLabels.push(lastIndex);
  if (n > 1 && peakIndex !== lastIndex && points[peakIndex].value > 0 && Math.abs(x(peakIndex) - x(lastIndex)) > 80) {
    directLabels.push(peakIndex);
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        ref={containerRef}
        className={cn("relative w-full rounded-lg transition-opacity", updating && "opacity-55")}
        style={{ height }}
        tabIndex={n > 0 ? 0 : undefined}
        role="group"
        aria-roledescription={t("common.chart.roleDescription")}
        aria-label={t("common.chart.keyboardHint", { label })}
        aria-describedby={tableId}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((current) => current ?? lastIndex)}
        onBlur={() => setActive(null)}
      >
        {width > 0 ? (
          <svg width={width} height={height} className="block overflow-visible" aria-hidden>
            <text x={MARGIN.left - 8} y={12} textAnchor="end" className="fill-fg-subtle text-[11px] font-semibold">
              {f.currency}
            </text>
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={MARGIN.left}
                  x2={width - MARGIN.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  className={tick === 0 ? "stroke-line-strong" : "stroke-line"}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text
                  x={MARGIN.left - 8}
                  y={y(tick) + 4}
                  textAnchor="end"
                  className="fill-fg-subtle tabular text-[11px]"
                >
                  {f.compact(tick)}
                </text>
              </g>
            ))}

            {variant === "area" ? (
              <>
                <path d={areaPath} className="fill-chart-fill" />
                <path
                  d={linePath}
                  fill="none"
                  className="stroke-chart"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </>
            ) : (
              points.map((p, i) => {
                const h = baseline - y(p.value);
                if (h <= 0) return null;
                return (
                  <path
                    key={p.key}
                    d={barPath(x(i) - barWidth / 2, baseline, barWidth, h)}
                    className={cn("fill-chart transition-opacity", active !== null && active !== i && "opacity-45")}
                  />
                );
              })
            )}

            {activePoint && active !== null ? (
              <line
                x1={x(active)}
                x2={x(active)}
                y1={MARGIN.top - 8}
                y2={baseline}
                className="stroke-fg-subtle"
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
            ) : null}

            {variant === "area"
              ? [lastIndex, ...(active !== null && active !== lastIndex ? [active] : [])].map((i) =>
                  points[i] ? (
                    <circle
                      key={`dot-${i}`}
                      cx={x(i)}
                      cy={y(points[i].value)}
                      r={4.5}
                      className="fill-chart stroke-surface"
                      strokeWidth={2}
                    />
                  ) : null,
                )
              : null}

            {active === null
              ? directLabels.map((i) => (
                  <text
                    key={`label-${i}`}
                    x={Math.min(Math.max(x(i), MARGIN.left + 30), width - MARGIN.right - 30)}
                    y={y(points[i].value) - 12}
                    textAnchor="middle"
                    className="fill-fg-muted text-[11px] font-semibold"
                  >
                    {f.compact(points[i].value)}
                    {i === peakIndex && i !== lastIndex ? ` ${t("common.chart.peak")}` : ""}
                  </text>
                ))
              : null}

            {points.map((p, i) =>
              showLabel(i) ? (
                <text
                  key={`x-${p.key}`}
                  x={x(i)}
                  y={height - 10}
                  textAnchor={
                    i === lastIndex && variant === "area" ? "end" : i === 0 && variant === "area" ? "start" : "middle"
                  }
                  className={cn("text-[11px]", p.highlight ? "fill-fg font-semibold" : "fill-fg-subtle")}
                >
                  {p.axisLabel}
                </text>
              ) : null,
            )}

            <rect
              x={MARGIN.left}
              y={MARGIN.top - 8}
              width={innerWidth}
              height={innerHeight + 8}
              fill="transparent"
              onPointerMove={(event) => setActive(indexFromPointer(event))}
              onPointerLeave={() => setActive(null)}
              style={{ cursor: "crosshair" }}
            />
          </svg>
        ) : null}

        {activePoint ? (
          <div
            className="border-line bg-surface shadow-popover pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 -translate-y-full rounded-lg border px-3 py-2"
            style={{ left: tooltipLeft, top: tooltipTop }}
          >
            <p className="text-fg tabular text-sm font-bold">{f.money(activePoint.amount)}</p>
            <p className="text-fg-muted text-xs">
              {activePoint.label} · {t("common.paymentsCount", { count: activePoint.transactions })}
            </p>
          </div>
        ) : null}

        <p className="sr-only" aria-live="polite">
          {activePoint
            ? t("common.chart.announce", {
                date: activePoint.label,
                amount: f.money(activePoint.amount),
                payments: t("common.paymentsCount", { count: activePoint.transactions }),
              })
            : ""}
        </p>
      </div>

      <details className="group text-sm">
        <summary className="text-link inline-flex min-h-11 cursor-pointer items-center rounded-md font-semibold select-none hover:underline md:min-h-8">
          <span className="group-open:hidden">{t("common.chart.viewTable")}</span>
          <span className="hidden group-open:inline">{t("common.chart.hideTable")}</span>
        </summary>
        <div className="border-line mt-2 max-h-64 scrollbar-thin overflow-auto rounded-lg border">
          <table id={tableId} className="w-full text-left text-sm">
            <caption className="sr-only">{label}</caption>
            <thead className="bg-tint sticky top-0">
              <tr>
                <th scope="col" className="text-fg-muted px-3 py-2 font-semibold">
                  {t("common.chart.date")}
                </th>
                <th scope="col" className="text-fg-muted px-3 py-2 text-right font-semibold">
                  {t("common.chart.revenue")}
                </th>
                <th scope="col" className="text-fg-muted px-3 py-2 text-right font-semibold">
                  {t("common.chart.payments")}
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.key} className="border-line border-t">
                  <td className="text-fg px-3 py-1.5">{p.label}</td>
                  <td className="text-fg tabular px-3 py-1.5 text-right">{f.money(p.amount)}</td>
                  <td className="text-fg-muted tabular px-3 py-1.5 text-right">{p.transactions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
