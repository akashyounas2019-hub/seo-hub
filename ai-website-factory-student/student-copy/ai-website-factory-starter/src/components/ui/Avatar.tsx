/**
 * Initials avatar — colored softly by role.
 *
 * Sizes: sm=20, md=28 (default), lg=36, xl=56.
 *
 * Renders 2 uppercase initials derived from the name (first letter of first
 * two whitespace-separated words) or, failing that, from the email local-part.
 */
export type AvatarSize = "sm" | "md" | "lg" | "xl";

const SIZE_PX: Record<AvatarSize, number> = { sm: 20, md: 28, lg: 36, xl: 56 };
const FONT_PX: Record<AvatarSize, number> = { sm: 9, md: 10.5, lg: 13, xl: 20 };

function initialsFrom(name: string | null | undefined, email: string): string {
  const fromName = name?.trim()
    ? name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
    : "";
  if (fromName.length >= 1) return fromName.slice(0, 2).toUpperCase();
  const local = email.split("@")[0] ?? email;
  return local.slice(0, 2).toUpperCase();
}

function roleClasses(role?: string): string {
  switch (role) {
    case "admin":
      return "bg-danger-tint text-danger ring-1 ring-inset ring-danger/20";
    case "manager":
      return "bg-warning-tint text-warning ring-1 ring-inset ring-warning/20";
    case "student":
    case "worker":
      return "bg-info-tint text-info ring-1 ring-inset ring-info/20";
    default:
      return "bg-surface-2 text-text-muted ring-1 ring-inset ring-border";
  }
}

export function Avatar({
  email,
  name,
  role,
  size = "md",
  className = "",
}: {
  email: string;
  name?: string | null;
  role?: string;
  size?: AvatarSize;
  className?: string;
}) {
  const px = SIZE_PX[size];
  const fontPx = FONT_PX[size];
  const initials = initialsFrom(name, email);
  return (
    <span
      title={name ?? email}
      aria-label={name ?? email}
      className={`tnum inline-grid shrink-0 place-items-center rounded-full font-semibold uppercase tracking-wider ${roleClasses(role)} ${className}`}
      style={{ width: px, height: px, fontSize: fontPx, lineHeight: 1 }}
    >
      {initials}
    </span>
  );
}

/**
 * Avatar with a colored presence dot in the corner.
 */
export function AvatarWithDot({
  email,
  name,
  role,
  size = "md",
  tone,
  pulse,
  className = "",
}: {
  email: string;
  name?: string | null;
  role?: string;
  size?: AvatarSize;
  tone: "success" | "warning" | "neutral" | "accent" | "danger" | "info";
  pulse?: boolean;
  className?: string;
}) {
  const dotColor = {
    success: "bg-success",
    warning: "bg-warning",
    neutral: "bg-text-faint",
    accent: "bg-accent",
    danger: "bg-danger",
    info: "bg-info",
  }[tone];
  // Dot diameter scales with avatar size.
  const dotPx = size === "xl" ? 14 : size === "lg" ? 10 : size === "md" ? 8 : 7;
  return (
    <span className={`relative inline-flex ${className}`}>
      <Avatar email={email} name={name} role={role} size={size} />
      <span
        className={`absolute right-0 bottom-0 block rounded-full ${dotColor} ring-2 ring-surface`}
        style={{ width: dotPx, height: dotPx }}
        aria-hidden
      />
      {pulse ? (
        <span
          className={`absolute right-0 bottom-0 block rounded-full ${dotColor} opacity-50 animate-ping`}
          style={{ width: dotPx, height: dotPx }}
          aria-hidden
        />
      ) : null}
    </span>
  );
}
