"""
Feature Engineering Module for EduConnect Recommendation Engine.

This module provides a unified, deterministic feature extraction layer
used across:
1. Training data preparation
2. Model evaluation / testing
3. Live real-time inference in the recommendation service

Features (Schema Order):
1.  departmentMatch       (float 0.0 or 1.0)
2.  yearEligible          (float 0.0 or 1.0)
3.  cgpaEligible          (float 0.0 or 1.0)
4.  cgpaDiff              (float, student.cgpa - opp.minCGPA)
5.  skillMatchRatio       (float 0.0 to 1.0)
6.  interestMatchRatio    (float 0.0 to 1.0)
7.  typeMatch             (float 0.0 or 1.0)
8.  modeMatch             (float 0.0 to 1.0)
9.  hasPriorInteraction   (float 0.0 or 1.0)
10. priorInteractionCount (float, non-negative integer count)
11. hasBookmarked         (float 0.0 or 1.0)
12. hasApplied            (float 0.0 or 1.0)
13. deadlineDays          (float, days remaining, or -1.0 if missing)
14. semanticCosineSim     (float 0.0 to 1.0, TF-IDF Cosine Similarity)
"""

import math
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

FEATURE_NAMES: List[str] = [
    "departmentMatch",
    "yearEligible",
    "cgpaEligible",
    "cgpaDiff",
    "skillMatchRatio",
    "interestMatchRatio",
    "typeMatch",
    "modeMatch",
    "hasPriorInteraction",
    "priorInteractionCount",
    "hasBookmarked",
    "hasApplied",
    "deadlineDays",
    "semanticCosineSim"
]

STOPWORDS = {
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
    'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
    'between', 'both', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'doing',
    'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have',
    'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
    'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'me', 'more', 'most', 'my',
    'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other',
    'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she', 'should', 'so',
    'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves',
    'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under',
    'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which',
    'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your', 'yours'
}


def normalize_text(text: Optional[str]) -> str:
    """Normalize string to lowercase and stripped whitespace."""
    if not text:
        return ""
    return str(text).strip().lower()


def tokenize(text: Optional[str]) -> List[str]:
    """Tokenize and filter stopwords from text."""
    if not text:
        return []
    cleaned = re.sub(r'[^a-z0-9+#.\s-]', ' ', str(text).lower())
    words = re.split(r'[\s,/;]+', cleaned)
    return [w.strip() for w in words if len(w.strip()) > 1 and w.strip() not in STOPWORDS]


def build_student_document(student: Dict[str, Any]) -> str:
    """Build text representation of student profile with term weighting."""
    skills = " ".join(student.get("skills") or [])
    interests = " ".join(student.get("interests") or [])
    department = student.get("department") or ""
    # Skills and interests are weighted 2x for semantic profile matching
    return f"{skills} {skills} {interests} {interests} {department}"


def build_opportunity_document(opportunity: Dict[str, Any]) -> str:
    """Build text representation of opportunity catalog entry."""
    title = opportunity.get("title") or ""
    desc = opportunity.get("description") or ""
    opp_type = opportunity.get("type") or ""
    org = opportunity.get("organization") or ""
    tags = " ".join(opportunity.get("tags") or [])
    elig = opportunity.get("eligibility") or {}
    req_skills = " ".join(elig.get("skills") or [])
    req_depts = " ".join(elig.get("department") or [])
    return f"{title} {desc} {opp_type} {org} {tags} {req_skills} {req_depts}"


