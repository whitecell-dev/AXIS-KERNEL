#!/usr/bin/env node

/**
 * 🎯 KERN v3 Complete Integration
 * 
 * Solves the conundrum by properly bridging:
 * YAML rules → v3_rulesconfig.json → KERN engine execution
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Load the bridge and adapter we created
const YamlToV3RulesConfigBridge = require('./yaml_v3_bridge');
const KernPlanAdapter = require('./kern_plan_adapter');

class KernV3Integration {
    constructor(options = {}) {
        this.projectRoot = options.projectRoot || process.cwd();
        this.rulesDir = options.rulesDir || './rules';
        this.kernSchemasDir = options.kernSchemasDir || './kern_schemas';
        this.dataDir = options.dataDir || './data';
        this.outputDir = options.outputDir || './output';
        
        // Initialize the bridge and adapter
        this.bridge = new YamlToV3RulesConfigBridge();
        this.adapter = new KernPlanAdapter();
        
        // Paths to critical files
        this.manifestPath = path.join(this.projectRoot, 'systemmanifest_instance.json');
        this.kernRuntimePath = path.join(this.projectRoot, 'kern_runtime_v3_full.ts');
    }

    /**
     * 🔄 Full pipeline: YAML → v3_rulesconfig → KERN execution
     */
    async executeYamlWithKern(yamlRulesFile, inputData, options = {}) {
        const executionId = this.generateExecutionId();
        
        console.log(`\n🎯 KERN v3 Integration Pipeline [${executionId}]`);
        console.log(`   YAML Rules: ${yamlRulesFile}`);
        console.log(`   Input Data: ${typeof inputData === 'string' ? inputData : 'object'}`);
        
        try {
            // Step 1: Convert YAML to v3_rulesconfig.json
            console.log('\n📋 Step 1: Converting YAML to v3_rulesconfig...');
            const v3Result = await this.convertYamlToV3(yamlRulesFile);
            
            if (!v3Result.success) {
                throw new Error(`YAML to v3 conversion failed: ${v3Result.error}`);
            }
            
            // Step 2: Adapt v3_rulesconfig to KERN plan format
            console.log('\n🔄 Step 2: Adapting to KERN plan format...');
            const planResult = this.adapter.adaptV3RulesConfigToPlan(v3Result.outputPath);
            
            if (!planResult.success) {
                throw new Error(`Plan adaptation failed: ${planResult.error}`);
            }
            
            // Step 3: Update system manifest to reference the plan
            console.log('\n🔧 Step 3: Updating system manifest...');
            await this.updateSystemManifest(planResult.outputPath);
            
            // Step 4: Prepare input data
            console.log('\n📝 Step 4: Preparing input data...');
            const inputPath = await this.prepareInputData(inputData, executionId);
            
            // Step 5: Execute with KERN v3 engine
            console.log('\n⚡ Step 5: Executing with KERN v3 engine...');
            const result = await this.executeKernEngine(inputPath, planResult.outputPath, options);
            
            console.log(`\n✅ Pipeline completed successfully [${executionId}]`);
            return {
                success: true,
                executionId,
                v3ConfigPath: v3Result.outputPath,
                kernPlanPath: planResult.outputPath,
                inputPath,
                result
            };
            
        } catch (error) {
            console.error(`\n❌ Pipeline failed [${executionId}]:`, error.message);
            return {
                success: false,
                executionId,
                error: error.message
            };
        }
    }

    /**
     * Convert YAML rules to v3_rulesconfig format
     */
    async convertYamlToV3(yamlFilePath) {
        const baseName = path.basename(yamlFilePath, path.extname(yamlFilePath));
        const outputPath = path.join(this.kernSchemasDir, `${baseName}_v3_rulesconfig.json`);
        
        // Ensure kern_schemas directory exists
        if (!fs.existsSync(this.kernSchemasDir)) {
            fs.mkdirSync(this.kernSchemasDir, { recursive: true });
        }
        
        return this.bridge.convertYamlToV3RulesConfig(yamlFilePath, outputPath);
    }

    /**
     * Update systemmanifest_instance.json to reference the converted rules
     */
    async updateSystemManifest(v3RulesConfigPath) {
        if (!fs.existsSync(this.manifestPath)) {
            throw new Error(`System manifest not found: ${this.manifestPath}`);
        }
        
        const manifest = JSON.parse(fs.readFileSync(this.manifestPath, 'utf8'));
        
        // Update the rules component path to point to our converted file
        const relativePath = path.relative(this.projectRoot, v3RulesConfigPath);
        manifest.manifest.components.rules.path = `./${relativePath}`;
        
        // Update metadata
        manifest.manifest.metadata.lastModified = new Date().toISOString();
        
        // Write back
        fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2));
        
        console.log(`   📄 Updated manifest rules path: ${relativePath}`);
        return relativePath;
    }

    /**
     * Prepare input data for KERN engine
     */
    async prepareInputData(inputData, executionId) {
        let data;
        
        if (typeof inputData === 'string') {
            // Assume it's a file path
            if (fs.existsSync(inputData)) {
                data = JSON.parse(fs.readFileSync(inputData, 'utf8'));
            } else {
                throw new Error(`Input file not found: ${inputData}`);
            }
        } else {
            // Assume it's an object
            data = inputData;
        }
        
        // Create input file for KERN engine
        const inputPath = path.join(this.outputDir, `input_${executionId}.json`);
        
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        
        fs.writeFileSync(inputPath, JSON.stringify(data, null, 2));
        
        console.log(`   📁 Input file created: ${inputPath}`);
        return inputPath;
    }

    /**
     * Execute KERN v3 engine
     */
    async executeKernEngine(inputPath, planPath, options = {}) {
        return new Promise((resolve, reject) => {
            const args = [
                'execute',
                '--input', inputPath,
                '--plan', planPath,
                '--halt-on-error', options.haltOnError || 'false',
                '--max-iterations', options.maxIterations || '50'
            ];
            
            if (options.verbose) {
                args.push('--verbose');
            }
            
            console.log(`   🚀 Spawning: ts-node ${this.kernRuntimePath} ${args.join(' ')}`);
            
            const kernProcess = spawn('npx', ['ts-node', this.kernRuntimePath, ...args], {
                cwd: this.projectRoot,
                stdio: 'pipe'
            });
            
            let stdout = '';
            let stderr = '';
            
            kernProcess.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                if (options.verbose) {
                    process.stdout.write(output);
                }
            });
            
            kernProcess.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                if (options.verbose) {
                    process.stderr.write(output);
                }
            });
            
            kernProcess.on('close', (code) => {
                if (code === 0) {
                    console.log(`   ✅ KERN execution completed successfully`);
                    
                    // Try to parse the result from stdout
                    try {
                        const resultMatch = stdout.match(/FINAL_RESULT:(.+)/);
                        const result = resultMatch ? JSON.parse(resultMatch[1]) : { stdout, stderr };
                        resolve(result);
                    } catch (e) {
                        resolve({ stdout, stderr, code });
                    }
                } else {
                    console.error(`   ❌ KERN execution failed with code ${code}`);
                    reject(new Error(`KERN execution failed: ${stderr || stdout}`));
                }
            });
            
            kernProcess.on('error', (error) => {
                reject(new Error(`Failed to spawn KERN process: ${error.message}`));
            });
        });
    }

    /**
     * 📦 Batch process multiple input files against YAML rules
     */
    async batchExecuteYamlWithKern(yamlRulesFile, inputDirectory, options = {}) {
        console.log(`\n📦 KERN v3 Batch Processing`);
        console.log(`   YAML Rules: ${yamlRulesFile}`);
        console.log(`   Input Directory: ${inputDirectory}`);
        
        // Step 1: Convert YAML to v3_rulesconfig (once)
        console.log('\n📋 Step 1: Converting YAML to v3_rulesconfig...');
        const v3Result = await this.convertYamlToV3(yamlRulesFile);
        
        if (!v3Result.success) {
            throw new Error(`YAML to v3 conversion failed: ${v3Result.error}`);
        }
        
        // Step 2: Adapt to KERN plan format
        console.log('\n🔄 Step 2: Adapting to KERN plan format...');
        const planResult = this.adapter.adaptV3RulesConfigToPlan(v3Result.outputPath);
        
        if (!planResult.success) {
            throw new Error(`Plan adaptation failed: ${planResult.error}`);
        }
        
        // Step 3: Update system manifest
        console.log('\n🔧 Step 3: Updating system manifest...');
        await this.updateSystemManifest(planResult.outputPath);
        
        // Step 3: Find all input files
        console.log('\n🔍 Step 3: Finding input files...');
        const inputFiles = this.findInputFiles(inputDirectory);
        console.log(`   Found ${inputFiles.length} input files`);
        
        // Step 4: Process each file
        const results = [];
        const batchId = this.generateExecutionId();
        
        console.log(`\n⚡ Step 4: Processing files [batch-${batchId}]...`);
        
        for (let i = 0; i < inputFiles.length; i++) {
            const inputFile = inputFiles[i];
            const fileName = path.basename(inputFile, path.extname(inputFile));
            
            console.log(`\n   📄 Processing ${i + 1}/${inputFiles.length}: ${fileName}`);
            
            try {
                const executionId = `${batchId}_${i + 1}`;
                const inputPath = await this.prepareInputData(inputFile, executionId);
                const result = await this.executeKernEngine(inputPath, planResult.outputPath, {
                    ...options,
                    verbose: false // Reduce verbosity for batch
                });
                
                results.push({
                    inputFile: fileName,
                    success: true,
                    executionId,
                    result
                });
                
                console.log(`     ✅ ${fileName} completed successfully`);
                
            } catch (error) {
                results.push({
                    inputFile: fileName,
                    success: false,
                    error: error.message
                });
                
                console.log(`     ❌ ${fileName} failed: ${error.message}`);
                
                if (options.haltOnError) {
                    throw error;
                }
            }
        }
        
        // Step 5: Generate batch report
        console.log(`\n📊 Batch Processing Complete [batch-${batchId}]`);
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        console.log(`   ✅ Successful: ${successful}`);
        console.log(`   ❌ Failed: ${failed}`);
        console.log(`   📈 Success Rate: ${((successful / results.length) * 100).toFixed(1)}%`);
        
        // Save batch report
        const reportPath = path.join(this.outputDir, `batch_report_${batchId}.json`);
        const report = {
            batchId,
            timestamp: new Date().toISOString(),
            yamlRulesFile,
            inputDirectory,
            v3ConfigPath: v3Result.outputPath,
            kernPlanPath: planResult.outputPath,
            summary: {
                total: results.length,
                successful,
                failed,
                successRate: (successful / results.length) * 100
            },
            results
        };
        
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`   📋 Batch report saved: ${reportPath}`);
        
        return report;
    }

    /**
     * Find input files for batch processing
     */
    findInputFiles(inputDirectory) {
        if (!fs.existsSync(inputDirectory)) {
            throw new Error(`Input directory not found: ${inputDirectory}`);
        }
        
        return fs.readdirSync(inputDirectory)
            .filter(file => file.endsWith('.json'))
            .map(file => path.join(inputDirectory, file));
    }

    /**
     * Batch process multiple YAML files
     */
    async bridgeAllYamlFiles() {
        console.log(`\n🔄 Bridging all YAML files in ${this.rulesDir}`);
        
        const results = this.bridge.bridgeRulesDirectory(this.rulesDir, this.kernSchemasDir);
        
        // Update manifest for the first successful conversion
        const firstSuccess = results.find(r => r.success);
        if (firstSuccess) {
            await this.updateSystemManifest(firstSuccess.outputPath);
        }
        
        return results;
    }
	/**
 * Generate sample input JSON files
 */
