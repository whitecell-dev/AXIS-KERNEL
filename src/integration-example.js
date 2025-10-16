#!/usr/bin/env node

/**
 * KERN v3 Integration Example - FIXED VERSION
 * Direct YAML to KERN v3 pipeline with SQLite persistence
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

// Check if modules exist before requiring
const loadOptionalModule = (modulePath, fallback = null) => {
  try {
    return require(modulePath);
  } catch (error) {
    console.warn(`⚠️  Optional module not found: ${modulePath}`);
    return fallback;
  }
};

// Load modules with fallback
const YamlToKernBridge = loadOptionalModule('./yaml_to_kern_bridge');
const KernSqlitePersistence = loadOptionalModule('./sqlite-persistence-layer');

class KernIntegrationEngine {
  constructor(options = {}) {
    this.dbPath = options.dbPath || './database/kern_state.db';
    this.rulesDir = options.rulesDir || './rules';
    this.dataDir = options.dataDir || './data';
    this.outputDir = options.outputDir || './output';
    
    // Initialize optional components
    this.yamlBridge = YamlToKernBridge ? new YamlToKernBridge() : null;
    this.persistence = (options.useSqlite && KernSqlitePersistence) ? 
      new KernSqlitePersistence(this.dbPath) : null;
    
    this.isInitialized = false;
    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.rulesDir, this.dataDir, this.outputDir, './exports', './temp', './database'].forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
  }

  /**
   * Initialize the system
   */
  async initialize() {
    if (!this.isInitialized) {
      if (this.persistence) {
        await this.persistence.initialize();
      }
      this.isInitialized = true;
      console.log('🎯 KERN Integration Engine initialized');
    }
  }

  /**
   * Execute YAML pipeline if YAML bridge is available
   */
  async executeYamlPipeline(yamlFile, inputData, options = {}) {
    if (!this.yamlBridge) {
      throw new Error('YAML bridge not available - ensure yaml_to_kern_bridge.js exists');
    }

    await this.initialize();
    
    const executionId = this.generateExecutionId();
    console.log(`\n🚀 Starting execution pipeline: ${executionId}`);
    
    try {
      // Step 1: Convert YAML to KERN format
      console.log('\n📋 Step 1: Converting YAML to KERN format...');
      const yamlPath = path.join(this.rulesDir, yamlFile);
      
      if (!fs.existsSync(yamlPath)) {
        throw new Error(`YAML file not found: ${yamlPath}`);
      }
      
      const conversion = this.yamlBridge.convert(yamlPath);
      
      // Step 2: Prepare input
      console.log('\n🔧 Step 2: Preparing execution...');
      const inputPath = path.join('./temp', `input_${executionId}.json`);
      fs.writeFileSync(inputPath, JSON.stringify(inputData, null, 2));
      
      // Step 3: Execute with KERN v3
      console.log('\n⚡ Step 3: Executing with KERN v3...');
      const result = await this.executeKernEngine(conversion.outputPath, inputPath, options);
      
      // Step 4: Store results if persistence available
      if (this.persistence) {
        console.log('\n💾 Step 4: Storing results...');
        await this.storeExecution(executionId, conversion, inputData, result);
      }
      
      // Step 5: Generate report
      const report = this.generateExecutionReport(executionId, result, conversion);
      
      // Cleanup
      fs.unlinkSync(inputPath);
      
      console.log(`\n🎯 Pipeline completed successfully!`);
      console.log(`   Execution ID: ${executionId}`);
      console.log(`   Final Hash: ${result.proof?.finalHash || 'N/A'}`);
      
      return {
        executionId,
        result,
        report,
        conversion
      };
      
    } catch (error) {
      console.error(`❌ Pipeline failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute KERN v3 engine as subprocess
   */
  async executeKernEngine(planPath, inputPath, options = {}) {
    return new Promise((resolve, reject) => {
      const args = [
        './kern_runtime_v3_full.ts',
        '--input', inputPath,
        '--plan', planPath,
        '--logLevel', options.logLevel || 'normal'
      ];
      
      if (options.haltOnError) args.push('--haltOnError');
      
      console.log(`   Running: ts-node ${args.join(' ')}`);
      
      const kernProcess = spawn('ts-node', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });
      
      let stdout = '';
      let stderr = '';
      
      kernProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        if (options.logLevel !== 'quiet') {
          process.stdout.write(output);
        }
      });
      
      kernProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      kernProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = this.parseKernOutput(stdout);
            resolve(result);
          } catch (parseError) {
            reject(new Error(`Failed to parse KERN output: ${parseError.message}`));
          }
        } else {
          reject(new Error(`KERN execution failed (code ${code}): ${stderr}`));
        }
      });
      
      kernProcess.on('error', (error) => {
        reject(new Error(`Failed to start KERN process: ${error.message}`));
      });
    });
  }

  /**
   * Parse KERN v3 output
   */
  parseKernOutput(stdout) {
    try {
      // Extract final state
      const finalStateMatch = stdout.match(/📊 Final State:\s*(\{[\s\S]*?\})\s*🔍/);
      const finalState = finalStateMatch ? JSON.parse(finalStateMatch[1]) : {};
      
      // Extract verification proof
      const proofMatch = stdout.match(/🔍 Verification Proof:\s*(\{[\s\S]*?\})/);
      const proof = proofMatch ? JSON.parse(proofMatch[1]) : {};
      
      // Extract execution time
      const timeMatch = stdout.match(/complete in (\d+)ms/);
      const executionTime = timeMatch ? parseInt(timeMatch[1]) : 0;
      
      return {
        finalState,
        proof,
        executionTime,
        rawOutput: stdout
      };
      
    } catch (error) {
      // Fallback if parsing fails
      console.warn(`⚠️  Failed to parse KERN output, using fallback`);
      return {
        finalState: {},
        proof: { outcome: 'parse_error' },
        executionTime: 0,
        rawOutput: stdout,
        parseError: error.message
      };
    }
  }

  /**
   * Store execution in database
   */
  async storeExecution(executionId, conversion, inputData, result) {
    if (!this.persistence) return;
    
    try {
      const ruleVersion = await this.persistence.storeRuleVersion(conversion.kernData);
      await this.persistence.startExecution(executionId, ruleVersion.id, inputData);
      await this.persistence.completeExecution(executionId, result.finalState, {
        actualIterations: result.proof?.ticks || 0,
        violationsCount: 0
      });
    } catch (error) {
      console.warn(`⚠️  Failed to store execution: ${error.message}`);
    }
  }

  /**
   * Generate execution report
   */
  generateExecutionReport(executionId, result, conversion) {
    const report = {
      executionId,
      timestamp: new Date().toISOString(),
      summary: {
        finalHash: result.proof?.finalHash || 'unknown',
        executionTime: result.executionTime,
        outcome: result.proof?.outcome || 'completed'
      },
      conversion: conversion ? {
        rulesCount: conversion.summary?.rulesCount || 0,
        version: conversion.summary?.version || 'unknown',
        hash: conversion.hash
      } : null
    };
    
    // Save report
    const reportPath = path.join(this.outputDir, `execution_${executionId}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`📊 Execution report saved: ${reportPath}`);
    return report;
  }

  /**
   * Load CSV data
   */
  loadCsvData(filename) {
    const csvPath = path.join(this.dataDir, filename);
    
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found: ${csvPath}`);
    }
    
    const content = fs.readFileSync(csvPath, 'utf8');
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

  /**
   * Batch process CSV data
   */
  async batchProcess(yamlFile, csvFile, options = {}) {
    const records = this.loadCsvData(csvFile);
    console.log(`\n📦 Batch processing ${records.length} records...`);
    
    const results = [];
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      console.log(`\n--- Processing Record ${i + 1}/${records.length}: ${record.name || record.id || `Record ${i + 1}`} ---`);
      
      try {
        const result = await this.executeYamlPipeline(yamlFile, record, options);
        results.push({
          recordIndex: i,
          record,
          success: true,
          executionId: result.executionId
        });
      } catch (error) {
        console.error(`❌ Record ${i + 1} failed: ${error.message}`);
        results.push({
          recordIndex: i,
          record,
          success: false,
          error: error.message
        });
      }
    }
    
    const summary = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    };
    
    console.log(`\n📈 Batch processing complete!`);
    console.log(`   Total: ${summary.total}`);
    console.log(`   Successful: ${summary.successful}`);
    console.log(`   Failed: ${summary.failed}`);
    
    return { results, summary };
  }

  generateExecutionId() {
    return 'exec_' + crypto.randomBytes(6).toString('hex');
  }

  async close() {
    if (this.persistence) {
      await this.persistence.close();
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const engine = new KernIntegrationEngine({ useSqlite: true });

  try {
    if (args[0] === 'execute') {
      const yamlFile = args[1];
      const dataFile = args[2];
      
      if (!yamlFile || !dataFile) {
        console.log('Usage: node integration-example.js execute <rules.yaml> <data.json|data.csv>');
        return;
      }
      
      let inputData;
      if (dataFile.endsWith('.csv')) {
        const records = engine.loadCsvData(dataFile);
        inputData = records[0];
      } else {
        const dataPath = path.join(engine.dataDir, dataFile);
        inputData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      }
      
      const result = await engine.executeYamlPipeline(yamlFile, inputData);
      console.log(`\n📤 Final State:`, JSON.stringify(result.result.finalState, null, 2));
      
    } else if (args[0] === 'batch') {
      const yamlFile = args[1];
      const csvFile = args[2];
      
      if (!yamlFile || !csvFile) {
        console.log('Usage: node integration-example.js batch <rules.yaml> <data.csv>');
        return;
      }
      
      await engine.batchProcess(yamlFile, csvFile);
      
    } else if (args[0] === 'init') {
      await engine.initialize();
      console.log('✅ KERN Integration Engine initialized successfully!');
      
    } else {
      console.log(`
🎯 KERN Integration Engine

Commands:
  node integration-example.js init                        Initialize system
  node integration-example.js execute <rules.yaml> <data> Execute single record
  node integration-example.js batch <rules.yaml> <csv>   Batch process CSV

Examples:
  node integration-example.js init
  node integration-example.js execute mortgage-rules.yaml applicant.json
  node integration-example.js batch mortgage-rules.yaml applicants.csv

Features:
  ✅ YAML → KERN v3 conversion
  ✅ SQLite persistence with audit trails
  ✅ Deterministic execution
  ✅ Docker support
      `);
    }
  } finally {
    await engine.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = KernIntegrationEngine;
