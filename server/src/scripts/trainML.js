/**
 * Standalone CLI Script to Train/Retrain the Random Forest ML Recommendation Model.
 * 
 * Flow:
 * 1. Initializes database connection if available.
 * 2. Extracts training dataset from actual student interactions, applications, and benchmark seed data.
 * 3. Saves dataset to server/ml/data/training_data.json.
 * 4. Spawns Python train.py process to fit the Random Forest model and compute real metrics.
 * 5. Prints evaluation summary to console.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { connectDB, closeDB } = require('../config/db');
const { exportTrainingDataset, DEFAULT_EXPORT_PATH } = require('../services/mlDatasetGenerator');

async function runTraining() {
  console.log('======================================================');
  console.log('STARTING EDUCONNECT RANDOM FOREST ML MODEL TRAINING');
  console.log('======================================================\n');

  let dbConnected = false;
  try {
    await connectDB();
    dbConnected = true;
  } catch (err) {
    console.warn('[ML Train] Notice: Running in offline/file mode without active DB connection:', err.message);
  }

  try {
    // 1. Export training data
    console.log('Step 1: Generating training dataset with anti-leakage features...');
    const dataMeta = await exportTrainingDataset(DEFAULT_EXPORT_PATH, { includeSeed: true });
    console.log(`Step 1 complete: ${dataMeta.totalSamples} total samples (${dataMeta.positiveSamples} positive, ${dataMeta.negativeSamples} negative).\n`);

    // 2. Run Python training script
    console.log('Step 2: Spawning Python RandomForest training process...');
    const trainScriptPath = path.resolve(__dirname, '../../ml/train.py');
    const pythonExe = process.env.PYTHON_PATH || 'python';

    const pythonProcess = spawn(pythonExe, [trainScriptPath, '--data', DEFAULT_EXPORT_PATH], {
      cwd: path.resolve(__dirname, '../../ml'),
      env: { ...process.env, PYTHONPATH: path.resolve(__dirname, '../../ml') }
    });

    pythonProcess.stdout.on('data', (data) => {
      process.stdout.write(data.toString());
    });

    pythonProcess.stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });

    const exitCode = await new Promise((resolve) => {
      pythonProcess.on('close', resolve);
    });

    if (exitCode === 0) {
      console.log('\n[SUCCESS] Random Forest ML model training completed successfully!');
      
      // Print metrics.json summary
      const metricsPath = path.resolve(__dirname, '../../ml/artifacts/metrics.json');
      if (fs.existsSync(metricsPath)) {
        const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'));
        console.log('\n--- Model Evaluation Summary ---');
        console.log(`Status:    ${metrics.status}`);
        console.log(`Accuracy:  ${metrics.accuracy}`);
        console.log(`Precision: ${metrics.precision}`);
        console.log(`Recall:    ${metrics.recall}`);
        console.log(`F1 Score:  ${metrics.f1}`);
        console.log(`ROC-AUC:   ${metrics.roc_auc}`);
      }
    } else {
      console.error(`\n[ERROR] Python ML training process exited with code ${exitCode}`);
      process.exit(exitCode);
    }
  } catch (err) {
    console.error('Fatal error during ML training execution:', err);
    process.exit(1);
  } finally {
    if (dbConnected) {
      await closeDB();
    }
  }
}

if (require.main === module) {
  runTraining();
}

module.exports = { runTraining };
