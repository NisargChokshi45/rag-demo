#!/bin/bash
# Verification Script for Groq + Gemini Setup
# Run this to verify your RAG pipeline is properly configured

echo "═══════════════════════════════════════════════════════════════"
echo "  RAG Pipeline Setup Verification"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASS=0
FAIL=0

# Helper functions
check_pass() {
  echo -e "${GREEN}✓${NC} $1"
  ((PASS++))
}

check_fail() {
  echo -e "${RED}✗${NC} $1"
  ((FAIL++))
}

check_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

echo "1. Checking Environment Variables"
echo "───────────────────────────────────────────────────────────────"

if [ -z "$GOOGLE_API_KEY" ]; then
  check_fail "GOOGLE_API_KEY not set"
else
  KEY_PREVIEW="${GOOGLE_API_KEY:0:10}...${GOOGLE_API_KEY: -4}"
  check_pass "GOOGLE_API_KEY is set ($KEY_PREVIEW)"
fi

if [ -z "$GROQ_API_KEY" ]; then
  check_fail "GROQ_API_KEY not set"
else
  KEY_PREVIEW="${GROQ_API_KEY:0:10}...${GROQ_API_KEY: -4}"
  check_pass "GROQ_API_KEY is set ($KEY_PREVIEW)"
fi

echo ""
echo "2. Checking File Structure"
echo "───────────────────────────────────────────────────────────────"

files=(
  "lib/models.ts"
  "lib/embeddings.ts"
  "lib/chunk.ts"
  "lib/agent-tools.ts"
  "lib/db.ts"
  "app/api/ingest/route.ts"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    check_pass "Found: $file"
  else
    check_fail "Missing: $file"
  fi
done

echo ""
echo "3. Checking Models Configuration"
echo "───────────────────────────────────────────────────────────────"

# Check Groq model in lib/models.ts
if grep -q "ChatGroq" lib/models.ts; then
  check_pass "lib/models.ts uses ChatGroq"
else
  check_fail "lib/models.ts doesn't use ChatGroq"
fi

if grep -q "llama-3.3-70b-versatile" lib/models.ts; then
  check_pass "Default Groq model: llama-3.3-70b-versatile"
else
  check_warn "Groq model might be different (check lib/models.ts)"
fi

# Check Gemini model in lib/embeddings.ts
if grep -q "gemini-embedding" lib/embeddings.ts; then
  check_pass "lib/embeddings.ts uses Gemini embeddings"
else
  check_fail "lib/embeddings.ts doesn't use Gemini embeddings"
fi

echo ""
echo "4. Checking Resumes Folder"
echo "───────────────────────────────────────────────────────────────"

if [ -d "resumes" ]; then
  pdf_count=$(find resumes -name "*.pdf" 2>/dev/null | wc -l)
  if [ "$pdf_count" -gt 0 ]; then
    check_pass "Found $pdf_count resume PDFs in resumes/"
  else
    check_fail "No PDF files found in resumes/"
  fi
else
  check_fail "resumes/ folder not found"
fi

echo ""
echo "5. Checking Node Modules"
echo "───────────────────────────────────────────────────────────────"

if [ -d "node_modules/@langchain/groq" ]; then
  check_pass "@langchain/groq is installed"
else
  check_fail "@langchain/groq not found (run: pnpm install)"
fi

if [ -d "node_modules/langchain" ]; then
  check_pass "langchain is installed"
else
  check_fail "langchain not found (run: pnpm install)"
fi

echo ""
echo "6. Checking Database Configuration"
echo "───────────────────────────────────────────────────────────────"

# Check for Supabase environment
if grep -q "SUPABASE_URL\|supabase" .env.local 2>/dev/null || grep -q "createServiceClient" lib/supabase/server.ts; then
  check_pass "Supabase configured"
else
  check_warn "Supabase configuration not verified"
fi

echo ""
echo "7. Testing Dependencies"
echo "───────────────────────────────────────────────────────────────"

# Check if TypeScript is available
if command -v tsc &> /dev/null; then
  check_pass "TypeScript is installed"
else
  check_warn "TypeScript not in PATH (using pnpm tsx should work)"
fi

# Check if pnpm is available
if command -v pnpm &> /dev/null; then
  check_pass "pnpm is installed"
else
  check_fail "pnpm not found (install: npm install -g pnpm)"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Summary"
echo "═══════════════════════════════════════════════════════════════"
echo -e "Passed: ${GREEN}$PASS${NC} | Failed: ${RED}$FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}✓ Setup verification passed!${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Run: pnpm tsx scripts/demo-pipeline.ts"
  echo "  2. Or: pnpm tsx scripts/test-custom-query.ts"
  echo "  3. Or: npm run dev (to start the app)"
  exit 0
else
  echo -e "${RED}✗ Setup verification failed!${NC}"
  echo ""
  echo "Issues found:"

  if [ -z "$GOOGLE_API_KEY" ] || [ -z "$GROQ_API_KEY" ]; then
    echo "  - Set API keys:"
    echo "    export GOOGLE_API_KEY='your-gemini-key'"
    echo "    export GROQ_API_KEY='your-groq-key'"
  fi

  if [ $PASS -lt 5 ]; then
    echo "  - Install dependencies:"
    echo "    pnpm install"
  fi

  exit 1
fi
