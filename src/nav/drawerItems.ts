import type { MemberRole } from '../api/reads';
import { can } from '../auth/roles';

/**
 * What the side drawer offers, stated as data.
 *
 * One list serves all three shells (owner, packer, delivery), so which person
 * sees which destination is decided here once and unit-tested, rather than
 * re-decided in three layouts.
 *
 * Visibility is by ROLE ONLY, never by read-only state. A lapsed subscription
 * still lets the owner open every screen -- that is the "read-only, never a
 * data lock" promise -- and the write buttons inside hide themselves via
 * `me.can()`.
 *
 * As everywhere in the client, this is UX, not security: the (owner) layout
 * redirects anyone else, and every RPC re-checks the role server-side.
 *
 * Pure (a type import and roles.ts), so it runs in Node.
 */

export interface DrawerViewer {
  role: MemberRole | null;
  /** businesses.features.packing, from get_my_context. */
  hasPacking: boolean;
}

export type DrawerSection = 'catalog' | 'operations' | 'business';

export interface DrawerItem {
  key: string;
  section: DrawerSection;
  /** An i18n key; the drawer resolves it. */
  labelKey: string;
  /** An Ionicons name. Kept as a string so this file needs no RN import. */
  icon: string;
  href: string;
  show: (v: DrawerViewer) => boolean;
}

export const SECTION_LABEL_KEYS: Record<DrawerSection, string> = {
  catalog: 'drawer.catalog',
  operations: 'drawer.operations',
  business: 'drawer.business',
};

export const DRAWER_ITEMS: readonly DrawerItem[] = [
  {
    key: 'customers',
    section: 'catalog',
    labelKey: 'catalog.customers',
    icon: 'people-outline',
    href: '/(owner)/catalog/customers',
    show: (v) => can(v.role, 'manage_masters'),
  },
  {
    key: 'materials',
    section: 'catalog',
    labelKey: 'catalog.materials',
    icon: 'leaf-outline',
    href: '/(owner)/catalog/material',
    show: (v) => can(v.role, 'manage_masters'),
  },
  {
    key: 'skus',
    section: 'catalog',
    labelKey: 'catalog.skus',
    icon: 'pricetags-outline',
    href: '/(owner)/catalog/sku',
    show: (v) => can(v.role, 'manage_masters'),
  },
  {
    key: 'packing',
    section: 'operations',
    labelKey: 'packer.runs',
    icon: 'layers-outline',
    href: '/(pack)/runs',
    // Owners and managers reach packing from here. A packer does not need the
    // link: packing is already a tab in their own app.
    show: (v) => v.hasPacking && can(v.role, 'run_packing') && v.role !== 'PACKER',
  },
  {
    key: 'staff',
    section: 'business',
    labelKey: 'staff.title',
    icon: 'people-circle-outline',
    href: '/(owner)/more/staff',
    show: (v) => can(v.role, 'manage_staff'),
  },
  {
    key: 'settings',
    section: 'business',
    labelKey: 'settings.title',
    icon: 'settings-outline',
    href: '/(owner)/more/settings',
    show: (v) => can(v.role, 'manage_settings'),
  },
];

/** The visible items, grouped by section, in declaration order. */
export function drawerSections(
  viewer: DrawerViewer,
): Array<{ section: DrawerSection; items: DrawerItem[] }> {
  const out: Array<{ section: DrawerSection; items: DrawerItem[] }> = [];
  for (const item of DRAWER_ITEMS) {
    if (!item.show(viewer)) continue;
    const last = out[out.length - 1];
    if (last && last.section === item.section) last.items.push(item);
    else out.push({ section: item.section, items: [item] });
  }
  return out;
}
