import { glass } from './board-header';

const steps = [
  { text: 'Order at the kiosk or counter' },
  { text: 'Find your number on this screen' },
  { ready: true, text: 'Collect when it moves to' },
];

/** Three steps for a first-time guest, on the board's empty screen. */
export function HowItWorks({ className = '' }: Readonly<{ className?: string }>) {
  return (
    <section
      aria-label="How it works"
      className={`rounded-[32px] px-[32px] py-[26px] ${glass} ${className}`}
    >
      <h2 className="text-[18px] font-bold uppercase tracking-[0.18em] text-ds-text-3">
        How it works
      </h2>
      <ol className="mt-[16px] grid grid-cols-3 gap-[24px]">
        {steps.map((step, index) => (
          <li className="flex flex-col gap-[12px]" key={step.text}>
            <span className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-ds-primary-soft text-[22px] font-extrabold text-ds-link">
              {index + 1}
            </span>
            <span className="text-[22px] font-semibold leading-[1.25] text-ds-text">
              {step.text}
              {step.ready ? <span className="text-ds-teal-text"> Ready</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
