"""Add issue proof and review checks without fabricating historical evidence."""
from sqlalchemy import inspect, text


def migrate_issue_evidence(connection):
    for table, column in (("issue_analysis", "evidence"), ("reviews", "issue_assessment")):
        columns = {item["name"] for item in inspect(connection).get_columns(table)}
        if column not in columns:
            connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} JSON"))
