#!/usr/bin/env node

/**
 * YAML to KERN Bridge - Convert Git for Logic YAML to v3 KERN format
 * Integrates with existing v3_rulesconfig.json schema
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const crypto = require('crypto');

class YamlToKernBridge {
  constructor() {
    this.engineVersion = "3.0.0";
  }

  /**
   * Convert YAML rules to KERN v3 format
   * Maps to your existing v3_rulesconfig.json schema
   */
  convertYamlToKernFormat(yamlRules) {
    // Validate required metadata
    if (!yamlRules.metadata) {
      throw new Error('YAML rules must include metadata section');
    }

    const { metadata, rules } = yamlRules;

    return {
      // Core ruleset - maps to your v3_rulesconfig.json
      ruleSet: {
        id: this.sanitizeId(metadata.name),
        version: metadata.version || "1.0.0",
        name: metadata.name,
        description: metadata.description || "",
        domain: metadata.domain || "business_logic",
        author: metadata.author || "system",
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        
        // Convert YAML rules to KERN format
        rules: rules.map((rule, index) => ({
          name: this.sanitizeRuleName(rule.name),
          priority: rule.priority || (index + 1) * 100, // Auto-assign if missing
          if: rule.when || rule.condition || "true", // Support multiple condition formats
          then: this.convertThenClause(rule.then),
          description: rule.description || `Auto-generated from YAML rule: ${rule.name}`,
          category: rule.category || "default",
          enabled: rule.enabled !== false, // Default to enabled
          version: rule.version || "1.0.0",
          tags: rule.tags || [],
          dependencies: rule.dependencies || []
        })),

        categories: this.extractCategories(rules),
        maxIterations: yamlRules.maxIterations || metadata.maxIterations || 50
      },

      // Optional execution contracts
      contracts: {
        executionMode: metadata.executionMode || "priority_ordered",
        conflictResolution: metadata.conflictResolution || "priority_override", 
        invariantChecking: metadata.invariantChecking || "per_iteration",
        auditLevel: metadata.auditLevel || "detailed",
        deterministic: metadata.deterministic !== false
      },

      // Add transformation pipeline if present
      ...(yamlRules.pipeline && {
        transformation_pipeline: this.convertPipeline(yamlRules.pipeline)
      })
    };
  }

  /**
   * Convert YAML "then" clause to KERN format
   * Handles both simple assignments and template expressions
   */
  convertThenClause(thenClause) {
    const converted = {};
    
    for (const [key, value] of Object.entries(thenClause)) {
      // Handle template expressions like "{{ expression }}"
      if (typeof value === 'string' && value.match(/^\{\{.*\}\}$/)) {
        converted[key] = value; // Keep template as-is
      } else {
        converted[key] = String(value); // Convert to string as expected by KERN
      }
    }
    
    return converted;
  }

  /**
   * Extract unique categories from rules
   */
  extractCategories(rules) {
    const categories = new Set(['default']);
    rules.forEach(rule => {
      if (rule.category) categories.add(rule.category);
    });
    return Array.from(categories);
  }

  /**
   * Convert pipeline steps if present
   */
  convertPipeline(pipeline) {
    return pipeline.map((step, index) => ({
      id: step.id || `step_${index + 1}`,
      primitive: step.primitive || "RULE_APPLICATOR",
      input_fields: step.inputs || [],
      output_fields: step.outputs || [],
      params: step.params || {}
    }));
  }

  /**
   * Sanitize identifiers for KERN compatibility
   */
  sanitizeId(name) {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  }

  sanitizeRuleName(name) {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /**
   * Load and validate YAML file
   */
  loadYamlFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const yamlData = yaml.load(content);
      
      // Basic validation
      if (!yamlData.metadata) {
        throw new Error('YAML must contain metadata section');
      }
      if (!yamlData.rules || !Array.isArray(yamlData.rules)) {
        throw new Error('YAML must contain rules array');
      }

      return yamlData;
    } catch (error) {
      throw new Error(`Failed to load YAML file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Save KERN format to JSON file
   */
  saveKernFormat(kernData, outputPath) {
    const jsonContent = JSON.stringify(kernData, null, 2);
    fs.writeFileSync(outputPath, jsonContent);
    
    // Generate hash for integrity checking
    const hash = crypto.createHash('sha256').update(jsonContent).digest('hex').substring(0, 12);
    console.log(`✅ Saved KERN format to: ${outputPath}`);
    console.log(`🔍 Config Hash: ${hash}`);
    
    return hash;
  }

  /**
   * Convert YAML to KERN and save
   */
  convert(yamlPath, outputPath = null) {
    const yamlData = this.loadYamlFile(yamlPath);
    const kernData = this.convertYamlToKernFormat(yamlData);
    
    // Auto-generate output path if not provided
    if (!outputPath) {
      const baseName = path.basename(yamlPath, path.extname(yamlPath));
      outputPath = path.join(path.dirname(yamlPath), `${baseName}-kern.json`);
    }
    
    const hash = this.saveKernFormat(kernData, outputPath);
    
    console.log(`\n📊 Conversion Summary:`);
    console.log(`   Input: ${yamlPath}`);
    console.log(`   Output: ${outputPath}`);
    console.log(`   Rules: ${kernData.ruleSet.rules.length}`);
    console.log(`   Version: ${kernData.ruleSet.version}`);
    console.log(`   Hash: ${hash}`);
    
    return {
      kernData,
      outputPath,
      hash,
      summary: {
        rulesCount: kernData.ruleSet.rules.length,
        version: kernData.ruleSet.version,
        categories: kernData.ruleSet.categories
      }
    };
  }

  /**
   * Batch convert multiple YAML files
   */
  convertBatch(inputDir, outputDir = null) {
    if (!outputDir) outputDir = inputDir;
    
    const yamlFiles = fs.readdirSync(inputDir)
      .filter(file => file.endsWith('.yaml') || file.endsWith('.yml'));
    
    console.log(`🔄 Converting ${yamlFiles.length} YAML files...`);
    
    const results = [];
    for (const file of yamlFiles) {
      const yamlPath = path.join(inputDir, file);
      const baseName = path.basename(file, path.extname(file));
      const outputPath = path.join(outputDir, `${baseName}-kern.json`);
      
      try {
        const result = this.convert(yamlPath, outputPath);
        results.push({ file, success: true, ...result.summary });
      } catch (error) {
        console.error(`❌ Failed to convert ${file}: ${error.message}`);
        results.push({ file, success: false, error: error.message });
      }
    }
    
    console.log(`\n📈 Batch Conversion Complete:`);
    const successful = results.filter(r => r.success);
    console.log(`   ✅ Successful: ${successful.length}`);
    console.log(`   ❌ Failed: ${results.length - successful.length}`);
    
    return results;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const bridge = new YamlToKernBridge();

  if (args.length === 0) {
    console.log(`
🌉 YAML to KERN Bridge - Convert Git for Logic YAML to KERN v3 format

Usage:
  node yaml-to-kern.js <input.yaml> [output.json]     Convert single file
  node yaml-to-kern.js batch <input-dir> [output-dir] Convert directory
  node yaml-to-kern.js validate <input.yaml>          Validate only

Examples:
  node yaml-to-kern.js rules/mortgage.yaml
  node yaml-to-kern.js rules/mortgage.yaml config/mortgage-kern.json  
  node yaml-to-kern.js batch ./rules ./config
  node yaml-to-kern.js validate rules/mortgage.yaml
    `);
    return;
  }

  try {
    if (args[0] === 'batch') {
      const inputDir = args[1];
      const outputDir = args[2];
      
      if (!inputDir) {
        console.error('❌ Batch mode requires input directory');
        return;
      }
      
      bridge.convertBatch(inputDir, outputDir);
      
    } else if (args[0] === 'validate') {
      const yamlPath = args[1];
      
      if (!yamlPath) {
        console.error('❌ Validate mode requires YAML file path');
        return;
      }
      
      const yamlData = bridge.loadYamlFile(yamlPath);
      const kernData = bridge.convertYamlToKernFormat(yamlData);
      
      console.log('✅ YAML validation successful!');
      console.log(`📊 Rules: ${kernData.ruleSet.rules.length}`);
      console.log(`🏷️  Categories: ${kernData.ruleSet.categories.join(', ')}`);
      
    } else {
      const yamlPath = args[0];
      const outputPath = args[1];
      
      bridge.convert(yamlPath, outputPath);
    }
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = YamlToKernBridge;
