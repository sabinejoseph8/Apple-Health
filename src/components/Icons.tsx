// Small line icons drawn in the app, in the style of SF Symbols. They take the
// current text colour and are hidden from screen readers; the control they
// sit in carries the label.

import type { ReactNode } from 'react'

type IconProps = { size?: number; className?: string }

function Svg({ size = 22, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export function GearIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="6.6" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M17.91 14.45L20.59 15.56M14.45 17.91L15.56 20.59M9.55 17.91L8.44 20.59M6.09 14.45L3.41 15.56M6.09 9.55L3.41 8.44M9.55 6.09L8.44 3.41M14.45 6.09L15.56 3.41M17.91 9.55L20.59 8.44" strokeWidth={3.2} strokeLinecap="butt" />
    </Svg>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg size={16} {...props}>
      <path d="M9 5l7 7-7 7" />
    </Svg>
  )
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Svg size={22} {...props}>
      <path d="M15 4l-8 8 8 8" />
    </Svg>
  )
}

// A face for each check-in answer: a wide smile, a small smile, a flat mouth.
export function FaceIcon({ answer, ...props }: IconProps & { answer: 'good' | 'okay' | 'off' | null }) {
  const mouth =
    answer === 'good' ? 'M7.6 13.6c1.1 2 2.6 3 4.4 3s3.3-1 4.4-3' : answer === 'off' ? 'M8.4 15.4h7.2' : 'M8.4 14.4c1 1.2 2.2 1.8 3.6 1.8s2.6-.6 3.6-1.8'
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M9 9.6v.6M15 9.6v.6" strokeWidth={2.2} />
      <path d={mouth} />
    </Svg>
  )
}

export function WarningIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.6l9 15.6H3z" />
      <path d="M12 9.6v4.4M12 16.8v.2" strokeWidth={2.2} />
    </Svg>
  )
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Svg size={16} {...props}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </Svg>
  )
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <Svg size={16} {...props}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Svg>
  )
}

export function TickCircleIcon(props: IconProps) {
  return (
    <Svg size={16} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.4l2.7 2.6L16 9.4" />
    </Svg>
  )
}

// The three readings' icons, shown in each reading's colour.
export function PulseIcon(props: IconProps) {
  return (
    <Svg size={16} {...props}>
      <path d="M2.5 12.5h4l2.2-5.5 4 11 2.6-7 1.4 1.5h4.8" />
    </Svg>
  )
}

export function MoonIcon(props: IconProps) {
  return (
    <Svg size={16} {...props}>
      <path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z" />
    </Svg>
  )
}

export function HeartIcon(props: IconProps) {
  return (
    <Svg size={16} {...props}>
      <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z" />
    </Svg>
  )
}

export function BellIcon(props: IconProps) {
  return (
    <Svg size={16} {...props}>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </Svg>
  )
}

export function DashCircleIcon(props: IconProps) {
  return (
    <Svg size={16} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </Svg>
  )
}

// A clock with an arrow turning back, for the previous days row.
export function HistoryIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.6 13.5a7.5 7.5 0 1 0 1.9-6.9" />
      <path d="M4.5 3.8v4h4" />
      <path d="M12 8.2v4.3l3 1.8" />
    </Svg>
  )
}

// A small line chart, for the trends row.
export function ChartIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4v16h16" />
      <path d="M7.5 15l3.5-4 3 2.5 4.5-6" />
    </Svg>
  )
}

export function CalendarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </Svg>
  )
}
