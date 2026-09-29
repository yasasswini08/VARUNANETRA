"""
Central configuration.

APP_MODE is the single switch that separates the two operating modes required
by the spec:

  APP_MODE=real  -> every provider must use real external data or fail loudly.
                     No synthetic fixtures are permitted anywhere on this path.
  APP_MODE=demo  -> synthetic providers are permitted, but every response they
                     produce must be tagged SYNTHETIC_DEMO in its provenance
                     object and the frontend must render the demo banner.

Nothing in this file invents a default credential. Missing credentials are
surfaced as `configured=False` on /api/providers/status and as a
ProviderNotConfigured error at call time — never as a silent fallback.
"""
from enum import Enum
from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppMode(str, Enum):
    REAL = "real"
    DEMO = "demo"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_mode: AppMode = Field(default=AppMode.DEMO, alias="APP_MODE")
    environment: str = Field(default="development", alias="ENVIRONMENT")

    # --- Copernicus Data Space Ecosystem (Sentinel-1) ---
    # Register at https://dataspace.copernicus.eu -> create an OAuth2 client
    # under your account settings to obtain these.
    cdse_client_id: str | None = Field(default=None, alias="CDSE_CLIENT_ID")
    cdse_client_secret: str | None = Field(default=None, alias="CDSE_CLIENT_SECRET")
    cdse_token_url: str = Field(
        default="https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
        alias="CDSE_TOKEN_URL",
    )
    cdse_stac_url: str = Field(
        default="https://catalogue.dataspace.copernicus.eu/stac",
        alias="CDSE_STAC_URL",
    )
    cdse_download_url: str = Field(
        default="https://zipper.dataspace.copernicus.eu/odata/v1",
        alias="CDSE_DOWNLOAD_URL",
    )

    # --- Copernicus Climate Data Store (ERA5) ---
    # Obtain a personal access token from https://cds.climate.copernicus.eu/profile
    cds_api_url: str = Field(default="https://cds.climate.copernicus.eu/api", alias="CDS_API_URL")
    cds_api_key: str | None = Field(default=None, alias="CDS_API_KEY")

    # --- Copernicus Marine Service (CMEMS) ---
    # Register at https://data.marine.copernicus.eu
    cmems_username: str | None = Field(default=None, alias="CMEMS_USERNAME")
    cmems_password: str | None = Field(default=None, alias="CMEMS_PASSWORD")
    # Default operational product; see providers/cmems/README.md for the
    # documented rationale for this specific dataset id.
    cmems_dataset_id: str = Field(
        default="cmems_mod_glo_phy_anfc_merged-uv_PT1H-i",
        alias="CMEMS_DATASET_ID",
    )

    # --- AIS ---
    ais_provider: str = Field(default="global_fishing_watch", alias="AIS_PROVIDER")
    gfw_api_token: str | None = Field(default=None, alias="GFW_API_TOKEN")
    gfw_api_url: str = Field(default="https://gateway.api.globalfishingwatch.org", alias="GFW_API_URL")

    # --- Infra ---
    database_url: str = Field(
        default="postgresql+psycopg://varuna:varuna@postgres:5432/varuna_netra",
        alias="DATABASE_URL",
    )
    redis_url: str = Field(default="redis://redis:6379/0", alias="REDIS_URL")
    s3_endpoint: str = Field(default="http://minio:9000", alias="S3_ENDPOINT")
    s3_access_key: str = Field(default="varuna_minio", alias="S3_ACCESS_KEY")
    s3_secret_key: str = Field(default="varuna_minio_secret", alias="S3_SECRET_KEY")
    s3_bucket: str = Field(default="varuna-netra", alias="S3_BUCKET")

    # --- Pipeline parameters (kept configurable per spec section 10/12) ---
    candidate_weight_spatial: float = Field(default=0.25, alias="WEIGHT_SPATIAL")
    candidate_weight_temporal: float = Field(default=0.25, alias="WEIGHT_TEMPORAL")
    candidate_weight_trajectory: float = Field(default=0.30, alias="WEIGHT_TRAJECTORY")
    candidate_weight_behavioural: float = Field(default=0.20, alias="WEIGHT_BEHAVIOURAL")

    drift_ensemble_size: int = Field(default=1000, alias="DRIFT_ENSEMBLE_SIZE")
    drift_backward_hours: int = Field(default=72, alias="DRIFT_BACKWARD_HOURS")

    falsification_min_spatial_overlap: float = Field(default=0.15, alias="FALSIFY_MIN_SPATIAL_IOU")
    falsification_max_centroid_km: float = Field(default=25.0, alias="FALSIFY_MAX_CENTROID_KM")
    falsification_max_arrival_error_h: float = Field(default=6.0, alias="FALSIFY_MAX_ARRIVAL_ERROR_H")
    decision_leading_margin: float = Field(default=0.15, alias="DECISION_LEADING_MARGIN")
    decision_leading_min_score: float = Field(default=0.60, alias="DECISION_LEADING_MIN_SCORE")

    model_version: str = Field(default="varuna-netra-0.1.0", alias="MODEL_VERSION")

    def is_real(self) -> bool:
        return self.app_mode == AppMode.REAL


@lru_cache
def get_settings() -> Settings:
    return Settings()
