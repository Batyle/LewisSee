const normalize = (value) => String(value || "").trim().toLocaleLowerCase();
const normalizeStudentId = (value) => {
  const id = String(value || "").trim();
  const match = /^C-(\d{4})-(\d{1,4})$/i.exec(id);
  return match ? `C-${match[1]}-${match[2].padStart(4, "0")}`.toLocaleLowerCase() : normalize(id);
};

export function matchesRosterSelection(student, selection = {}) {
  return (
    (!selection.course || normalize(student.course) === normalize(selection.course)) &&
    (!selection.yearLevel || String(student.yearLevel) === String(selection.yearLevel)) &&
    (!selection.block || normalize(student.block) === normalize(selection.block)) &&
    (!selection.studentId || normalizeStudentId(student.studentId) === normalizeStudentId(selection.studentId))
  );
}

export function matchesSessionRoster(student, session, activeClass) {
  if (session?.rosterScope === "all") return true;
  if (session?.rosterScope === "selection") {
    return matchesRosterSelection(student, session.rosterSelection);
  }
  return (
    normalize(student.course) === normalize(activeClass?.course) &&
    String(student.yearLevel) === String(activeClass?.yearLevel) &&
    normalize(student.block) === normalize(activeClass?.block)
  );
}

export function sessionTargetsRecord(session, record) {
  if (session.date !== record.date) return false;
  if (session.rosterScope === "all") return true;
  if (session.rosterScope !== "selection") {
    return normalize(session.section) === normalize(record.section);
  }

  const sectionMatch = /^(.+?)\s+(\d+)([A-Za-z0-9-]+)$/.exec(String(record.section || "").trim());
  if (!sectionMatch) return false;
  return matchesRosterSelection(
    {
      studentId: record.studentId,
      course: sectionMatch[1],
      yearLevel: sectionMatch[2],
      block: sectionMatch[3],
    },
    session.rosterSelection,
  );
}
