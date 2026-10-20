import logging
import os
from concurrent.futures import ThreadPoolExecutor

from app.workers.pipeline import run_document_pipeline_sync

logger = logging.getLogger(__name__)

# In-process threadpool for local execution and dev testing
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="doc-worker-")


def dispatch_document_processing(document_id: str, parser_type: str | None = None) -> None:
    """Dispatch document processing to Celery if configured, or background threadpool."""
    use_celery = os.environ.get("USE_CELERY", "false").lower() == "true"

    if use_celery:
        try:
            from app.workers.celery_app import celery_process_document

            celery_process_document.delay(document_id, parser_type)
            logger.info("Dispatched document %s to Celery queue", document_id)
            return
        except Exception as e:
            logger.warning("Failed to dispatch to Celery (%s). Falling back to threadpool executor.", e)

    # In-process asynchronous threadpool execution
    future = _executor.submit(run_document_pipeline_sync, document_id, parser_type)

    def _done_callback(fut):
        try:
            res = fut.result()
            logger.info("Pipeline completed for document %s with success=%s", document_id, res)
        except Exception as exc:
            logger.exception("Pipeline execution crashed for document %s: %s", document_id, exc)
            try:
                from app.db.session import SessionLocal
                from app.models.document import QuestionPaper
                from app.models.enums import StageStatus

                db = SessionLocal()
                doc = db.query(QuestionPaper).filter(QuestionPaper.id == document_id).first()
                if doc:
                    doc.parser_status = StageStatus.FAILED
                    doc.extraction_status = StageStatus.FAILED
                    doc.indexing_status = StageStatus.FAILED
                    doc.error_message = str(exc)
                    db.commit()
                db.close()
            except Exception:
                pass

    future.add_done_callback(_done_callback)
    logger.info("Dispatched document %s to local background threadpool executor", document_id)

