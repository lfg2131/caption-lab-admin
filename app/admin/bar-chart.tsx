"use client";

import { useState } from "react";

type Point = { day: string; value: number };

function dayLabel(day: string, style: "short" | "long" = "short") {
  // day is a New York calendar date (YYYY-MM-DD); format it as that date.
  const date = new Date(`${day}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", ...(style === "long" ? { weekday: "short" } : {}) }).format(date);
}

/**
 * Single-series daily bar chart (one hue, no legend: the title names it).
 * Thin bars with rounded tops on a shared baseline, a recessive grid, a
 * hover/focus tooltip per bar, and the same numbers as a table for screen readers.
 */
export function DailyBarChart({ title, unit, points, color = "#8b5cf6" }: { title: string; unit: string; points: Point[]; color?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((point) => point.value));
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const hovered = active === null ? null : points[active];

  return (
    <figure className="card space-y-4 p-5">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{title}</span>
        <span className="text-sm text-muted">{total} in {points.length} days</span>
      </figcaption>
      <div className="relative" aria-hidden="true">
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-line" />
        <span className="absolute -top-2.5 right-0 bg-surface pl-1 text-[11px] text-muted">{max}</span>
        <div className="flex h-36 items-end gap-0.5 border-b border-line" onMouseLeave={() => setActive(null)}>
          {points.map((point, index) => (
            <div
              key={point.day}
              className="group relative flex h-full flex-1 items-end justify-center outline-none"
              tabIndex={0}
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
            >
              <div
                className="w-full max-w-5 rounded-t-[4px] transition-opacity"
                style={{ height: point.value ? `${Math.max(3, (point.value / max) * 100)}%` : 0, background: color, opacity: active === null || active === index ? 1 : 0.45 }}
              />
            </div>
          ))}
        </div>
        {hovered && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-surface-raised px-3 py-1.5 text-xs whitespace-nowrap shadow-xl"
            style={{ left: `${((active! + 0.5) / points.length) * 100}%` }}
          >
            <span className="text-muted">{dayLabel(hovered.day, "long")}</span>{" "}
            <span className="font-semibold text-foreground">{hovered.value} {unit}</span>
          </div>
        )}
        <div className="mt-1.5 flex justify-between text-[11px] text-muted">
          <span>{dayLabel(points[0]?.day ?? "")}</span>
          <span>{dayLabel(points[points.length - 1]?.day ?? "")}</span>
        </div>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">{unit}</th></tr></thead>
        <tbody>{points.map((point) => <tr key={point.day}><td>{point.day}</td><td>{point.value}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
