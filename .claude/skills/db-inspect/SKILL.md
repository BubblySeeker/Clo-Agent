# /db-inspect — Database Inspection

Quick database inspection — show table schemas, row counts, RLS policies, or run ad-hoc queries against the running Postgres container.

## Arguments

The user can provide:
- **table name** — inspect that specific table
- **query** — run a raw SQL query
- No arguments — show overview of all tables with row counts

## Instructions

Use the Docker Compose postgres container to run queries:

```bash
docker compose exec -T postgres psql -U "${POSTGRES_USER:-cloagent}" -d "${POSTGRES_DB:-cloagent}" -c "<SQL>"
```

### If no arguments: show overview
```sql
SELECT table_name,
       (xpath('/row/cnt/text()', xml_count))[1]::text::int AS row_count
FROM (
  SELECT table_name,
         query_to_xml('SELECT count(*) AS cnt FROM ' || quote_ident(table_name), false, true, '') AS xml_count
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
) t
ORDER BY table_name;
```

### If table name provided: show schema + RLS
1. Table columns:
   ```sql
   SELECT column_name, data_type, is_nullable, column_default
   FROM information_schema.columns
   WHERE table_name = '<table>' AND table_schema = 'public'
   ORDER BY ordinal_position;
   ```

2. RLS policies:
   ```sql
   SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr,
          pg_get_expr(polwithcheck, polrelid) AS with_check
   FROM pg_policy
   WHERE polrelid = '<table>'::regclass;
   ```

3. Row count:
   ```sql
   SELECT count(*) FROM <table>;
   ```

### If raw query provided: run it directly
Execute the user's SQL query and display results in a formatted table.

## Output

- Formatted table of results
- Any errors from Postgres
- For schema inspection: column types, nullability, defaults, RLS policies
