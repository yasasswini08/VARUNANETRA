"""
Celery application object. Task modules (scene_processing, drift_processing,
pasha_processing) are registered here as each is built in the
async-processing phase; this file exists now so `docker compose up` brings
up a worker process that can be inspected with `celery -A app.jobs.celery_app
inspect ping` even before task modules land.
"""
from celery import Celery

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "varuna_netra",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_send_task_events=True,
    task_send_sent_event=True,
)

celery_app.autodiscover_tasks(["app.jobs"])
import app.jobs.investigation_pipeline  # noqa: E402,F401 -- ensures the task is registered on import
