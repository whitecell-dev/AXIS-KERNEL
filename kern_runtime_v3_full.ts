#!/usr/bin/env ts-node

/**
 * 🧠 KERN v3 Full Runtime - PHASE 1 HARDENING
 * Deterministic Execution Engine with:
 *   ✅ Schema validation
 *   ✅ Invariant checks with violation tracking
 *   ✅ Metrics snapshot
 *   ✅ Configurable error handling
 *   ✅ CLI wrapper
 */

import fs from "fs";
import path from "path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import crypto from "crypto";
import { performance } from "perf_hooks";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

// ================================================================
// I. LOAD & VALIDATE SYSTEM MANIFEST INSTANCE
// ================================================================

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const SCHEMA_DIR = path.resolve("./kern_schemas");

// Load the schema (definition)
const manifestSchemaPath = path.join(SCHEMA_DIR, "v3_systemmanifest.json");
const manifestSchema = JSON.parse(fs.readFileSync(manifestSchemaPath, "utf-8"));
const validateManifest = ajv.compile(manifestSchema);

// Load the actual instance
const manifestInstancePath = path.resolve("./systemmanifest_instance.json");
const manifestInstance = JSON.parse(fs.readFileSync(manifestInstancePath, "utf-8"));

if (!validateManifest(manifestInstance)) {
  console.error("❌ Manifest validation errors:", validateManifest.errors);
  process.exit(1);
}
console.log("✅ Manifest instance validated successfully.");

// ================================================================
// II. LOAD COMPONENT SCHEMAS
// ================================================================

function loadSchema(file: string) {
  const fullPath = path.join(SCHEMA_DIR, file);
  return JSON.parse(fs.readFileSync(fullPath, "utf-8"));
}

const primitivesSchema = loadSchema("v3_primitives.json");
const invariantSchema = loadSchema("v3_invariant.json");
const metricsSchema = loadSchema("v3_metrics.json");
console.log("🧩 All component schemas loaded.\n");

// ================================================================
// III. UTILITIES
// ================================================================

const timestamp = () => new Date().toISOString();

