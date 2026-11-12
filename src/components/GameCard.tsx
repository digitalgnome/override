import { FC, useState } from 'react';
import { toaster } from '@decky/api';
import { DialogButton, Field, PanelSectionRow } from '@decky/ui';
import { FaArrowRight, FaDownload, FaSyncAlt } from 'react-icons/fa';
import { compareVersions, downloadPack } from '../api';
import { useAppArt } from '../useAppArt';
import { StoreEntry } from '../types';

interface GameCardProps {
  entry: StoreEntry;
  /** Installed pack version, or undefined if not installed */
  installedVersion?: string;
  onChanged: () => void;
  onOpen: (packId: string) => void;
}

const GameCard: FC<GameCardProps> = ({ entry, installedVersion, onChanged, onOpen }) => {
  const [busy, setBusy] = useState(false);
  const thumb = useAppArt(entry.steamAppId, 'capsule');
  const [failed, setFailed] = useState<string | null>(null);

  const isInstalled = installedVersion !== undefined;
  const hasUpdate = isInstalled && compareVersions(entry.version, installedVersion) > 0;

  const download = async () => {
    setBusy(true);
    try {
      const result = await downloadPack(entry.id, entry.downloadUrl);
      if (result.success) {
        toaster.toast({
          title: entry.gameName,
          body: hasUpdate ? 'Cheats updated' : 'Cheats installed',
        });
        onChanged();
      } else {
        toaster.toast({ title: entry.gameName, body: result.error ?? 'Download failed' });
      }
    } catch (e) {
      toaster.toast({ title: entry.gameName, body: 'Download failed' });
    } finally {
      setBusy(false);
    }
  };

  const count = entry.cheatCount ? `${entry.cheatCount} cheat${entry.cheatCount === 1 ? '' : 's'}` : null;
  const status = hasUpdate ? (
    <span className="cc-warn">Update available</span>
  ) : isInstalled ? (
    <span className="cc-ok">Installed</span>
  ) : null;

  let action;
  if (busy) {
    action = <DialogButton className="cc-action-btn" disabled>…</DialogButton>;
  } else if (!isInstalled || hasUpdate) {
    action = (
      <DialogButton className="cc-action-btn cc-primary" onClick={download}>
        {hasUpdate ? <FaSyncAlt size={11} /> : <FaDownload size={11} />}
        {hasUpdate ? 'Update' : 'Get'}
      </DialogButton>
    );
  } else {
    action = (
      <DialogButton className="cc-action-btn" onClick={() => onOpen(entry.id)}>
        Open <FaArrowRight size={10} />
      </DialogButton>
    );
  }

  return (
    <PanelSectionRow>
      <Field
        label={
          <div className="cc-store-row">
            {thumb && failed !== thumb ? (
              <img className="cc-thumb" src={thumb} alt="" onError={() => setFailed(thumb)} />
            ) : (
              <div className="cc-thumb" />
            )}
            <div className="cc-row-text">
              <div className="cc-row-title">{entry.gameName}</div>
              <div className="cc-row-sub">
                {[count, status].filter(Boolean).map((part, i) => (
                  <span key={i}>
                    {i > 0 && ' · '}
                    {part}
                  </span>
                ))}
              </div>
            </div>
          </div>
        }
        childrenContainerWidth="min"
        inlineWrap="keep-inline"
        verticalAlignment="center"
      >
        {action}
      </Field>
    </PanelSectionRow>
  );
};

export default GameCard;
