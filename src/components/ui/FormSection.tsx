import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icons';
export function FormSection({
  title,
  description,
  icon,
  index,
  children,
}: {
  title: string;
  description: string;
  icon: IconName;
  index: string;
  children: ReactNode;
}) {
  return (
    <section className="form-section">
      <header className="form-section-heading">
        <span className="form-section-icon">
          <Icon name={icon} size={21} />
        </span>
        <small className="form-section-index">{index}</small>
        <h3>{title}</h3>
        <p>{description}</p>
      </header>
      <div className="form-section-content">{children}</div>
    </section>
  );
}
