import { FC, useEffect, useMemo, useState } from 'react';
import { ButtonItem, DialogButton, Focusable, PanelSection, PanelSectionRow } from '@decky/ui';
import { FaSearch, FaSyncAlt, FaWifi } from 'react-icons/fa';
import { getDownloadedPacks, getStoreIndex } from '../api';
import GameCard from '../components/GameCard';
import SearchBar from '../components/SearchBar';
import { StoreIndex } from '../types';

// Keep the search text while switching views.
let lastQuery = '';

const StorePage: FC<{ onOpenPack: (packId: string) => void }> = ({ onOpenPack }) => {
  const [index, setIndex] = useState<StoreIndex | null>(null);
  const [installed, setInstalled] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState(lastQuery);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInstalled = async () => {
    const packs = await getDownloadedPacks();
    setInstalled(new Map(packs.map((p) => [p.id, p.version])));
  };

  const load = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const [idx] = await Promise.all([getStoreIndex(force), loadInstalled()]);
      setIndex(idx);
    } catch (e) {
      setError('Could not load the cheat store.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onQuery = (q: string) => {
    lastQuery = q;
    setQuery(q);
  };

  // Filter locally: instant results, no backend round-trip per keystroke.
  const results = useMemo(() => {
    const entries = [...(index?.entries ?? [])].sort((a, b) =>
      a.gameName.localeCompare(b.gameName),
    );
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return entries;
    return entries.filter((e) => {
      const haystack = `${e.gameName} ${e.description} ${e.steamAppId}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }, [index, query]);

  const total = index?.entries.length ?? 0;

  const countText = query.trim()
    ? `${results.length} of ${total} game${total === 1 ? '' : 's'}`
    : `${total} game${total === 1 ? '' : 's'}`;

  return (
    <>
      <PanelSection>
        <PanelSectionRow>
          <SearchBar value={query} onChange={onQuery} />
        </PanelSectionRow>
      </PanelSection>

      {loading && <PanelSection spinner title="Loading" />}

      {error && !loading && (
        <PanelSection>
          <PanelSectionRow>
            <div className="cc-empty">
              <FaWifi />
              <div>{error}</div>
            </div>
          </PanelSectionRow>
          <PanelSectionRow>
            <ButtonItem layout="below" onClick={() => load(true)}>
              Retry
            </ButtonItem>
          </PanelSectionRow>
        </PanelSection>
      )}

      {!loading && !error && (
        <PanelSection title={countText + (index?.source === 'bundled' ? ' · offline' : '')}>
          {results.length === 0 ? (
            <PanelSectionRow>
              <div className="cc-empty">
                <FaSearch />
                <div>
                  {query.trim() ? `No cheats for “${query.trim()}” yet.` : 'The store is empty.'}
                </div>
              </div>
            </PanelSectionRow>
          ) : (
            results.map((entry) => (
              <GameCard
                key={entry.id}
                entry={entry}
                installedVersion={installed.get(entry.id)}
                onChanged={loadInstalled}
                onOpen={onOpenPack}
              />
            ))
          )}
        </PanelSection>
      )}

      {!loading && (
        <PanelSection>
          <PanelSectionRow>
            <Focusable className="cc-toolbar">
              <DialogButton className="cc-tool" onClick={() => load(true)}>
                <FaSyncAlt />
                <span>Refresh store</span>
              </DialogButton>
            </Focusable>
          </PanelSectionRow>
        </PanelSection>
      )}
    </>
  );
};

export default StorePage;
