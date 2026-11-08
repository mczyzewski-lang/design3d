// Długa treść zgody: skrót z „…” i „rozwiń” (kliknięcie nie zaznacza checkboxa w etykiecie).
import { useState, type ReactNode } from 'react';
import { consentShort } from './consentShort';

export { consentShort };

export function ConsentText({ text, testId, extra }: { text: string; testId?: string; extra?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const short = consentShort(text);
  const collapsible = short !== text;
  return (
    <span data-testid={testId}>
      {open || !collapsible ? text : short}
      {extra}
      {collapsible && (
        <>
          {' '}
          <button type="button" data-testid={testId ? `${testId}-toggle` : undefined} aria-expanded={open}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
            className="whitespace-nowrap font-medium text-oak underline underline-offset-2 hover:text-ink">
            {open ? 'zwiń' : 'rozwiń'}
          </button>
        </>
      )}
    </span>
  );
}
