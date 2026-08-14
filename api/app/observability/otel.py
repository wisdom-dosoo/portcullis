"""OpenTelemetry setup and instrumentation boundary."""

from __future__ import annotations

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from app.config import Settings


def configure_otel(settings: Settings) -> TracerProvider | None:
    """Set up the global TracerProvider and auto-instrument httpx.

    Returns the configured TracerProvider, or None when OTel is disabled
    (i.e. ``settings.otel_endpoint`` is None).  When disabled the global
    provider remains the default no-op provider — no explicit setup needed.
    """
    if settings.otel_endpoint is None:
        return None

    resource = Resource(attributes={SERVICE_NAME: settings.otel_service_name})
    provider = TracerProvider(resource=resource)

    exporter = OTLPSpanExporter(endpoint=settings.otel_endpoint)
    provider.add_span_processor(BatchSpanProcessor(exporter))

    trace.set_tracer_provider(provider)
    HTTPXClientInstrumentor().instrument()

    return provider


def shutdown_otel(provider: TracerProvider | None) -> None:
    """Flush and shut down the TracerProvider and uninstrument httpx.

    Safe to call when ``provider`` is None (OTel was disabled).
    """
    if provider is None:
        return

    provider.force_flush()
    provider.shutdown()
    HTTPXClientInstrumentor().uninstrument()


def get_tracer(name: str) -> trace.Tracer:
    """Return a tracer for *name* from the active global provider.

    Callers import this function rather than ``opentelemetry.trace`` directly
    so that the instrumentation boundary stays contained to this module.
    """
    return trace.get_tracer(name)