def compute_tf_idf_cosine(doc_a: str, doc_b: str, corpus: Optional[List[str]] = None) -> float:
    """
    Compute cosine similarity between two text documents.
    If a corpus is provided, uses smoothed IDF weights across the corpus;
    otherwise computes standard normalized term-overlap cosine similarity.
    """
    tokens_a = tokenize(doc_a)
    tokens_b = tokenize(doc_b)
    if not tokens_a or not tokens_b:
        return 0.0

    tf_a: Dict[str, float] = {}
    for t in tokens_a:
        tf_a[t] = tf_a.get(t, 0.0) + 1.0

    tf_b: Dict[str, float] = {}
    for t in tokens_b:
        tf_b[t] = tf_b.get(t, 0.0) + 1.0

    len_a = float(len(tokens_a))
    len_b = float(len(tokens_b))

    vocab = set(tf_a.keys()).union(set(tf_b.keys()))

    idf: Dict[str, float] = {}
    if corpus and len(corpus) > 0:
        n_docs = float(len(corpus))
        for word in vocab:
            df = sum(1 for d in corpus if word in tokenize(d))
            idf[word] = math.log((n_docs + 1.0) / (df + 1.0)) + 1.0
    else:
        for word in vocab:
            idf[word] = 1.0

    vec_a = {w: (tf_a.get(w, 0.0) / len_a) * idf[w] for w in vocab}
    vec_b = {w: (tf_b.get(w, 0.0) / len_b) * idf[w] for w in vocab}

    dot_product = sum(vec_a[w] * vec_b[w] for w in vocab)
    norm_a = math.sqrt(sum(v * v for v in vec_a.values()))
    norm_b = math.sqrt(sum(v * v for v in vec_b.values()))

    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0

    sim = dot_product / (norm_a * norm_b)
    return float(max(0.0, min(1.0, sim)))


