const LABELS = {
  Present: "Present",
  Late: "Late",
  Absent: "Absent",
};

export default function AttendanceStatusBadge({ status = "Present" }) {
  const normalized = LABELS[status] ? status : "Present";
  return (
    <span className={`attendance-status-badge status-${normalized.toLowerCase()}`}>
      {normalized}
    </span>
  );
}
