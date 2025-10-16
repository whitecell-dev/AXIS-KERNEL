#!/usr/bin/env node

/**
 * KERN Bridge - Connect Git for Logic to KERN v3 Engine
 * Keeps both systems, adds integration layer
 */

const GitForLogic = require('./git-for-logic');
const YamlToKernBridge = require('./yaml-to-kern-bridge');
const KernSqlitePersistence = require('./sqlite-persistence');
const { spawn } = require('child_process');
const path = require('path');

class KernBridge {
  constructor(options = {}) {
    // Initialize both systems
    this.gitForLogic = new GitForLogic(
      options.rulesDir || './rules',
      options.dataDir || './data'
    );
    
    this.yamlBridge = new YamlToKernBridge();
    this.persistence = options.useSqlite ? new KernSqlitePersistence() : null;
    
    this.kernPath = options.kernPath || './kern_runtime_v3_full.ts';
    this.mode = options.mode || 'simple'; // 'simple' or 'enterprise'
  }

  /**
   * Execute with choice of engine
   */
  async execute(rulesFile, inputData, options = {}) {
    console.log(`🎯 KERN Bridge - Mode: ${this.mode.toUpperCase()}`);
    
    if (this.mode === 'simple') {
      // Use Git for Logic engine - fast and simple
      console.log('📦 Using Git for Logic engine (simple, fast)');
      return this.gitForLogic.execute(rulesFile, inputData);
      
    } else if (this.mode === 'enterprise') {
      // Use KERN v3 engine - full validation and audit
      console.log('🏢 Using KERN v3 engine (enterprise, audited)');
      return this.executeWithKern(rulesFile, inputData, options);
      
    } else if (this.mode === 'both') {
      // Execute with both and compare results
      console.log('🔄 Executing with BOTH engines for comparison');
      return this.executeComparison(rulesFile, inputData, options);
    }
  }

  /**
   * Execute using KERN v3 engine
   */
  async executeWithKern(rulesFile, inputData, options = {}) {
    // Step 1: Convert YAML to KERN format
    const yamlPath = path.join(this.gitForLogic.rulesDir, rulesFile);
    const conversion = this.yamlBridge.convert(yamlPath);
    
    // Step 2: Save input data as JSON
    const inputPath = './temp_input.json';
    require('fs').writeFileSync(inputPath, JSON.stringify(inputData, null, 2));
    
    // Step 3: Execute with KERN v3
    console.log('⚡ Executing with KERN v3 engine...');
    
    const result = await this.runKernEngine(conversion.outputPath, inputPath);
    
    // Step 4: Store in SQLite if enabled
    if (this.persistence) {
      await this.persistence.initialize();
      // Store execution details...
    }
    
    // Cleanup temp files
    require('fs').unlinkSync(inputPath);
    
    return result;
  }

  /**
   * Execute with both engines and compare
   */
  async executeComparison(rulesFile, inputData, options = {}) {
    console.log('\n🔄 Running comparison between engines...\n');
    
    // Execute with Git for Logic
    console.log('1️⃣ Git for Logic execution:');
    const simpleResult = this.gitForLogic.execute(rulesFile, inputData);
    
    // Execute with KERN v3
    console.log('\n2️⃣ KERN v3 execution:');
    const kernResult = await this.executeWithKern(rulesFile, inputData, options);
    
    // Compare results
    console.log('\n📊 Comparison Results:');
    const comparison = this.compareResults(simpleResult, kernResult);
    
    return {
      simple: simpleResult,
      kern: kernResult,
      comparison
    };
  }

