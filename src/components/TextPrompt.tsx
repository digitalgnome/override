import { FC, useState } from 'react';
import { ConfirmModal, TextField, showModal } from '@decky/ui';

// Text boxes inside the Quick Access panel fight the on-screen keyboard:
// every keystroke re-renders the panel, focus jumps, and Steam can lock up.
// Typing inside a modal is reliable, so all text entry goes through here.

interface PromptOptions {
  title: string;
  description?: string;
  initial?: string;
  okText?: string;
  numeric?: boolean;
  /** Return an error message to block OK, or null when valid */
  validate?: (value: string) => string | null;
}

const PromptModal: FC<PromptOptions & { onDone: (v: string | null) => void; closeModal?: () => void }> = ({
  title,
  description,
  initial = '',
  okText = 'OK',
  numeric,
  validate,
  onDone,
  closeModal,
}) => {
  const [value, setValue] = useState(initial);
  const error = validate ? validate(value) : null;

  const finish = (result: string | null) => {
    onDone(result);
    closeModal?.();
  };

  return (
    <ConfirmModal
      strTitle={title}
      strOKButtonText={okText}
      bOKDisabled={error !== null}
      onOK={() => onDone(value)}
      onCancel={() => onDone(null)}
      closeModal={closeModal}
    >
      {description && <div style={{ marginBottom: '8px', opacity: 0.8 }}>{description}</div>}
      <TextField
        focusOnMount
        value={value}
        mustBeNumeric={numeric}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && error === null) finish(value);
        }}
      />
      <div style={{ minHeight: '18px', marginTop: '6px', color: '#ff6b6b', fontSize: '13px' }}>
        {value !== '' && error}
      </div>
    </ConfirmModal>
  );
};

/** Show a text-entry dialog. Resolves to the entered text, or null if cancelled. */
export function promptText(opts: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: string | null) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    showModal(<PromptModal {...opts} onDone={done} />);
  });
}
