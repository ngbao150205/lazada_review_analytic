"""Add optional decision traces without rewriting saved analyses."""
from sqlalchemy import inspect, text


def migrate_sentiment_decisions(connection):
    columns = {column["name"] for column in inspect(connection).get_columns("review_analysis")}
    if "decision_details" not in columns:
        connection.execute(text("ALTER TABLE review_analysis ADD COLUMN decision_details JSON"))
