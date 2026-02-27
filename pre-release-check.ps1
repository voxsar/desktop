#!/usr/bin/env pwsh
# Pre-Release Checklist Script
# Run this before creating/pushing any GitHub tags to ensure all CI checks pass

$ErrorActionPreference = "Stop"
$failedChecks = @()

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "   PRE-RELEASE CI CHECKS" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Check 1: ESLint
Write-Host "[1/5] Running ESLint..." -ForegroundColor Yellow
try {
    npm run lint:js-quiet 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ ESLint passed" -ForegroundColor Green
    } else {
        Write-Host "✗ ESLint failed" -ForegroundColor Red
        $failedChecks += "ESLint"
    }
} catch {
    Write-Host "✗ ESLint failed: $_" -ForegroundColor Red
    $failedChecks += "ESLint"
}

# Check 2: TypeScript Type Checking
Write-Host "`n[2/5] Running TypeScript type checking..." -ForegroundColor Yellow
try {
    npm run check-types 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ TypeScript types passed" -ForegroundColor Green
    } else {
        Write-Host "✗ TypeScript types failed" -ForegroundColor Red
        $failedChecks += "TypeScript"
    }
} catch {
    Write-Host "✗ TypeScript types failed: $_" -ForegroundColor Red
    $failedChecks += "TypeScript"
}

# Check 3: i18n Extraction and Validation
Write-Host "`n[3/5] Running i18n extraction and validation..." -ForegroundColor Yellow
try {
    npm run i18n-extract -- --desktop-dir . 2>&1 | Out-Null
    $diff = git --no-pager diff --exit-code i18n/en.json 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ i18n strings are up to date" -ForegroundColor Green
    } else {
        Write-Host "✗ i18n strings are out of sync - i18n/en.json has uncommitted changes" -ForegroundColor Red
        Write-Host "  Run: npm run i18n-extract -- --desktop-dir ." -ForegroundColor Yellow
        Write-Host "  Then commit the changes to i18n/en.json" -ForegroundColor Yellow
        $failedChecks += "i18n"
    }
} catch {
    Write-Host "✗ i18n check failed: $_" -ForegroundColor Red
    $failedChecks += "i18n"
}

# Check 4: Build Config
Write-Host "`n[4/5] Checking build configuration..." -ForegroundColor Yellow
try {
    npm run check-build-config 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Build config passed" -ForegroundColor Green
    } else {
        Write-Host "✗ Build config failed" -ForegroundColor Red
        $failedChecks += "Build Config"
    }
} catch {
    Write-Host "✗ Build config failed: $_" -ForegroundColor Red
    $failedChecks += "Build Config"
}

# Check 5: Unit Tests
Write-Host "`n[5/5] Running unit tests (this may take a while)..." -ForegroundColor Yellow
$testOutput = npm run test:unit 2>&1 | Out-String
$testsPassed = $testOutput -match "Tests:\s+(\d+) failed"
$failedCount = if ($matches) { [int]$matches[1] } else { 0 }

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ All unit tests passed" -ForegroundColor Green
} else {
    Write-Host "✗ Unit tests failed: $failedCount test(s) failing" -ForegroundColor Red
    # Extract failed test names
    $failedTests = $testOutput | Select-String -Pattern "● (.*)" | ForEach-Object { $_.Matches.Groups[1].Value }
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
