"""Diagnose why the Neo4j knowledge graph is / isn't connecting.

Run from the backend dir with the app's virtualenv:
    ./.venv/Scripts/python.exe check_neo4j.py          (Windows)
    ./.venv/bin/python check_neo4j.py                  (macOS/Linux)

It reads the exact same settings the app uses (env vars + backend/.env), then
tries to connect and reports precisely what's wrong.
"""
from __future__ import annotations

from app.core.config import settings


def mask(secret: str | None) -> str:
    if not secret:
        return "(not set)"
    return secret[:2] + "***" + secret[-2:] if len(secret) > 4 else "***"


print("=" * 64)
print("Neo4j configuration as the app sees it")
print("=" * 64)
print(f"NEO4J_URI      : {settings.neo4j_uri or '(not set)'}")
print(f"NEO4J_USER     : {settings.neo4j_user}")
print(f"NEO4J_PASSWORD : {mask(settings.neo4j_password)}")
print(f"NEO4J_DATABASE : {settings.neo4j_database}")
print()

if not settings.neo4j_uri or not settings.neo4j_password:
    print("RESULT: NOT CONFIGURED.")
    print("  -> NEO4J_URI and NEO4J_PASSWORD must BOTH be set.")
    print("  -> Locally: put them in backend/.env, then restart.")
    print("  -> On Render: set them in the service's Environment, then redeploy.")
    raise SystemExit(1)

# Sanity check on the URI scheme (Aura requires the TLS scheme).
if "databases.neo4j.io" in settings.neo4j_uri and not settings.neo4j_uri.startswith("neo4j+s://"):
    print("WARNING: Aura URIs must use the 'neo4j+s://' scheme (TLS).")
    print(f"  Yours starts with: {settings.neo4j_uri.split('://')[0]}://")
    print()

print("Attempting to connect...")
try:
    from neo4j import GraphDatabase

    driver = GraphDatabase.driver(
        settings.neo4j_uri, auth=(settings.neo4j_user, settings.neo4j_password)
    )
    driver.verify_connectivity()
    with driver.session(database=settings.neo4j_database) as s:
        val = s.run("RETURN 1 AS ok").single()["ok"]
        count = s.run("MATCH (n:TwinNode) RETURN count(n) AS c").single()["c"]
    driver.close()
    print("RESULT: CONNECTED OK  (test query returned", val, ")")
    print(f"  TwinNode count in graph: {count}")
    if count == 0:
        print("  Note: graph is empty — onboard a company or upload a CSV to sync it,")
        print("        or add a backfill to push existing companies in.")
except Exception as exc:  # noqa: BLE001
    print(f"RESULT: FAILED to connect — {type(exc).__name__}: {exc}")
    print()
    print("Common causes:")
    print("  - Wrong password, or password not the one from Aura's credentials file.")
    print("  - Aura instance is PAUSED (Free tier sleeps) or still provisioning — resume it.")
    print("  - URI typo, or missing 'neo4j+s://' TLS scheme for Aura.")
    print("  - Network/firewall blocking outbound port 7687.")
    raise SystemExit(2)
