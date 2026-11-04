import { useEffect, useMemo, useState } from "react";

const valueFor = (record, ...keys) => {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return "";
};

const formatDate = (value) => {
  if (!value) return "—";
  if (typeof value === "string") return value;
  if (value?.toDate) return value.toDate().toLocaleDateString();
  return new Date(value).toLocaleDateString();
};

/**
 * @param {{
 *   subscribeToAttendance: (onRecords: (records: object[]) => void, onError?: (error: Error) => void) => (() => void) | void,
 *   exportToCSV: (records: object[]) => void
 * }} props
 */
export default function Dashboard({ subscribeToAttendance, exportToCSV }) {
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let mounted = true;
    setError("");

    const unsubscribe = subscribeToAttendance(
      (nextRecords) => {
        if (!mounted) return;
        setRecords(Array.isArray(nextRecords) ? nextRecords : []);
        setIsLoading(false);
      },
      (subscriptionError) => {
        if (!mounted) return;
        setError(subscriptionError?.message || "Could not load attendance records.");
        setIsLoading(false);
      },
    );

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [subscribeToAttendance]);

  const dates = useMemo(
    () => [...new Set(records.map((record) => String(valueFor(record, "date", "attendanceDate"))).filter(Boolean))].sort().reverse(),
    [records],
  );
  const sections = useMemo(
    () => [...new Set(records.map((record) => String(valueFor(record, "section", "className", "class"))).filter(Boolean))].sort(),
    [records],
  );
  const filteredRecords = useMemo(() => {
    const nameQuery = search.trim().toLowerCase();
    return records.filter((record) => {
      const name = String(valueFor(record, "studentName", "name", "student")).toLowerCase();
      const date = String(valueFor(record, "date", "attendanceDate"));
      const section = String(valueFor(record, "section", "className", "class"));
      return (!nameQuery || name.includes(nameQuery)) &&
        (!dateFilter || date === dateFilter) &&
        (!sectionFilter || section === sectionFilter);
    });
  }, [records, search, dateFilter, sectionFilter]);

  const handleTableClick = (event) => {
    // The click bubbles from a cell or its child to this one tbody handler.
    const row = event.target.closest("tr");
    const id = row?.dataset.id;
    if (!id || !event.currentTarget.contains(row)) return;
    setSelectedRecord(filteredRecords.find((record) => String(record.id) === id) || null);
  };

  return (
    <main className="dashboard-page">
      <section className="dashboard-card" aria-labelledby="attendance-heading">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">ATTENDANCE</p>
            <h1 id="attendance-heading">Attendance records</h1>
          </div>
          <button type="button" onClick={() => exportToCSV(filteredRecords)} disabled={!filteredRecords.length}>
            Export CSV
          </button>
        </div>

        <div className="dashboard-filters">
          <label>
            Search students
            <input
              type="search"
              placeholder="Search by student name"
              onInput={(event) => setSearchInput(event.currentTarget.value)}
            />
          </label>
          <label>
            Date
            <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
              <option value="">All dates</option>
              {dates.map((date) => <option key={date} value={date}>{formatDate(date)}</option>)}
            </select>
          </label>
          <label>
            Section
            <select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)}>
              <option value="">All sections</option>
              {sections.map((section) => <option key={section} value={section}>{section}</option>)}
            </select>
          </label>
        </div>

        {error && <p role="alert">{error}</p>}
        <div className="attendance-table-wrap">
          <table>
            <thead><tr><th>Student</th><th>Student ID</th><th>Date</th><th>Section</th><th>Time</th><th>Status</th></tr></thead>
            <tbody onClick={handleTableClick}>
              {isLoading && Array.from({ length: 5 }, (_, index) => (
                <tr className="attendance-skeleton" key={index} aria-busy="true">
                  {Array.from({ length: 6 }, (_, cell) => (
                    <td key={cell}>
                      <span aria-hidden="true" style={{ display: "block", minHeight: "1rem", borderRadius: "0.25rem", background: "var(--light-gray)" }} />
                    </td>
                  ))}
                </tr>
              ))}
              {!isLoading && filteredRecords.map((record) => (
                <tr key={record.id} data-id={record.id} tabIndex="0">
                  <td>{valueFor(record, "studentName", "name", "student")}</td>
                  <td>{valueFor(record, "studentId", "idNumber")}</td>
                  <td>{formatDate(valueFor(record, "date", "attendanceDate"))}</td>
                  <td>{valueFor(record, "section", "className", "class")}</td>
                  <td>{valueFor(record, "time", "checkInTime")}</td>
                  <td>{valueFor(record, "status") || "Present"}</td>
                </tr>
              ))}
              {!isLoading && !filteredRecords.length && <tr><td colSpan="6">No matching attendance records.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {selectedRecord && (
        <div className="attendance-modal-backdrop" role="presentation" onClick={() => setSelectedRecord(null)}>
          <section
            className="attendance-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-detail-heading"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" aria-label="Close details" onClick={() => setSelectedRecord(null)}>×</button>
            <h2 id="attendance-detail-heading">Attendance details</h2>
            <dl>
              {Object.entries(selectedRecord).map(([key, value]) => (
                <div key={key}><dt>{key}</dt><dd>{typeof value === "object" ? JSON.stringify(value) : String(value ?? "—")}</dd></div>
              ))}
            </dl>
          </section>
        </div>
      )}
    </main>
  );
}
