'use client';

import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function PasswordField({ label = 'Contraseña', value, onChange, autoComplete, invalid, describedBy }: {
  label?: string; value: string; onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password'; invalid?: boolean; describedBy?: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const name = label === 'Contraseña' ? 'contraseña' : 'confirmación de contraseña';
  return <div className="account-password-field">
    <label htmlFor={id}>{label}</label>
    <div className="account-password-input">
      <input id={id} type={visible ? 'text' : 'password'} autoComplete={autoComplete} minLength={6} required
        value={value} onChange={event => onChange(event.target.value)} aria-invalid={invalid || undefined} aria-describedby={describedBy} />
      <button type="button" className="account-password-toggle" aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${name}`}
        aria-pressed={visible} aria-controls={id} onClick={() => setVisible(shown => !shown)}>
        {visible ? <EyeOff size={20} aria-hidden="true"/> : <Eye size={20} aria-hidden="true"/>}
      </button>
    </div>
  </div>;
}
