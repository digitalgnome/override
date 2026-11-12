import { FC } from 'react';
import { DialogButton, Focusable } from '@decky/ui';
import { FaSearch, FaTimes } from 'react-icons/fa';
import { promptText } from './TextPrompt';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

// Opens a search dialog instead of typing in the panel (see TextPrompt.tsx).
const SearchBar: FC<SearchBarProps> = ({ value, onChange }) => {
  const openSearch = async () => {
    const q = await promptText({
      title: 'Search cheats',
      description: 'Game name or Steam app ID',
      initial: value,
      okText: 'Search',
    });
    if (q !== null) onChange(q.trim());
  };

  return (
    <Focusable className="cc-toolbar" flow-children="horizontal">
      <DialogButton className="cc-tool cc-grow" onClick={openSearch}>
        <FaSearch />
        <span className="cc-ellipsis">{value ? `“${value}”` : 'Search games'}</span>
      </DialogButton>
      {value && (
        <DialogButton className="cc-tool cc-square" onClick={() => onChange('')}>
          <FaTimes />
        </DialogButton>
      )}
    </Focusable>
  );
};

export default SearchBar;
