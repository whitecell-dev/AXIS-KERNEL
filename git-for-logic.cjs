#!/usr/bin/env node

/**
 * Git for Logic - Minimal Example
 * Version control for business rules with deterministic execution
 */

const fs = require('fs');
const crypto = require('crypto');
const yaml = require('js-yaml');

class GitForLogic {
  constructor(rulesDir = './rules', dataDir = './data') {
    this.rulesDir = rulesDir;
    this.dataDir = dataDir;
    this.history = [];
    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.rulesDir, this.dataDir, './history'].forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
  }

  // Load YAML rules - human friendly format
  loadRules(filename) {
    const path = `${this.rulesDir}/${filename}`;
    const content = fs.readFileSync(path, 'utf8');
    return yaml.load(content);
  }

  // Simple rule evaluation - keeps it minimal
  evaluateCondition(condition, data) {
    try {
      // Basic condition evaluation - safely handles common patterns
      const safeEval = condition
        .replace(/(\w+\.?\w*)/g, (match) => {
          if (match.includes('.')) {
            return `data.${match}`;
          }
          return match;
        });
      return eval(safeEval);
    } catch (e) {
      console.warn(`Condition evaluation failed: ${condition}`, e.message);
      return false;
    }
  }

  // Execute rules on data - deterministic core
  execute(rulesFile, inputData) {
    const rules = this.loadRules(rulesFile);
    const startTime = Date.now();
    
    // Sort by priority (lower number = higher priority)
    const sortedRules = rules.rules.sort((a, b) => (a.priority || 999) - (b.priority || 999));
    
    let state = JSON.parse(JSON.stringify(inputData)); // Deep clone
    const appliedRules = [];
    const audit = [];

    console.log(`🚀 Executing rules from: ${rulesFile}`);
    console.log(`📊 Processing ${sortedRules.length} rules\n`);

    for (const rule of sortedRules) {
      const beforeState = JSON.stringify(state);
      
      if (this.evaluateCondition(rule.when, state)) {
        console.log(`✅ Applied: ${rule.name}`);
        appliedRules.push(rule.name);
        
        // Apply transformations
        for (const [key, value] of Object.entries(rule.then)) {
          this.setNestedValue(state, key, value);
        }
        
        // Track change
        audit.push({
          rule: rule.name,
          priority: rule.priority,
          condition: rule.when,
          changes: rule.then,
          timestamp: new Date().toISOString()
        });
      } else {
        console.log(`⏭️  Skipped: ${rule.name}`);
      }
    }

    const execution = {
      rulesFile,
      inputHash: this.hash(inputData),
      rulesHash: this.hash(rules),
      outputHash: this.hash(state),
      appliedRules,
      audit,
      finalState: state,
      metadata: {
        version: rules.metadata?.version || '1.0.0',
        description: rules.metadata?.description || '',
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    };

    // Create deterministic execution hash
    const executionHash = this.hash({
      input: execution.inputHash,
      rules: execution.rulesHash,
      output: execution.outputHash
    });
    
    execution.executionHash = executionHash;
    this.saveExecution(execution);
    
    console.log(`\n🔍 Execution Hash: ${executionHash}`);
    console.log(`⏱️  Completed in ${execution.metadata.executionTime}ms`);
    
    return execution;
  }

  // Utility to set nested values like "applicant.approval.status"
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  // Generate deterministic hash
  hash(data) {
    return crypto.createHash('sha256')
      .update(JSON.stringify(data, Object.keys(data).sort()))
      .digest('hex')
      .substring(0, 12); // Short hash for readability
  }

  // Save execution to history (like git commits)
  saveExecution(execution) {
    const filename = `./history/${execution.executionHash}.json`;
    fs.writeFileSync(filename, JSON.stringify(execution, null, 2));
    this.history.push(execution);
  }

  // Load CSV data (simple implementation)
  loadCsv(filename) {
    const path = `${this.dataDir}/${filename}`;
    const content = fs.readFileSync(path, 'utf8');
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = isNaN(values[i]) ? values[i] : Number(values[i]);
      });
      return obj;
    });
  }

  // Show execution history (like git log)
  showHistory() {
    console.log('📚 Execution History:\n');
    this.history.forEach((exec, i) => {
      console.log(`${i + 1}. ${exec.executionHash} - ${exec.metadata.timestamp}`);
      console.log(`   Rules: ${exec.rulesFile} (v${exec.metadata.version})`);
      console.log(`   Applied: ${exec.appliedRules.length} rules`);
      console.log(`   Duration: ${exec.metadata.executionTime}ms\n`);
    });
  }

  // Compare two executions (like git diff)
  diff(hash1, hash2) {
    const exec1 = JSON.parse(fs.readFileSync(`./history/${hash1}.json`, 'utf8'));
    const exec2 = JSON.parse(fs.readFileSync(`./history/${hash2}.json`, 'utf8'));
    
    console.log(`📊 Comparing ${hash1} vs ${hash2}\n`);
    console.log(`Rules Changed: ${exec1.rulesHash !== exec2.rulesHash ? 'YES' : 'NO'}`);
    console.log(`Output Changed: ${exec1.outputHash !== exec2.outputHash ? 'YES' : 'NO'}`);
    console.log(`Applied Rules Diff:`);
    
    const rules1 = new Set(exec1.appliedRules);
    const rules2 = new Set(exec2.appliedRules);
    
    const added = [...rules2].filter(r => !rules1.has(r));
    const removed = [...rules1].filter(r => !rules2.has(r));
    
    if (added.length) console.log(`  + ${added.join(', ')}`);
    if (removed.length) console.log(`  - ${removed.join(', ')}`);
    if (!added.length && !removed.length) console.log(`  No rule changes`);
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const engine = new GitForLogic();

  if (args[0] === 'execute') {
    // node git-for-logic.js execute mortgage-rules.yaml applicants.csv
    const rulesFile = args[1];
    const dataFile = args[2];
    
    if (!rulesFile || !dataFile) {
      console.log('Usage: node git-for-logic.js execute <rules.yaml> <data.csv>');
      return;
    }
    
    try {
      const data = engine.loadCsv(dataFile);
      console.log(`📁 Loaded ${data.length} records from ${dataFile}\n`);
      
      // Execute on each record
      data.forEach((record, i) => {
        console.log(`\n--- Processing Record ${i + 1}: ${record.name || record.id} ---`);
        const result = engine.execute(rulesFile, record);
        console.log(`📤 Final State:`, JSON.stringify(result.finalState, null, 2));
      });
      
    } catch (error) {
      console.error('❌ Execution failed:', error.message);
    }
    
  } else if (args[0] === 'history') {
    engine.showHistory();
    
  } else if (args[0] === 'diff') {
    // node git-for-logic.js diff <hash1> <hash2>
    const hash1 = args[1];
    const hash2 = args[2];
    
    if (!hash1 || !hash2) {
      console.log('Usage: node git-for-logic.js diff <hash1> <hash2>');
      return;
    }
    
    engine.diff(hash1, hash2);
    
  } else {
    console.log(`
🎯 Git for Logic - Version Control for Business Rules

Commands:
  execute <rules.yaml> <data.csv>  Execute rules on data
  history                          Show execution history
  diff <hash1> <hash2>            Compare executions

Examples:
  node git-for-logic.js execute mortgage-rules.yaml applicants.csv
  node git-for-logic.js history
  node git-for-logic.js diff a1b2c3d4 e5f6g7h8
    `);
  }
}

if (require.main === module) {
  main();
}

module.exports = GitForLogic;
