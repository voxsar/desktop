#!/bin/bash
# Pre-Release Checklist Script for Linux/Mac
# Run this before creating/pushing any GitHub tags to ensure all CI checks pass

set +e  # Don't exit on error

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
    echo -e "${GREEN}[PASS] ESLint${NC}"
else
    echo -e "${RED}[FAIL] ESLint${NC}"
    failed_checks+=("ESLint")
fi

# Check 2: TypeScript Type Checking
echo -e "\n${YELLOW}[2/5] Running TypeScript type checking...${NC}"
if npm run check-types > /dev/null 2>&1; then
    echo -e "${GREEN}[PASS] TypeScript types${NC}"
else
    echo -e "${RED}[FAIL] TypeScript types${NC}"
    failed_checks+=("TypeScript")
fi

# Check 3: i18n Extraction and Validation
echo -e "\n${YELLOW}[3/5] Running i18n extraction and validation...${NC}"
npm run i18n-extract -- --desktop-dir . > /dev/null 2>&1
if git --no-pager diff --exit-code i18n/en.json > /dev/null 2>&1; then
    echo -e "${GREEN}[PASS] i18n strings are up to date${NC}"
else
    echo -e "${RED}[FAIL] i18n strings are out of sync${NC}"
    echo -e "${YELLOW}  Run: npm run i18n-extract -- --desktop-dir .${NC}"
    echo -e "${YELLOW}  Then commit the changes to i18n/en.json${NC}"
    failed_checks+=("i18n")
fi

# Check 4: Build Config
echo -e "\n${YELLOW}[4/5] Checking build configuration...${NC}"
if npm run check-build-config > /dev/null 2>&1; then
    echo -e "${GREEN}[PASS] Build config${NC}"
else
    echo -e "${RED}[FAIL] Build config${NC}"
    failed_checks+=("Build Config")
fi

# Check 5: Unit Tests
echo -e "\n${YELLOW}[5/5] Running unit tests (this may take a while)...${NC}"
test_output=$(npm run test:unit 2>&1 || true)
test_exit_code=$?

if [ $test_exit_code -eq 0 ]; then
    echo -e "${GREEN}[PASS] All unit tests${NC}"
else
    if echo "$test_output" | grep -q "Test Suites:.*failed"; then
        failed_count=$(echo "$test_output" | grep -oP "Test Suites:\s+\K\d+(?=\s+failed)" || echo "some")
        echo -e "${RED}[FAIL] Unit tests ($failed_count test suite(s) failing)${NC}"
        echo -e "\n${YELLOW}Failed test suites:${NC}"
        echo "$test_output" | grep -oP "FAIL\s+\K.+\.test\.js" | head -n 10 | while read -r line; do
            echo -e "${RED}  - $line${NC}"
        done
    else
        echo -e "${RED}[FAIL] Unit tests${NC}"
    fi
    failed_checks+=("Unit Tests")
fi

# Summary
echo -e "\n${CYAN}========================================"
echo -e "   SUMMARY"
echo -e "========================================${NC}"

if [ ${#failed_checks[@]} -eq 0 ]; then
    echo -e "\n${GREEN}[SUCCESS] ALL CHECKS PASSED! Safe to release.${NC}"
    echo -e "\nYou can now proceed with:"
    echo -e "${CYAN}  git tag v<version>${NC}"
    echo -e "${CYAN}  git push origin v<version>${NC}"
    exit 0
else
    echo -e "\n${RED}[FAILURE] ${#failed_checks[@]} CHECK(S) FAILED:${NC}"
    for check in "${failed_checks[@]}"; do
        echo -e "${RED}  - $check${NC}"
    done
    echo -e "\n${YELLOW}WARNING: DO NOT RELEASE until all checks pass!${NC}"
    echo -e "${YELLOW}Fix the issues above and run this script again.${NC}"
    exit 1
fi
