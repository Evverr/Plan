import { useState } from 'react';
import selection from './control-assets/color-selected.svg';

/** Figma Ato / Color: 36px target, 22px colour, a separate selected-state frame. */
export function ColorChoices({ choices, value, onChange, label = 'Цвет' }: {
  choices: readonly { color: string; name: string }[]; value: string; onChange: (color: string) => void; label?: string;
}) {
  // Duplicate colours in the supplied palette remain separate choices. Only the clicked one is marked.
  const [picked, setPicked] = useState(() => choices.findIndex((c) => c.color.toLowerCase() === value.toLowerCase()));
  const selected = choices[picked]?.color.toLowerCase() === value.toLowerCase()
    ? picked : choices.findIndex((c) => c.color.toLowerCase() === value.toLowerCase());
  return <div className="color-choices" role="group" aria-label={label}>
    {choices.map((choice, index) => <button key={`${index}:${choice.color}`} type="button" className="color-choice"
      title={choice.name} aria-label={choice.name} aria-pressed={index === selected}
      onClick={() => { setPicked(index); onChange(choice.color); }}>
      {index === selected && <img src={selection} alt="" draggable={false} />}
      <span style={{ backgroundColor: choice.color }} />
    </button>)}
  </div>;
}
