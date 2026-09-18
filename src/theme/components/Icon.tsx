import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import { icon as iconSize } from '../tokens';
import { TONES, type Tone } from './Text';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * All icons go through here, for the same reason all text goes through Text:
 * one place knows the icon family and the size scale.
 *
 * Icons are decoration beside a word, never a replacement for one. This
 * audience reads a label faster than a glyph, so every icon in the app sits
 * next to text that says the same thing, and is hidden from screen readers.
 */
export function Icon({
  name,
  size = 'md',
  tone = 'default',
  color,
}: {
  name: IconName;
  size?: keyof typeof iconSize;
  tone?: Tone;
  /** Overrides `tone`, for icons on a coloured surface. */
  color?: string;
}) {
  return (
    <Ionicons
      name={name}
      size={iconSize[size]}
      color={color ?? TONES[tone]}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
