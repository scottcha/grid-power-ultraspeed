import { useGame } from '../state/store.ts';
import { Icon } from './Icons.tsx';

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  const modal = useGame((s) => s.modal);
  if (!toasts.length || modal === 'summary' || modal === 'victory') return null;
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind} ${t.hint ? 'hint' : ''}`} onClick={() => dismiss(t.id)}>
          <span className="t-ico">
            <Icon name={t.hint ? 'info' : t.kind === 'good' ? 'check' : t.kind === 'bad' ? 'info' : 'info'} size={15} />
          </span>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