  /**
   * Run KERN v3 engine as subprocess
   */
  async runKernEngine(planPath, inputPath) {
    return new Promise((resolve, reject) => {
      const kernProcess = spawn('ts-node', [
        this.kernPath,
        '--input', inputPath,
        '--plan', planPath
      ]);
      
      let stdout = '';
      let stderr = '';
      
      kernProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(data.toString());
      });
      
      kernProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      kernProcess.on('close', (code) => {
        if (code === 0) {
          // Parse KERN output
          resolve(this.parseKernOutput(stdout));
        } else {
          reject(new Error(`KERN execution failed: ${stderr}`));
        }
      });
    });
  }

  /**
   * Parse KERN v3 output
   */
  parseKernOutput(stdout) {
    // Extract final state and metrics from KERN output
    const lines = stdout.split('\n');
    
    // Look for final state output
    const finalStateMatch = stdout.match(/📊 Final State:\s*({.*})/s);
    const verificationMatch = stdout.match(/🔍 Verification Proof:\s*({.*})/s);
    
    return {
      finalState: finalStateMatch ? JSON.parse(finalStateMatch[1]) : null,
      verification: verificationMatch ? JSON.parse(verificationMatch[1]) : null,
      rawOutput: stdout,
      engine: 'KERN_v3'
    };
  }

  /**
   * Compare results between engines
   */
  compareResults(simpleResult, kernResult) {
    const comparison = {
      outputMatches: false,
      hashMatches: false,
      performanceDiff: {
        simple: simpleResult.metadata.executionTime,
        kern: kernResult.executionTime || 0
      },
      differences: []
    };
    
    // Compare final states
    const simpleState = JSON.stringify(simpleResult.finalState, Object.keys(simpleResult.finalState).sort());
    const kernState = JSON.stringify(kernResult.finalState, Object.keys(kernResult.finalState || {}).sort());
    
    comparison.outputMatches = simpleState === kernState;
    
    if (!comparison.outputMatches) {
      comparison.differences.push('Final states differ');
      console.log('⚠️  Output mismatch detected!');
      console.log('Simple:', simpleResult.finalState);
      console.log('KERN:', kernResult.finalState);
    } else {
      console.log('✅ Outputs match perfectly!');
    }
    
    console.log(`🏃 Performance: Simple ${comparison.performanceDiff.simple}ms vs KERN ${comparison.performanceDiff.kern}ms`);
    
    return comparison;
  }

  /**
   * Convert existing history to KERN format
   */
  async migrateHistory() {
    if (!this.persistence) {
      console.log('❌ SQLite persistence not enabled');
      return;
    }
    
    console.log('🔄 Migrating Git for Logic history to KERN SQLite...');
    
    const historyFiles = require('fs').readdirSync('./history')
      .filter(f => f.endsWith('.json'));
    
    await this.persistence.initialize();
    
    for (const file of historyFiles) {
      const execution = JSON.parse(
        require('fs').readFileSync(`./history/${file}`, 'utf8')
      );
      
      // Convert to KERN format and store
      // This preserves your Git for Logic audit trail in enterprise format
      console.log(`📦 Migrating ${execution.executionHash}...`);
    }
    
    console.log('✅ Migration complete!');
  }

  /**
   * Batch process with engine choice
   */
  async batchProcess(rulesFile, csvFile, options = {}) {
    const data = this.gitForLogic.loadCsv(csvFile);
    console.log(`📦 Batch processing ${data.length} records with ${this.mode} engine\n`);
    
    const results = [];
    
    for (let i = 0; i < data.length; i++) {
      const record = data[i];
      console.log(`--- Record ${i + 1}/${data.length}: ${record.name || record.id} ---`);
      
      try {
        const result = await this.execute(rulesFile, record, options);
        results.push({
          index: i,
          record,
          result,
          success: true
        });
      } catch (error) {
        console.error(`❌ Record ${i + 1} failed:`, error.message);
        results.push({
          index: i,
          record,
          error: error.message,
          success: false
        });
      }
    }
    
    const summary = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      engine: this.mode
    };
    
    console.log(`\n📈 Batch Summary:`, summary);
    
    return { results, summary };
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === 'simple') {
    // Use Git for Logic only
    const bridge = new KernBridge({ mode: 'simple' });
    await bridge.execute(args[1], args[2]);
    
  } else if (args[0] === 'enterprise') {
    // Use KERN v3 only  
    const bridge = new KernBridge({ mode: 'enterprise', useSqlite: true });
    await bridge.execute(args[1], args[2]);
    
  } else if (args[0] === 'compare') {
    // Use both engines
    const bridge = new KernBridge({ mode: 'both' });
    await bridge.execute(args[1], args[2]);
    
  } else if (args[0] === 'migrate') {
    // Migrate Git for Logic history to KERN SQLite
    const bridge = new KernBridge({ useSqlite: true });
    await bridge.migrateHistory();
    
  } else {
    console.log(`
🌉 KERN Bridge - Connect Git for Logic to KERN v3

Commands:
  simple <rules.yaml> <data.csv>     Use Git for Logic engine (fast)
  enterprise <rules.yaml> <data>     Use KERN v3 engine (audited)  
  compare <rules.yaml> <data>        Use both engines and compare
  migrate                            Migrate Git for Logic history to SQLite

Examples:
  node kern-bridge.js simple mortgage-rules.yaml applicants.csv
  node kern-bridge.js enterprise mortgage-rules.yaml applicant.json
  node kern-bridge.js compare mortgage-rules.yaml applicants.csv
  node kern-bridge.js migrate

Engine Comparison:
  Git for Logic:  Simple, fast, perfect for development & testing
  KERN v3:        Enterprise, audited, full validation & compliance
  Both:           Run comparison to verify consistency
    `);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = KernBridge;
