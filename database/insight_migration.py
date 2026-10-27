"""Add narrative snapshots and source scope without rewriting past runs."""
from sqlalchemy import inspect, text


def migrate_product_insights(connection):
    for table, column in (("analysis_history", "insights"), ("products", "collection_context")):
        columns = {item["name"] for item in inspect(connection).get_columns(table)}
        if column not in columns:
            connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} JSON"))
