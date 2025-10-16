# AXIS-KERNEL

Deterministic business logic execution engine with cryptographic verification and complete audit trails.

## Overview

AXIS-KERNEL executes YAML-defined business rules against data inputs with deterministic, verifiable results. All executions are logged to SQLite for compliance and debugging.

## Architecture

```
YAML Rules → KERN v3 Engine → SQLite Database → Audit Trail
```

## Core Components

- **KERN v3 Runtime**: TypeScript execution engine with schema validation
- **YAML Bridge**: Converts business rules to executable JSON plans  
- **SQLite Persistence**: Stores execution history and audit trails
- **Docker Container**: Consistent deployment environment

## Quick Start

### Docker (Recommended)

```bash
# Initialize system
docker-compose up

# Execute against CSV data
docker-compose --profile batch up
```

### Local Development

```bash
# Install dependencies
npm install

# Initialize database
node src/integration-example.js init

# Execute single record
node src/integration-example.js execute mortgage-rules.yaml applicant.json

# Batch process CSV
node src/integration-example.js batch mortgage-rules.yaml applicants.csv
```

## Directory Structure

```
├── kern_runtime_v3_full.ts       # Main execution engine
├── systemmanifest_instance.json  # Runtime configuration
├── src/
│   ├── integration-example.js    # Primary entry point
│   ├── yaml_to_kern_bridge.js    # YAML → JSON converter
│   └── sqlite-persistence-layer.js # Database operations
├── rules/                        # YAML business logic
├── data/                         # Input datasets
├── kern_schemas/                 # JSON validation schemas
├── audit/                        # Execution audit files
└── database/                     # SQLite persistence
```

## Rule Definition

Rules are defined in YAML format:

```yaml
metadata:
  name: "business_rules"
  version: "1.0.0"
  domain: "finance"

rules:
  - name: "credit_check"
    priority: 100
    when: "credit_score >= 650"
    then:
      approved: true
      reason: "Good credit"
```

## Data Input

CSV format with headers:

```csv
name,credit_score,income
John Doe,720,75000
Jane Smith,580,45000
```

## Execution Output

Each execution produces:
- Final state with all applied transformations
- Cryptographic hash for verification
- Complete audit trail in SQLite
- Violation log if any invariants fail

## Database Schema

- `executions`: Execution metadata and results
- `rule_versions`: Versioned rule definitions
- `mneme_ledger`: Step-by-step execution log
- `invariant_violations`: Rule violations
- `execution_metrics`: Performance data
- `state_snapshots`: State at each execution tick

## Configuration

Environment variables:
- `NODE_ENV`: Runtime environment
- `DATABASE_PATH`: SQLite database location
- `LOG_LEVEL`: Logging verbosity
- `HALT_ON_ERROR`: Stop on first error

## API

### CLI Commands

```bash
# Initialize system
node src/integration-example.js init

# Execute single record
node src/integration-example.js execute <rules.yaml> <data.json>

# Batch process
node src/integration-example.js batch <rules.yaml> <data.csv>
```

### Docker Profiles

```bash
# Initialization
docker-compose up

# Single execution
docker-compose --profile execute up

# Batch processing  
docker-compose --profile batch up
```

## Requirements

- Node.js 18+
- SQLite 3
- Docker (optional)

## Dependencies

- ajv: JSON schema validation
- js-yaml: YAML parsing
- sqlite3: Database operations
- typescript: Runtime compilation
- yargs: CLI argument parsing

## License

MIT
