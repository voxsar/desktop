#!/bin/bash
# Pre-Release Checklist Script
# Run this before creating/pushing any GitHub tags to ensure all CI checks pass

set -e
trap 'last_command=$current_command; current_command=$BASH_COMMAND' DEBUG

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

failed_checks=()

echo -e "\n${CYAN}========================================"
echo -e "   PRE-RELEASE CI CHECKS"
echo -e "========================================${NC}\n"

# Check 1: ESLint
echo -e "${YELLOW}[1/5] Running ESLint...${NC}"
if npm run lint:js-quiet > /dev/null 2>&1; then
    echo -e "${GREEN}✓ ESLint passed${NC}"
else
    echo -e "${RED}✗ ESLint failed${NC}"
    failed_checks+=("ESLint")
fi

# Check 2: TypeScript Type Checking
echo -e "\n${YELLOW}[2/5] Running TypeScript type checking...${NC}"
if npm run check-types > /dev/null 2>&1; then
    echo -e "${GREEN}✓ TypeScript types passed${NC}"
else
    echo -e "${RED}✗ TypeScript types failed${NC}"
    failed_checks+=("TypeScript")
fi

# Check 3: i18n Extraction and Validation
echo -e "\n${YELLOW}[3/5] Running i18n extraction and validation...${NC}"
npm run i18n-extract -- --desktop-dir . > /dev/null 2>&1
if git --no-pager diff --exit-code i18n/en.json > /dev/null 2>&1; then
    echo -e "${GREEN}✓ i18n strings are up to date${NC}"
else
    echo -e "${RED}✗ i18n strings are out of sync - i18n/en.json has uncommitted changes${NC}"
    echo -e "${YELLOW}  Run: npm run i18n-extract -- --desktop-dir .${NC}"
    echo -e "${YELLOW}  Then commit the changes to i18n/en.json${NC}"
    failed_checks+=("i18n")
fi

# Check 4: Build Config
echo -e "\n${YELLOW}[4/5] Checking build configuration...${NC}"
if npm run check-build-config > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Build config passed${NC}"
else
    echo -e "${RED}✗ Build config failed${NC}"
    failed_checks+=("Build Config")
fi

# Check 5: Unit Tests
echo -e "\n${YELLOW}[5/5] Running unit tests (this may take a while)...${NC}"
test_output=$(npm run test:unit 2>&1 || true)
if echo "$test_output" | grep -q "Tests:.*failed"; then
    failed_count=$(echo "$test_output" | grep -oP "Tests:\s+\K\d+(?= failed)" || echo "0")
    echo -e "${RED}✗ Unit tests failed: $failed_count test(s) failing${NC}"
    echo -e "\n${YELLOW}Failed tests:${NC}"
    echo "$test_output" | grep -oP "● \K.*" | head -n 10 | while read -r line; do
        echo -e "${RED}  - $line${NC}"
    done
    failed_checks+=("Unit Tests")
elif echo "$test_output" | grep -q "Test Suites:.*failed"; then
    echo -e "${RED}✗ Unit tests failed${NC}"
    failed_checks+=("Unit Tests")
else
    echo -e "${GREEN}✓ All unit tests passed${NC}"
fi

# Summary
echo -e "\n${CYAN}========================================"
echo -e "   SUMMARY"
echo -e "========================================${NC}"

if [ ${#failed_checks[@]} -eq 0 ]; then
    echo -e "\n${GREEN}✓ ALL CHECKS PASSED! Safe to release.${NC}"
    echo -e "\nYou can now proceed with:"
    echo -e "${CYAN}  git tag v<version>${NC}"
    echo -e "${CYAN}  git push origin v<version>${NC}"
    exit 0
else
    echo -e "\n${RED}✗ ${#failed_checks[@]} CHECK(S) FAILED:${NC}"
    for check in "${failed_checks[@]}"; do
        echo -e "${RED}  - $check${NC}"
    done
    echo -e "\n${YELLOW}⚠️  DO NOT RELEASE until all checks pass!${NC}"
    echo -e "${YELLOW}Fix the issues above and run this script again.${NC}"
    exit 1
fi
