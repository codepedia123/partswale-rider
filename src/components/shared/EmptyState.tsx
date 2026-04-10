interface EmptyStateProps {
  icon: string;
  title: string;
  copy: string;
}

export function EmptyState({ icon, title, copy }: EmptyStateProps) {
  return (
    <div className="card empty-state">
      <div className="empty-state__orb" aria-hidden="true">
        {icon}
      </div>
      <div>
        <h3 className="section-title centered">{title}</h3>
        <p className="section-copy centered">{copy}</p>
      </div>
    </div>
  );
}
