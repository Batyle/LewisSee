const normalize = (value) => String(value || "").trim().toLocaleLowerCase();

export function matchesRosterSelection(student, selection = {}) {
  return (
    (!selection.course || normalize(student.course) === normalize(selection.course)) &&
    (!selection.yearLevel || String(student.yearLevel) === String(selection.yearLevel)) &&
    (!selection.block || normalize(student.block) === normalize(selection.block)) &&
    (!selection.studentId || normalize(student.studentId) === normalize(selection.studentId))
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
