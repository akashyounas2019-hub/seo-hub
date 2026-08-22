export interface ObsidianNote {
  id: string;
  title: string;
  category: string;
  tags: string[];
  wikilinks: string[];
  content: string;
  lastModified: string;
}

export function parseObsidianNote(rawContent: string, fileName: string): ObsidianNote {
  let title = fileName.replace(/\.md$/, "").replace(/_/g, " ");
  let category = "SEO Knowledge";
  let tags: string[] = [];
  let wikilinks: string[] = [];
  let content = rawContent;

  // Extract YAML frontmatter if present
  const frontmatterMatch = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (frontmatterMatch) {
    const yaml = frontmatterMatch[1];
    content = frontmatterMatch[2];

    const titleMatch = yaml.match(/title:\s*["']?(.*?)["']?$/m);
    if (titleMatch) title = titleMatch[1];

    const categoryMatch = yaml.match(/category:\s*["']?(.*?)["']?$/m);
    if (categoryMatch) category = categoryMatch[1];

    const tagsMatch = yaml.match(/tags:\s*\[?(.*?)\]?$/m);
    if (tagsMatch) {
      tags = tagsMatch[1]
        .split(",")
        .map((t) => t.trim().replace(/^#/, "").replace(/["']/g, ""))
        .filter(Boolean);
    }
  }

  // Extract Obsidian [[Wikilinks]]
  const linkMatches = content.match(/\[\[(.*?)\]\]/g);
  if (linkMatches) {
    wikilinks = Array.from(
      new Set(linkMatches.map((l) => l.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim())),
    );
  }

  // Extract inline hashtags #tag
  const inlineTags = content.match(/#(?:[a-zA-Z0-9_-]+)/g);
  if (inlineTags) {
    const parsedInline = inlineTags.map((t) => t.replace(/^#/, ""));
    tags = Array.from(new Set([...tags, ...parsedInline]));
  }

  return {
    id: fileName.toLowerCase().replace(/[^a-z0-9]/g, "-"),
    title,
    category,
    tags,
    wikilinks,
    content: content.trim(),
    lastModified: new Date().toISOString().split("T")[0],
  };
}

export const DEFAULT_OBSIDIAN_VAULT: ObsidianNote[] = [
  {
    id: "01-dubai-seo-mastery",
    title: "Dubai Local SEO & GMB Optimization Strategy",
    category: "GMB Strategy",
    tags: ["gmb", "dubai", "local-seo", "maps-ranking"],
    wikilinks: ["Target Keywords List", "Dubai Municipality Guidelines", "AI Crawler Defense"],
    content: `# Dubai Local SEO & GMB Optimization Strategy

This SOP defines local Google Business Profile ranking rules for **Safaeewala Cleaning Services**.

## Key Objectives
- Maintain #1 spot in Google Local 3-Pack for [[Target Keywords List]].
- Ensure complete compliance with [[Dubai Municipality Guidelines]].
- Maintain automated protection against [[AI Crawler Defense]].

## Execution Checklist
1. **Primary Category**: Cleaning Service.
2. **Secondary Categories**: House Cleaning Service, Carpet Cleaning Service, Window Cleaning Service.
3. **Geo-Targeting**: Downtown Dubai, Marina, Business Bay, JLT, Palm Jumeirah.
4. **Review Frequency**: Minimum 3 weekly reviews with geo-tagged images (#dubai #cleaning).`,
    lastModified: "2026-08-22",
  },
  {
    id: "02-target-keywords-list",
    title: "Target Keywords List",
    category: "Keyword Intelligence",
    tags: ["keywords", "intent", "search-volume"],
    wikilinks: ["Dubai Local SEO & GMB Optimization Strategy", "On-Page Content Checklist"],
    content: `# Target Keywords List (Dubai Market)

Primary and secondary high-intent keywords for Safaeewala:

- \`dubai cleaning services\` (CTR: 7.8%, Volume: 12,400)
- \`sofa cleaning dubai price\` (CTR: 6.2%, Volume: 9,800)
- \`deep cleaning company near me\` (CTR: 6.9%, Volume: 7,200)
- \`move in cleaning dubai\` (CTR: 6.1%, Volume: 5,600)
- \`villa sanitization services uae\` (CTR: 5.9%, Volume: 4,900)

Cross-referenced with [[Dubai Local SEO & GMB Optimization Strategy]] and [[On-Page Content Checklist]].`,
    lastModified: "2026-08-22",
  },
  {
    id: "03-ai-crawler-defense",
    title: "AI Crawler Defense & Cloudflare Shield",
    category: "Technical Security",
    tags: ["cloudflare", "bots", "ai-shield", "crawlers"],
    wikilinks: ["Dubai Local SEO & GMB Optimization Strategy"],
    content: `# AI Crawler Defense & Cloudflare Shield Rules

Guidelines for controlling LLM crawlers (GPTBot, ClaudeBot, Bytespider, PerplexityBot).

## Cloudflare Firewall Rules
- Block unverified aggressive scrapers trying to steal pricing catalogs.
- Allow verified AI assistants (ChatGPT User, Gemini Web Search) to cite Safaeewala.
- Require JS challenge for high-frequency bot requests exceeding 50 req/min.`,
    lastModified: "2026-08-22",
  },
];
