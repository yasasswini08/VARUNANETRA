"""
Exception hierarchy. Every one of these is caught in app/main.py's exception
handlers and turned into a structured JSON error with an explicit
`reason_code` -- never into a silently degraded 200 response.
"""


class VarunaError(Exception):
    reason_code = "INTERNAL_ERROR"

    def __init__(self, message: str, **context):
        super().__init__(message)
        self.message = message
        self.context = context


class ProviderNotConfigured(VarunaError):
    """Raised when a real-data provider is called but its credentials are
    missing. Section 19 of the spec requires this to surface as
    'Provider not configured.', never as fabricated data."""
    reason_code = "PROVIDER_NOT_CONFIGURED"


class ProviderUnavailable(VarunaError):
    """Raised when a configured provider's upstream API fails, times out,
    rate-limits, or returns no data for the requested window."""
    reason_code = "PROVIDER_UNAVAILABLE"


class ModeIntegrityError(VarunaError):
    """Raised if synthetic data is about to leak into a REAL-mode response."""
    reason_code = "MODE_INTEGRITY_VIOLATION"


class InvalidGeometry(VarunaError):
    reason_code = "INVALID_GEOMETRY"


class SimulationFailure(VarunaError):
    """OpenDrift/OpenOil run failed or produced a degenerate ensemble."""
    reason_code = "SIMULATION_FAILURE"


class InsufficientData(VarunaError):
    """E.g. AIS_DATA_UNAVAILABLE_FOR_THIS_ANALYSIS_WINDOW."""
    reason_code = "INSUFFICIENT_DATA"


class IngestionError(VarunaError):
    """Raised when an uploaded SAR product cannot be safely unpacked or its
    metadata cannot be confidently extracted -- e.g. a zip with no `.SAFE`
    member, a zip-slip path, or annotation XML that doesn't parse. Distinct
    from InvalidGeometry (that's for a bad bbox the *caller* supplied) and
    from ProviderUnavailable (that's for a real upstream failing, not a
    malformed upload)."""
    reason_code = "INGESTION_FAILED"
