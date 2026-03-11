const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---/;

export type ManifestValue = string | string[];

export const parseFrontmatter = (
  markdownContent: string
): Record<string, ManifestValue> => {
  const match = markdownContent.match(FRONTMATTER_PATTERN);
  if (!match) {
    return {};
  }

  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, ManifestValue>>((metadata, line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex < 0) {
        return metadata;
      }

      const key = line.slice(0, separatorIndex).trim();
      const rawValue = line.slice(separatorIndex + 1).trim();

      if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
        metadata[key] = rawValue
          .slice(1, -1)
          .split(",")
          .map((value) => value.trim().replace(/^"|"$/g, ""))
          .filter(Boolean);
        return metadata;
      }

      metadata[key] = rawValue.replace(/^"|"$/g, "");
      return metadata;
    }, {});
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
