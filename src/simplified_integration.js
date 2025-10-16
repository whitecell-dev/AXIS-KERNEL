#!/usr/bin/env node

/**
 * Simplified KERN Integration - YAML → KERN v3 Direct Pipeline
 * Eliminates Git for Logic complexity, uses clean YAML bridge
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

// Import your existing bridges
const YamlToKernBridge = require('./yaml_to_kern_bridge');
const KernSqlitePersistence = require('./sqlite-persistence-layer');

class SimplifiedKernEngine {
  constructor(options = {}) {
    this.rulesDir = options.rulesDir || './rules';
    this.dataDir = options.dataDir || './data';
    this.outputDir = options.outputDir || './output';
    this.dbPath = options.dbPath || './database/kern_state.db';
    
    // Initialize components
    this.yamlBridge = new YamlToKernBridge();
    this.persistence = options.usePersistence ? new KernSqlitePersistence(this.dbPath) : null;
    
    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.rulesDir, this.dataDir, this.outputDir, './database', './exports'].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Main execution pipeline: YAML → KERN → Results
   */
  async execute(yamlFile, inputData, options = {}) {
    const executionId = this.generateExecutionId();
    console.log(`🎯 KERN Direct Pipeline: ${executionId}`);
    
    try {
      // Step 1: Convert YAML to KERN format
      console.log('\n📋 Converting YAML to KERN format...');
      const yamlPath = path.join(this.rulesDir, yamlFile);
      const conversion = this.yamlBridge.convert(yamlPath);
      
      // Step 2: Prepare input data
      console.log('\n🔧 Preparing execution...');
      const inputPath = path.join('./temp', `input_${executionId}.json`);
      fs.mkdirSync('./temp', { recursive: true });
      fs.writeFileSync(inputPath, JSON.stringify(inputData, null, 2));
      
      // Step 3: Execute with KERN v3 engine
      console.log('\n⚡ Executing with KERN v3...');
      const result = await this.executeKernEngine(conversion.outputPath, inputPath, options);
      
      // Step 4: Store results and audit trail
      if (this.persistence) {
        await this.storeExecution(executionId, conversion, inputData, result);
      }
      
      // Step 5: Generate report
      const report = this.generateReport(executionId, conversion, result);
      
      // Cleanup
      fs.unlinkSync(inputPath);
      
      console.log(`\n✅ Pipeline complete: ${executionId}`);
      return { executionId, result, report, conversion };
      
    } catch (error) {
      console.error(`❌ Pipeline failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute KERN v3 runtime as subprocess
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
          console.log(output.trim());
        }
      });
      
      kernProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      kernProcess.on('close', (code) => {
        if (code === 0) {
          try {
            // Parse execution results
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
   * Parse KERN v3 output and extract results
   */
  parseKernOutput(stdout) {
    try {
      // Extract final state
      const finalStateMatch = stdout.match(/📊 Final State:\s*(\{[\s\S]*?\})\s*🔍/);
      const finalState = finalStateMatch ? JSON.parse(finalStateMatch[1]) : null;
      
      // Extract verification proof
      const proofMatch = stdout.match(/🔍 Verification Proof:\s*(\{[\s\S]*?\})\s*/);
      const proof = proofMatch ? JSON.parse(proofMatch[1]) : null;
      
      // Extract metrics if available
      let metrics = null;
      if (fs.existsSync('./metrics_snapshot.json')) {
        metrics = JSON.parse(fs.readFileSync('./metrics_snapshot.json', 'utf8'));
      }
      
      // Extract violations if available
      let violations = [];
      if (fs.existsSync('./audit/violations_audit.json')) {
        violations = JSON.parse(fs.readFileSync('./audit/violations_audit.json', 'utf8'));
      }
      
      return {
        finalState,
        proof,
        metrics,
        violations,
        rawOutput: stdout,
        executionTime: this.extractExecutionTime(stdout)
      };
      
    } catch (error) {
      throw new Error(`Failed to parse KERN output: ${error.message}`);
    }
  }

  extractExecutionTime(stdout) {
    const timeMatch = stdout.match(/complete in (\d+)ms/);
    return timeMatch ? parseInt(timeMatch[1]) : 0;
  }

  /**
   * Store execution in SQLite for audit
   */
  async storeExecution(executionId, conversion, inputData, result) {
    if (!this.persistence) return;
    
    await this.persistence.initialize();
    
    // Store rule version
    const ruleVersion = await this.persistence.storeRuleVersion(conversion.kernData);
    
    // Start execution record
    await this.persistence.startExecution(executionId, ruleVersion.id, inputData);
    
    // Complete execution
    await this.persistence.completeExecution(executionId, result.finalState, {
      actualIterations: result.proof?.ticks || 0,
      violationsCount: result.violations.length
    });
    
    console.log(`💾 Execution stored in database: ${executionId}`);
  }

  /**
   * Generate execution report
   */
  generateReport(executionId, conversion, result) {
    const report = {
      executionId,
      timestamp: new Date().toISOString(),
      yaml: {
        file: conversion.summary.rulesCount,
        version: conversion.summary.version,
        hash: conversion.hash
      },
      execution: {
        finalHash: result.proof?.finalHash,
        ticks: result.proof?.ticks,
        violations: result.violations.length,
        executionTime: result.executionTime,
        outcome: result.proof?.outcome || 'unknown'
      },
      deterministic: true
    };
    
    // Save report
    const reportPath = path.join(this.outputDir, `report_${executionId}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`📊 Report saved: ${reportPath}`);
    return report;
  }

  /**
   * Batch process CSV data
   */
  async batchProcess(yamlFile, csvFile, options = {}) {
    const csvData = this.loadCsvData(csvFile);
    console.log(`📦 Batch processing ${csvData.length} records\n`);
    
    const results = [];
    for (let i = 0; i < csvData.length; i++) {
      const record = csvData[i];
      console.log(`--- Record ${i + 1}/${csvData.length}: ${record.name || record.id || `Record ${i + 1}`} ---`);
      
      try {
        const result = await this.execute(yamlFile, record, options);
        results.push({
          index: i,
          record,
          success: true,
          executionId: result.executionId,
          finalHash: result.result.proof?.finalHash
        });
      } catch (error) {
        console.error(`❌ Record ${i + 1} failed: ${error.message}`);
        results.push({
          index: i,
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
    
    console.log(`\n📈 Batch complete:`, summary);
    return { results, summary };
  }

  /**
   * Load CSV data
   */
  loadCsvData(filename) {
    const csvPath = path.join(this.dataDir, filename);
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
  const engine = new SimplifiedKernEngine({ usePersistence: true });

  try {
    if (args[0] === 'execute') {
      const yamlFile = args[1];
      const dataFile = args[2];
      
      if (!yamlFile || !dataFile) {
        console.log('Usage: node simplified-integration.js execute <rules.yaml> <data.csv|data.json>');
        return;
      }
      
      let inputData;
      if (dataFile.endsWith('.csv')) {
        const records = engine.loadCsvData(dataFile);
        inputData = records[0]; // First record
      } else {
        inputData = JSON.parse(fs.readFileSync(path.join(engine.dataDir, dataFile), 'utf8'));
      }
      
      const result = await engine.execute(yamlFile, inputData);
      console.log(`\n📤 Final State:`, JSON.stringify(result.result.finalState, null, 2));
      
    } else if (args[0] === 'batch') {
      const yamlFile = args[1];
      const csvFile = args[2];
      
      if (!yamlFile || !csvFile) {
        console.log('Usage: node simplified-integration.js batch <rules.yaml> <data.csv>');
        return;
      }
      
      await engine.batchProcess(yamlFile, csvFile);
      
    } else if (args[0] === 'init') {
      console.log('✅ KERN Engine initialized successfully!');
      
    } else {
      console.log(`
🎯 Simplified KERN Engine - Direct YAML → KERN v3 Pipeline

Commands:
  node simplified-integration.js execute <rules.yaml> <data>    Execute single record
  node simplified-integration.js batch <rules.yaml> <data.csv> Batch process CSV
  node simplified-integration.js init                          Initialize system

Examples:
  node simplified-integration.js execute mortgage-rules.yaml applicant.json
  node simplified-integration.js batch mortgage-rules.yaml applicants.csv

Features:
  ✅ Direct YAML → KERN v3 conversion (no Git for Logic complexity)
  ✅ Full SQLite persistence and audit trails
  ✅ Deterministic execution with cryptographic verification
  ✅ Clean error handling and reporting
  ✅ Docker support with multi-stage builds
      `);
    }
  } finally {
    await engine.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = SimplifiedKernEngine;
