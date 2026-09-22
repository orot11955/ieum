/** Public design API contract only: React wrappers are I-UI work, not implemented here. */
export type Intent = 'primary' | 'secondary' | 'danger' | 'ghost';
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type Density = 'comfortable' | 'compact';
export type Interaction = 'enabled' | 'disabled' | 'busy';
export type SaveState = 'pristine' | 'dirty' | 'saving' | 'saved' | 'offline' | 'conflict' | 'error';
export type ResourceState = 'loading' | 'empty' | 'ready' | 'partial-error' | 'error' | 'forbidden' | 'not-found' | 'stale';
export interface ButtonContract {
  intent: Intent;
  interaction: Interaction;
  label: string;
  iconOnly?: boolean; // true requires a nonempty accessible label and min target size
  disabledReason?: string; // persistent nearby help, not a hover-only tooltip
}
export interface FieldContract {
  label: string;
  access: 'editable' | 'readonly' | 'disabled';
  validation: 'none' | 'invalid';
  error?: string;
  help?: string;
}
export interface StatusContract {
  label: string;
  tone: Tone;
  icon?: 'check' | 'info' | 'warning' | 'error' | 'clock' | 'lock';
}
// Product state -> label/tone belongs to the owning feature, not to a generic rankScore rule.
// There is intentionally no `color`, `radius`, `fontSize` or `shadow` prop.
