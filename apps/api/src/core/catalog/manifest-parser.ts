const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---/;

export type ManifestValue = string | string[];

export const parseFrontmatter = (
  markdownContent: string
): Record<string, ManifestValue> => {
  const match = markdownContent.match(FRONTMATTER_PATTERN);
  if (!match) {
    return {};
  }

  const metadata: Record<string, ManifestValue> = {};
  let activeListKey: string | null = null;

  match[1]
    .split("\n")
    .forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) {
        return;
      }

      const listMatch = line.match(/^-\s*(.+?)\s*$/);
      if (listMatch && activeListKey) {
        const current = Array.isArray(metadata[activeListKey]) ? metadata[activeListKey] : [];
        metadata[activeListKey] = current.concat(listMatch[1].trim().replace(/^"|"$/g, ""));
        return;
      }

      activeListKey = null;
      const separatorIndex = line.indexOf(":");
      if (separatorIndex < 0) {
        return;
      }

      const key = line.slice(0, separatorIndex).trim();
      const rawValue = line.slice(separatorIndex + 1).trim();

      if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
        metadata[key] = rawValue
          .slice(1, -1)
          .split(",")
          .map((value) => value.trim().replace(/^"|"$/g, ""))
          .filter(Boolean);
        return;
      }

      if (!rawValue) {
        metadata[key] = [];
        activeListKey = key;
        return;
      }

      metadata[key] = rawValue.replace(/^"|"$/g, "");
    });

  return metadata;
};

export const asString = (
  value: ManifestValue | undefined,
  fallback = ""
): string => (Array.isArray(value) ? value.join(", ") : value || fallback);

export const asStringArray = (value: ManifestValue | undefined): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};