generateSampleInputFiles(outputDirectory, count = 5) {
    console.log(`\n🎲 Generating ${count} sample input files in ${outputDirectory}`);
    
    if (!fs.existsSync(outputDirectory)) {
        fs.mkdirSync(outputDirectory, { recursive: true });
    }

    const baseTemplate = {
        applicant: {
            annual_income: 75000,
            credit_score: 720,
            existing_debt: 15000
        },
        co_applicant: {
            exists: false,
            annual_income: 0,
            credit_score: 0,
            existing_debt: 0
        },
        loan: {
            requested_amount: 300000,
            down_payment: 60000,
            term_years: 30,
            type: 'conventional',
            interest_rate: 0,
            processed: false
        },
        property: {
            purchase_price: 360000,
            property_tax_annual: 4320,
            hoa_monthly: 150
        },
        insurance: {
            homeowners_annual: 1200
        },
        household: {},
        ratios: {},
        approval: {}
    };

    const scenarios = [
        { name: 'high_income', annual_income: 120000, credit_score: 780, existing_debt: 5000 },
        { name: 'low_income', annual_income: 45000, credit_score: 650, existing_debt: 25000 },
        { name: 'excellent_credit', annual_income: 85000, credit_score: 820, existing_debt: 8000 },
        { name: 'poor_credit', annual_income: 65000, credit_score: 580, existing_debt: 35000 },
        { name: 'fha_loan', annual_income: 55000, credit_score: 620, existing_debt: 18000, loan_type: 'fha' }
    ];

    const files = [];

    for (let i = 0; i < count; i++) {
        const scenario = scenarios[i % scenarios.length];
        const applicant = {
            ...baseTemplate,
            applicant: {
                ...baseTemplate.applicant,
                annual_income: scenario.annual_income + (Math.random() - 0.5) * 10000,
                credit_score: Math.max(300, Math.min(850, scenario.credit_score + Math.floor((Math.random() - 0.5) * 40))),
                existing_debt: Math.max(0, scenario.existing_debt + (Math.random() - 0.5) * 5000)
            }
        };

        if (scenario.loan_type) {
            applicant.loan.type = scenario.loan_type;
        }

        if (i % 3 === 0) {
            applicant.co_applicant = {
                exists: true,
                annual_income: Math.floor(Math.random() * 60000) + 30000,
                credit_score: Math.floor(Math.random() * 200) + 600,
                existing_debt: Math.floor(Math.random() * 15000)
            };
        }

        const fileName = `applicant_${i + 1}_${scenario.name}.json`;
        const filePath = path.join(outputDirectory, fileName);

        fs.writeFileSync(filePath, JSON.stringify(applicant, null, 2));
        files.push(filePath);

        console.log(`   📄 Generated: ${fileName}`);
    }

    console.log(`\n✅ Generated ${files.length} sample files`);
    return files;
}


    /**
     * Validate the integration setup
     */
    validateSetup() {
        const checks = [
            { name: 'Project root exists', check: () => fs.existsSync(this.projectRoot) },
            { name: 'Rules directory exists', check: () => fs.existsSync(this.rulesDir) },
            { name: 'System manifest exists', check: () => fs.existsSync(this.manifestPath) },
            { name: 'KERN runtime exists', check: () => fs.existsSync(this.kernRuntimePath) },
            { name: 'kern_schemas directory', check: () => fs.existsSync(this.kernSchemasDir) || this.createDir(this.kernSchemasDir) },
            { name: 'output directory', check: () => fs.existsSync(this.outputDir) || this.createDir(this.outputDir) }
        ];
        
        console.log('\n🔍 Validating integration setup:');
        
        let allPassed = true;
        for (const { name, check } of checks) {
            try {
                const passed = check();
                console.log(`   ${passed ? '✅' : '❌'} ${name}`);
                if (!passed) allPassed = false;
            } catch (error) {
                console.log(`   ❌ ${name}: ${error.message}`);
                allPassed = false;
            }
        }
        
        return allPassed;
    }

    createDir(dirPath) {
        try {
            fs.mkdirSync(dirPath, { recursive: true });
            return true;
        } catch (error) {
            return false;
        }
    }

    generateExecutionId() {
        return Math.random().toString(36).substr(2, 8);
    }
}

