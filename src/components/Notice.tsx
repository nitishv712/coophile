/**
 * Centred full-screen message used by every non-playing state on /play.
 *
 * Deliberately free of hooks so the server can render the states it already
 * knows about — an unknown game, a missing ROM — without shipping any of it.
 */
export default function Notice({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
      <span className="material-symbols-outlined text-6xl text-on-surface-variant/40 mb-6">
        {icon}
      </span>
      <h1 className="font-headline text-3xl font-bold text-on-surface mb-3">{title}</h1>
      <p className="font-body text-on-surface-variant mb-8 max-w-md leading-relaxed">
        {body}
      </p>
      {action}
    </div>
  );
}
