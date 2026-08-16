import Link from "next/link";
import { ensureSchema } from "@/db/client";
import { requireAdmin } from "@/lib/server-auth";
import { getKeywordLists } from "@/app/actions/keyword-lists";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { KeywordListActions } from "./KeywordListActions";

export const dynamic = "force-dynamic";

export default async function KeywordListsPage() {
  await ensureSchema();
  await requireAdmin();

  const lists = await getKeywordLists();

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <div className="flex items-end justify-between gap-4">
        <PageHeader
          title="Keyword Lists"
          subtitle="Save and organize cleaning service keywords from your research into custom lists for tracking and content planning."
        />
        <KeywordListActions />
      </div>

      {lists.length === 0 ? (
        <EmptyState
          glyph="search"
          title="No keyword lists yet"
          description="Create your first list, then save keywords from Keyword Research into it. Lists help you organize keywords by service area, location, or campaign — e.g. Dubai deep cleaning, villa cleaning Dubai Marina."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lists.map((list) => (
            <Link
              key={list.id}
              href={`/admin/keyword-lists/${list.id}`}
              className="group flex flex-col rounded-xl bg-surface p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-semibold text-text group-hover:text-accent">
                    {list.name}
                  </h3>
                  {list.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-text-muted">
                      {list.description}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-accent-tint px-2.5 py-1 text-xs font-semibold tabular-nums text-accent">
                  {list.keywordCount}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-text-faint">
                <span>
                  {list.keywordCount} keyword{list.keywordCount === 1 ? "" : "s"}
                </span>
                <span>
                  Created {new Date(list.createdAt).toLocaleDateString()}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
