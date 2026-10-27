"""Track binary risk rules without removing legacy data or columns."""
from sqlalchemy import inspect, text


def migrate_risk_rules(connection):
    columns = {item["name"] for item in inspect(connection).get_columns("risk_detection")}
    if "rule_version" not in columns:
        connection.execute(text("ALTER TABLE risk_detection ADD COLUMN rule_version VARCHAR(64)"))
