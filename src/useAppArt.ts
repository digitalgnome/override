import { useEffect, useState } from 'react';
import { loadAppArt } from './api';

/** Image URL for a game ('header' banner or small 'capsule'), or null while loading. */
export function useAppArt(appId: string, kind: 'header' | 'capsule'): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    loadAppArt(appId).then((art) => alive && setUrl(art[kind]));
    return () => {
      alive = false;
    };
  }, [appId, kind]);
  return url;
}
