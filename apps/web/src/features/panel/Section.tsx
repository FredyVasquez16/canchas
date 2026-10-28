import type { ReactNode } from 'react';

/** Panel card used by every panel tab: a title, an optional hint and a body. */
export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">{title}</h2>
        {hint && <span className="hint">{hint}</span>}
      </div>
      <div className="panel__body">{children}</div>
    </section>
  );
}
