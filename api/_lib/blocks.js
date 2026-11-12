export async function listBlocks(pool) {
  const [rows] = await pool.execute(
    "SELECT course, year_level, block FROM class_groups ORDER BY course, year_level, block",
  );
  return rows.map((row, index) => ({
    id: index + 1,
    name: `${row.course} ${row.year_level}-${row.block}`,
    schedule: `${row.course} Year ${row.year_level} Block ${row.block}`,
    course: row.course,
    yearLevel: Number(row.year_level),
    block: row.block,
  }));
}
