import { cn } from "@/lib/utils";

// Inline SVGs — small set we need across the platform. Cheaper than pulling in
// a whole icon library; matches Linear/Vercel's approach of curating a tiny set.

type IconProps = { className?: string; size?: number };

function svg(path: React.ReactNode, viewBox = "0 0 16 16") {
  return ({ className, size = 16 }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("inline-block shrink-0", className)}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

export const IconSparkle = svg(
  <>
    <path d="M8 2v3.5M8 10.5V14M2 8h3.5M10.5 8H14M3.6 3.6l2.5 2.5M9.9 9.9l2.5 2.5M3.6 12.4l2.5-2.5M9.9 6.1l2.5-2.5" />
  </>,
);
export const IconHome = svg(<path d="M2.5 7.5 8 2l5.5 5.5V13a1 1 0 0 1-1 1h-3v-4h-3v4h-3a1 1 0 0 1-1-1V7.5Z" />);
export const IconInbox = svg(
  <>
    <path d="M2.5 9.5h3l.75 1.5h3.5l.75-1.5h3" />
    <path d="M3 9.5V4a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 13 4v5.5" />
    <rect x="2" y="9.5" width="12" height="4" rx="1" />
  </>,
);
export const IconChecklist = svg(
  <>
    <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
    <path d="m5.5 5.5 1 1 2-2.5M5.5 9.5l1 1 2-2.5" />
    <path d="M10.5 6h1.5M10.5 10h1.5" />
  </>,
);
export const IconBolt = svg(<path d="M9.5 1.5 3.5 9h4l-1 5.5L13 7h-4l.5-5.5Z" />);
export const IconGlobe = svg(
  <>
    <circle cx="8" cy="8" r="6" />
    <path d="M2 8h12M8 2c1.8 2 2.5 4 2.5 6S9.8 14 8 14c-1.8 0-2.5-2-2.5-6S6.2 2 8 2Z" />
  </>,
);
export const IconUsers = svg(
  <>
    <circle cx="6" cy="6" r="2.5" />
    <path d="M2 13.5c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5" />
    <circle cx="11" cy="6.5" r="2" />
    <path d="M14 12c0-1.5-1-2.5-3-2.5" />
  </>,
);
export const IconMonitor = svg(
  <>
    <rect x="2" y="3" width="12" height="8" rx="1" />
    <path d="M6 13.5h4M8 11v2.5" />
  </>,
);
export const IconCard = svg(
  <>
    <rect x="2" y="4" width="12" height="9" rx="1.5" />
    <path d="M2 7h12" />
  </>,
);
export const IconPhone = svg(
  <path d="M3.5 3.5c0-.6.4-1 1-1h2l1 3-1.5 1c.8 1.6 2.1 2.9 3.7 3.7l1-1.5 3 1v2c0 .6-.4 1-1 1C7.6 13.5 2.5 8.4 2.5 3.5Z" />,
);
export const IconGear = svg(
  <>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.5 3.5l1 1M11.5 11.5l1 1M3.5 12.5l1-1M11.5 4.5l1-1" />
  </>,
);
export const IconActivity = svg(<path d="M2 8h2.5l2-4 3 8 2-4H14" />);
export const IconBell = svg(
  <>
    <path d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3L4 11Z" />
    <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
  </>,
);
export const IconSearch = svg(
  <>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m13.5 13.5-3-3" />
  </>,
);
export const IconChevronRight = svg(<path d="m6 4 4 4-4 4" />);
export const IconImage = svg(
  <>
    <rect x="2" y="3" width="12" height="10" rx="1.5" />
    <circle cx="5.5" cy="6.5" r="1" />
    <path d="m3 12 3.5-3.5 2 2L11 8l2 2" />
  </>,
);
export const IconCommand = svg(
  <path d="M5.5 2.5a1.5 1.5 0 0 0-1.5 1.5v1.5h7V4a1.5 1.5 0 0 0-1.5-1.5h-4Zm-1.5 5.5v3a1.5 1.5 0 0 0 1.5 1.5h1.5V8H4Zm5.5 0v4.5h1.5a1.5 1.5 0 0 0 1.5-1.5V8h-3Zm-3-2.5v3h3v-3h-3Z" />,
);
export const IconSun = svg(
  <>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" />
  </>,
);
export const IconMoon = svg(<path d="M13.5 9.5A5.5 5.5 0 1 1 6.5 2.5a4.5 4.5 0 0 0 7 7Z" />);
export const IconSidebar = svg(
  <>
    <rect x="2" y="3" width="12" height="10" rx="1" />
    <path d="M6 3v10" />
  </>,
);
export const IconX = svg(<path d="m4 4 8 8M12 4l-8 8" />);
// Status icons — used on dashboards (SEO health, etc.)
export const IconTrendingDown = svg(
  <>
    <path d="M2 4.5 6.5 9l2.5-2.5L14 12" />
    <path d="M10.5 12H14V8.5" />
  </>,
);
export const IconTrendingUp = svg(
  <>
    <path d="M2 11.5 6.5 7l2.5 2.5L14 4" />
    <path d="M10.5 4H14v3.5" />
  </>,
);
export const IconCheckCircle = svg(
  <>
    <circle cx="8" cy="8" r="6" />
    <path d="m5.5 8 1.75 1.75L10.75 6" />
  </>,
);
export const IconAlertTriangle = svg(
  <>
    <path d="M8 2.5 14 13H2L8 2.5Z" />
    <path d="M8 6.5v3" />
    <path d="M8 11.25h.01" />
  </>,
);
export const IconChartBar = svg(
  <>
    <path d="M2 13.5h12" />
    <rect x="3" y="8" width="2.5" height="4" rx="0.5" />
    <rect x="6.75" y="5" width="2.5" height="7" rx="0.5" />
    <rect x="10.5" y="2.5" width="2.5" height="9.5" rx="0.5" />
  </>,
);
export const IconMail = svg(
  <>
    <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
    <path d="m2.5 4.5 5.5 4 5.5-4" />
  </>,
);
export const IconLink = svg(
  <>
    <path d="M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-1 1" />
    <path d="M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l1-1" />
  </>,
);
export const IconUser = svg(
  <>
    <circle cx="8" cy="5.5" r="2.5" />
    <path d="M3.5 13.5a4.5 4.5 0 0 1 9 0" />
  </>,
);
export const IconExternalLink = svg(
  <>
    <path d="M9 3h4v4" />
    <path d="m13 3-6 6" />
    <path d="M11 9v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3" />
  </>,
);
export const IconSettings = svg(
  <>
    <circle cx="8" cy="8" r="2.5" />
    <path d="M8 1.5v1.5M8 13v1.5M14.5 8H13M3 8H1.5M12.6 3.4l-1.06 1.06M4.46 11.54 3.4 12.6M12.6 12.6l-1.06-1.06M4.46 4.46 3.4 3.4" />
  </>,
);
// Side-profile car silhouette — used for the Drivers / fleet section
export const IconCar = svg(
  <>
    <path d="M2 10v3a1 1 0 0 0 1 1h1.5M2 10h12M2 10l1.5-4a2 2 0 0 1 1.9-1.4h5.2a2 2 0 0 1 1.9 1.4L14 10M14 10v3a1 1 0 0 1-1 1h-1.5" />
    <circle cx="5.25" cy="13.25" r="1.25" />
    <circle cx="10.75" cy="13.25" r="1.25" />
  </>,
);
