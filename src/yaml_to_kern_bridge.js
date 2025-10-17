const fs = require('fs');
const yaml = require('js-yaml');
const crypto = require('crypto');
const path = require('path');

class YamlToKernBridge {
    constructor() {}

    sanitizeId(name) {
        return name.toLowerCase().replace(/[^a-z0-9_]/gi, '_');
    }

    sanitizeRuleName(name) {
        return name.replace(/\s+/g, '_').toLowerCase();
    }

    extractCategories(rules) {
        return Array.from(new Set(
            rules.map(rule => rule.category || 'default')
        ));
    }

    convertThenClause(then) {
        if (typeof then === 'object') return then;
        return { action: then };
    }

    convertPipeline(pipelineYaml) {
        return pipelineYaml.map((step, i) => ({
            id: step.id || `step_${i + 1}`,
            primitive: step.primitive || 'UNKNOWN_PRIMITIVE',
            input_fields: step.input_fields || ['*'],
            output_fields: step.output_fields || ['*'],
            params: step.params || {}
        }));
    }

    convertYamlToKernFormat(yamlRules) {
        if (!yamlRules.metadata) {
            throw new Error('YAML rules must include metadata section');
        }

        const { metadata, rules } = yamlRules;

        const rulesetId = this.sanitizeId(metadata.name);

        // Build the ruleset block
        const compiledRuleSet = {
            id: rulesetId,
            version: metadata.version || '1.0.0',
            name: metadata.name,
            description: metadata.description || '',
            domain: metadata.domain || 'business_logic',
            author: metadata.author || 'system',
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            rules: rules.map((rule, index) => ({
                name: this.sanitizeRuleName(rule.name),
                priority: rule.priority || (index + 1) * 100,
                if: rule.when || rule.condition || 'true',
                then: this.convertThenClause(rule.then),
                description: rule.description || `Auto-generated from YAML rule: ${rule.name}`,
                category: rule.category || 'default',
                enabled: rule.enabled !== false,
                version: rule.version || '1.0.0',
                tags: rule.tags || [],
                dependencies: rule.dependencies || []
            })),
            categories: this.extractCategories(rules),
            maxIterations: yamlRules.maxIterations || metadata.maxIterations || 50
        };

        // Build pipeline
        let pipelineSteps;
        if (yamlRules.pipeline) {
            pipelineSteps = this.convertPipeline(yamlRules.pipeline);
        } else {
            // default: RULE_APPLICATOR that uses ruleset ID
            pipelineSteps = [{
                id: `${rulesetId}_applicator`,
                primitive: 'RULE_APPLICATOR',
                input_fields: ['*'],
                output_fields: ['*'],
                params: {
                    ruleSetId: rulesetId
                }
            }];
        }

        return {
            transformation_pipeline: pipelineSteps,
            contracts: {
                executionMode: metadata.executionMode || 'priority_ordered',
                conflictResolution: metadata.conflictResolution || 'priority_override',
                invariantChecking: metadata.invariantChecking || 'per_iteration',
                auditLevel: metadata.auditLevel || 'detailed',
                deterministic: metadata.deterministic !== false
            },
            [rulesetId]: compiledRuleSet
        };
    }

    loadYamlFile(filepath) {
        const raw = fs.readFileSync(filepath, 'utf8');
        return yaml.load(raw);
    }

    saveKernFile(outputPath, kernJson) {
        fs.writeFileSync(outputPath, JSON.stringify(kernJson, null, 2));
    }

    generateHash(obj) {
        return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 12);
    }

    /**
     * Converts a YAML file to KERN JSON, saves it, and returns conversion metadata.
     * ⚡ FIX APPLIED: Correctly returns the outputPath and a structured summary.
     */
    convertFile(inputYamlPath, outputJsonPath) {
        const yamlParsed = this.loadYamlFile(inputYamlPath);
        const kernFormat = this.convertYamlToKernFormat(yamlParsed);
        this.saveKernFile(outputJsonPath, kernFormat);
        
        const hash = this.generateHash(kernFormat);
        const rulesCount = yamlParsed?.rules?.length || 0;
        const version = yamlParsed?.metadata?.version || '1.0.0';

        return {
            // ✅ CRITICAL FIX: Include the output path
            outputPath: outputJsonPath, 
            hash: hash,
            kernData: kernFormat, // Include the full KERN data for persistence if needed
            summary: {
                rulesCount: rulesCount,
                version: version
            }
        };
    }
}

module.exports = YamlToKernBridge;