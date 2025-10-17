#!/usr/bin/env node

/**
 * 🔄 KERN Plan Format Adapter
 * 
 * Converts v3_rulesconfig.json to transformation_pipeline format
 * that the KERN runtime actually expects
 */

const fs = require('fs');
const path = require('path');

class KernPlanAdapter {
    
    /**
     * Convert v3_rulesconfig to transformation_pipeline format
     */
    adaptV3RulesConfigToPlan(v3RulesConfigPath, outputPath = null) {
        try {
            console.log(`🔄 Adapting v3_rulesconfig to KERN plan format: ${v3RulesConfigPath}`);
            
            const v3Config = JSON.parse(fs.readFileSync(v3RulesConfigPath, 'utf8'));
            
            if (!v3Config.ruleSet || !v3Config.ruleSet.rules) {
                throw new Error('Invalid v3_rulesconfig structure - missing ruleSet.rules');
            }
            
            // Convert to transformation_pipeline format
            const transformationPipeline = this.convertRulesToPipeline(v3Config.ruleSet.rules);
            
            const kernPlan = {
                transformation_pipeline: transformationPipeline,
                metadata: {
                    id: v3Config.ruleSet.id,
                    version: v3Config.ruleSet.version,
                    name: v3Config.ruleSet.name,
                    description: v3Config.ruleSet.description,
                    convertedFrom: "v3_rulesconfig",
                    convertedAt: new Date().toISOString()
                },
                contracts: v3Config.contracts || {}
            };
            
            // Generate output path if not provided
            if (!outputPath) {
                const baseName = path.basename(v3RulesConfigPath, '.json');
                outputPath = path.join(path.dirname(v3RulesConfigPath), `${baseName}_kern_plan.json`);
            }
            
            fs.writeFileSync(outputPath, JSON.stringify(kernPlan, null, 2));
            
            console.log(`✅ KERN plan generated: ${outputPath}`);
            console.log(`📊 Pipeline steps: ${transformationPipeline.length}`);
            
            return {
                success: true,
                outputPath,
                stepsCount: transformationPipeline.length,
                kernPlan
            };
            
        } catch (error) {
            console.error(`❌ Plan adaptation failed:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Convert v3 rules to transformation pipeline steps
     */
    convertRulesToPipeline(rules) {
        // Sort rules by priority
        const sortedRules = rules.sort((a, b) => a.priority - b.priority);
        
        const pipeline = [];
        
        for (const rule of sortedRules) {
            // Create condition evaluation step
            if (rule.if && rule.if !== "true") {
                pipeline.push({
                    id: `${rule.name}_condition`,
                    primitive: "CONDITION_EVALUATOR",
                    input_fields: ["*"],
                    output_fields: [`${rule.name}_condition_result`],
                    params: {
                        condition: rule.if,
                        ruleName: rule.name
                    }
                });
            }
            
            // Create rule application step
            pipeline.push({
                id: rule.name,
                primitive: "RULE_APPLICATOR",
                input_fields: ["*"],
                output_fields: ["*"],
                params: {
                    ruleId: rule.name,
                    priority: rule.priority,
                    condition: rule.if,
                    assignments: rule.then,
                    enabled: rule.enabled !== false
                }
            });
        }
        
        return pipeline;
    }
    
    /**
     * Create a custom RULE_APPLICATOR primitive that handles v3 rule format
     */
    generateRuleApplicatorCode() {
        return `
// Custom RULE_APPLICATOR for v3_rulesconfig compatibility
RULE_APPLICATOR: (input, context) => {
    const { ruleId, condition, assignments, enabled } = input;
    
    if (!enabled) {
        return { skipped: true, reason: 'Rule disabled' };
    }
    
    // Evaluate condition if present
    if (condition && condition !== "true") {
        try {
            const conditionFn = new Function("context", \`with(context){ return (\${condition}); }\`);
            const conditionResult = conditionFn(context.state || {});
            
            if (!conditionResult) {
                return { skipped: true, reason: 'Condition not met', condition };
            }
        } catch (err) {
            return { error: \`Condition evaluation failed: \${err.message}\`, condition };
        }
    }
    
    // Apply assignments
    const results = {};
    const updates = [];
    
    for (const [fieldPath, expression] of Object.entries(assignments)) {
        try {
            let value;
            
            // Handle template expressions {{...}}
            if (typeof expression === 'string' && expression.startsWith('{{') && expression.endsWith('}}')) {
                const templateExpr = expression.slice(2, -2).trim();
                const exprFn = new Function("context", \`with(context){ return (\${templateExpr}); }\`);
                value = exprFn(context.state || {});
            } else {
                // Direct value assignment
                value = expression === "true" ? true : expression === "false" ? false : expression;
                if (!isNaN(Number(expression)) && expression !== "") {
                    value = Number(expression);
                }
            }
            
            // Apply the assignment to state
            const pathParts = fieldPath.split('.');
            let obj = context.state;
            
            for (let i = 0; i < pathParts.length - 1; i++) {
                const part = pathParts[i];
                if (!obj[part]) obj[part] = {};
                obj = obj[part];
            }
            
            const finalKey = pathParts[pathParts.length - 1];
            obj[finalKey] = value;
            
            updates.push({ field: fieldPath, value });
            results[fieldPath] = value;
            
        } catch (err) {
            return { 
                error: \`Assignment failed for \${fieldPath}: \${err.message}\`, 
                expression,
                fieldPath 
            };
        }
    }
    
    return {
        success: true,
        ruleId,
        updatesApplied: updates.length,
        updates,
        results
    };
}`;
    }
}

// CLI Interface
if (require.main === module) {
    const [,, command, ...args] = process.argv;
    
    const adapter = new KernPlanAdapter();
    
    switch (command) {
        case 'adapt':
            if (args.length < 1) {
                console.error('Usage: node kern_plan_adapter.js adapt <v3-rulesconfig-file> [output-file]');
                process.exit(1);
            }
            adapter.adaptV3RulesConfigToPlan(args[0], args[1]);
            break;
            
        case 'generate-primitive':
            console.log('🧩 Custom RULE_APPLICATOR Primitive Code:');
            console.log(adapter.generateRuleApplicatorCode());
            break;
            
        default:
            console.log(`
🔄 KERN Plan Format Adapter

Converts v3_rulesconfig.json to transformation_pipeline format for KERN runtime

Commands:
  adapt <v3-config> [output]  - Convert v3_rulesconfig to KERN plan
  generate-primitive          - Output custom RULE_APPLICATOR code

Examples:
  node kern_plan_adapter.js adapt ./kern_schemas/mortgage-rules_v3_rulesconfig.json
  node kern_plan_adapter.js generate-primitive
            `);
    }
}

module.exports = KernPlanAdapter;