/**
 * Random Forest ML Recommendation Service for EduConnect.
 * 
 * Flow:
 * 1. Hard Eligibility Filter:
 *    - Strict academic gates for Department, Year of Study, and CGPA cutoff.
 *    - Ineligible opportunities never outrank eligible ones.
 * 2. Supervised ML Ranking (RandomForestClassifier):
 *    - Communicates with Python inference engine to predict student engagement probability.
 * 3. Transparent Fallback:
 *    - If Python is unavailable, model is unbuilt, or prediction times out,
 *      gracefully degrades to the Content-Based Cosine / Rule-based engine.
 * 4. Model Metadata & Status:
 *    - Exposes operational health, evaluation metrics, and feature schema.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { generateMLRecommendations } = require('./mlRecommendationEngine');
const { generateRecommendations } = require('./recommendationEngine');

const MODEL_PATH = path.resolve(__dirname, '../../ml/artifacts/random_forest_model.joblib');
const METRICS_PATH = path.resolve(__dirname, '../../ml/artifacts/metrics.json');
const METADATA_PATH = path.resolve(__dirname, '../../ml/artifacts/model_metadata.json');
const PREDICT_SCRIPT = path.resolve(__dirname, '../../ml/predict.py');

/**
 * Check if the trained Random Forest model artifact is present and readable.
 */
function isModelAvailable() {
  return fs.existsSync(MODEL_PATH) && fs.existsSync(PREDICT_SCRIPT);
}

/**
 * Execute Python prediction process with timeout safety.
 */
