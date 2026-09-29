"""
python -m scripts.health_check

Confirms the Celery worker is actually alive and the Redis broker/result
backend actually round-trip task state -- by submitting a real diagnostic
task (investigation.health_check_progress) and polling its AsyncResult,
timestamping each new state as it arrives. If Celery isn't running, or the
worker died, or Redis is unreachable, this fails loudly with a clear reason
rather than silently reporting "ok" because the import succeeded.
"""
import argparse
import sys
import time

from app.jobs.celery_app import celery_app
from app.jobs.investigation_pipeline import health_check_progress_task


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=5)
    parser.add_argument("--delay", type=float, default=1.0)
    parser.add_argument("--timeout", type=float, default=30.0)
    args = parser.parse_args()

    print(f"Submitting health_check_progress_task(steps={args.steps}, delay_s={args.delay})...")
    t0 = time.monotonic()
    async_result = health_check_progress_task.delay(steps=args.steps, delay_s=args.delay)
    print(f"  task_id = {async_result.id}")

    last_percent = None
    while time.monotonic() - t0 < args.timeout:
        result = celery_app.AsyncResult(async_result.id)
        percent = None
        if result.state == "PROGRESS" and result.info:
            percent = result.info.get("percent")
        elif result.state == "SUCCESS":
            percent = 100
        if percent != last_percent:
            elapsed = time.monotonic() - t0
            print(f"  [t+{elapsed:5.1f}s] state={result.state:10s} percent={percent}")
            last_percent = percent
        if result.state == "SUCCESS":
            print(f"Health check OK: {result.result}")
            sys.exit(0)
        if result.state == "FAILURE":
            print(f"Health check FAILED: {result.info}")
            sys.exit(1)
        time.sleep(0.3)

    print(f"Health check TIMED OUT after {args.timeout}s -- is a Celery worker running? "
          f"(celery -A app.jobs.celery_app worker --loglevel=INFO)")
    sys.exit(1)


if __name__ == "__main__":
    main()
