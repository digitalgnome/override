import { FC, ReactNode, useState } from 'react';
import { toaster } from '@decky/api';
import {
  ConfirmModal,
  DialogButton,
  Field,
  Focusable,
  PanelSectionRow,
  SliderField,
  Toggle,
  showModal,
} from '@decky/ui';
import { FaInfoCircle, FaPen } from 'react-icons/fa';
import { setCheatState } from '../api';
import { ApplyResult, CheatDefinition, CheatState } from '../types';
import { promptText } from './TextPrompt';

interface CheatItemProps {
  packId: string;
  cheat: CheatDefinition;
  state: CheatState | undefined;
  onStateChanged: (next: CheatState) => void;
  /** Value currently in game memory, if it could be read */
  liveValue?: number | string;
}

function report(cheat: CheatDefinition, result: ApplyResult) {
  if (!result.success) {
    toaster.toast({ title: cheat.name, body: result.error ?? 'Failed' });
  } else if (!result.applied && result.message) {
    toaster.toast({ title: cheat.name, body: result.message });
  } else if (result.applied && cheat.type === 'value') {
    toaster.toast({ title: cheat.name, body: 'Applied' });
  }
}

const fmt = (v: unknown) => (typeof v === 'number' ? v.toLocaleString() : String(v));

/** Validate typed input against the cheat's type and range. */
function validateValue(cheat: CheatDefinition, raw: string): string | null {
  const v = raw.replace(/[,\s]/g, '');
  if (v === '') return 'Enter a value';
  if (cheat.valueType !== 'integer' && cheat.valueType !== 'float') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return 'Numbers only';
  if (cheat.valueType === 'integer' && !Number.isInteger(n)) return 'Whole numbers only';
  if (cheat.min !== undefined && n < cheat.min) return `Minimum is ${fmt(cheat.min)}`;
  if (cheat.max !== undefined && n > cheat.max) return `Maximum is ${fmt(cheat.max)}`;
  return null;
}

function showInfo(cheat: CheatDefinition, extra: string[]) {
  showModal(
    <ConfirmModal
      strTitle={cheat.name}
      strDescription={
        <div style={{ lineHeight: 1.5 }}>
          <div>{cheat.description || 'No description.'}</div>
          {extra.map((line) => (
            <div key={line} style={{ marginTop: '8px', opacity: 0.75 }}>
              {line}
            </div>
          ))}
        </div>
      }
      strOKButtonText="Close"
      bAlertDialog
    />,
  );
}

/** Cheat name on the left; control + info button on the right. */
const CheatRow: FC<{ name: string; onInfo: () => void; children: ReactNode }> = ({
  name,
  onInfo,
  children,
}) => (
  <PanelSectionRow>
    <Field label={name} childrenContainerWidth="min" inlineWrap="keep-inline" verticalAlignment="center">
      <Focusable className="cc-controls" flow-children="horizontal">
        {children}
        <DialogButton className="cc-icon-btn" onClick={onInfo} aria-label="Info">
          <FaInfoCircle />
        </DialogButton>
      </Focusable>
    </Field>
  </PanelSectionRow>
);

const CheatItem: FC<CheatItemProps> = ({ packId, cheat, state, onStateChanged, liveValue }) => {
  const enabled = state?.enabled ?? false;
  const savedValue = state?.value ?? cheat.defaultValue ?? '';
  const [sliderValue, setSliderValue] = useState<number>(Number(savedValue) || 0);
  const [busy, setBusy] = useState(false);

  const send = async (nextEnabled: boolean, value: string | null) => {
    setBusy(true);
    try {
      const result = await setCheatState(packId, cheat.id, nextEnabled, value);
      report(cheat, result);
      if (result.success) {
        onStateChanged({
          cheatId: cheat.id,
          enabled: nextEnabled,
          value: value ?? state?.value ?? null,
        });
      }
    } catch (e) {
      toaster.toast({ title: cheat.name, body: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const isNumeric = cheat.valueType === 'integer' || cheat.valueType === 'float';
  const hasRange = isNumeric && cheat.min !== undefined && cheat.max !== undefined;
  const rangeText = hasRange ? `${fmt(cheat.min)} – ${fmt(cheat.max)}` : '';
  const current = liveValue ?? null;
  const info = () =>
    showInfo(
      cheat,
      [
        rangeText ? `Allowed values: ${rangeText}` : '',
        current !== null ? `In game now: ${fmt(current)}` : '',
      ].filter(Boolean),
    );

  if (cheat.type === 'toggle') {
    return (
      <CheatRow name={cheat.name} onInfo={info}>
        <Toggle value={enabled} disabled={busy} onChange={(checked) => send(checked, null)} />
      </CheatRow>
    );
  }

  // ----- value cheat -----
  const step = cheat.step ?? (cheat.valueType === 'integer' ? 1 : 0.1);
  // Sliders only for small ranges; big ones (e.g. 0-9,999,999 Gil) are typed.
  const useSlider = hasRange && (cheat.max! - cheat.min!) / step <= 500;

  const typeValue = async () => {
    const entered = await promptText({
      title: cheat.name,
      description: rangeText ? `Enter a value (${rangeText})` : 'Enter a value',
      initial: String(current ?? savedValue),
      okText: 'Apply',
      numeric: isNumeric,
      validate: (v) => validateValue(cheat, v),
    });
    if (entered !== null) await send(true, entered.replace(/[,\s]/g, ''));
  };

  if (useSlider) {
    return (
      <>
        <PanelSectionRow>
          <SliderField
            label={cheat.name}
            value={sliderValue}
            min={cheat.min}
            max={cheat.max}
            step={step}
            showValue
            onChange={setSliderValue}
          />
        </PanelSectionRow>
        <CheatRow name="" onInfo={info}>
          <DialogButton className="cc-value-btn" disabled={busy} onClick={() => send(true, String(sliderValue))}>
            {busy ? '…' : `Apply ${fmt(sliderValue)}`}
          </DialogButton>
        </CheatRow>
      </>
    );
  }

  // Large range or text: the button shows the current in-game value; tapping
  // it opens a typing dialog and OK applies.
  return (
    <CheatRow name={cheat.name} onInfo={info}>
      <DialogButton className="cc-value-btn" disabled={busy} onClick={typeValue}>
        {busy ? '…' : current !== null ? fmt(current) : 'Set'}
        <FaPen size={10} />
      </DialogButton>
    </CheatRow>
  );
};

export default CheatItem;
