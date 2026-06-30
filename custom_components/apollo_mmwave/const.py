"""Constants for the Apollo mmWave integration."""

# Core domain
DOMAIN = "apollo_mmwave"

# Services
SERVICE_UPDATE_ZONE = "update_zone"

# Event names
EVENT_ZONE_UPDATED = f"{DOMAIN}_zone_updated"

# hass.data keys
DATA_LOCATIONS = "locations"
DATA_PLATFORMS_LOADED = "platforms_loaded"

# Location store keys
STORE_ZONES = "zones"
STORE_ENTITIES = "entities"

# Attribute / data keys. Persisted coordinates are rounded to whole mm
ATTR_SHAPE = "shape"
ATTR_DATA = "data"
ATTR_POINTS = "points"
ATTR_X_MIN = "x_min"
ATTR_X_MAX = "x_max"
ATTR_Y_MIN = "y_min"
ATTR_Y_MAX = "y_max"
ATTR_CX = "cx"
ATTR_CY = "cy"
ATTR_RX = "rx"
ATTR_RY = "ry"
ATTR_ROTATION_DEG = "rotation_deg"
ATTR_NAME = "name"

# Shapes
SHAPE_RECT = "rect"
SHAPE_ELLIPSE = "ellipse"
SHAPE_POLYGON = "polygon"
SHAPE_NONE = "none"
SUPPORTED_SHAPES = (SHAPE_NONE, SHAPE_RECT, SHAPE_ELLIPSE, SHAPE_POLYGON)

# Limits / defaults
POLYGON_MAX_POINTS = 32
POLYGON_MIN_POINTS = 3

# Sensor / entity naming fragments
COORD_SENSOR_UNIQUE_ID_FMT = "apollo_mmwave_{location}_zone_{zone_id}"
PRESENCE_SENSOR_UNIQUE_ID_FMT = "apollo_mmwave_{location}_zone_{zone_id}_presence"

# The zone-drawing card this integration bundles (vendored from zone-mapper-card).
CARD_TYPE = "custom:zone-mapper-card"

# Options flow: opt out of the auto-created dashboard.
CONF_AUTO_CREATE_VIEW = "auto_create_view"
DEFAULT_AUTO_CREATE_VIEW = True

# Dedicated, strategy-backed dashboard this integration registers in the sidebar.
# The dashboard config is just `{"strategy": {"type": DASHBOARD_STRATEGY_TYPE}}`;
# the frontend strategy detects every Apollo mmWave device and builds one tab each.
DASHBOARD_URL_PATH = "apollo-mmwave"
DASHBOARD_TITLE = "Apollo mmWave"
DASHBOARD_ICON = "mdi:radar"
DASHBOARD_STRATEGY_TYPE = "custom:apollo-radar-tuning"

# Frontend assets bundled with the integration and served as Lovelace resources,
# so users install ONE thing (no separate card downloads). Filenames live in www/.
STATIC_URL_BASE = f"/{DOMAIN}"
FRONTEND_DIR = "www"
JS_BUNDLES = (
    "apollo-radar-tuning.js",  # tuning cards + dashboard strategy
    "zone-mapper-card.js",  # vendored 2D zone-drawing card
)

# Log / warning templates
WARN_POLY_INSUFFICIENT = (
    "Polygon zone %s in location '%s' has insufficient points (<3); clearing zone."
)
WARN_POLY_TRUNCATING = (
    "Polygon zone %s in location '%s' has %d points; truncating to %d."
)
WARN_RECT_INVALID = (
    "Rectangle zone %s in location '%s' has invalid bounds; clearing zone."
)
WARN_RECT_NON_NUM = (
    "Rectangle zone %s in location '%s' has non-numeric bounds; clearing zone."
)
WARN_ELLIPSE_NON_POSITIVE = (
    "Ellipse zone %s in location '%s' has non-positive radii; clearing zone."
)
WARN_ELLIPSE_INVALID = (
    "Ellipse zone %s in location '%s' has invalid radii; clearing zone."
)