def parse_datetime(val: Any) -> Optional[datetime]:
    """Parse various timestamp representations into timezone-aware UTC datetime."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    if isinstance(val, (int, float)):
        return datetime.fromtimestamp(val / 1000.0, tz=timezone.utc)
    if isinstance(val, str):
        val = val.strip()
        if not val:
            return None
        try:
            # Replace trailing 'Z' for ISO parsing
            cleaned = val.replace('Z', '+00:00')
            dt = datetime.fromisoformat(cleaned)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            return None
    return None


def extract_features(
    student: Dict[str, Any],
    opportunity: Dict[str, Any],
    past_interactions: Optional[List[Dict[str, Any]]] = None,
    reference_time: Optional[Any] = None,
    corpus_documents: Optional[List[str]] = None
) -> Dict[str, float]:
    """
    Extract a deterministic feature dictionary for a (student, opportunity) pair.
    
    Parameters:
    - student: Student profile dictionary
    - opportunity: Opportunity catalog item
    - past_interactions: List of interactions involving this student occurred BEFORE reference_time
    - reference_time: Timestamp cutoff to avoid future data leakage
    - corpus_documents: Optional list of opportunity texts for IDF estimation
    """
    ref_dt = parse_datetime(reference_time) or datetime.now(timezone.utc)
    past_interactions = past_interactions or []

    # 1. Academic & Eligibility Features
    student_dept = normalize_text(student.get("department"))
    student_year = float(student.get("year") or 1)
    student_cgpa = float(student.get("cgpa") or 0.0)

    elig = opportunity.get("eligibility") or {}
    opp_depts = [normalize_text(d) for d in (elig.get("department") or [])]
    opp_min_year = float(elig.get("minYear") if elig.get("minYear") is not None else 1)
    opp_min_cgpa = float(elig.get("minCGPA") if elig.get("minCGPA") is not None else 0.0)
    opp_skills = [normalize_text(s) for s in (elig.get("skills") or [])]

    # Department match: open to all if empty or contains 'all' / 'any'
    is_dept_open = len(opp_depts) == 0 or 'all' in opp_depts or 'any' in opp_depts
    dept_match = 1.0 if (is_dept_open or (student_dept and student_dept in opp_depts)) else 0.0

    # Year eligibility
    year_eligible = 1.0 if student_year >= opp_min_year else 0.0

    # CGPA eligibility
    cgpa_eligible = 1.0 if student_cgpa >= opp_min_cgpa else 0.0
    cgpa_diff = float(student_cgpa - opp_min_cgpa)

    # 2. Profile & Opportunity Matching
    student_skills = [normalize_text(s) for s in (student.get("skills") or [])]
    student_interests = [normalize_text(i) for i in (student.get("interests") or [])]

    if len(opp_skills) == 0:
        skill_match_ratio = 1.0  # Open skill entry
    else:
        matched_skills = 0
        for req_skill in opp_skills:
            if any(s == req_skill or req_skill in s or s in req_skill for s in student_skills):
                matched_skills += 1
        skill_match_ratio = float(matched_skills / len(opp_skills))

    # Interest matching against opportunity content
    opp_type = normalize_text(opportunity.get("type"))
    opp_tags = [normalize_text(t) for t in (opportunity.get("tags") or [])]
    opp_text_blob = f"{normalize_text(opportunity.get('title'))} {normalize_text(opportunity.get('description'))} {' '.join(opp_tags)}"

    if len(student_interests) == 0:
        interest_match_ratio = 0.5  # Neutral baseline
    else:
        matched_interests = 0
        for interest in student_interests:
            if interest and (interest in opp_text_blob or interest in opp_type or any(interest in t or t in interest for t in opp_tags)):
                matched_interests += 1
        interest_match_ratio = float(matched_interests / len(student_interests))

    # Type match
    type_plural = f"{opp_type}s"
    type_match = 1.0 if any(opp_type in i or type_plural in i or i in opp_type for i in student_interests) else 0.0

    # Mode match (online/hybrid is universally accessible)
    opp_mode = normalize_text(opportunity.get("mode") or "online")
    if opp_mode in ["online", "remote", "hybrid", ""]:
        mode_match = 1.0
    else:
        mode_match = 0.7

    # 3. Behavioral Features (Strictly Prior to reference_time)
    opp_id_str = str(opportunity.get("_id") or opportunity.get("id") or "")

    relevant_interactions = []
    for it in past_interactions:
        it_opp_id = str(it.get("opportunityId") or it.get("opportunity") or "")
        it_dt = parse_datetime(it.get("timestamp") or it.get("createdAt"))
        # Data leakage protection: only consider interactions before reference time
        if it_opp_id == opp_id_str:
            if it_dt is None or it_dt <= ref_dt:
                relevant_interactions.append(it)

    has_prior = 1.0 if len(relevant_interactions) > 0 else 0.0
    prior_count = float(len(relevant_interactions))

    has_bookmarked = 1.0 if any(it.get("interactionType") == "BOOKMARK" for it in relevant_interactions) else 0.0
    has_applied = 1.0 if any(it.get("interactionType") == "APPLY" for it in relevant_interactions) else 0.0

    # Also check student bookmarks array
    if not has_bookmarked and student.get("bookmarks"):
        bookmarked_ids = [str(b.get("_id") if isinstance(b, dict) else b) for b in student["bookmarks"]]
        if opp_id_str in bookmarked_ids:
            has_bookmarked = 1.0

    # 4. Opportunity Timing (Deadline Days)
    deadline_val = opportunity.get("deadline")
    deadline_dt = parse_datetime(deadline_val)

    if deadline_dt is None:
        # Documented missing deadline representation: -1.0 (never hallucinate a date)
        deadline_days = -1.0
    else:
        diff = (deadline_dt - ref_dt).total_seconds() / 86400.0
        deadline_days = float(diff)

    # 5. Semantic Cosine Similarity (TF-IDF vector space model)
    student_doc = build_student_document(student)
    opp_doc = build_opportunity_document(opportunity)
    semantic_sim = compute_tf_idf_cosine(student_doc, opp_doc, corpus=corpus_documents)

    return {
        "departmentMatch": dept_match,
        "yearEligible": year_eligible,
        "cgpaEligible": cgpa_eligible,
        "cgpaDiff": round(cgpa_diff, 4),
        "skillMatchRatio": round(skill_match_ratio, 4),
        "interestMatchRatio": round(interest_match_ratio, 4),
        "typeMatch": type_match,
        "modeMatch": mode_match,
        "hasPriorInteraction": has_prior,
        "priorInteractionCount": prior_count,
        "hasBookmarked": has_bookmarked,
        "hasApplied": has_applied,
        "deadlineDays": round(deadline_days, 2),
        "semanticCosineSim": round(semantic_sim, 4)
    }


def feature_dict_to_vector(feat_dict: Dict[str, float]) -> List[float]:
    """Convert feature dictionary to fixed-order numeric vector."""
    return [float(feat_dict.get(name, 0.0)) for name in FEATURE_NAMES]


def extract_feature_vector(
    student: Dict[str, Any],
    opportunity: Dict[str, Any],
    past_interactions: Optional[List[Dict[str, Any]]] = None,
    reference_time: Optional[Any] = None,
    corpus_documents: Optional[List[str]] = None
) -> List[float]:
    """Extract ordered numeric feature vector for a student-opportunity pair."""
    f_dict = extract_features(student, opportunity, past_interactions, reference_time, corpus_documents)
    return feature_dict_to_vector(f_dict)
