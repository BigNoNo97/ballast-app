import React, { useMemo } from 'react';

export interface TrendPoint {
  id: string;
  date: number;
  value: number;
}

interface TrendChartProps {
  points: TrendPoint[];
  targetValue?: number | null;
  color?: string;
}

export const TrendChart: React.FC<TrendChartProps> = ({ points, targetValue, color = 'var(--color-blue)' }) => {
  const chart = useMemo(() => {
    if (points.length === 0) return null;

    const width = 320;
    const height = 150;
    const padX = 16;
    const padY = 18;

    const values = points.map((p) => p.value);
    if (targetValue) values.push(targetValue);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) { min -= 2; max += 2; }
    const range = max - min;
    min -= range * 0.1;
    max += range * 0.1;

    const xFor = (i: number) =>
      points.length === 1 ? width / 2 : padX + (i / (points.length - 1)) * (width - padX * 2);
    const yFor = (v: number) => height - padY - ((v - min) / (max - min)) * (height - padY * 2);

    const coords = points.map((p, i) => ({ x: xFor(i), y: yFor(p.value), point: p }));
    const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
    const targetY = targetValue ? yFor(targetValue) : null;

    return { width, height, coords, pathD, targetY };
  }, [points, targetValue]);

  if (!chart) return null;

  return (
    <svg viewBox={`0 0 ${chart.width} ${chart.height}`} width="100%" height="150" style={{ overflow: 'visible' }}>
      {chart.targetY !== null && (
        <line x1="0" y1={chart.targetY} x2={chart.width} y2={chart.targetY} stroke="var(--color-blue)" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.6" />
      )}
      <path d={chart.pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {chart.coords.map((c, i) => (
        <circle
          key={c.point.id}
          cx={c.x}
          cy={c.y}
          r={i === chart.coords.length - 1 ? 5 : 3}
          fill={i === chart.coords.length - 1 ? color : 'var(--bg-app)'}
          stroke={color}
          strokeWidth="2"
        />
      ))}
    </svg>
  );
};
