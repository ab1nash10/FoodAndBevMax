const steps = [
  { text: 'Order at the kiosk or counter' },
  { text: 'Find your number on this screen' },
  { ready: true, text: 'Collect when it moves to' },
];

/** Three steps for a first-time guest. */
export function HowItWorks({ className = '' }: Readonly<{ className?: string }>) {
  return (
    <section
      aria-label="How it works"
      className={`rounded-[22px] border-2 border-ds-border bg-ds-surface px-[28px] py-[22px] ${className}`}
    >
      <h2 className="text-[18px] font-bold uppercase tracking-[0.18em] text-ds-muted">
        How it works
      </h2>
      <ol className="mt-[14px] grid grid-cols-3 gap-[20px]">
        {steps.map((step, index) => (
          <li className="flex flex-col gap-[10px]" key={step.text}>
            <span className="flex h-[40px] w-[40px] items-center justify-center rounded-full bg-ds-status-info-bg text-[22px] font-extrabold text-ds-status-info-fg">
              {index + 1}
            </span>
            <span className="text-[21px] font-semibold leading-[1.25] text-ds-text">
              {step.text}
              {step.ready ? <span className="text-ds-teal-text"> Ready</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
