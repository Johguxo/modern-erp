// Pestañas de la bandeja: enlaces de navegación con aria-current (la pestaña vive en ?tab=), no un
// tablist. Las de «Más» van en un menú. Cambiar de pestaña conserva la búsqueda y vuelve a la
// página 1.
import Link from 'next/link';

import { MORE_TABS, VISIBLE_TABS, type InboxTab } from '@/modules/requests/contracts';
import { messages } from '@/ui/messages/es-PE';

import { inboxHref } from './inbox-params';
import { InboxMoreMenu } from './inbox-more-menu';
import { tabPillClass } from './tab-pill';

const t = messages.inbox;

export function InboxTabs({ active, q }: { active: InboxTab; q: string | null }) {
  const moreActive = MORE_TABS.find((tab) => tab === active);
  return (
    <nav aria-label={t.tabsLabel} className="flex flex-wrap gap-2">
      {VISIBLE_TABS.map((tab) => (
        <Link
          key={tab}
          href={inboxHref({ tab, q })}
          aria-current={tab === active ? 'page' : undefined}
          className={tabPillClass(tab === active)}
        >
          {t.tabs[tab]}
        </Link>
      ))}
      <InboxMoreMenu
        active={moreActive ?? null}
        items={MORE_TABS.map((tab) => ({
          tab,
          label: t.tabs[tab],
          href: inboxHref({ tab, q }),
        }))}
      />
    </nav>
  );
}
