/**
 * Machine Learning Recommendation Engine (Content-Based Vector Space Model)
 * 
 * Technical Methodology:
 * 1. Text Preprocessing: Lowercasing, tokenization, stopword removal, and term extraction.
 * 2. TF-IDF Vectorizer: Term Frequency - Inverse Document Frequency mapping across the corpus.
 * 3. High-Dimensional Vector Space Modeling: Converts student profile (skills, interests, department)
 *    and opportunity documents (title, description, requirements, tags) into sparse/dense feature vectors.
 * 4. Cosine Similarity Calculation:
 *      CosineSimilarity(A, B) = (A . B) / (||A|| * ||B||)
 * 5. Feature Importance Extraction: Identifies top overlapping TF-IDF terms driving the match.
 * 6. Hybrid Integration: Combines Hard Eligibility Constraints (Rule Gate) with ML Cosine Ranking.
 */

const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'aren\'t', 'as', 'at', 'be', 'because', 'been', 'before', 'being',
  'below', 'between', 'both', 'but', 'by', 'can', 'cannot', 'could', 'did', 'do',
  'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had',
  'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'let\'s',
  'me', 'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on',
  'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over',
  'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the',
  'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this',
  'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we',
  'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with',
  'would', 'you', 'your', 'yours', 'yourself', 'yourselves'
]);

/**
 * Tokenize and normalize text into clean words
 */
function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/[\s,/;]+/)
    .map(w => w.trim())
    .filter(w => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Build a document representation from an opportunity
 */
function buildOpportunityDocument(opp) {
  const parts = [
    opp.title || '',
    opp.description || '',
    opp.type || '',
    opp.organization || '',
    (opp.tags || []).join(' '),
    (opp.eligibility?.skills || []).join(' '),
    (opp.eligibility?.department || []).join(' ')
  ];
  return parts.join(' ');
}

/**
 * Build a document representation from a student profile
 */
function buildStudentDocument(student) {
  // Give high weight to skills and interests by repeating their prominence
  const skillsText = (student.skills || []).join(' ');
  const interestsText = (student.interests || []).join(' ');
  const deptText = student.department || '';

  const parts = [
    skillsText,
    skillsText, // 2x weight on explicit technical skills
    interestsText,
    interestsText, // 2x weight on student interests
    deptText
  ];
  return parts.join(' ');
}

/**
 * TF-IDF Vectorizer & Cosine Similarity Model
 */
class ContentBasedRecommenderModel {
  constructor() {
    this.vocabulary = new Map(); // term -> index
    this.idf = []; // index -> idf value
    this.corpusSize = 0;
  }

  /**
   * Fit the model on the opportunity catalog corpus
   */
  fit(documents) {
    this.corpusSize = documents.length;
    this.vocabulary.clear();
    const docTermFreqs = [];
    const docFrequency = new Map();

    // 1. Compute term frequencies per document
    documents.forEach((doc, docIdx) => {
      const tokens = tokenize(doc);
      const tf = new Map();
      const uniqueTokensInDoc = new Set(tokens);

      tokens.forEach(token => {
        tf.set(token, (tf.get(token) || 0) + 1);
      });

      docTermFreqs.push(tf);

      // Track document frequency (DF) for IDF calculation
      uniqueTokensInDoc.forEach(token => {
        docFrequency.set(token, (docFrequency.get(token) || 0) + 1);
      });
    });

    // 2. Build vocabulary and IDF vector
    let termIndex = 0;
    this.idf = [];

    docFrequency.forEach((df, term) => {
      this.vocabulary.set(term, termIndex);
      // Smoothed IDF: log((N + 1) / (df + 1)) + 1
      const idfValue = Math.log((this.corpusSize + 1) / (df + 1)) + 1;
      this.idf[termIndex] = idfValue;
      termIndex++;
    });

    return this;
  }

  /**
   * Transform text into a normalized TF-IDF vector
   */
  transform(text) {
    const tokens = tokenize(text);
    const vector = new Array(this.vocabulary.size).fill(0);
    const tf = new Map();

    tokens.forEach(token => {
      tf.set(token, (tf.get(token) || 0) + 1);
    });

    const totalTokens = tokens.length || 1;

    tf.forEach((count, token) => {
      const termIdx = this.vocabulary.get(token);
      if (termIdx !== undefined) {
        // Augmented term frequency
        const tfNorm = count / totalTokens;
        vector[termIdx] = tfNorm * this.idf[termIdx];
      }
    });

    // L2 Vector Normalization
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] = vector[i] / norm;
      }
    }

    return vector;
  }

  /**
   * Compute Cosine Similarity between two L2-normalized vectors
   */
  cosineSimilarity(vectorA, vectorB) {
    let dotProduct = 0;
    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
    }
    return Math.max(0, Math.min(1, dotProduct));
  }

  /**
   * Extract top contributing feature terms explaining the cosine similarity
   */
  extractTopFeatures(vectorA, vectorB, topN = 4) {
    const featureWeights = [];
    this.vocabulary.forEach((termIdx, term) => {
      const contribution = vectorA[termIdx] * vectorB[termIdx];
      if (contribution > 0) {
        featureWeights.push({ term, weight: contribution });
      }
    });

    featureWeights.sort((a, b) => b.weight - a.weight);
    return featureWeights.slice(0, topN);
  }
}

