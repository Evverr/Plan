import { ProfileDialog, SettingsDialog } from '../ui/Dialogs';
import { readJSON, readText, writeJSON, writeText } from '../storage';
import { navigate } from '../route';

export type HomePage = 'settings' | 'profile' | 'help';
export function homePageFromUrl(): HomePage | null {
  const page = new URLSearchParams(location.search).get('page');
  return page === 'settings' || page === 'profile' || page === 'help' ? page : null;
}

const LAST = 'planx-last-board';
export const noteBoard = (id: string): void => writeText(LAST, id);
export function toWork(): void {
  const id = readText(LAST);
  navigate(id && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? `${location.pathname}?board=${id}` : location.pathname);
}

export const PAGE_TITLES: Record<HomePage, string> = { profile: 'Профиль', settings: 'Настройки', help: 'Помощь' };

/** Existing page contents, now reached through the light header menu. */
export function HomePageView({ page, dark, onDark }: { page: HomePage; dark: boolean; onDark: () => void }) {
  if (page === 'settings') return <SettingsDialog page dark={dark} onDark={onDark} onClose={() => {}} />;
  if (page === 'profile') {
    const me = readJSON<{ name?: string }>('planx-me') ?? {};
    return <ProfileDialog page name={me.name ?? ''} onRename={(name) => writeJSON('planx-me', { ...me, name: name.slice(0, 24) })} onClose={() => {}} />;
  }
  return <section className="page-view help-page" aria-label="Помощь">
    <h1>Помощь</h1>
    <p>Здесь скоро будут ответы на частые вопросы, подсказки и горячие клавиши.</p>
  </section>;
}
