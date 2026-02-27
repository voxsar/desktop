# Pre-Release Checklist Script for Windows
# Run this before creating/pushing any GitHub tags to ensure all CI checks pass

$ErrorActionPreference = "Continue"
$failedChecks = @()

Write-Host ""
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host "   PRE-RELEASE CI CHECKS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check 1: ESLint
Write-Host "[1/5] Running ESLint..." -ForegroundColor Yellow
npm run lint:js-quiet *> $null
if ($LASTEXITCODE -eq 0) {
    Write-Host "[PASS] ESLint" -ForegroundColor Green
} else {
    Write-Host "[FAIL] ESLint" -ForegroundColor Red
    $failedChecks += "ESLint"
}

# Check 2: TypeScript Type Checking
Write-Host ""
Write-Host "[2/5] Running TypeScript type checking..." -ForegroundColor Yellow
npm run check-types *> $null
if ($LASTEXITCODE -eq 0) {
    Write-Host "[PASS] TypeScript types" -ForegroundColor Green
} else {
    Write-Host "[FAIL] TypeScript types" -ForegroundColor Red
    $failedChecks += "TypeScript"
}

# Check 3: i18n Extraction and Validation
Write-Host ""
Write-Host "[3/5] Running i18n extraction and validation..." -ForegroundColor Yellow
npm run i18n-extract -- --desktop-dir . *> $null
git --no-pager diff --exit-code i18n/en.json *> $null
if ($LASTEXITCODE -eq 0) {
    Write-Host "[PASS] i18n strings are up to date" -ForegroundColor Green
} else {
    Write-Host "[FAIL] i18n strings are out of sync" -ForegroundColor Red
    Write-Host "  Run: npm run i18n-extract -- --desktop-dir ." -ForegroundColor Yellow
    Write-Host "  Then commit the changes to i18n/en.json" -ForegroundColor Yellow
    $failedChecks += "i18n"
}

# Check 4: Build Config
Write-Host ""
Write-Host "[4/5] Checking build configuration..." -ForegroundColor Yellow
npm run check-build-config *> $null
if ($LASTEXITCODE -eq 0) {
    Write-Host "[PASS] Build config" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Build config" -ForegroundColor Red
    $failedChecks += "Build Config"
}

# Check 5: Unit Tests
Write-Host ""
Write-Host "[5/5] Running unit tests (this may take a while)..." -ForegroundColor Yellow
$testOutput = npm run test:unit 2>&1 | Out-String
$testExitCode = $LASTEXITCODE

if ($testExitCode -eq 0) {
    Write-Host "[PASS] All unit tests" -ForegroundColor Green
} else {
    if ($testOutput -match "Test Suites:\s+(\d+)\s+failed") {
        $failedSuites = $matches[1]
        Write-Host "[FAIL] Unit tests ($failedSuites test suite(s) failing)" -ForegroundColor Red
    } else {
        Write-Host "[FAIL] Unit tests" -ForegroundColor Red
    }
    
    # Extract and display first few failed tests
    $failedTests = $testOutput | Select-String -Pattern "FAIL\s+(.+\.test\.js)" | ForEach-Object { $_.Matches.Groups[1].Value.Trim() } | Select-Object -Unique
    if ($failedTests) {
        Write-Host ""
        Write-Host "Failed test suites:" -ForegroundColor Yellow
        $failedTests | Select-Object -First 10 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
        if ($failedTests.Count -gt 10) {
            Write-Host "  ... and $($failedTests.Count - 10) more" -ForegroundColor Red
        }
    }
    $failedChecks += "Unit Tests"
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($failedChecks.Count -eq 0) {
    Write-Host ""
    Write-Host "[SUCCESS] ALL CHECKS PASSED! Safe to release." -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now proceed with:" -ForegroundColor White
    Write-Host "  git tag v<version>" -ForegroundColor Cyan
    Write-Host "  git push origin v<version>" -ForegroundColor Cyan
    exit 0
} else {
    Write-Host ""
    Write-Host "[FAILURE] $($failedChecks.Count) CHECK(S) FAILED:" -ForegroundColor Red
    $failedChecks | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "WARNING: DO NOT RELEASE until all checks pass!" -ForegroundColor Yellow
    Write-Host "Fix the issues above and run this script again." -ForegroundColor Yellow
    exit 1
}
