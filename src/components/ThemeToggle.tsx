/**
 * Isla mínima de tema: cicla sistema -> claro -> oscuro. Persiste en
 * localStorage; un script inline en el <head> aplica el tema antes de pintar
 * (sin destello). Respeta el modo sistema cuando está en "system".
 */
import { useEffect, useState } from 'preact/hooks';

type Theme = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'rr_theme';

interface Props {
  labelToggle: string;
  labels: { system: string; light: string; dark: string };
}

function apply(theme: Theme) {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

export default function ThemeToggle({ labelToggle, labels }: Props) {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme) || 'system';
    setTheme(stored);
  }, []);

  function cycle() {
    const order: Theme[] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(theme) + 1) % order.length]!;
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    apply(next);
  }

  const icon = theme === 'system' ? '🖵' : theme === 'light' ? '☀' : '☾';
  const current = labels[theme];

  return (
    <button
      type="button"
      onClick={cycle}
      title={`${labelToggle}: ${current}`}
      aria-label={`${labelToggle}: ${current}`}
      class="inline-flex min-h-9 min-w-9 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-surface-2 px-2 text-fg-secondary transition-colors hover:bg-surface-3 hover:text-fg"
    >
      <span aria-hidden="true" class="text-sm leading-none">{icon}</span>
    </button>
  );
}
