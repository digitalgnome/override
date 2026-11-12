export interface CheatDefinition {
  id: string;
  name: string;
  description: string;
  /** toggle = on/off switch, value = user enters a number or text */
  type: 'toggle' | 'value';
  valueType?: 'integer' | 'float' | 'string';
  defaultValue?: number | string;
  /** Optional slider bounds for numeric value cheats */
  min?: number;
  max?: number;
  step?: number;
}

export interface CheatPack {
  id: string;
  gameName: string;
  steamAppId: string;
  version: string;
  author: string;
  description: string;
  cheats: CheatDefinition[];
}

export interface CheatState {
  cheatId: string;
  enabled: boolean;
  value?: number | string | null;
}

export interface StoreEntry {
  id: string;
  gameName: string;
  steamAppId: string;
  author: string;
  description: string;
  version: string;
  downloadUrl: string;
  iconUrl?: string;
  cheatCount?: number;
}

export interface StoreIndex {
  entries: StoreEntry[];
  lastUpdated: string;
  source?: 'online' | 'bundled' | 'none';
}

export interface RunningGame {
  appId: string;
  name: string;
}

export interface Result {
  success: boolean;
  error?: string;
}

export interface ApplyResult extends Result {
  applied?: boolean;
  message?: string;
}
