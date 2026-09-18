import { Icon, type IconName } from '../theme/components';

/**
 * Tab options with an icon: filled when selected, outline otherwise -- the
 * Material convention, so the selected tab reads by shape as well as colour.
 * `icon` is an Ionicons base name that has an `-outline` variant.
 */
export function tab(title: string, icon: IconName) {
  return {
    title,
    tabBarIcon: ({ focused, color }: { focused: boolean; color: string }) => (
      <Icon name={(focused ? icon : `${icon}-outline`) as IconName} color={color} />
    ),
  };
}
