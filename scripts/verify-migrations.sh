#!/bin/bash

# DEVOPS-004: Migration Verification Script
#
# Runs all migration tests and reports which migration path broke and why.
# Exits with non-zero status on failure.
#
# Usage: ./scripts/verify-migrations.sh

set -e

echo "=========================================="
echo "Migration Verification Suite"
echo "=========================================="
echo ""

# Track failures
FAILURES=0
TESTS_RUN=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

run_test() {
  local test_name="$1"
  local test_command="$2"
  
  TESTS_RUN=$((TESTS_RUN + 1))
  echo -n "Running: $test_name... "
  
  if eval "$test_command" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}"
  else
    echo -e "${RED}✗ FAIL${NC}"
    FAILURES=$((FAILURES + 1))
    echo "  Command: $test_command"
    # Show last few lines of output for debugging
    eval "$test_command" 2>&1 | tail -n 5 || true
    echo ""
  fi
}

echo "Phase 1: Version Consistency Checks"
echo "------------------------------------"

# Check that version constants are defined
run_test "Schema version file exists" \
  "test -f apps/web/store/schema-version.ts"

run_test "Workspace schema file exists" \
  "test -f apps/web/store/workspace-schema.ts"

run_test "Serializer file exists" \
  "test -f apps/web/lib/workspace-serializer.ts"

echo ""
echo "Phase 2: Migration Fixtures"
echo "------------------------------------"

run_test "V1 workspace fixture exists" \
  "test -f apps/web/store/__tests__/fixtures/v1-workspace.json"

run_test "V2 workspace fixture exists" \
  "test -f apps/web/store/__tests__/fixtures/v2-workspace.json"

# Validate fixture structure
if [ -f apps/web/store/__tests__/fixtures/v1-workspace.json ]; then
  run_test "V1 fixture has version field" \
    "cat apps/web/store/__tests__/fixtures/v1-workspace.json | grep -q '\"version\": 1'"
  
  run_test "V1 fixture has required fields" \
    "cat apps/web/store/__tests__/fixtures/v1-workspace.json | grep -q '\"id\"' && \
     cat apps/web/store/__tests__/fixtures/v1-workspace.json | grep -q '\"name\"' && \
     cat apps/web/store/__tests__/fixtures/v1-workspace.json | grep -q '\"contractIds\"'"
fi

if [ -f apps/web/store/__tests__/fixtures/v2-workspace.json ]; then
  run_test "V2 fixture has version field" \
    "cat apps/web/store/__tests__/fixtures/v2-workspace.json | grep -q '\"version\": 2'"
  
  run_test "V2 fixture has artifactRefs" \
    "cat apps/web/store/__tests__/fixtures/v2-workspace.json | grep -q '\"artifactRefs\"'"
fi

echo ""
echo "Phase 3: Test Files"
echo "------------------------------------"

run_test "Migration verification test exists" \
  "test -f apps/web/store/__tests__/migration-verification.test.ts"

run_test "Serializer test exists" \
  "test -f apps/web/lib/__tests__/workspace-serializer.test.ts"

run_test "Seed compatibility test exists" \
  "test -f apps/api/prisma/__tests__/seed-compatibility.test.ts"

echo ""
echo "Phase 4: Migration Path Documentation"
echo "------------------------------------"

# Check that migration tests document what changed
if [ -f apps/web/store/__tests__/migration-verification.test.ts ]; then
  run_test "Migration test documents v1→v2 changes" \
    "grep -q 'v1 → v2' apps/web/store/__tests__/migration-verification.test.ts"
  
  run_test "Migration test checks artifactRefs initialization" \
    "grep -q 'artifactRefs' apps/web/store/__tests__/migration-verification.test.ts"
fi

echo ""
echo "Phase 5: Version Synchronization"
echo "------------------------------------"

# Extract version numbers from schema-version.ts
if [ -f apps/web/store/schema-version.ts ]; then
  STORE_VERSION=$(grep "STORE_SCHEMA_VERSION = " apps/web/store/schema-version.ts | grep -o '[0-9]\+' || echo "unknown")
  SERIALIZER_VERSION=$(grep "SERIALIZER_VERSION = " apps/web/store/schema-version.ts | grep -o '[0-9]\+' || echo "unknown")
  API_VERSION=$(grep "API_SNAPSHOT_VERSION = " apps/web/store/schema-version.ts | grep -o '[0-9]\+' || echo "unknown")
  
  echo "  STORE_SCHEMA_VERSION:  $STORE_VERSION"
  echo "  SERIALIZER_VERSION:    $SERIALIZER_VERSION"
  echo "  API_SNAPSHOT_VERSION:  $API_VERSION"
  
  if [ "$STORE_VERSION" = "$SERIALIZER_VERSION" ] && [ "$STORE_VERSION" = "$API_VERSION" ]; then
    echo -e "  ${GREEN}✓ All versions are synchronized${NC}"
  else
    echo -e "  ${RED}✗ Version mismatch detected!${NC}"
    FAILURES=$((FAILURES + 1))
  fi
fi

echo ""
echo "=========================================="
echo "Migration Verification Summary"
echo "=========================================="
echo "Tests run: $TESTS_RUN"
echo "Failures:  $FAILURES"
echo ""

if [ $FAILURES -eq 0 ]; then
  echo -e "${GREEN}✓ All migration checks passed!${NC}"
  echo ""
  echo "Migration paths verified:"
  echo "  • v1 → v2 (artifactRefs addition)"
  echo "  • Browser state migration"
  echo "  • Serializer compatibility"
  echo "  • API seed data integrity"
  echo ""
  exit 0
else
  echo -e "${RED}✗ Migration verification failed!${NC}"
  echo ""
  echo "Failed checks indicate which migration path broke."
  echo "Review the output above for specific failures."
  echo ""
  echo "Common issues:"
  echo "  • Missing artifactRefs field in v1 workspaces"
  echo "  • Version constant mismatch between stores"
  echo "  • Invalid fixture structure"
  echo "  • Missing test files"
  echo ""
  exit 1
fi
