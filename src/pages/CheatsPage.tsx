import { FC, useEffect, useState } from 'react';
import { toaster } from '@decky/api';
import {
  ButtonItem,
  ConfirmModal,
  DialogButton,
  DropdownItem,
  Focusable,
  PanelSection,
  PanelSectionRow,
  showModal,
} from '@decky/ui';
import { FaDownload, FaSyncAlt, FaTrashAlt } from 'react-icons/fa';
import {
  deletePack,
  getCheatStates,
  getDownloadedPacks,
  getRunningGame,
  readCheatValues,
} from '../api';
import CheatItem from '../components/CheatItem';
import { useAppArt } from '../useAppArt';
import { CheatPack, CheatState, RunningGame } from '../types';

// Remember the last picked game while the plugin stays loaded.
let lastSelectedPackId: string | null = null;

interface CheatsPageProps {
  /** Pack to show first (set by "Open" in the store) */
  preferPackId: string | null;
  onPreferConsumed: () => void;
  onNavigateToStore: () => void;
}

const GameHero: FC<{ pack: CheatPack; running: boolean }> = ({ pack, running }) => {
  const src = useAppArt(pack.steamAppId, 'header');
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className="cc-hero">
      {src && failed !== src && <img src={src} alt="" onError={() => setFailed(src)} />}
      <span className={`cc-badge ${running ? 'cc-badge-live' : 'cc-badge-idle'}`}>
        <span className="cc-dot" />
        {running ? 'Running' : 'Not running'}
      </span>
      <div className="cc-hero-text">
        <div className="cc-hero-title">{pack.gameName}</div>
        <div className="cc-hero-meta">
          {pack.cheats.length} cheat{pack.cheats.length === 1 ? '' : 's'} · v{pack.version}
        </div>
      </div>
    </div>
  );
};

const CheatsPage: FC<CheatsPageProps> = ({ preferPackId, onPreferConsumed, onNavigateToStore }) => {
  const [packs, setPacks] = useState<CheatPack[]>([]);
  const [runningGame, setRunningGame] = useState<RunningGame | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(lastSelectedPackId);
  const [states, setStates] = useState<CheatState[]>([]);
  const [liveValues, setLiveValues] = useState<Record<string, number | string>>({});
  const [loading, setLoading] = useState(true);

  const selectPack = (id: string | null) => {
    lastSelectedPackId = id;
    setSelectedId(id);
  };

  const loadPacks = async () => {
    setLoading(true);
    try {
      const [installed, game] = await Promise.all([getDownloadedPacks(), getRunningGame()]);
      setPacks(installed);
      setRunningGame(game);

      // Prefer: explicit "Open" > running game > previous pick > first pack.
      const find = (id: string | null) => installed.find((p) => p.id === id);
      const running = game ? installed.find((p) => p.steamAppId === game.appId) : undefined;
      const pick = find(preferPackId) ?? running ?? find(lastSelectedPackId) ?? installed[0];
      selectPack(pick?.id ?? null);
      if (preferPackId) onPreferConsumed();
    } catch (e) {
      console.error('[Override] loadPacks failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPacks();
  }, []);

  const refreshLive = (id: string | null = selectedId) => {
    if (!id) return;
    readCheatValues(id).then(setLiveValues).catch(() => setLiveValues({}));
  };

  useEffect(() => {
    setLiveValues({});
    if (!selectedId) {
      setStates([]);
      return;
    }
    getCheatStates(selectedId).then(setStates).catch(() => setStates([]));
    refreshLive(selectedId);
  }, [selectedId]);

  const pack = packs.find((p) => p.id === selectedId) ?? null;
  const isRunning = (p: CheatPack) => runningGame?.appId === p.steamAppId;

  const updateState = (next: CheatState) => {
    setStates((prev) => prev.map((s) => (s.cheatId === next.cheatId ? next : s)));
    refreshLive();
  };

  const confirmRemove = (p: CheatPack) =>
    showModal(
      <ConfirmModal
        strTitle={`Remove ${p.gameName}?`}
        strDescription="Deletes this cheat pack and its saved settings. You can download it again from Get Cheats."
        strOKButtonText="Remove"
        bDestructiveWarning
        onOK={async () => {
          const res = await deletePack(p.id);
          if (!res.success) toaster.toast({ title: 'Remove failed', body: res.error ?? '' });
          await loadPacks();
        }}
      />,
    );

  if (loading && packs.length === 0) {
    return <PanelSection spinner title="Loading" />;
  }

  if (packs.length === 0) {
    return (
      <PanelSection>
        <PanelSectionRow>
          <div className="cc-empty">
            <FaDownload />
            <div>No cheats installed yet.</div>
            <div>Find your game in Get Cheats.</div>
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={onNavigateToStore}>
            Browse cheats
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  return (
    <>
      <PanelSection>
        {pack && (
          <PanelSectionRow>
            <GameHero pack={pack} running={isRunning(pack)} />
          </PanelSectionRow>
        )}
        {packs.length > 1 && (
          <PanelSectionRow>
            <DropdownItem
              label="Game"
              menuLabel="Installed cheats"
              rgOptions={packs.map((p) => ({
                data: p.id,
                label: isRunning(p) ? `● ${p.gameName}` : p.gameName,
              }))}
              selectedOption={selectedId}
              onChange={(opt) => selectPack(opt.data)}
            />
          </PanelSectionRow>
        )}
      </PanelSection>

      {pack && (
        <PanelSection title="Cheats">
          {!isRunning(pack) && (
            <PanelSectionRow>
              <div className="cc-muted">Start the game to apply cheats.</div>
            </PanelSectionRow>
          )}
          {pack.cheats.map((cheat) => (
            <CheatItem
              key={`${pack.id}:${cheat.id}`}
              packId={pack.id}
              cheat={cheat}
              state={states.find((s) => s.cheatId === cheat.id)}
              liveValue={liveValues[cheat.id]}
              onStateChanged={updateState}
            />
          ))}
        </PanelSection>
      )}

      <PanelSection>
        <PanelSectionRow>
          <Focusable className="cc-toolbar" flow-children="horizontal">
            <DialogButton className="cc-tool" onClick={loadPacks} disabled={loading}>
              <FaSyncAlt />
              <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
            </DialogButton>
            {pack && (
              <DialogButton className="cc-tool" onClick={() => confirmRemove(pack)}>
                <FaTrashAlt />
                <span>Remove</span>
              </DialogButton>
            )}
          </Focusable>
        </PanelSectionRow>
      </PanelSection>
    </>
  );
};

export default CheatsPage;
