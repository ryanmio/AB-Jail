#!/bin/bash
set -e

# Load environment variables
if [ -f .env.local ]; then
    export $(cat .env.local | grep DATABASE_URL | xargs)
fi

# Apply migrations
echo "Applying migration: 2026-01-04_add_sort_date.sql"
psql "$DATABASE_URL" -f sql/2026-01-04_add_sort_date.sql

echo "✓ Migration completed successfully!"
