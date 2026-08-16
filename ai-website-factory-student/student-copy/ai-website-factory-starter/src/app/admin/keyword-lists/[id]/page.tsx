import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureSchema } from "@/db/client";
import { requireAdmin } from "@/lib/server-auth";
import { getKeywordListWithItems } from "@/app/actions/keyword-lists";
import { EmptyState } from "@/components/ui/EmptyState";
import { KeywordListDetailActions, KeywordListTable } from "./KeywordListDetailActions";

export const dynamic = "force-dynamic";

export default async function KeywordListDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await ensureSchema();
  await requireAdmin();

  const { list, items } = await getKeywordListWithItems(params.id);
  if (!list) notFound();

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <div>
        <Link
          href="/admin/keyword-lists"
          className="text-xs text-text-faint hover:text-text"
        >
          ← Back to Keyword Lists
        </Link>
        <h1 className="mt-2 text-2xl font-medium tracking-tight text-text">
          {list.name}
        </h1>
        {list.description && (
          <p className="mt-1 text-sm text-text-muted">{list.description}</p>
        )}
        <p className="mt-1 text-xs text-text-faint">
          {items.length} keyword{items.length === 1 ? "" : "s"} · Created{" "}
          {new Date(list.createdAt).toLocaleDateString()}
        </p>
      </div>

      <KeywordListDetailActions listId={list.id} />

      {items.length === 0 ? (
        <EmptyState
          glyph="search"
          title="No keywords in this list"
          description="Go to Keyword Research, select cleaning service keywords, and save them to this list."
          action={{ label: "Keyword Research", href: "/admin/keywords" }}
        />
      ) : (
        <KeywordListTable items={items} />
      )}
    </div>
  );
}
