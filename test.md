
📦 Batch processing 4 records...

📋 Pre-Step: Converting YAML to KERN format for batch...
✅ KERN plan generated: rules/mortgage-rules-kern.json (Hash: d0d6491e7029)

--- Processing Record 1/4: John Doe ---

🚀 Starting execution: exec_284d5de7b445
🔧 Step 2: Preparing execution...
⚡ Step 3: Executing with KERN v3...
Running KERN with plan path: rules/mortgage-rules-kern.json
    Running: ts-node ./kern_runtime_v3_full.ts --input temp/input_exec_284d5de7b445.json --plan rules/mortgage-rules-kern.json --logLevel normal
✅ Manifest instance validated successfully.
🧩 All component schemas loaded.

🚀 Starting deterministic execution...
   Mode: CONTINUE_ON_ERROR
   Log Level: normal


✅ Execution complete in 1ms

📊 Final State:
{
  "name": "John Doe",
  "credit_score": 620,
  "annual_income": 45000,
  "debt_to_income_ratio": 0.45,
  "requested_loan_amount": 250000
}

🔐 Verification Proof:
{
  "ticks": 1,
  "finalHash": "9682fc7846647aee893f45e3a2742b53d1805c9970a895f6160e6d962d5745d7",
  "ledgerEntries": 1,
  "violations": 1,
  "outcome": "violations_detected"
}

📈 Metrics Snapshot written to metrics_snapshot.json
📋 Violations Audit written to audit/violations_audit.json

❌ Detected 1 invariant violations:
{
  "Unknown primitive": 1
}
⚠️ Step 4: Storing results skipped for this fix. Re-enable persistence logic later.
📊 Execution report saved: output/execution_exec_284d5de7b445.json
⚙️  Primitives executed: {}

--- Processing Record 2/4: Jane Smith ---

🚀 Starting execution: exec_6bfb999341ad
🔧 Step 2: Preparing execution...
⚡ Step 3: Executing with KERN v3...
Running KERN with plan path: rules/mortgage-rules-kern.json
    Running: ts-node ./kern_runtime_v3_full.ts --input temp/input_exec_6bfb999341ad.json --plan rules/mortgage-rules-kern.json --logLevel normal
✅ Manifest instance validated successfully.
🧩 All component schemas loaded.

🚀 Starting deterministic execution...
   Mode: CONTINUE_ON_ERROR
   Log Level: normal


✅ Execution complete in 1ms

📊 Final State:
{
  "name": "Jane Smith",
  "credit_score": 720,
  "annual_income": 75000,
  "debt_to_income_ratio": 0.35,
  "requested_loan_amount": 350000
}

🔐 Verification Proof:
{
  "ticks": 1,
  "finalHash": "84278ddf17f2e292d1ab5b1414d90f2a11b5f52c0098b052ac1bb3e607fe5e62",
  "ledgerEntries": 1,
  "violations": 1,
  "outcome": "violations_detected"
}

📈 Metrics Snapshot written to metrics_snapshot.json
📋 Violations Audit written to audit/violations_audit.json

❌ Detected 1 invariant violations:
{
  "Unknown primitive": 1
}
⚠️ Step 4: Storing results skipped for this fix. Re-enable persistence logic later.
📊 Execution report saved: output/execution_exec_6bfb999341ad.json
⚙️  Primitives executed: {}

--- Processing Record 3/4: Bob Johnson ---

🚀 Starting execution: exec_928b130d9403
🔧 Step 2: Preparing execution...
⚡ Step 3: Executing with KERN v3...
Running KERN with plan path: rules/mortgage-rules-kern.json
    Running: ts-node ./kern_runtime_v3_full.ts --input temp/input_exec_928b130d9403.json --plan rules/mortgage-rules-kern.json --logLevel normal
✅ Manifest instance validated successfully.
🧩 All component schemas loaded.

🚀 Starting deterministic execution...
   Mode: CONTINUE_ON_ERROR
   Log Level: normal


✅ Execution complete in 1ms

📊 Final State:
{
  "name": "Bob Johnson",
  "credit_score": 550,
  "annual_income": 35000,
  "debt_to_income_ratio": 0.5,
  "requested_loan_amount": 200000
}

🔐 Verification Proof:
{
  "ticks": 1,
  "finalHash": "485553d8186595727f017378fe66dd17894da746b5ef1f38cbed0bde63dd77a9",
  "ledgerEntries": 1,
  "violations": 1,
  "outcome": "violations_detected"
}

📈 Metrics Snapshot written to metrics_snapshot.json
📋 Violations Audit written to audit/violations_audit.json

❌ Detected 1 invariant violations:
{
  "Unknown primitive": 1
}
⚠️ Step 4: Storing results skipped for this fix. Re-enable persistence logic later.
📊 Execution report saved: output/execution_exec_928b130d9403.json
⚙️  Primitives executed: {}

--- Processing Record 4/4: Alice Williams ---

🚀 Starting execution: exec_fedff36f6eaf
🔧 Step 2: Preparing execution...
⚡ Step 3: Executing with KERN v3...
Running KERN with plan path: rules/mortgage-rules-kern.json
    Running: ts-node ./kern_runtime_v3_full.ts --input temp/input_exec_fedff36f6eaf.json --plan rules/mortgage-rules-kern.json --logLevel normal
✅ Manifest instance validated successfully.
🧩 All component schemas loaded.

🚀 Starting deterministic execution...
   Mode: CONTINUE_ON_ERROR
   Log Level: normal


✅ Execution complete in 1ms

📊 Final State:
{
  "name": "Alice Williams",
  "credit_score": 680,
  "annual_income": 65000,
  "debt_to_income_ratio": 0.25,
  "requested_loan_amount": 300000
}

🔐 Verification Proof:
{
  "ticks": 1,
  "finalHash": "326b0ec0c30a8905300cc8a7b338e218bf0566d50a647444332864a22681f6b2",
  "ledgerEntries": 1,
  "violations": 1,
  "outcome": "violations_detected"
}

📈 Metrics Snapshot written to metrics_snapshot.json
📋 Violations Audit written to audit/violations_audit.json

❌ Detected 1 invariant violations:
{
  "Unknown primitive": 1
}
⚠️ Step 4: Storing results skipped for this fix. Re-enable persistence logic later.
📊 Execution report saved: output/execution_exec_fedff36f6eaf.json
⚙️  Primitives executed: {}

📈 Batch processing complete!
    Total: 4
    Successful: 4
    Failed: 0