function hashState(state: any): string {
  return crypto.createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ================================================================
// IV. PRIMITIVE LIBRARY
// ================================================================

// ================================================================
// IV. PRIMITIVE LIBRARY
// ================================================================

const PrimitiveLibrary: Record<string, (input: any, context: any) => any> = {
  CONDITION_EVALUATOR: (input) => {
    try {
      const fn = new Function("input", `with(input){ return (${input.condition}); }`);
      return { result: !!fn(input.context || {}) };
    } catch (err: any) {
      return { result: false, error: err.message };
    }
  },

  EXPRESSION_EVALUATOR: (input) => {
    try {
      const fn = new Function("input", `with(input){ return (${input.expression}); }`);
      const value = fn(input.context || {});

      // 🔍 SYNTHETIC VIOLATION: NaN detection
      if (typeof value === 'number' && Number.isNaN(value)) {
        return { value, _violation: "NaN_detected" };
      }

      return { value };
    } catch (err: any) {
      return { error: err.message };
    }
  },

  STATE_MUTATOR: (input, context) => {
    const path = input["path"];
    const value = input["value"];

    if (!path || typeof path !== "string") {
      console.warn("⚠️ STATE_MUTATOR: Missing or invalid path", input);
      return { success: false, message: "Invalid or missing path" };
    }

    // 🔍 SYNTHETIC VIOLATION: Empty output check
    if (value === undefined || value === null) {
      return { success: false, _violation: "empty_output_detected" };
    }

    const keys = path.split(".");
    let obj: any = context.state;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!obj[key]) obj[key] = {};
      obj = obj[key];
    }
    obj[keys[keys.length - 1]] = value;

    return { success: true, updatedPath: path, newValue: value };
  },

  // 🔍 ADDED: Synthetic primitive that sometimes produces violations
  COMPOSITE_SCORER: (input) => {
    const scores = input.scores || [];
    if (scores.length === 0) {
      return { normalized_score: NaN, _violation: "empty_scores_array" };
    }

    const sum = scores.reduce((a: number, b: number) => a + b, 0);
    const normalized = sum / scores.length;

    // Sometimes produce NaN for testing
    if (input.trigger_nan_test) {
      return { normalized_score: NaN, _violation: "synthetic_NaN_test" };
    }

    return { normalized_score: normalized };
  },

  // 🧩 KERN Primitive Library Extension: RULE_APPLICATOR
  RULE_APPLICATOR: (input, context) => {
    const { ruleId, condition, assignments, enabled, priority } = input;

    if (!enabled) {
        return {
            skipped: true,
            reason: 'Rule disabled',
            ruleId
        };
    }

    // Evaluate condition if present
    if (condition && condition !== "true") {
        try {
            // Create a safe evaluation context
            const evalContext = { ...context.state };
            const conditionFn = new Function("context", `with(context){ return (${condition}); }`);
            const conditionResult = conditionFn(evalContext);

            if (!conditionResult) {
                return {
                    skipped: true,
                    reason: 'Condition not met',
                    condition,
                    ruleId
                };
            }
        } catch (err: any) {
            return {
                error: `Condition evaluation failed: ${err.message}`,
                condition,
                ruleId
            };
        }
    }

    // Apply assignments
    const results = {};
    const updates = [];

    for (const [fieldPath, expression] of Object.entries(assignments || {})) {
        try {
            let value;

            // Handle template expressions {{...}}
            if (typeof expression === 'string' && expression.startsWith('{{') && expression.endsWith('}}')) {
                const templateExpr = expression.slice(2, -2).trim();
                const evalContext = { ...context.state };

                // Add utility functions to context
                evalContext.Math = Math;
                evalContext.Number = Number;
                evalContext.now = () => new Date().toISOString();
                evalContext.uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    const r = Math.random() * 16 | 0;
                    const v = c == 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });

                const exprFn = new Function("context", `with(context){ return (${templateExpr}); }`);
                value = exprFn(evalContext);
            } else {
                // Direct value assignment - handle type conversion
                if (expression === "true") {
                    value = true;
                } else if (expression === "false") {
                    value = false;
                } else if (typeof expression === 'string' && !isNaN(Number(expression)) && expression !== "") {
                    value = Number(expression);
                } else {
                    value = expression;
                }
            }

            // Apply the assignment to state
            const pathParts = fieldPath.split('.');
            let obj = context.state;

            // Navigate to the parent object
            for (let i = 0; i < pathParts.length - 1; i++) {
                const part = pathParts[i];
                if (!obj[part]) {
                    obj[part] = {};
                }
                obj = obj[part];
            }

            // Set the final value
            const finalKey = pathParts[pathParts.length - 1];
            obj[finalKey] = value;

            updates.push({ field: fieldPath, value });
            results[fieldPath] = value;

        } catch (err: any) {
            return {
                error: `Assignment failed for ${fieldPath}: ${err.message}`,
                expression,
                fieldPath,
                ruleId
            };
        }
    }

    return {
        success: true,
        ruleId,
        priority,
        updatesApplied: updates.length,
        updates,
        results
    };
  }, // <-- The new primitive ends here
};
// ================================================================
// V. KERN EXECUTION ENGINE - HARDENED VERSION
// ================================================================

interface RuntimeOptions {
  haltOnError?: boolean;
  collectAllViolations?: boolean;
  logLevel?: 'verbose' | 'normal' | 'quiet';
}

class KernRuntime {
  private state: Record<string, any> = {};
  private ledger: any[] = [];
  private auditTrail: any[] = [];
  private tick = 0;
  private metrics = {
    primitiveCounts: {} as Record<string, number>,
    invariantViolations: 0,
    checksPassed: 0,
    checksSkipped: 0,
    violationsByType: {} as Record<string, number>,
  };
  private invariantBindings: Record<string, string[]>;
  private options: Required<RuntimeOptions>;

  constructor(
    private plan: any, 
    private manifest: any, 
    invariantSchema: any,
    options: RuntimeOptions = {}
  ) {
    this.invariantBindings = invariantSchema.contracts?.primitiveBindings || {};
    this.options = {
      haltOnError: options.haltOnError ?? false,
      collectAllViolations: options.collectAllViolations ?? true,
      logLevel: options.logLevel ?? 'normal',
    };
  }

