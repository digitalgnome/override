import { definePlugin } from '@decky/api';
import { DialogButton, Focusable, PanelSection, PanelSectionRow, staticClasses } from '@decky/ui';
import { FC, ReactNode, useState } from 'react';
import { FaDownload, FaGamepad, FaRocket } from 'react-icons/fa';

import CheatsPage from './pages/CheatsPage';
import StorePage from './pages/StorePage';
import { Styles } from './styles';

type View = 'cheats' | 'store';

// <Tabs> needs a fixed-height container and renders empty in the Quick
// Access panel, so this is a simple segmented control instead.
const TabBar: FC<{ view: View; onChange: (v: View) => void }> = ({ view, onChange }) => {
  const tab = (v: View, icon: ReactNode, label: string) => (
    <DialogButton
      className={`cc-tab${view === v ? ' cc-active' : ''}`}
      onClick={() => onChange(v)}
    >
      {icon}
      {label}
    </DialogButton>
  );
  return (
    <Focusable className="cc-tabs" flow-children="horizontal">
      {tab('cheats', <FaGamepad />, 'My Cheats')}
      {tab('store', <FaDownload />, 'Get Cheats')}
    </Focusable>
  );
};

const MainContent: FC = () => {
  const [view, setView] = useState<View>('cheats');
  // Set when "Open" is pressed on an installed game in the store.
  const [openPackId, setOpenPackId] = useState<string | null>(null);

  return (
    <div className="cc-root">
      <Styles />
      <PanelSection>
        <PanelSectionRow>
          <TabBar view={view} onChange={setView} />
        </PanelSectionRow>
      </PanelSection>
      {view === 'cheats' ? (
        <CheatsPage
          preferPackId={openPackId}
          onPreferConsumed={() => setOpenPackId(null)}
          onNavigateToStore={() => setView('store')}
        />
      ) : (
        <StorePage
          onOpenPack={(id) => {
            setOpenPackId(id);
            setView('cheats');
          }}
        />
      )}
    </div>
  );
};

export default definePlugin(() => ({
  name: 'Override',
  titleView: <div className={staticClasses.Title}>Override</div>,
  icon: <FaRocket />,
  content: <MainContent />,
  onDismount() {},
}));
