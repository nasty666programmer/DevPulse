export type TabId = 'digest' | 'feed' | 'telegram';

type TabsProps = {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
};

const TAB_LABELS: Record<TabId, string> = {
  digest: 'Дайджест',
  feed: 'Лента',
  telegram: 'Телеграм',
};

export function Tabs({ activeTab, onChange }: TabsProps) {
  return (
    <div className="tabs" role="tablist">
      {(Object.keys(TAB_LABELS) as TabId[]).map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={activeTab === tab}
          className={`tab${activeTab === tab ? ' is-active' : ''}`}
          onClick={() => onChange(tab)}
        >
          {TAB_LABELS[tab]}
        </button>
      ))}
    </div>
  );
}
