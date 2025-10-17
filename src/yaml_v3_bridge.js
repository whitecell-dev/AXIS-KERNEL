#!/usr/bin/env node

/**
 * 🔄 YAML to v3_rulesconfig.json Bridge
 * Converts YAML rule files to KERN v3 compliant rulesconfig format
 * 
 * Addresses the mismatch between:
 * - YAML rules -> transformation pipeline JSON (current)
 * - v3_rulesconfig.json schema (required by KERN engine)
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const crypto = require('crypto');

class YamlToV3RulesConfigBridge {
    constructor() {
        this.timestamp = new Date().toISOString();
    }

    /**
     * Convert YAML rules file to v3_rulesconfig.json compliant format
     */
    convertYamlToV3RulesConfig(yamlFilePath, outputPath = null) {
        try {
            console.log(`🔄 Converting YAML to v3_rulesconfig format: ${yamlFilePath}`);
            
            // Read and parse YAML
            const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
            const yamlData = yaml.load(yamlContent);
            
            // Extract metadata
            const metadata = yamlData.metadata || {};
            
            // Convert rules to v3 format
            const v3Rules = this.convertRulesToV3Format(yamlData.rules || []);
            
            // Build v3_rulesconfig compliant structure
            const v3RulesConfig = {
                ruleSet: {
                    id: metadata.name || path.basename(yamlFilePath, '.yaml'),
                    version: metadata.version || "1.0.0",
                    name: metadata.description || `Rules from ${path.basename(yamlFilePath)}`,
                    description: metadata.description || `Auto-generated from ${yamlFilePath}`,
                    domain: metadata.domain || "financial_services",
                    author: metadata.author || "system",
                    createdAt: this.timestamp,
                    lastModified: this.timestamp,
                    rules: v3Rules,
                    categories: this.extractCategories(v3Rules),
                    maxIterations: yamlData.max_iterations || 50
                },
                contracts: {
                    executionMode: "priority_ordered",
                    conflictResolution: "priority_override", 
                    invariantChecking: "per_iteration",
                    auditLevel: "detailed",
                    deterministic: true
                }
            };
            
            // Generate output path if not provided
            if (!outputPath) {
                const baseName = path.basename(yamlFilePath, path.extname(yamlFilePath));
                outputPath = path.join(path.dirname(yamlFilePath), `${baseName}_v3_rulesconfig.json`);
            }
            
            // Write v3 compliant JSON
            fs.writeFileSync(outputPath, JSON.stringify(v3RulesConfig, null, 2));
            
            const hash = this.generateHash(v3RulesConfig);
            
            console.log(`✅ v3_rulesconfig generated: ${outputPath}`);
            console.log(`📊 Rules converted: ${v3Rules.length}`);
            console.log(`🔑 Config hash: ${hash}`);
            
            return {
                success: true,
                outputPath,
                hash,
                rulesCount: v3Rules.length,
                v3RulesConfig
            };
            
        } catch (error) {
            console.error(`❌ YAML to v3_rulesconfig conversion failed:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Convert YAML rule format to v3_rulesconfig Rule schema
     */
    convertRulesToV3Format(yamlRules) {
        return yamlRules.map((rule, index) => {
            // Handle the condition - fix original YAML format issue
            let condition = rule.if || "true";
            
            // Clean up condition expression for v3 format
            condition = this.sanitizeCondition(condition);
            
            // Convert 'then' object to proper format
            const thenObject = this.convertThenClause(rule.then);
            
            return {
                name: rule.name || `rule_${index + 1}`,
                priority: rule.priority || (index + 1),
                if: condition,
                then: thenObject,
                description: rule.description || `Auto-generated from YAML rule: ${rule.name || 'unnamed'}`,
                category: rule.category || "default",
                enabled: rule.enabled !== false,
                version: rule.version || "1.0.0",
                tags: rule.tags || [],
                dependencies: rule.dependencies || []
            };
        });
    }

    /**
     * Sanitize condition expressions for v3 compliance
     */
    sanitizeCondition(condition) {
        if (!condition || condition === "true") {
            return "true";
        }
        
        // Handle complex boolean expressions and convert to safe evaluation format
        let sanitized = condition
            .replace(/&&/g, ' && ')
            .replace(/\|\|/g, ' || ')
            .replace(/!=/g, ' != ')
            .replace(/==/g, ' == ')
            .replace(/>/g, ' > ')
            .replace(/</g, ' < ')
            .replace(/>=/g, ' >= ')
            .replace(/<=  /g, ' <= ')
            .trim();
            
        // Remove any dangerous eval patterns
        sanitized = sanitized.replace(/eval\(/g, '/* eval blocked */');
        
        return sanitized;
    }

    /**
     * Convert YAML 'then' clause to v3_rulesconfig format
     * 
     * YAML format: 
     *   then:
     *     field.name: "{{expression}}"
     *     field.other: value
     * 
     * v3 format:
     *   then: {
     *     "field.name": "{{expression}}",
     *     "field.other": "value"
     *   }
     */
    convertThenClause(thenClause) {
        if (!thenClause || typeof thenClause !== 'object') {
            return {};
        }
        
        const converted = {};
        
        for (const [fieldPath, value] of Object.entries(thenClause)) {
            // Ensure all values are strings as per v3_rulesconfig schema
            if (typeof value === 'string') {
                converted[fieldPath] = value;
            } else if (typeof value === 'number' || typeof value === 'boolean') {
                converted[fieldPath] = String(value);
            } else if (typeof value === 'object') {
                // Convert complex expressions to template strings
                converted[fieldPath] = `{{${JSON.stringify(value)}}}`;
            } else {
                converted[fieldPath] = String(value || '');
            }
        }
        
        return converted;
    }

    /**
     * Extract unique categories from rules
     */
    extractCategories(rules) {
        const categories = new Set();
        rules.forEach(rule => {
            if (rule.category) {
                categories.add(rule.category);
            }
        });
        return Array.from(categories);
    }

    /**
     * Generate hash for the configuration
     */
    generateHash(config) {
        return crypto.createHash('sha256')
            .update(JSON.stringify(config, null, 0))
            .digest('hex')
            .substring(0, 12);
    }

    /**
     * Validate against v3_rulesconfig schema (basic validation)
     */
    validateV3RulesConfig(rulesConfig) {
        const required = ['ruleSet'];
        const ruleSetRequired = ['id', 'version', 'rules'];
        
        // Basic structure validation
        for (const field of required) {
            if (!rulesConfig[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
        
        for (const field of ruleSetRequired) {
            if (!rulesConfig.ruleSet[field]) {
                throw new Error(`Missing required ruleSet field: ${field}`);
            }
        }
        
        // Validate each rule
        rulesConfig.ruleSet.rules.forEach((rule, index) => {
            const ruleRequired = ['name', 'priority', 'if', 'then'];
            for (const field of ruleRequired) {
                if (rule[field] === undefined) {
                    throw new Error(`Rule ${index}: Missing required field: ${field}`);
                }
            }
            
            // Validate rule name pattern
            if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(rule.name)) {
                throw new Error(`Rule ${index}: Invalid name pattern: ${rule.name}`);
            }
            
            // Validate priority range
            if (rule.priority < 1 || rule.priority > 10000) {
                throw new Error(`Rule ${index}: Priority must be between 1 and 10000`);
            }
        });
        
        console.log(`✅ v3_rulesconfig validation passed`);
        return true;
    }

    /**
     * Create bridge for existing YAML files in rules directory
     */
    bridgeRulesDirectory(rulesDir = './rules', outputDir = './kern_schemas') {
        console.log(`🔄 Bridging YAML rules from ${rulesDir} to ${outputDir}`);
        
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const yamlFiles = fs.readdirSync(rulesDir)
            .filter(file => file.endsWith('.yaml') || file.endsWith('.yml'));
            
        const results = [];
        
        for (const yamlFile of yamlFiles) {
            const yamlPath = path.join(rulesDir, yamlFile);
            const baseName = path.basename(yamlFile, path.extname(yamlFile));
            const outputPath = path.join(outputDir, `${baseName}_v3_rulesconfig.json`);
            
            const result = this.convertYamlToV3RulesConfig(yamlPath, outputPath);
            results.push({ yamlFile, ...result });
        }
        
        console.log(`\n📊 Bridge Summary:`);
        console.log(`   YAML files processed: ${yamlFiles.length}`);
        console.log(`   Successful conversions: ${results.filter(r => r.success).length}`);
        console.log(`   Failed conversions: ${results.filter(r => !r.success).length}`);
        
        return results;
    }
}

// CLI Interface
if (require.main === module) {
    const [,, command, ...args] = process.argv;
    
    const bridge = new YamlToV3RulesConfigBridge();
    
    switch (command) {
        case 'convert':
            if (args.length < 1) {
                console.error('Usage: node yaml_v3_bridge.js convert <yaml-file> [output-file]');
                process.exit(1);
            }
            bridge.convertYamlToV3RulesConfig(args[0], args[1]);
            break;
            
        case 'bridge-dir':
            const rulesDir = args[0] || './rules';
            const outputDir = args[1] || './kern_schemas';
            bridge.bridgeRulesDirectory(rulesDir, outputDir);
            break;
            
        default:
            console.log(`
🔄 YAML to v3_rulesconfig Bridge

Usage:
  node yaml_v3_bridge.js convert <yaml-file> [output-file]
  node yaml_v3_bridge.js bridge-dir [rules-dir] [output-dir]

Examples:
  node yaml_v3_bridge.js convert ./rules/mortgage-rules.yaml
  node yaml_v3_bridge.js bridge-dir ./rules ./kern_schemas
            `);
    }
}

module.exports = YamlToV3RulesConfigBridge;