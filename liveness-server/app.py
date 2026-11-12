"""Local anti-spoofing API for FaceAttend.

Uses the Silent-Face-Anti-Spoofing model referenced by
computervisioneng/face-attendance-system.  The model files are downloaded by
setup.ps1 and are deliberately kept out of the browser bundle.
"""

from __future__ import annotations

import os
import sys
import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import bcrypt
import cv2
import jwt
import numpy as np
import pymysql
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parent
MODEL_ROOT = ROOT / "Silent-Face-Anti-Spoofing"
models = MODEL_ROOT / "resources" / "anti_spoof_models"
_predictor = None
_cropper = None
_parse_model_name = None


def load_liveness_runtime():
    """Lazy-load Torch anti-spoof so MySQL admin/attendance APIs still start if Torch is broken."""
    global _predictor, _cropper, _parse_model_name
    if _predictor is not None and _cropper is not None and _parse_model_name is not None:
        return _predictor, _cropper, _parse_model_name
    if not MODEL_ROOT.exists():
        raise HTTPException(status_code=503, detail="Run liveness-server/setup.ps1 before starting this service.")
    try:
        if str(MODEL_ROOT) not in sys.path:
            sys.path.insert(0, str(MODEL_ROOT))
        from src.anti_spoof_predict import AntiSpoofPredict  # noqa: E402
        from src.generate_patches import CropImage  # noqa: E402
        from src.utility import parse_model_name  # noqa: E402
        _predictor = AntiSpoofPredict(0)
        _cropper = CropImage()
        _parse_model_name = parse_model_name
    except Exception as error:
        raise HTTPException(status_code=503, detail="Anti-spoof runtime failed to load.") from error
    return _predictor, _cropper, _parse_model_name


app = FastAPI(title="FaceAttend liveness service")
bearer_scheme = HTTPBearer(auto_error=False)
cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "LIVENESS_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
    ).split(",")
    if origin.strip()
]
cors_origin_regex = os.getenv("LIVENESS_CORS_ORIGIN_REGEX", "").strip() or None
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=cors_origin_regex,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["*"],
)


