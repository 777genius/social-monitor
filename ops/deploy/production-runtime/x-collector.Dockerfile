FROM python:3.13-slim

WORKDIR /app
COPY apps/x-collector /app/apps/x-collector
COPY ops/deploy/production-runtime/x-launch-guard.py /usr/local/lib/social-monitor/x-launch-guard.py
RUN pip install --no-cache-dir /app/apps/x-collector

ARG SOCIAL_MONITOR_RELEASE_SHA
LABEL org.opencontainers.image.revision="${SOCIAL_MONITOR_RELEASE_SHA}"

WORKDIR /app/apps/x-collector
USER 1000:1000
ENTRYPOINT ["python", "/usr/local/lib/social-monitor/x-launch-guard.py", "container-exec"]
CMD ["python", "-m", "x_collector"]