  async execute(initialState: Record<string, any>) {
    this.state = deepClone(initialState);
    const start = performance.now();

    console.log("🚀 Starting deterministic execution...");
    console.log(`   Mode: ${this.options.haltOnError ? 'HALT_ON_ERROR' : 'CONTINUE_ON_ERROR'}`);
    console.log(`   Log Level: ${this.options.logLevel}\n`);

    for (const step of this.plan.transformation_pipeline || this.plan) {
      this.tick++;

      const primitiveFn = PrimitiveLibrary[step.primitive];
      if (!primitiveFn) {
        this.recordViolation(`Unknown primitive: ${step.primitive}`, step.primitive, {});
        if (this.options.haltOnError) break;
        continue;
      }

      const inputs: Record<string, any> = {};
      for (const f of step.input_fields || []) inputs[f] = this.resolve(f);
	  
      const params = step.params || {};
      const combinedInputs = { ...inputs, ...params };      

      const output = primitiveFn(combinedInputs, this);

      // 🔍 Check for synthetic violations in output
      if (output && output._violation) {
        this.recordViolation(
          `Synthetic violation: ${output._violation}`,
          step.primitive,
          combinedInputs,
          output
        );
      }

      // 🔍 Additional invariant checks
      this.runCustomInvariants(step.primitive, output, combinedInputs);

      this.applyOutputs(step.output_fields || [], output);

      this.metrics.primitiveCounts[step.primitive] =
        (this.metrics.primitiveCounts[step.primitive] || 0) + 1;

      // 🔍 Run schema-bound invariants
      const boundChecks = this.invariantBindings[step.primitive] || [];
      for (const check of boundChecks) {
        const passed = this.runInvariant(check, output);
        if (!passed) {
          this.metrics.invariantViolations++;
          this.recordViolation(`Schema invariant failed: ${check}`, step.primitive, combinedInputs, output);
        } else {
          this.metrics.checksPassed++;
        }
      }

      this.appendLedgerEntry(step.primitive, combinedInputs, output);
      
      if (this.options.logLevel === 'verbose') {
        console.log(`Tick ${this.tick}: ${step.id} (${step.primitive})`);
        console.log(`  → Input:`, combinedInputs);
        console.log(`  → Output:`, output);
      } else {
        console.log(`Tick ${this.tick}: ${step.id} (${step.primitive}) →`, 
          output._violation ? `❌ VIOLATION: ${output._violation}` : '✅ Success');
      }

      // Halt if configured and violations detected
      if (this.options.haltOnError && this.metrics.invariantViolations > 0) {
        console.log(`\n🛑 Halting execution due to violation (haltOnError=true)`);
        break;
      }
    }

    const totalDuration = Math.round(performance.now() - start);
    console.log(`\n✅ Execution complete in ${totalDuration}ms`);

    const metricsSnapshot = this.generateMetricsSnapshot(totalDuration);
    fs.writeFileSync("./metrics_snapshot.json", JSON.stringify(metricsSnapshot, null, 2));

    return {
      state: this.state,
      ledger: this.ledger,
      auditTrail: this.auditTrail,
      metrics: metricsSnapshot,
      proof: {
        ticks: this.tick,
        finalHash: hashState(this.state),
        ledgerEntries: this.ledger.length,
        violations: this.metrics.invariantViolations,
        outcome: this.metrics.invariantViolations > 0 ? "violations_detected" : "clean_execution",
      },
    };
  }

  private recordViolation(message: string, primitive: string, input: any, output?: any) {
    const violation = {
      tick: this.tick,
      primitive,
      type: "InvariantViolation",
      message,
      inputSample: this.sampleData(input),
      outputSample: this.sampleData(output),
      timestamp: timestamp(),
    };
    
    this.auditTrail.push(violation);
    this.metrics.invariantViolations++;
    
    // Track by violation type
    const violationType = message.split(':')[0].trim();
    this.metrics.violationsByType[violationType] = 
      (this.metrics.violationsByType[violationType] || 0) + 1;
    
    // Also add to ledger for visibility
    this.ledger.push({
      id: crypto.randomUUID(),
      timestamp: timestamp(),
      operation: "VIOLATION_RECORDED",
      payload: violation,
      hash: hashState(violation),
    });
  }

  private sampleData(data: any): any {
    if (!data) return data;
    if (typeof data !== 'object') return data;
    
    const sampled: any = {};
    const keys = Object.keys(data).slice(0, 3); // Sample first 3 keys
    for (const key of keys) {
      sampled[key] = data[key];
    }
    return sampled;
  }

