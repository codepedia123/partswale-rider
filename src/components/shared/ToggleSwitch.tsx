interface ToggleSwitchProps {
  checked: boolean;
  onChange: (nextValue: boolean) => void;
  disabled?: boolean;
}

export function ToggleSwitch({ checked, onChange, disabled }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      className={`toggle ${checked ? "toggle--on" : ""}`}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      aria-pressed={checked}
    >
      <span className="toggle__thumb" />
    </button>
  );
}
