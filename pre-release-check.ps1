#!/usr/bin/env pwsh
# Pre-Release Checklist Script
# Run this before creating/pushing any GitHub tags to ensure all CI checks pass

$ErrorActionPreference = "Continue"
$failedChecks = @()

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "   PRE-RELEASE CI CHECKS" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Check 1: ESLint
Write-Host "[1/5] Running ESLint..." -ForegroundColor Yellow
$null = npm run lint:js-quiet 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ ESLint passed" -ForegroundColor Green
} else {
    Write-Host "✗ ESLint failed" -ForegroundColor Red
    $failedChecks += "ESLint"
}

# Check 2: TypeScript Type Checking
Write-Host "`n[2/5] Running TypeScript type checking..." -ForegroundColor Yellow
$null = npm run check-types 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ TypeScript types passed" -ForegroundColor Green
} else {
    Write-Host "✗ TypeScript types failed" -ForegroundColor Red
    $failedChecks += "TypeScript"
}

# Check 3: i18n Extraction and Validation
Write-Host "`n[3/5] Running i18n extraction and validation..." -ForegroundColor Yellow
$null = npm run i18n-extract -- --desktop-dir . 2>&1
$ErrorActionPreference = "Continue"
git --no-pager diff --exit-code i18n/en.json *> $null
$gitExitCode = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($gitExitCode -eq 0) {
    Write-Host "✓ i18n strings are up to date" -ForegroundColor Green
} else {
    Write-Host "✗ i18n strings are out of sync - i18n/en.json has uncommitted changes" -ForegroundColor Red
    Write-Host "  Run: npm run i18n-extract -- --desktop-dir ." -ForegroundColor Yellow
    Write-Host "  Then commit the changes to i18n/en.json" -ForegroundColor Yellow
    $failedChecks += "i18n"
}

# Check 4: Build Config
Write-Host "`n[4/5] Checking build configuration..." -ForegroundColor Yellow
$null = npm run check-build-config 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Build config passed" -ForegroundColor Green
} else {
    Write-Host "✗ Build config failed" -ForegroundColor Red
    $failedChecks += "Build Config"
}

# Check 5: Unit Tests
Write-Host "`n[5/5] Running unit tests (this may take a while)..." -ForegroundColor Yellow
$ErrorActionPreference = "Continue"
$testOutput = & npm run test:unit 2>&1 | Out-String
$testExitCode = $LASTEXITCODE
$ErrorActionPreference = "Stop"

if ($testExitCode -eq 0) {
    Write-Host "✓ All unit tests passed" -ForegroundColor Green
} else {
    # Parse the output for test results
    if ($testOutput -match "Test Suites:\s+(\d+)\s+failed") {
        $failedSuites = $matches[1]
        Write-Host "✗ Unit tests failed: $failedSuites test suite(s) failing" -ForegroundColor Red
    } else {
        Write-Host "✗ Unit tests failed" -ForegroundColor Red
    }
    
    # Extract and display first few failed tests
    $failedTests = $testOutput | Select-String -Pattern "●\s+(.+)" | ForEach-Object { $_.Matches.Groups[1].Value.Trim() } | Select-Object -Unique
    if ($failedTests) {
        Write-Host "`nFailed tests:" -ForegroundColor Yellow
        $failedTests | Select-Object -First 10 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
        if ($failedTests.Count -gt 10) {
            Write-Host "  ... and $($failedTests.Count - 10) more" -ForegroundColor Red
        }
    }
    $failedChecks += "Unit Tests"
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "   SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($failedChecks.Count -eq 0) {
    Write-Host "`n✓ ALL CHECKS PASSED! Safe to release." -ForegroundColor Green
    Write-Host "`nYou can now proceed with:" -ForegroundColor White
    Write-Host "  git tag v<version>" -ForegroundColor Cyan
    Write-Host "  git push origin v<version>" -ForegroundColor Cyan
    exit 0
} else {
    Write-Host "`n✗ $($failedChecks.Count) CHECK(S) FAILED:" -ForegroundColor Red
    $failedChecks | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host "`n⚠️  DO NOT RELEASE until all checks pass!" -ForegroundColor Yellow
    Write-Host "Fix the issues above and run this script again." -ForegroundColor Yellow
    exit 1
}
