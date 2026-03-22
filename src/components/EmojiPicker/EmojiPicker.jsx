import { useState } from 'react';
import { Smile } from 'lucide-react';
import './EmojiPicker.css';

const CUSTOM_EMOJI_IDS = [
  '5249203579134179981','5249222386795967624','5249038167058709114',
  '5249101968797889750','5249380256908865528','5249497067134418748',
  '5248961824015024533','5249022679406641203','5249500859590539214',
  '5249393919199836094','5249315265463743154','5249137793120107984',
  '5249431560293220758','5248978625927083352','5249266736628266267',
  '5249284625167055914','5248996780753844722','5249377542489535714',
  '5249100031767641367','5249370271109905382','5249023950716959287',
  '5249494885291033786','5249233003955125362','5249132016389092908',
  '5249455491850991356','5249484955326643084','5249109553710136350',
  '5249409342427396269','5249407873548581860','5249222721803416777',
  '5249042689659273281','5249150639367287343','5249302071324214197',
  '5249311528842196557','5249350832087925208',
];

export default function EmojiPicker({ onInsert }) {
  const [open, setOpen] = useState(false);

  const handleSelect = (emojiId) => {
    const tag = `<tg-emoji emoji-id="${emojiId}">⭐</tg-emoji>`;
    onInsert(tag);
    setOpen(false);
  };

  return (
    <div className="emoji-picker-wrapper">
      <button
        className="emoji-picker-trigger"
        onClick={() => setOpen(!open)}
        title="Фирменные эмодзи"
        type="button"
      >
        <Smile size={16} />
      </button>

      {open && (
        <>
          <div className="emoji-picker-backdrop" onClick={() => setOpen(false)} />
          <div className="emoji-picker-popup">
            <div className="emoji-picker-header">Фирменные эмодзи</div>
            <div className="emoji-picker-grid">
              {CUSTOM_EMOJI_IDS.map((id) => (
                <button
                  key={id}
                  className="emoji-picker-item"
                  onClick={() => handleSelect(id)}
                  title={id}
                >
                  <img
                    src={`/emoji/${id}.webp`}
                    alt="emoji"
                    className="emoji-picker-img"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
