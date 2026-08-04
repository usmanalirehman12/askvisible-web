"use client";
import { useState } from "react";

export type TrendPoint = { label: string; value: number };

// Hand-rolled SVG line chart, same technique as page.tsx's Sparkline (no charting
// library in this project) but bigger, with gridlines, axis labels, and a hover
// tooltip. Shared between the report's score-history trend and the traffic tab's
// daily trend — both are just a labeled series of numbers over time.
export default function ScoreTrendChart({ data, yMax, color = "var(--sky,#0EA5E9)", valueFormatter }: { data: TrendPoint[]; yMax?: number; color?: string; valueFormatter?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length < 2) {
    return <div style={{ padding: "28px", textAlign: "center", color: "var(--muted)", fontSize: "13px" }}>Not enough history yet — run another scan to see a trend.</div>;
  }

  const w = 640, h = 200, padL = 34, padB = 22, padT = 12, padR = 12;
  const values = data.map(d => d.value);
  const max = yMax ?? Math.max(...values, 1);
  const range = max || 1;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const x = (i: number) => padL + (i / (data.length - 1)) * plotW;
  const y = (v: number) => padT + plotH - (v / range) * plotH;
  const fmt = valueFormatter ?? ((v: number) => String(Math.round(v)));
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");

  return (
    <div style={{ position: "relative" }}>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible", display: "block" }} role="img" aria-label="Trend chart">
        {[0, 0.5, 1].map(f => {
          const val = range * f;
          const yy = y(val);
          return <g key={f}>
            <line x1={padL} x2={w - padR} y1={yy} y2={yy} stroke="var(--line)" strokeWidth="1" />
            <text x={padL - 8} y={yy + 3} fontSize="10" fill="var(--muted)" textAnchor="end">{fmt(val)}</text>
          </g>;
        })}
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <circle
            key={i} cx={x(i)} cy={y(d.value)} r={hover === i ? 5 : 3} fill={color}
            tabIndex={0} aria-label={`${d.label}: ${fmt(d.value)}`} style={{ cursor: "pointer" }}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)} onBlur={() => setHover(null)}
          />
        ))}
        <text x={x(0)} y={h - 4} fontSize="10" fill="var(--muted)" textAnchor="start">{data[0].label}</text>
        <text x={x(data.length - 1)} y={h - 4} fontSize="10" fill="var(--muted)" textAnchor="end">{data[data.length - 1].label}</text>
      </svg>
      {hover != null && (
        <div style={{ position: "absolute", left: `${(x(hover) / w) * 100}%`, top: 0, transform: "translate(-50%,-110%)", background: "#0F172A", color: "#fff", fontSize: "11px", fontWeight: 700, padding: "4px 9px", borderRadius: "6px", whiteSpace: "nowrap", pointerEvents: "none" }}>
          {fmt(data[hover].value)} · {data[hover].label}
        </div>
      )}
    </div>
  );
}