class Student(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    studentId: str = Field(min_length=1, max_length=191)
    email: str = Field(default="", max_length=255)
    course: str = Field(min_length=2, max_length=64)
    yearLevel: int = Field(ge=1, le=8)
    block: str = Field(min_length=1, max_length=12)
    descriptor: list[float] = Field(default_factory=list)
    photo: str = Field(default="")


class AttendanceRecord(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    studentId: str = Field(min_length=1, max_length=191)
    name: str = Field(min_length=1, max_length=255)
    date: str = Field(min_length=10, max_length=10)
    section: str = Field(min_length=1, max_length=191)
    time: str = Field(min_length=1, max_length=32)


class ClassGroup(BaseModel):
    course: str = Field(min_length=2, max_length=64)
    yearLevel: int = Field(ge=1, le=8)
    block: str = Field(min_length=1, max_length=12)


class AttendanceStore(BaseModel):
    students: list[Student]
    records: list[AttendanceRecord]
    classes: list[ClassGroup] = Field(default_factory=list)


class AdminLogin(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class InstructorRegister(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    requestedBlockIds: list[int] = Field(default_factory=list)


class InstructorLogin(BaseModel):
    email: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class InstructorDecision(BaseModel):
    reason: str = Field(default="", max_length=500)


EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def database_settings() -> dict[str, Any]:
    """Read credentials only from service environment variables, never Vite."""
    required = ("DB_HOST", "DB_DATABASE", "DB_USERNAME", "DB_PASSWORD")
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise HTTPException(
            status_code=503,
            detail="Database is not configured. Set " + ", ".join(missing) + " on the API service.",
        )
    settings = {
        "host": os.environ["DB_HOST"],
        "port": int(os.getenv("DB_PORT", "3306")),
        "user": os.environ["DB_USERNAME"],
        "password": os.environ["DB_PASSWORD"],
        "database": os.environ["DB_DATABASE"],
        "charset": "utf8mb4",
        "cursorclass": pymysql.cursors.DictCursor,
        "connect_timeout": 10,
        "autocommit": False,
    }
    ssl_mode = os.getenv("DB_SSL_MODE", "").upper()
    if ssl_mode in {"REQUIRED", "VERIFY_CA", "VERIFY_IDENTITY"}:
        # Aiven accepts TLS with REQUIRED.  A CA file is only mandatory when
        # certificate verification is explicitly requested.  This is useful on
        # container hosts where a certificate file is not mounted as a secret.
        ssl_settings: dict[str, Any] = {}
        ca_file = os.getenv("DB_SSL_CA", "").strip()
        if ssl_mode in {"VERIFY_CA", "VERIFY_IDENTITY"} and not ca_file:
            raise HTTPException(
                status_code=503,
                detail="DB_SSL_CA is required for DB_SSL_MODE=VERIFY_CA or VERIFY_IDENTITY.",
            )
        if ca_file:
            ca_path = Path(ca_file)
            if not ca_path.is_absolute():
                ca_path = ROOT / ca_path
            if not ca_path.is_file():
                raise HTTPException(status_code=503, detail="The configured DB_SSL_CA certificate file was not found.")
            ssl_settings["ca"] = str(ca_path)
            ssl_settings["check_hostname"] = ssl_mode == "VERIFY_IDENTITY"
        settings["ssl"] = ssl_settings
    return settings


@contextmanager
def db_connection():
    try:
        connection = pymysql.connect(**database_settings())
    except HTTPException:
        raise
    except pymysql.MySQLError as error:
        raise HTTPException(status_code=503, detail="Could not connect to MySQL.") from error
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def ensure_schema(connection: Any) -> None:
    with connection.cursor() as cursor:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS admins (
              uid VARCHAR(64) PRIMARY KEY,
              email VARCHAR(255) NOT NULL UNIQUE,
              password_hash VARCHAR(255) NOT NULL,
              role VARCHAR(16) NOT NULL,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT admins_role_check CHECK (role = 'admin')
            ) CHARACTER SET utf8mb4
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS instructors (
              uid VARCHAR(64) PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              email VARCHAR(255) NOT NULL UNIQUE,
              password_hash VARCHAR(255) NULL,
              role VARCHAR(16) NOT NULL,
              status VARCHAR(16) NOT NULL,
              email_verified BOOLEAN NOT NULL DEFAULT FALSE,
              assigned_blocks JSON NOT NULL,
              rejection_reason VARCHAR(500) NULL,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT instructors_role_check CHECK (role = 'instructor'),
              CONSTRAINT instructors_status_check CHECK (status IN ('pending', 'active', 'suspended', 'terminated', 'rejected'))
            ) CHARACTER SET utf8mb4
        """)
        cursor.execute("SHOW COLUMNS FROM instructors")
        instructor_columns = {row["Field"] for row in cursor.fetchall()}
        if "password_hash" not in instructor_columns:
            cursor.execute("ALTER TABLE instructors ADD COLUMN password_hash VARCHAR(255) NULL AFTER email")
        if "rejection_reason" not in instructor_columns:
            cursor.execute("ALTER TABLE instructors ADD COLUMN rejection_reason VARCHAR(500) NULL")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS class_groups (
              course VARCHAR(64) NOT NULL,
              year_level TINYINT UNSIGNED NOT NULL,
              block VARCHAR(12) NOT NULL,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (course, year_level, block)
            ) CHARACTER SET utf8mb4
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS students (
              student_id VARCHAR(191) PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              email VARCHAR(255) NOT NULL DEFAULT '',
              course VARCHAR(64) NOT NULL,
              year_level TINYINT UNSIGNED NOT NULL,
              block VARCHAR(12) NOT NULL,
              descriptor_json LONGTEXT NOT NULL,
              photo MEDIUMTEXT NOT NULL,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) CHARACTER SET utf8mb4
        """)
        # Existing deployments created the first version without class fields.
        # Upgrade them in place so staff do not have to recreate the database.
        cursor.execute("SHOW COLUMNS FROM students")
        student_columns = {row["Field"] for row in cursor.fetchall()}
        if "course" not in student_columns:
            cursor.execute("ALTER TABLE students ADD COLUMN course VARCHAR(64) NOT NULL DEFAULT 'BSIT' AFTER email")
        if "year_level" not in student_columns:
            cursor.execute("ALTER TABLE students ADD COLUMN year_level TINYINT UNSIGNED NOT NULL DEFAULT 3 AFTER course")
        if "block" not in student_columns:
            cursor.execute("ALTER TABLE students ADD COLUMN block VARCHAR(12) NOT NULL DEFAULT 'A' AFTER year_level")
        cursor.execute("SHOW INDEX FROM students WHERE Key_name = 'unique_student_name'")
        if not cursor.fetchone():
            cursor.execute("CREATE UNIQUE INDEX unique_student_name ON students (name)")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attendance_records (
              id VARCHAR(64) PRIMARY KEY,
              student_id VARCHAR(191) NOT NULL,
              student_name VARCHAR(255) NOT NULL,
              attendance_date DATE NOT NULL,
              section VARCHAR(191) NOT NULL,
              attendance_time VARCHAR(32) NOT NULL,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              UNIQUE KEY one_checkin_per_class_day (student_id, attendance_date, section),
              KEY attendance_by_date (attendance_date, section)
            ) CHARACTER SET utf8mb4
        """)


def jwt_secret() -> str:
    secret = os.getenv("ADMIN_JWT_SECRET", "")
    if len(secret) < 32:
        raise HTTPException(status_code=503, detail="Admin authentication is not configured.")
    return secret


def current_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, str]:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    try:
        claims = jwt.decode(credentials.credentials, jwt_secret(), algorithms=["HS256"])
        uid = claims.get("sub")
        if not uid:
            raise jwt.InvalidTokenError("Missing subject")
    except jwt.PyJWTError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session.") from error

    # Read the role from MySQL on every protected request so revoked accounts
    # lose access immediately, rather than waiting for token expiration.
    with db_connection() as connection:
        ensure_schema(connection)
        with connection.cursor() as cursor:
            cursor.execute("SELECT uid, email, role FROM admins WHERE uid = %s", (uid,))
            admin = cursor.fetchone()
    if not admin or admin["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return admin


@app.post("/admin/login")
def admin_login(credentials: AdminLogin) -> dict[str, Any]:
    """Verify a MySQL admin password and issue a short-lived signed token."""
    with db_connection() as connection:
        ensure_schema(connection)
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT uid, email, password_hash, role FROM admins WHERE LOWER(email) = LOWER(%s)",
                (credentials.email.strip(),),
            )
            admin = cursor.fetchone()

    password_matches = False
    if admin:
        try:
            password_matches = bcrypt.checkpw(credentials.password.encode("utf-8"), admin["password_hash"].encode("utf-8"))
        except (ValueError, TypeError):
            password_matches = False
    if not admin or not password_matches or admin["role"] != "admin":
        # Keep this deliberately generic so emails and roles cannot be enumerated.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    expires_at = datetime.now(timezone.utc) + timedelta(hours=8)
    token = jwt.encode({"sub": admin["uid"], "exp": expires_at}, jwt_secret(), algorithm="HS256")
    return {"token": token, "admin": {"uid": admin["uid"], "email": admin["email"], "role": admin["role"]}}


@app.get("/admin/me")
def get_current_admin(admin: dict[str, str] = Depends(current_admin)) -> dict[str, str]:
    return {"uid": admin["uid"], "email": admin["email"], "role": admin["role"]}


def serialize_instructor(row: dict[str, Any]) -> dict[str, Any]:
    blocks = row.get("assigned_blocks") or []
    if isinstance(blocks, str):
        try:
            blocks = json.loads(blocks)
        except json.JSONDecodeError:
            blocks = []
    created = row.get("created_at")
    return {
        "uid": row["uid"],
        "name": row["name"],
        "email": row["email"],
        "status": row["status"],
        "assignedBlocks": blocks if isinstance(blocks, list) else [],
        "rejectionReason": row.get("rejection_reason") or "",
        "createdAt": created.isoformat() if hasattr(created, "isoformat") else created,
    }


def fetch_instructor(connection: Any, uid: str) -> dict[str, Any] | None:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT uid, name, email, status, assigned_blocks, rejection_reason, created_at
            FROM instructors
            WHERE uid = %s
            """,
            (uid,),
        )
        return cursor.fetchone()


@app.get("/admin/instructors")
def list_instructors(_admin: dict[str, str] = Depends(current_admin)) -> dict[str, Any]:
    with db_connection() as connection:
        ensure_schema(connection)
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT uid, name, email, status, assigned_blocks, rejection_reason, created_at
                FROM instructors
                ORDER BY
                  CASE status
                    WHEN 'pending' THEN 0
                    WHEN 'active' THEN 1
                    WHEN 'suspended' THEN 2
                    WHEN 'rejected' THEN 3
                    ELSE 4
                  END,
                  created_at DESC
                """
            )
            rows = cursor.fetchall()
    instructors = [serialize_instructor(row) for row in rows]
    return {
        "instructors": instructors,
        "counts": {
            "pending": sum(item["status"] == "pending" for item in instructors),
            "active": sum(item["status"] == "active" for item in instructors),
            "blocked": sum(item["status"] in {"suspended", "terminated", "rejected"} for item in instructors),
        },
    }


@app.post("/admin/instructors/{uid}/approve")
def approve_instructor(uid: str, _admin: dict[str, str] = Depends(current_admin)) -> dict[str, Any]:
    with db_connection() as connection:
        ensure_schema(connection)
        instructor = fetch_instructor(connection, uid)
        if not instructor:
            raise HTTPException(status_code=404, detail="Instructor request was not found.")
        if instructor["status"] not in {"pending", "rejected", "suspended"}:
            raise HTTPException(status_code=400, detail="Only pending, rejected, or suspended accounts can be approved.")
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE instructors SET status = 'active', rejection_reason = NULL WHERE uid = %s",
                (uid,),
            )
        updated = fetch_instructor(connection, uid)
    return {"instructor": serialize_instructor(updated), "message": "Instructor approved."}


@app.post("/admin/instructors/{uid}/reject")
def reject_instructor(
    uid: str,
    payload: InstructorDecision,
    _admin: dict[str, str] = Depends(current_admin),
) -> dict[str, Any]:
    reason = " ".join(payload.reason.split())
    with db_connection() as connection:
        ensure_schema(connection)
        instructor = fetch_instructor(connection, uid)
        if not instructor:
            raise HTTPException(status_code=404, detail="Instructor request was not found.")
        if instructor["status"] not in {"pending", "active", "suspended"}:
            raise HTTPException(status_code=400, detail="This account cannot be rejected.")
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE instructors SET status = 'rejected', rejection_reason = %s WHERE uid = %s",
                (reason or None, uid),
            )
        updated = fetch_instructor(connection, uid)
    return {"instructor": serialize_instructor(updated), "message": "Instructor request rejected."}


@app.post("/admin/instructors/{uid}/suspend")
def suspend_instructor(uid: str, _admin: dict[str, str] = Depends(current_admin)) -> dict[str, Any]:
    with db_connection() as connection:
        ensure_schema(connection)
        instructor = fetch_instructor(connection, uid)
        if not instructor:
            raise HTTPException(status_code=404, detail="Instructor was not found.")
        if instructor["status"] != "active":
            raise HTTPException(status_code=400, detail="Only active instructors can be suspended.")
        with connection.cursor() as cursor:
            cursor.execute("UPDATE instructors SET status = 'suspended' WHERE uid = %s", (uid,))
        updated = fetch_instructor(connection, uid)
    return {"instructor": serialize_instructor(updated), "message": "Instructor suspended."}


def list_class_blocks(connection: Any) -> list[dict[str, Any]]:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT course, year_level, block FROM class_groups ORDER BY course, year_level, block"
        )
        rows = cursor.fetchall()
    if not rows:
        # Sensible starter options so new deployments can still submit a request.
        rows = [
            {"course": "BSIT", "year_level": 1, "block": "A"},
            {"course": "BSIT", "year_level": 2, "block": "A"},
            {"course": "BSIT", "year_level": 3, "block": "A"},
            {"course": "BSIT", "year_level": 4, "block": "A"},
        ]
    return [
        {
            "id": index + 1,
            "name": f"{row['course']} {row['year_level']}-{row['block']}",
            "schedule": f"{row['course']} Year {row['year_level']} Block {row['block']}",
            "course": row["course"],
            "yearLevel": int(row["year_level"]),
            "block": row["block"],
        }
        for index, row in enumerate(rows)
    ]


@app.get("/blocks")
def get_blocks() -> dict[str, list[dict[str, Any]]]:
    with db_connection() as connection:
        ensure_schema(connection)
        return {"blocks": list_class_blocks(connection)}


@app.post("/instructor-auth/register")
def instructor_register(payload: InstructorRegister) -> dict[str, Any]:
    """Create a pending instructor account in the live MySQL database."""
    normalized_email = payload.email.strip().lower()
    name = " ".join(payload.name.split())
    if not name or not EMAIL_PATTERN.match(normalized_email):
        raise HTTPException(
            status_code=400,
            detail="Please provide a name, valid email, password of at least 8 characters, and valid requested block IDs.",
        )
    if any(block_id < 1 for block_id in payload.requestedBlockIds):
        raise HTTPException(status_code=400, detail="Requested block IDs are invalid.")

    password_hash = bcrypt.hashpw(payload.password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")
    with db_connection() as connection:
        ensure_schema(connection)
        blocks = list_class_blocks(connection)
        by_id = {block["id"]: block for block in blocks}
        selected = []
        for block_id in payload.requestedBlockIds:
            block = by_id.get(block_id)
            if not block:
                raise HTTPException(status_code=400, detail="Requested block IDs are invalid.")
            selected.append(
                {"course": block["course"], "yearLevel": block["yearLevel"], "block": block["block"]}
            )
        instructor_uid = str(uuid.uuid4())
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO instructors
                      (uid, name, email, password_hash, role, status, email_verified, assigned_blocks)
                    VALUES (%s, %s, %s, %s, 'instructor', 'pending', 0, %s)
                    """,
                    (instructor_uid, name, normalized_email, password_hash, json.dumps(selected)),
                )
        except pymysql.err.IntegrityError as error:
            if getattr(error, "args", [None])[0] == 1062:
                raise HTTPException(status_code=409, detail="An account with this email already exists.") from error
            raise HTTPException(status_code=400, detail="Unable to submit your request.") from error

    return {
        "instructor": {
            "id": instructor_uid,
            "uid": instructor_uid,
            "name": name,
            "email": normalized_email,
            "status": "pending",
        },
        "message": "Request submitted — you'll be notified once an admin reviews it.",
    }


@app.post("/instructor-auth/login")
def instructor_login(payload: InstructorLogin) -> dict[str, Any]:
    normalized_email = payload.email.strip().lower()
    with db_connection() as connection:
        ensure_schema(connection)
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT uid, name, email, password_hash, status, rejection_reason
                FROM instructors
                WHERE LOWER(email) = LOWER(%s)
                """,
                (normalized_email,),
            )
            instructor = cursor.fetchone()

    password_matches = False
    if instructor and instructor.get("password_hash"):
        try:
            password_matches = bcrypt.checkpw(
                payload.password.encode("utf-8"),
                instructor["password_hash"].encode("utf-8"),
            )
        except (ValueError, TypeError):
            password_matches = False
    if not instructor or not password_matches:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if instructor["status"] == "pending":
        raise HTTPException(status_code=403, detail="Your account is awaiting admin approval.")
    if instructor["status"] == "rejected":
        reason = (instructor.get("rejection_reason") or "").strip()
        message = "Your request was denied."
        if reason:
            message = f"{message} {reason}"
        raise HTTPException(status_code=403, detail=message)
    if instructor["status"] == "suspended":
        raise HTTPException(status_code=403, detail="Your account is suspended.")
    if instructor["status"] == "terminated":
        raise HTTPException(status_code=403, detail="Your account has been terminated.")
    if instructor["status"] != "active":
        raise HTTPException(status_code=403, detail="Your account cannot sign in yet.")

    expires_at = datetime.now(timezone.utc) + timedelta(hours=8)
    token = jwt.encode(
        {"sub": instructor["uid"], "role": "instructor", "exp": expires_at},
        jwt_secret(),
        algorithm="HS256",
    )
    return {
        "token": token,
        "instructor": {
            "id": instructor["uid"],
            "uid": instructor["uid"],
            "name": instructor["name"],
            "email": instructor["email"],
            "status": instructor["status"],
        },
    }


@app.get("/attendance")
def get_attendance() -> dict[str, list[dict[str, Any]]]:
    with db_connection() as connection:
        ensure_schema(connection)
        with connection.cursor() as cursor:
            cursor.execute("SELECT student_id, name, email, course, year_level, block, descriptor_json, photo FROM students ORDER BY name")
            students = [
                {"studentId": row["student_id"], "name": row["name"], "email": row["email"],
                 "course": row["course"], "yearLevel": row["year_level"], "block": row["block"],
                 "descriptor": json.loads(row["descriptor_json"]), "photo": row["photo"]}
                for row in cursor.fetchall()
            ]
            cursor.execute("""SELECT id, student_id, student_name, DATE_FORMAT(attendance_date, '%Y-%m-%d') AS date,
                              section, attendance_time FROM attendance_records
                              ORDER BY attendance_date DESC, created_at DESC""")
            records = [
                {"id": row["id"], "studentId": row["student_id"], "name": row["student_name"],
                 "date": row["date"], "section": row["section"], "time": row["attendance_time"]}
                for row in cursor.fetchall()
            ]
            cursor.execute("SELECT course, year_level, block FROM class_groups ORDER BY course, year_level, block")
            classes = [
                {"course": row["course"], "yearLevel": row["year_level"], "block": row["block"]}
                for row in cursor.fetchall()
            ]
    return {"students": students, "records": records, "classes": classes}


@app.put("/attendance")
def replace_attendance(store: AttendanceStore) -> dict[str, int]:
    """Atomically persist the browser store; all SQL values are parameterized."""
    # Older browser builds did not send classes. Derive them during the
    # transition so upgrading the live API does not reject saved rosters.
    if not store.classes:
        seen_classes: set[tuple[str, int, str]] = set()
        store.classes = []
        for student in store.students:
            key = (student.course.strip().casefold(), student.yearLevel, student.block.strip().casefold())
            if key not in seen_classes:
                seen_classes.add(key)
                store.classes.append(ClassGroup(course=student.course, yearLevel=student.yearLevel, block=student.block))
    student_ids: set[str] = set()
    student_names: set[str] = set()
    student_emails: set[str] = set()
    for student in store.students:
        student_id = " ".join(student.studentId.split()).casefold()
        student_name = " ".join(student.name.split()).casefold()
        email = student.email.strip().casefold()
        if not student_id or not student_name:
            raise HTTPException(status_code=422, detail="Every student needs a name and student ID.")
        if student_id in student_ids:
            raise HTTPException(status_code=422, detail="Duplicate student IDs are not allowed.")
        if student_name in student_names:
            raise HTTPException(status_code=422, detail="Duplicate student names are not allowed.")
        if email and email in student_emails:
            raise HTTPException(status_code=422, detail="Duplicate email addresses are not allowed.")
        student_ids.add(student_id)
        student_names.add(student_name)
        if email:
            student_emails.add(email)
    if any(record.studentId.casefold() not in student_ids for record in store.records):
        raise HTTPException(status_code=422, detail="Attendance records must belong to an enrolled student.")
    class_keys = {(item.course.strip().casefold(), item.yearLevel, item.block.strip().casefold()) for item in store.classes}
    if len(class_keys) != len(store.classes):
        raise HTTPException(status_code=422, detail="Duplicate classes are not allowed.")
    student_classes = {(item.course.strip().casefold(), item.yearLevel, item.block.strip().casefold()) for item in store.students}
    if not student_classes.issubset(class_keys):
        raise HTTPException(status_code=422, detail="Every student must be assigned to an existing class.")
    with db_connection() as connection:
        ensure_schema(connection)
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM attendance_records")
            cursor.execute("DELETE FROM students")
            cursor.execute("DELETE FROM class_groups")
            if store.classes:
                cursor.executemany(
                    "INSERT INTO class_groups (course, year_level, block) VALUES (%s, %s, %s)",
                    [(item.course.strip(), item.yearLevel, item.block.strip().upper()) for item in store.classes],
                )
            if store.students:
                cursor.executemany(
                    """INSERT INTO students
                    (student_id, name, email, course, year_level, block, descriptor_json, photo)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                    [(s.studentId, s.name, s.email, s.course, s.yearLevel, s.block,
                      json.dumps(s.descriptor), s.photo) for s in store.students],
                )
            if store.records:
                cursor.executemany(
                    """INSERT INTO attendance_records
                    (id, student_id, student_name, attendance_date, section, attendance_time)
                    VALUES (%s, %s, %s, %s, %s, %s)""",
                    [(r.id, r.studentId, r.name, r.date, r.section, r.time) for r in store.records],
                )
    return {"students": len(store.students), "records": len(store.records)}


