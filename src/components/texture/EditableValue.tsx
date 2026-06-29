import { useState, useEffect, useRef } from "react";

interface EditableValueProps {
  value: number;
  suffix?: string;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  className?: string;
}

export function EditableValue({
  value,
  suffix = "",
  min,
  max,
  step: _step,
  onChange,
  className = "",
}: EditableValueProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSubmit = () => {
    const numVal = parseFloat(editValue);
    if (!isNaN(numVal)) {
      const clamped = Math.max(min, Math.min(max, numVal));
      onChange(clamped);
    }
    setIsEditing(false);
    setEditValue(value.toString());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
    if (e.key === "Escape") {
      setIsEditing(false);
      setEditValue(value.toString());
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value.replace(/[^0-9.-]/g, ""))}
        onBlur={handleSubmit}
        onKeyDown={handleKeyDown}
        className={`text-xs bg-transparent border-b outline-none text-center ${className}`}
        style={{ borderColor: "var(--theme-primary)", color: "var(--theme-primary)" }}
      />
    );
  }

  return (
    <span
      onClick={() => {
        setIsEditing(true);
        setEditValue(value.toString());
      }}
      className={`text-xs cursor-pointer hover:underline select-none ${className}`}
      style={{ color: "var(--theme-primary)" }}
    >
      {value}
      {suffix}
    </span>
  );
}
