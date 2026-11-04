"""SQLite attendance storage with a per-student cooldown."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path


class AttendanceStore:
    def __init__(self, database_path: Path, cooldown_seconds: int = 300) -> None:
        self.database_path = database_path
        self.cooldown_seconds = cooldown_seconds
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as connection:
            connection.execute(
                """CREATE TABLE IF NOT EXISTS attendance (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    timestamp_utc TEXT NOT NULL,
                    status TEXT NOT NULL,
                    UNIQUE(student_id, timestamp_utc)
                )"""
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_attendance_student_time ON attendance(student_id, timestamp_utc)"
            )

    def _connection(self) -> sqlite3.Connection:
        return sqlite3.connect(self.database_path)

    def record_if_due(self, student_id: str, name: str, status: str = "Present") -> bool:
        """Store attendance only if no record exists within the cooldown window."""
        now = datetime.now(timezone.utc)
        cutoff = (now - timedelta(seconds=self.cooldown_seconds)).isoformat()
        with self._connection() as connection:
            recent = connection.execute(
                "SELECT 1 FROM attendance WHERE student_id = ? AND timestamp_utc >= ? LIMIT 1",
                (student_id, cutoff),
            ).fetchone()
            if recent:
                return False
            connection.execute(
                "INSERT INTO attendance(student_id, name, timestamp_utc, status) VALUES (?, ?, ?, ?)",
                (student_id, name, now.isoformat(), status),
            )
        return True