/**
 * Generate Hybrid & ML Recommendations
 */
function generateMLRecommendations(student, opportunities) {
  if (!opportunities || opportunities.length === 0) {
    return [];
  }

  // 1. Build document corpus
  const oppDocuments = opportunities.map(buildOpportunityDocument);
  const studentDoc = buildStudentDocument(student);

  // 2. Train / Fit TF-IDF Vectorizer
  const model = new ContentBasedRecommenderModel();
  model.fit(oppDocuments);

  const studentVector = model.transform(studentDoc);

  // 3. Score each opportunity
  const results = opportunities.map((opp, idx) => {
    const oppVector = model.transform(oppDocuments[idx]);
    const cosineSim = model.cosineSimilarity(studentVector, oppVector);
    const topFeatures = model.extractTopFeatures(studentVector, oppVector);

    // Hard eligibility checks
    const studentDept = (student.department || '').trim().toLowerCase();
    const studentYear = Number(student.year) || 1;
    const studentCGPA = Number(student.cgpa) || 0;

    const oppEligibility = opp.eligibility || {};
    const oppDepts = (oppEligibility.department || []).map(d => d.trim().toLowerCase());
    const oppMinYear = Number(oppEligibility.minYear) || 1;
    const oppMinCGPA = Number(oppEligibility.minCGPA) || 0;

    const isDeptMatch = oppDepts.length === 0 || oppDepts.includes('all') || oppDepts.includes('any') || (studentDept && oppDepts.includes(studentDept));
    const isYearMatch = studentYear >= oppMinYear;
    const isCGPAMatch = studentCGPA >= oppMinCGPA;
    const isEligible = isDeptMatch && isYearMatch && isCGPAMatch;

    // Convert cosine similarity (0 to 1) into percentage score (0 to 100)
    // Scale cosine score nicely with a baseline for matching terms
    let mlScore = Math.round(cosineSim * 100);
    
    // Calculate hybrid ensemble score (70% ML Cosine Similarity + 30% CGPA/Academic Merit)
    const academicBonus = Math.round((Math.min(10, studentCGPA) / 10) * 30);
    let hybridScore = Math.min(100, Math.round(mlScore * 0.7 + academicBonus));

    if (!isEligible) {
      mlScore = Math.min(25, Math.floor(mlScore * 0.3));
      hybridScore = Math.min(25, Math.floor(hybridScore * 0.3));
    }

    const mlReasons = [];
    if (topFeatures.length > 0) {
      const topTermsList = topFeatures.map(f => `"${f.term}" (weight: ${f.weight.toFixed(2)})`).join(', ');
      mlReasons.push(`ML Feature Extraction: Strongest vector cosine alignment on ${topTermsList}`);
    } else {
      mlReasons.push('ML Vector Space: Found baseline semantic similarity across student profile tags');
    }

    if (isEligible) {
      mlReasons.push(`Academic Gate: Passed all hard constraints (Branch: ${student.department || 'All'}, Min Year: ${oppMinYear}, Cutoff CGPA: ${oppMinCGPA.toFixed(1)})`);
    } else {
      if (!isDeptMatch) mlReasons.push(`Academic Gate Violation: Ineligible department (Requires: ${(oppEligibility.department || []).join(', ')})`);
      if (!isYearMatch) mlReasons.push(`Academic Gate Violation: Ineligible year (Requires Year >= ${oppMinYear})`);
      if (!isCGPAMatch) mlReasons.push(`Academic Gate Violation: Cutoff not met (Requires CGPA >= ${oppMinCGPA.toFixed(1)})`);
    }

    return {
      opportunityId: opp._id,
      opportunity: opp,
      mlScore: Math.max(10, mlScore),
      hybridScore: Math.max(10, hybridScore),
      score: hybridScore, // Default score
      cosineSimilarity: Number(cosineSim.toFixed(4)),
      topFeatures,
      matchReasons: mlReasons,
      eligibilityStatus: isEligible ? 'Eligible' : 'Ineligible'
    };
  });

  // Sort descending by hybrid score, prioritizing eligible opportunities
  results.sort((a, b) => {
    if (a.eligibilityStatus === 'Eligible' && b.eligibilityStatus !== 'Eligible') return -1;
    if (a.eligibilityStatus !== 'Eligible' && b.eligibilityStatus === 'Eligible') return 1;
    return b.hybridScore - a.hybridScore;
  });

  return results;
}

module.exports = {
  tokenize,
  ContentBasedRecommenderModel,
  generateMLRecommendations
};