@app.get("/health")
def health():
    return {
        "ready": models.is_dir(),
        "databaseConfigured": all(os.getenv(name) for name in ("DB_HOST", "DB_DATABASE", "DB_USERNAME", "DB_PASSWORD")),
        "adminAuthConfigured": len(os.getenv("ADMIN_JWT_SECRET", "")) >= 32,
    }


@app.post("/liveness")
async def liveness(image: UploadFile = File(...)):
    """Return live=False for a printed/screen photo or if no face is found."""
    raw = await image.read()
    frame = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail="The uploaded frame is not an image.")
    if not models.is_dir():
        raise HTTPException(status_code=503, detail="Anti-spoof model files are unavailable.")

    try:
        predictor, cropper, parse_model_name = load_liveness_runtime()
        bbox = predictor.get_bbox(frame)
        prediction = np.zeros((1, 3))
        model_count = 0
        for model_name in models.iterdir():
            if not model_name.is_file():
                continue
            height, width, _, scale = parse_model_name(model_name.name)
            patch = cropper.crop(
                org_img=frame,
                bbox=bbox,
                scale=scale,
                out_w=width,
                out_h=height,
                crop=scale is not None,
            )
            prediction += predictor.predict(patch, str(model_name))
            model_count += 1
        if not model_count:
            raise RuntimeError("No anti-spoof model files were found.")
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=422, detail="Could not verify a live face.") from error

    label = int(np.argmax(prediction))
    score = float(prediction[0][label] / model_count)
    # Silent Face Anti-Spoofing label 1 is a real/live face.
    return {"live": label == 1, "score": round(score, 3)}
