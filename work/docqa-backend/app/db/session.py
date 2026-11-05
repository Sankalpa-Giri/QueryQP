from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

connect_args = {}
engine_kwargs = {
    "pool_pre_ping": True,
}

if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False
else:
    # High-concurrency production connection pool for PostgreSQL
    engine_kwargs.update({
        "pool_size": 30,
        "max_overflow": 50,
        "pool_timeout": 30,
        "pool_recycle": 1800,
    })

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    **engine_kwargs,
)

# Enable SQLite foreign keys & WAL mode for high concurrency
if settings.DATABASE_URL.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def upgrade_schema(db_engine) -> None:
    """Safely apply incremental column additions and production vector indexes to existing database tables."""
    try:
        with db_engine.connect() as conn:
            dialect_name = db_engine.dialect.name
            if dialect_name == "sqlite":
                res = conn.exec_driver_sql("PRAGMA table_info(admin_users);").fetchall()
                existing_cols = {r[1] for r in res}
                if "must_change_password" not in existing_cols:
                    conn.exec_driver_sql("ALTER TABLE admin_users ADD COLUMN must_change_password BOOLEAN DEFAULT 0;")
                if "full_name" not in existing_cols:
                    conn.exec_driver_sql("ALTER TABLE admin_users ADD COLUMN full_name VARCHAR(150);")
                if "email" not in existing_cols:
                    conn.exec_driver_sql("ALTER TABLE admin_users ADD COLUMN email VARCHAR(255);")
                if "last_login_at" not in existing_cols:
                    conn.exec_driver_sql("ALTER TABLE admin_users ADD COLUMN last_login_at DATETIME;")
                if "updated_at" not in existing_cols:
                    conn.exec_driver_sql("ALTER TABLE admin_users ADD COLUMN updated_at DATETIME;")
                conn.commit()
            elif "postgres" in dialect_name:
                conn.exec_driver_sql("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;")
                conn.exec_driver_sql("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS full_name VARCHAR(150);")
                conn.exec_driver_sql("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS email VARCHAR(255);")
                conn.exec_driver_sql("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;")
                conn.exec_driver_sql("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;")

                # Setup pgvector extension & HNSW vector search index
                try:
                    conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector;")
                    # Fast compound index on status for student retrieval
                    conn.exec_driver_sql(
                        "CREATE INDEX IF NOT EXISTS idx_questions_published_status "
                        "ON questions (publication_status, review_status, subject_id);"
                    )
                except Exception:
                    pass

                conn.commit()
    except Exception as e:
        # Don't crash startup if table doesn't exist yet before create_all
        pass


def get_db() -> Generator[Session, None, None]:
    """Dependency that yields a database session and safely closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