  private runCustomInvariants(primitive: string, output: any, input: any) {
    // NaN detection invariant
    if (output && typeof output.normalized_score === 'number' && Number.isNaN(output.normalized_score)) {
      this.recordViolation('NaN normalized_score detected', primitive, input, output);
    }
    
    // Empty output object invariant  
    if (!output || (typeof output === 'object' && Object.keys(output).length === 0)) {
      this.recordViolation('Empty output object', primitive, input, output);
    }
    
    // Error field invariant
    if (output && output.error) {
      this.recordViolation(`Primitive error: ${output.error}`, primitive, input, output);
    }
  }

  private resolve(pathStr: string): any {
    return pathStr.split(".").reduce((o, k) => (o ? o[k] : undefined), this.state);
  }

  private set(pathStr: string, value: any) {
    const parts = pathStr.split(".");
    let obj = this.state;
    while (parts.length > 1) {
      const k = parts.shift()!;
      if (!obj[k]) obj[k] = {};
      obj = obj[k];
    }
    obj[parts[0]] = value;
  }

  private applyOutputs(fields: string[], output: any) {
    for (const field of fields) {
      const key = field.split(".").pop()!;
      if (output[key] !== undefined) this.set(field, output[key]);
    }
  }

  private appendLedgerEntry(primitive: string, input: any, output: any) {
    const entry = {
      id: crypto.randomUUID(),
      timestamp: timestamp(),
      operation: primitive,
      payload: { input, output },
      hash: hashState({ input, output }),
    };
    this.ledger.push(entry);
  }

  private runInvariant(name: string, output: any): boolean {
    if (name === "stateProgress" && output?.success === false) return false;
    if (name === "consistencyCheck" && output?.newValue === undefined) return false;
    return true;
  }

  private generateMetricsSnapshot(durationMs: number) {
    return {
      snapshot: {
        runId: "run_" + Date.now(),
        timestamp: timestamp(),
        engineVersion: "3.1.0-hardened",
        timing: { durationMs },
        primitives: this.metrics.primitiveCounts,
        invariants: {
          violations: this.metrics.invariantViolations,
          violationsByType: this.metrics.violationsByType,
          checksPassed: this.metrics.checksPassed,
        },
        execution: {
          totalTicks: this.tick,
          haltedEarly: this.options.haltOnError && this.metrics.invariantViolations > 0,
          options: this.options,
        },
        outcome:
          this.metrics.invariantViolations > 0 ? "violation_detected" : "success",
      },
    };
  }
}

// ================================================================
// VI. CLI ENTRYPOINT WITH OPTIONS
// ================================================================

(async () => {
  const argv = await yargs(hideBin(process.argv))
    .option("input", { type: "string", demandOption: true })
    .option("plan", { type: "string", demandOption: true })
    .option("haltOnError", { type: "boolean", default: false })
    .option("collectAllViolations", { type: "boolean", default: true })
    .option("logLevel", { choices: ['verbose', 'normal', 'quiet'], default: 'normal' })
    .help()
    .argv;

  const inputPath = path.resolve(argv.input);
  const planPath = path.resolve(argv.plan);

  const inputData = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const planData = JSON.parse(fs.readFileSync(planPath, "utf-8"));

  const engine = new KernRuntime(
    planData, 
    manifestInstance, 
    invariantSchema,
    {
      haltOnError: argv.haltOnError,
      collectAllViolations: argv.collectAllViolations,
      logLevel: argv.logLevel,
    }
  );
  
  const result = await engine.execute(inputData);

  fs.mkdirSync("./audit", { recursive: true });
  fs.writeFileSync("./audit/mneme_ledger.json", JSON.stringify(result.ledger, null, 2));
  fs.writeFileSync("./audit/violations_audit.json", JSON.stringify(result.auditTrail, null, 2));

  console.log("\n📊 Final State:");
  console.log(JSON.stringify(result.state, null, 2));
  console.log("\n🔐 Verification Proof:");
  console.log(JSON.stringify(result.proof, null, 2));
  console.log("\n📈 Metrics Snapshot written to metrics_snapshot.json");
  console.log("📋 Violations Audit written to audit/violations_audit.json");
  
  if (result.metrics.snapshot.invariants.violations > 0) {
    console.log(`\n❌ Detected ${result.metrics.snapshot.invariants.violations} invariant violations:`);
    console.log(JSON.stringify(result.metrics.snapshot.invariants.violationsByType, null, 2));
  } else {
    console.log("\n✅ No invariant violations detected!");
  }
})();