// CLI Interface
if (require.main === module) {
    const [,, command, ...args] = process.argv;
    
    const integration = new KernV3Integration();
    
    async function runCommand() {
        try {
            switch (command) {
                case 'validate':
                    const isValid = integration.validateSetup();
                    process.exit(isValid ? 0 : 1);
                    break;
                    
                case 'bridge':
                    await integration.bridgeAllYamlFiles();
                    break;
                    
                case 'execute':
                    if (args.length < 2) {
                        console.error('Usage: node kern_v3_integration.js execute <yaml-rules-file> <input-data-file>');
                        process.exit(1);
                    }
                    
                    const options = {
                        verbose: args.includes('--verbose'),
                        haltOnError: args.includes('--halt-on-error'),
                        maxIterations: args.find(arg => arg.startsWith('--max-iterations='))?.split('=')[1] || '50'
                    };
                    
                    await integration.executeYamlWithKern(args[0], args[1], options);
                    break;
                    
                case 'batch':
                    if (args.length < 2) {
                        console.error('Usage: node kern_v3_integration.js batch <yaml-rules-file> <input-directory>');
                        process.exit(1);
                    }
                    
                    const batchOptions = {
                        verbose: args.includes('--verbose'),
                        haltOnError: args.includes('--halt-on-error'),
                        maxIterations: args.find(arg => arg.startsWith('--max-iterations='))?.split('=')[1] || '50'
                    };
                    
                    await integration.batchExecuteYamlWithKern(args[0], args[1], batchOptions);
                    break;
                    
                case 'generate-samples':
                    const sampleDir = args[0] || './data/samples';
                    const sampleCount = parseInt(args[1]) || 5;
                    integration.generateSampleInputFiles(sampleDir, sampleCount);
                    break;
                    
                case 'demo':
                    // Demo with mortgage rules
                    console.log('🎯 Running KERN v3 Integration Demo');
                    await integration.validateSetup();
                    await integration.bridgeAllYamlFiles();
                    
                    // Create sample input if it doesn't exist
                    const sampleInput = {
                        applicant: {
                            annual_income: 75000,
                            credit_score: 720,
                            existing_debt: 15000
                        },
                        loan: {
                            requested_amount: 300000,
                            down_payment: 60000,
                            term_years: 30,
                            type: 'conventional',
                            interest_rate: 0,
                            processed: false
                        },
                        property: {
                            purchase_price: 360000,
                            property_tax_annual: 4320,
                            hoa_monthly: 150
                        },
                        insurance: {
                            homeowners_annual: 1200
                        },
                        household: {},
                        ratios: {},
                        approval: {}
                    };
                    
                    const demoInputPath = './applicant.json';
                    fs.writeFileSync(demoInputPath, JSON.stringify(sampleInput, null, 2));
                    
                    await integration.executeYamlWithKern('./rules/mortgage-rules.yaml', demoInputPath, { verbose: true });
                    break;
                    
                case 'batch-demo':
                    // Batch demo
                    console.log('📦 Running KERN v3 Batch Processing Demo');
                    await integration.validateSetup();
                    await integration.bridgeAllYamlFiles();
                    
                    // Generate sample files
                    const sampleFiles = integration.generateSampleInputFiles('./data/samples', 5);
                    
                    // Run batch processing
                    await integration.batchExecuteYamlWithKern('./rules/mortgage-rules.yaml', './data/samples', { verbose: false });
                    break;
                    
                default:
                    console.log(`
🎯 KERN v3 Integration

Addresses the YAML → v3_rulesconfig → KERN engine pipeline

Commands:
  validate                            - Validate integration setup
  bridge                              - Convert all YAML files to v3_rulesconfig
  execute <yaml> <data>               - Execute YAML rules with input data
  batch <yaml> <input-dir>            - Batch process multiple input files
  generate-samples [dir] [count]      - Generate sample input files for testing
  demo                                - Run complete demo pipeline
  batch-demo                          - Run batch processing demo

Examples:
  node kern_v3_integration.js validate
  node kern_v3_integration.js bridge
  node kern_v3_integration.js execute ./rules/mortgage-rules.yaml ./applicant.json
  node kern_v3_integration.js batch ./rules/mortgage-rules.yaml ./data/samples
  node kern_v3_integration.js generate-samples ./data/samples 10
  node kern_v3_integration.js demo
  node kern_v3_integration.js batch-demo

Options:
  --verbose                           - Enable verbose output
  --halt-on-error                     - Stop on first error (batch mode)
  --max-iterations=N                  - Set maximum iterations (default: 50)
                    `);
            }
        } catch (error) {
            console.error('❌ Command failed:', error.message);
            process.exit(1);
        }
    }
    
    runCommand();
}

module.exports = KernV3Integration;