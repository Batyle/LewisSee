import { useId } from "react";

export default function LewisSeeLogo({ animated = false, className = "" }) {
  const gradientId = `lewissee-logo-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <svg
      className={`lewissee-logo${animated ? " lewissee-logo-animated" : ""}${className ? ` ${className}` : ""}`}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#39dcff" />
          <stop offset="100%" stopColor="#0750df" />
        </linearGradient>
        <filter id={`${gradientId}-glow`}>
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <path className="lewissee-logo-corner top-left" d="M35 65 V40 Q35 30 45 30 H65" />
      <path className="lewissee-logo-corner top-right" d="M135 30 H155 Q165 30 165 40 V65" />
      <path className="lewissee-logo-corner bottom-left" d="M35 135 V160 Q35 170 45 170 H65" />
      <path className="lewissee-logo-corner bottom-right" d="M135 170 H155 Q165 170 165 160 V135" />
      <g className="lewissee-logo-person">
        <circle cx="100" cy="75" r="24" fill={`url(#${gradientId})`} />
        <path
          d="M52 145 C55 113 75 100 100 100 C125 100 145 113 148 145 Z"
          fill={`url(#${gradientId})`}
        />
      </g>
      <line
        className="lewissee-logo-scan"
        x1="45"
        y1="100"
        x2="155"
        y2="100"
        filter={`url(#${gradientId}-glow)`}
      />
      <path className="lewissee-logo-check" d="M145 145 L158 158 L180 132" />
    </svg>
  );
}
