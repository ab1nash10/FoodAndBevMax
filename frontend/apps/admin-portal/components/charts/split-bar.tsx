// Usage:
//   <SplitBar ariaLabel="97% accepted, 3% rejected"
//     parts={[{ className: 'bg-ds-chart-full', key: 'ok', value: 97 }, { className: 'bg-ds-chart-rejected', key: 'no', value: 3 }]} />
// One 8px bar split into parts by their share of the total.

export function SplitBar({
  ariaLabel,
  parts,
}: Readonly<{
  ariaLabel: string;
  parts: Array<{ className: string; key: string; value: number }>;
}>) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);

  return (
    <span
      aria-label={ariaLabel}
      className="flex h-2 overflow-hidden rounded-full bg-ds-status-neutral-bg"
      role="img"
    >
      {total > 0
        ? parts.map((part) => (
            <span
              className={part.className}
              key={part.key}
              style={{ width: `${(part.value / total) * 100}%` }}
            />
          ))
        : null}
    </span>
  );
}