async function predictWithPython(payload, timeoutMs = 10000) {
  if (!isModelAvailable()) {
    throw new Error('ML model artifact or predict script not found on disk.');
  }

  const pythonExe = process.env.PYTHON_PATH || 'python';

  return new Promise((resolve, reject) => {
    let stdoutData = '';
    let stderrData = '';
    let timedOut = false;

    const child = spawn(pythonExe, [PREDICT_SCRIPT], {
      cwd: path.resolve(__dirname, '../../ml'),
      env: { ...process.env, PYTHONPATH: path.resolve(__dirname, '../../ml') }
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      reject(new Error(`Python ML inference timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdoutData += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;

      if (code !== 0) {
        return reject(new Error(`Python ML process exited with code ${code}: ${stderrData || stdoutData}`));
      }

      try {
        const parsed = JSON.parse(stdoutData.trim());
        resolve(parsed);
      } catch (parseErr) {
        reject(new Error(`Failed to parse ML output JSON: ${parseErr.message}. Output was: ${stdoutData}`));
      }
    });

    child.stdin.on('error', (err) => {
      // Safely ignore stdin errors (e.g. EOF/EPIPE when python process exits early)
    });

    // Write input payload to stdin
    try {
      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    } catch (_) {}
  });
}

/**
 * Check hard eligibility constraints for a student against an opportunity.
 */
function checkEligibility(student, opportunity) {
  const studentDept = (student.department || '').trim().toLowerCase();
  const studentYear = Number(student.year) || 1;
  const studentCGPA = Number(student.cgpa) || 0;

  const oppEligibility = opportunity.eligibility || {};
  const oppDepts = (oppEligibility.department || []).map(d => d.trim().toLowerCase());
  const oppMinYear = Number(oppEligibility.minYear) || 1;
  const oppMinCGPA = Number(oppEligibility.minCGPA) || 0;

  const isDeptMatch = oppDepts.length === 0 || oppDepts.includes('all') || oppDepts.includes('any') || (studentDept && oppDepts.includes(studentDept));
  const isYearMatch = studentYear >= oppMinYear;
  const isCGPAMatch = studentCGPA >= oppMinCGPA;

  const isEligible = isDeptMatch && isYearMatch && isCGPAMatch;

  const reasons = [];
  if (isEligible) {
    reasons.push(`Eligibility Gate: Satisfies branch (${student.department || 'All'}), Year (${studentYear} >= ${oppMinYear}), and CGPA (${studentCGPA.toFixed(2)} >= ${oppMinCGPA.toFixed(2)})`);
  } else {
    if (!isDeptMatch) reasons.push(`Ineligible (Branch): Requires [${(oppEligibility.department || []).join(', ')}]`);
    if (!isYearMatch) reasons.push(`Ineligible (Year): Requires minimum Year ${oppMinYear}`);
    if (!isCGPAMatch) reasons.push(`Ineligible (CGPA): Requires minimum CGPA ${oppMinCGPA.toFixed(2)}`);
  }

  return { isEligible, reasons };
}

/**
 * Generate explainable match reasons for a Random Forest prediction.
 */
function generateRFMatchReasons(features, probability, isEligible, gateReasons) {
  const reasons = [];

  // Academic Gate statement
  if (gateReasons && gateReasons.length > 0) {
    reasons.push(gateReasons[0]);
  }

  // ML probability statement
  const pct = Math.round(probability * 100);
  reasons.push(`Random Forest ML: Model estimated ${pct}% probability of positive engagement.`);

  if (features) {
    // Semantic similarity
    if (features.semanticCosineSim > 0.3) {
      reasons.push(`Semantic Relevance: High profile-description cosine similarity (${(features.semanticCosineSim * 100).toFixed(1)}%).`);
    }

    // Skills match
    if (features.skillMatchRatio >= 0.8) {
      reasons.push(`Skill Alignment: High overlap with required skills (${Math.round(features.skillMatchRatio * 100)}%).`);
    } else if (features.skillMatchRatio > 0) {
      reasons.push(`Skill Overlap: Matches ${Math.round(features.skillMatchRatio * 100)}% of required skills.`);
    }

    // CGPA margin
    if (features.cgpaDiff > 1.0) {
      reasons.push(`Academic Merit: Strong CGPA buffer (+${features.cgpaDiff.toFixed(2)} above cutoff).`);
    }

    // Prior behavior
    if (features.hasBookmarked) {
      reasons.push('Prior Engagement: Previously bookmarked this opportunity.');
    } else if (features.hasPriorInteraction) {
      reasons.push(`Behavioral History: ${features.priorInteractionCount} prior view/exploration event(s).`);
    }

    // Type alignment
    if (features.typeMatch === 1) {
      reasons.push('Interest Focus: Directly aligns with your stated opportunity type interest.');
    }
  }

  return reasons;
}

/**
 * Generate Supervised Random Forest Recommendations for a Student.
 */
async function generateRFRecommendations(student, opportunities, pastInteractions = [], options = {}) {
  if (!opportunities || opportunities.length === 0) {
    return {
      recommendations: [],
      model: 'RandomForestClassifier',
      modelVersion: '1.0.0',
      fallback: false
    };
  }

  // Attempt ML prediction
  try {
    const payload = {
      student,
      opportunities,
      pastInteractions,
      referenceTime: new Date().toISOString()
    };

    const mlResponse = await predictWithPython(payload, options.timeout || 5000);
    const predictionMap = new Map((mlResponse.predictions || []).map(p => [p.opportunityId, p]));

    const results = opportunities.map(opp => {
      const oppIdStr = opp._id ? opp._id.toString() : opp.id;
      const pred = predictionMap.get(oppIdStr) || { probability: 0.5, features: {} };
      const { isEligible, reasons: gateReasons } = checkEligibility(student, opp);

      const probability = pred.probability;
      // Convert engagement probability into a 0-100 display score
      let score = Math.round(probability * 100);

      // Hard Eligibility Gate: Ineligible items are capped at 25% and marked Ineligible
      if (!isEligible) {
        score = Math.min(25, Math.floor(score * 0.25));
      }

      const matchReasons = generateRFMatchReasons(pred.features, probability, isEligible, gateReasons);

      return {
        opportunityId: opp._id,
        opportunity: opp,
        score: Math.max(5, score),
        probability: probability,
        rfScore: Math.max(5, score),
        hybridScore: Math.max(5, score),
        matchReasons,
        eligibilityStatus: isEligible ? 'Eligible' : 'Ineligible',
        features: pred.features,
        model: 'RandomForestClassifier',
        activeEngine: 'random_forest'
      };
    });

    // Hard eligibility sorting: All Eligible items rank before Ineligible items,
    // sorted descending by predicted probability score
    results.sort((a, b) => {
      if (a.eligibilityStatus === 'Eligible' && b.eligibilityStatus !== 'Eligible') return -1;
      if (a.eligibilityStatus !== 'Eligible' && b.eligibilityStatus === 'Eligible') return 1;
      return b.score - a.score;
    });

    return {
      recommendations: results,
      model: 'RandomForestClassifier',
      modelVersion: mlResponse.modelVersion || '1.0.0',
      fallback: false
    };
  } catch (err) {
    console.warn(`[ML Recommendation] Notice: ML recommendation unavailable (${err.message}). Using existing recommendation fallback.`);

    // Fallback to Content-Based ML Vector Space Model / Rule Engine
    const fallbackResults = generateMLRecommendations(student, opportunities);
    const markedResults = fallbackResults.map(item => ({
      ...item,
      probability: Number((item.score / 100).toFixed(4)),
      activeEngine: 'fallback_cosine'
    }));

    return {
      recommendations: markedResults,
      model: 'TF-IDF Cosine Similarity Model (Fallback)',
      modelVersion: 'fallback',
      fallback: true,
      fallbackReason: err.message
    };
  }
}

/**
 * Retrieve ML Model Status and Operational Health.
 */
function getMLStatus() {
  const modelExists = isModelAvailable();

  if (!modelExists || !fs.existsSync(METRICS_PATH)) {
    return {
      available: false,
      status: 'uninitialized',
      reason: 'Model artifact not yet trained. Run `npm run train:ml` to generate model artifacts.',
      model: 'RandomForestClassifier'
    };
  }

  try {
    const metricsRaw = fs.readFileSync(METRICS_PATH, 'utf-8');
    const metrics = JSON.parse(metricsRaw);

    let metadata = {};
    if (fs.existsSync(METADATA_PATH)) {
      metadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf-8'));
    }

    return {
      available: metrics.available !== false,
      status: metrics.status || 'trained',
      model: metrics.model || 'RandomForestClassifier',
      version: metadata.version || '1.0.0',
      trainedAt: metrics.trained_at,
      trainingSamples: metrics.training_samples,
      testSamples: metrics.test_samples,
      totalSamples: metrics.total_samples,
      classDistribution: metrics.class_distribution,
      features: metrics.features,
      featureImportances: metrics.feature_importances,
      metrics: {
        accuracy: metrics.accuracy,
        precision: metrics.precision,
        recall: metrics.recall,
        f1: metrics.f1,
        roc_auc: metrics.roc_auc,
        confusionMatrix: metrics.confusion_matrix
      }
    };
  } catch (err) {
    return {
      available: false,
      status: 'error_reading_artifacts',
      reason: err.message,
      model: 'RandomForestClassifier'
    };
  }
}

/**
 * Compare Existing Recommender vs Random Forest Recommender.
 */
async function compareRecommenders(student, opportunities, pastInteractions = []) {
  const ruleRecommendations = generateRecommendations(student, opportunities);
  const cosineRecommendations = generateMLRecommendations(student, opportunities);
  const rfResponse = await generateRFRecommendations(student, opportunities, pastInteractions);

  const ruleMap = new Map(ruleRecommendations.map(r => [r.opportunityId.toString(), r]));
  const cosineMap = new Map(cosineRecommendations.map(c => [c.opportunityId.toString(), c]));

  const comparison = (rfResponse.recommendations || []).map((rfItem, rfRank) => {
    const oppIdStr = rfItem.opportunityId.toString();
    const ruleItem = ruleMap.get(oppIdStr);
    const cosineItem = cosineMap.get(oppIdStr);

    const ruleRank = ruleRecommendations.findIndex(r => r.opportunityId.toString() === oppIdStr);
    const cosineRank = cosineRecommendations.findIndex(c => c.opportunityId.toString() === oppIdStr);

    return {
      opportunityId: rfItem.opportunityId,
      title: rfItem.opportunity.title,
      type: rfItem.opportunity.type,
      eligibilityStatus: rfItem.eligibilityStatus,
      randomForest: {
        rank: rfRank + 1,
        score: rfItem.score,
        probability: rfItem.probability
      },
      cosineSimilarity: {
        rank: cosineRank + 1,
        score: cosineItem ? cosineItem.hybridScore : null,
        cosineSim: cosineItem ? cosineItem.cosineSimilarity : null
      },
      ruleBased: {
        rank: ruleRank + 1,
        score: ruleItem ? ruleItem.score : null
      }
    };
  });

  return {
    studentId: student._id,
    totalEvaluated: opportunities.length,
    rfModelAvailable: !rfResponse.fallback,
    comparison
  };
}

module.exports = {
  isModelAvailable,
  predictWithPython,
  checkEligibility,
  generateRFRecommendations,
  getMLStatus,
  compareRecommenders,
  MODEL_PATH,
  METRICS_PATH,
  METADATA_PATH
};
