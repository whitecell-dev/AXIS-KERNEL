#!/usr/bin/env node

/**
 * SQLite Persistence Layer for KERN v3 - FIXED VERSION
 * Enterprise-grade audit trails and state management
 */

const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class KernSqlitePersistence {
    constructor(dbPath = './database/kern_state.db') {
        this.dbPath = dbPath;
        this.db = null;
        this.isInitialized = false;
    }

    /**
     * Initialize database with KERN v3 schema
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            // Ensure directory exists
            const dbDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }

            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(new Error(`Failed to open database: ${err.message}`));
                    return;
                }
                
                console.log(`📁 SQLite database opened: ${this.dbPath}`);
                this.createTables()
                    .then(() => {
                        this.isInitialized = true;
                        resolve();
                    })
                    .catch(reject);
            });
        });
    }

    /**
     * Create all necessary tables for KERN v3 persistence
     */
    async createTables() {
        const tableStatements = [
            // Rule versions and metadata
            `CREATE TABLE IF NOT EXISTS rule_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_set_id TEXT NOT NULL,
                version TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                domain TEXT,
                author TEXT,
                rules_json TEXT NOT NULL,
                rules_hash TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(rule_set_id, version)
            )`,

            // Execution sessions 
            `CREATE TABLE IF NOT EXISTS executions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                execution_id TEXT UNIQUE NOT NULL,
                rule_version_id INTEGER REFERENCES rule_versions(id),
                input_data TEXT NOT NULL,
                input_hash TEXT NOT NULL,
                output_data TEXT,
                output_hash TEXT,
                execution_status TEXT DEFAULT 'running',
                execution_mode TEXT DEFAULT 'priority_ordered',
                max_iterations INTEGER DEFAULT 50,
                actual_iterations INTEGER,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME,
                duration_ms INTEGER,
                error_message TEXT
            )`,

            // MNEME audit trail - tick-by-tick execution log
            `CREATE TABLE IF NOT EXISTS mneme_ledger (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                execution_id TEXT REFERENCES executions(execution_id),
                tick INTEGER NOT NULL,
                primitive_name TEXT NOT NULL,
                rule_name TEXT,
                input_data TEXT,
                output_data TEXT,
                state_before TEXT,
                state_after TEXT,
                state_hash TEXT,
                parent_hash TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                call_count INTEGER DEFAULT 1
            )`,

            // Invariant violations and validation results
            `CREATE TABLE IF NOT EXISTS invariant_violations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                execution_id TEXT REFERENCES executions(execution_id),
                tick INTEGER,
                violation_type TEXT NOT NULL,
                violation_message TEXT NOT NULL,
                rule_name TEXT,
                severity TEXT DEFAULT 'error',
                primitive_name TEXT,
                violation_data TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Metrics and performance data
            `CREATE TABLE IF NOT EXISTS execution_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                execution_id TEXT REFERENCES executions(execution_id),
                metric_name TEXT NOT NULL,
                metric_value REAL NOT NULL,
                metric_type TEXT DEFAULT 'counter',
                primitive_name TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // State snapshots for debugging and rollback
            `CREATE TABLE IF NOT EXISTS state_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                execution_id TEXT REFERENCES executions(execution_id),
                tick INTEGER NOT NULL,
                snapshot_type TEXT DEFAULT 'iteration',
                state_data TEXT NOT NULL,
                state_hash TEXT NOT NULL,
                compression TEXT DEFAULT 'none',
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(execution_id, tick, snapshot_type)
            )`
        ];

        // Index creation statements (separate from table creation)
        const indexStatements = [
            `CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(execution_status)`,
            `CREATE INDEX IF NOT EXISTS idx_executions_started ON executions(started_at)`,
            `CREATE INDEX IF NOT EXISTS idx_mneme_execution_tick ON mneme_ledger(execution_id, tick)`,
            `CREATE INDEX IF NOT EXISTS idx_violations_execution ON invariant_violations(execution_id)`,
            `CREATE INDEX IF NOT EXISTS idx_metrics_execution ON execution_metrics(execution_id, metric_name)`,
            `CREATE INDEX IF NOT EXISTS idx_snapshots_execution ON state_snapshots(execution_id, tick)`
        ];

        // Execute table creation first
        for (const statement of tableStatements) {
            await this.executeStatement(statement);
        }

        // Then create indexes
        for (const statement of indexStatements) {
            await this.executeStatement(statement);
        }
        
        console.log('✅ Database schema initialized');
    }

    /**
     * Execute a single SQL statement
     */
    async executeStatement(sql) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, (err) => {
                if (err) {
                    reject(new Error(`Migration failed: ${err.message}`));
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Store rule version in database
     */
    async storeRuleVersion(ruleSetData) {
        const rulesJson = JSON.stringify(ruleSetData);
        const rulesHash = this.generateHash(rulesJson);
        
        const stmt = `
            INSERT OR REPLACE INTO rule_versions 
            (rule_set_id, version, name, description, domain, author, rules_json, rules_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        return new Promise((resolve, reject) => {
            this.db.run(stmt, [
                ruleSetData.ruleSet.id,
                ruleSetData.ruleSet.version,
                ruleSetData.ruleSet.name,
                ruleSetData.ruleSet.description || '',
                ruleSetData.ruleSet.domain || 'business_logic',
                ruleSetData.ruleSet.author || 'system',
                rulesJson,
                rulesHash
            ], function(err) {
                if (err) {
                    reject(new Error(`Failed to store rule version: ${err.message}`));
                } else {
                    console.log(`✅ Stored rule version: ${ruleSetData.ruleSet.id} v${ruleSetData.ruleSet.version}`);
                    resolve({ id: this.lastID, hash: rulesHash });
                }
            });
        });
    }

    /**
     * ⚡ FIX ADDED: Retrieve rule_version.id by its hash
     */
    async getRuleVersionIdByHash(rulesHash) {
        const stmt = `
            SELECT id FROM rule_versions
            WHERE rules_hash = ?
            ORDER BY created_at DESC
            LIMIT 1
        `;

        return new Promise((resolve, reject) => {
            this.db.get(stmt, [rulesHash], (err, row) => {
                if (err) {
                    reject(new Error(`Failed to retrieve rule version by hash: ${err.message}`));
                } else if (!row) {
                    // This scenario is handled by storeRuleVersion in the integration engine,
                    // but we resolve to null if not found for safety.
                    resolve(null);
                } else {
                    resolve(row.id);
                }
            });
        });
    }

    /**
     * Start new execution session
     */
    async startExecution(executionId, ruleVersionId, inputData, options = {}) {
        const inputJson = JSON.stringify(inputData);
        const inputHash = this.generateHash(inputJson);
        
        const stmt = `
            INSERT INTO executions 
            (execution_id, rule_version_id, input_data, input_hash, execution_mode, max_iterations)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        return new Promise((resolve, reject) => {
            this.db.run(stmt, [
                executionId,
                ruleVersionId,
                inputJson,
                inputHash,
                options.executionMode || 'priority_ordered',
                options.maxIterations || 50
            ], function(err) {
                if (err) {
                    reject(new Error(`Failed to start execution: ${err.message}`));
                } else {
                    console.log(`🚀 Started execution: ${executionId}`);
                    resolve({ id: this.lastID, inputHash });
                }
            });
        });
    }

    /**
     * Log MNEME ledger entry (tick-by-tick audit trail)
     */
    async logMnemeEntry(executionId, tick, primitive, ruleName, input, output, stateBefore, stateAfter) {
        const stateAfterJson = JSON.stringify(stateAfter);
        const stateHash = this.generateHash(stateAfterJson);
        
        const stmt = `
            INSERT INTO mneme_ledger
            (execution_id, tick, primitive_name, rule_name, input_data, output_data, 
             state_before, state_after, state_hash, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `;
        
        return new Promise((resolve, reject) => {
            this.db.run(stmt, [
                executionId,
                tick,
                primitive,
                ruleName,
                JSON.stringify(input),
                JSON.stringify(output),
                JSON.stringify(stateBefore),
                stateAfterJson,
                stateHash
            ], function(err) {
                if (err) {
                    reject(new Error(`Failed to log MNEME entry: ${err.message}`));
                } else {
                    resolve({ stateHash, ledgerId: this.lastID });
                }
            });
        });
    }

    /**
     * Log invariant violation
     */
    async logInvariantViolation(executionId, tick, violationType, message, details = {}) {
        const stmt = `
            INSERT INTO invariant_violations
            (execution_id, tick, violation_type, violation_message, rule_name, 
             severity, primitive_name, violation_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        return new Promise((resolve, reject) => {
            this.db.run(stmt, [
                executionId,
                tick,
                violationType,
                message,
                details.ruleName || null,
                details.severity || 'error',
                details.primitiveName || null,
                JSON.stringify(details.data || {})
            ], function(err) {
                if (err) {
                    reject(new Error(`Failed to log violation: ${err.message}`));
                } else {
                    console.log(`⚠️ Logged violation: ${violationType} at tick ${tick}`);
                    resolve({ violationId: this.lastID });
                }
            });
        });
    }

    /**
     * Complete execution with final results
     */
    async completeExecution(executionId, outputData, metrics = {}) {
        const outputJson = JSON.stringify(outputData);
        const outputHash = this.generateHash(outputJson);
        
        const stmt = `
            UPDATE executions 
            SET output_data = ?, output_hash = ?, execution_status = 'completed',
                completed_at = datetime('now'), 
                duration_ms = (julianday(datetime('now')) - julianday(started_at)) * 86400000,
                actual_iterations = ?
            WHERE execution_id = ?
        `;
        
        return new Promise((resolve, reject) => {
            this.db.run(stmt, [
                outputJson,
                outputHash,
                metrics.actualIterations || 0,
                executionId
            ], function(err) {
                if (err) {
                    reject(new Error(`Failed to complete execution: ${err.message}`));
                } else {
                    console.log(`✅ Completed execution: ${executionId}`);
                    resolve({ outputHash, changes: this.changes });
                }
            });
        });
    }

    /**
     * Save state snapshot for debugging
     */
    async saveStateSnapshot(executionId, tick, state, snapshotType = 'iteration') {
        const stateJson = JSON.stringify(state);
        const stateHash = this.generateHash(stateJson);
        
        const stmt = `
            INSERT OR REPLACE INTO state_snapshots
            (execution_id, tick, snapshot_type, state_data, state_hash)
            VALUES (?, ?, ?, ?, ?)
        `;
        
        return new Promise((resolve, reject) => {
            this.db.run(stmt, [
                executionId,
                tick,
                snapshotType,
                stateJson,
                stateHash
            ], function(err) {
                if (err) {
                    reject(new Error(`Failed to save snapshot: ${err.message}`));
                } else {
                    resolve({ snapshotId: this.lastID, stateHash });
                }
            });
        });
    }

    /**
     * Query execution history
     */
    async getExecutionHistory(limit = 20, offset = 0) {
        const stmt = `
            SELECT e.*, rv.name as rule_name, rv.version as rule_version,
                   COUNT(ml.id) as ledger_entries,
                   COUNT(iv.id) as violations
            FROM executions e
            LEFT JOIN rule_versions rv ON e.rule_version_id = rv.id  
            LEFT JOIN mneme_ledger ml ON e.execution_id = ml.execution_id
            LEFT JOIN invariant_violations iv ON e.execution_id = iv.execution_id
            GROUP BY e.id
            ORDER BY e.started_at DESC
            LIMIT ? OFFSET ?
        `;
        
        return new Promise((resolve, reject) => {
            this.db.all(stmt, [limit, offset], (err, rows) => {
                if (err) {
                    reject(new Error(`Failed to query history: ${err.message}`));
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Get detailed audit trail for specific execution
     */
    async getAuditTrail(executionId) {
        const stmt = `
            SELECT ml.*, iv.violation_type, iv.violation_message
            FROM mneme_ledger ml
            LEFT JOIN invariant_violations iv ON ml.execution_id = iv.execution_id 
              AND ml.tick = iv.tick
            WHERE ml.execution_id = ?
            ORDER BY ml.tick ASC
        `;
        
        return new Promise((resolve, reject) => {
            this.db.all(stmt, [executionId], (err, rows) => {
                if (err) {
                    reject(new Error(`Failed to get audit trail: ${err.message}`));
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Generate deterministic hash
     */
    generateHash(data) {
        return crypto.createHash('sha256')
            .update(typeof data === 'string' ? data : JSON.stringify(data))
            .digest('hex')
            .substring(0, 16); // 16-char hash for readability
    }

    /**
     * Close database connection
     */
    async close() {
        if (this.db) {
            return new Promise((resolve) => {
                this.db.close((err) => {
                    if (err) {
                        console.error('Error closing database:', err.message);
                    } else {
                        console.log('📁 Database connection closed');
                    }
                    resolve();
                });
            });
        }
    }

    /**
     * Export execution data as JSON for backup/analysis
     */
    async exportExecution(executionId, outputPath = null) {
        if (!outputPath) {
            outputPath = `./exports/execution_${executionId}_${Date.now()}.json`;
        }
        
        // Ensure export directory exists
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        const execution = await new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM executions WHERE execution_id = ?', 
                [executionId], 
                (err, row) => err ? reject(err) : resolve(row)
            );
        });
        
        if (!execution) {
            throw new Error(`Execution ${executionId} not found`);
        }
        
        const auditTrail = await this.getAuditTrail(executionId);
        
        const exportData = {
            execution,
            auditTrail,
            exportTimestamp: new Date().toISOString(),
            exportVersion: "1.0"
        };
        
        fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
        console.log(`📤 Exported execution ${executionId} to: ${outputPath}`);
        
        return outputPath;
    }
}

// CLI Interface for standalone usage
async function main() {
    const args = process.argv.slice(2);
    
    if (args[0] === 'init') {
        const dbPath = args[1] || './database/kern_state.db';
        const persistence = new KernSqlitePersistence(dbPath);
        
        try {
            await persistence.initialize();
            console.log('🎯 KERN SQLite persistence layer initialized successfully!');
        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
        } finally {
            await persistence.close();
        }
        
    } else if (args[0] === 'history') {
        const dbPath = args[1] || './database/kern_state.db';
        const limit = parseInt(args[2]) || 10;
        
        const persistence = new KernSqlitePersistence(dbPath);
        await persistence.initialize();
        
        try {
            const history = await persistence.getExecutionHistory(limit);
            console.log('\n📚 Execution History:');
            console.table(history.map(h => ({
                ID: h.execution_id.substring(0, 8),
                Rule: h.rule_name,
                Version: h.rule_version,
                Status: h.execution_status,
                Started: h.started_at,
                Duration: h.duration_ms ? `${h.duration_ms}ms` : 'N/A',
                Entries: h.ledger_entries,
                Violations: h.violations
            })));
        } finally {
            await persistence.close();
        }
        
    } else if (args[0] === 'export') {
        const executionId = args[1];
        const outputPath = args[2];
        const dbPath = args[3] || './database/kern_state.db';
        
        if (!executionId) {
            console.error('❌ Export requires execution ID');
            return;
        }
        
        const persistence = new KernSqlitePersistence(dbPath);
        await persistence.initialize();
        
        try {
            const exported = await persistence.exportExecution(executionId, outputPath);
            console.log(`✅ Export complete: ${exported}`);
        } finally {
            await persistence.close();
        }
        
    } else {
        console.log(`
📊 KERN SQLite Persistence Layer

Commands:
  node sqlite-persistence-layer.js init [db-path]           Initialize database
  node sqlite-persistence-layer.js history [db-path] [limit]  Show execution history  
  node sqlite-persistence-layer.js export <execution-id> [output-path] [db-path]

Examples:
  node sqlite-persistence-layer.js init ./database/kern_state.db
  node sqlite-persistence-layer.js history ./database/kern_state.db 20
  node sqlite-persistence-layer.js export abc123def456 ./backup.json
    `);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = KernSqlitePersistence;