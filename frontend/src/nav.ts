export type TabId = 'digest' | 'feed' | 'telegram' | 'sources';

export const NAV_ITEMS: { id: TabId; label: string }[] = [
  { id: 'digest', label: 'Дайджест' },
  { id: 'feed', label: 'Лента' },
  { id: 'telegram', label: 'Телеграм' },
  { id: 'sources', label: 'Источники' },
];
