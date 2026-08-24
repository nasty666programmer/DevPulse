export type TabId = 'digest' | 'feed' | 'telegram';

export const NAV_ITEMS: { id: TabId; label: string }[] = [
  { id: 'digest', label: 'Дайджест' },
  { id: 'feed', label: 'Лента' },
  { id: 'telegram', label: 'Телеграм' },
];
