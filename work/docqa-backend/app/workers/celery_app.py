from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "pyq_tasks",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)


@celery_app.task(name="tasks.process_document", bind=True, max_retries=3, default_retry_delay=10)
def celery_process_document(self, document_id: str, parser_type: str | None = None):
    from app.workers.pipeline import run_document_pipeline_sync

    try:
        success = run_document_pipeline_sync(document_id, parser_type)
        if not success:
            raise RuntimeError(f"Processing failed for document {document_id}")
        return {"document_id": document_id, "status": "COMPLETED"}
    except Exception as exc:
        raise self.retry(exc=exc)
