# Apidog Report Exporter

Generate detailed HTML and JSON reports from Apidog test execution data.

## Features

- Merge all Apidog test result files
- Generate HTML reports
- Generate JSON reports
- Extract Request Body
- Extract Response Body
- Extract Response Headers
- Generate reusable cURL commands
- Sort reports by execution time
- Support Linux and Windows

## Folder Structure

```text
windows/
linux/
sample-output/
screenshots/
```

## Usage

### Windows

```bash
node windows/export_reports_recursive_for_win.js
```

### Linux

```bash
node linux/export_reports_recursive_fullstyle.js
```

## Generated Outputs

- merged_report.json
- apidog_report_summary.html

## Author

Ali Bahrampour