# EduConnect - Unified Student Opportunity Platform

> **Review 1 Deliverable**: Student Opportunity Discovery and Recommendation Module

EduConnect is a centralized student opportunity platform covering **scholarships, internships, hackathons, and certifications**. The platform uses a **Hybrid Recommender System** combining **Hard Eligibility Rule Gates** (Department, Year, CGPA cutoff) with a **Content-Based Vector Space Machine Learning Model (TF-IDF and Cosine Similarity)**.

---

## Architecture and Core Modules

- **Tech Stack**: MERN (MongoDB, Express.js, React.js, Node.js) + Firebase Authentication.
- **Visual Design**: Professional Blue and White palette (`#1E40AF`, `#2563EB`, `#F8FAFC`, `#FFFFFF`, `#0F172A`). Zero emojis, clean institutional typography, and SVG iconography.
- **Authentication**: Strict login and student registration flow capturing academic credentials (Department, Year, CGPA, Technical Skills, and Areas of Interest).
- **Hybrid Recommender Engine**:
  - **Deterministic Rule Gate**: Enforces branch compliance, minimum study year, and cutoff CGPA. Ineligible opportunities are marked and penalized.
  - **Content-Based ML Vector Space Model**: Computes TF-IDF term weights and evaluates vector cosine similarity between student profiles and opportunity requirements.
  - **Explainability**: Outputs specific audit reasons and top TF-IDF matching tokens (e.g., `react`, `mongodb`).
- **Opportunity Catalog**: Filterable by category (Scholarships, Internships, Hackathons, Certifications), academic department, and search query.
- **Application Lifecycle Tracking**: Complete internal workflow (`Submitted`, `Under Review`, `Accepted`, `Rejected`) with direct links to external official portals.

---

## Directory Structure

```
educonnect/
├── client/                     # React.js Frontend (Vite + Tailwind CSS)
│   ├── src/
│   │   ├── components/         # Navbar, OpportunityCard, ApplyModal, AuthModal
│   │   ├── context/            # AuthContext (Firebase + JWT Session)
│   │   ├── pages/              # Landing, Recommendations, Opportunities, Applications, Profile
│   │   ├── api.js              # Axios API client with Bearer token interceptor
│   │   └── firebase.js         # Firebase Client SDK configuration
│   └── package.json
│
├── server/                     # Express.js REST API Backend
│   ├── src/
│   │   ├── config/             # MongoDB connection and Firebase Admin setup
│   │   ├── controllers/        # Auth, Student, Opportunity, Application controllers
│   │   ├── middleware/         # Token verification middleware
│   │   ├── models/             # Student, Opportunity, Application, Recommendation schemas
│   │   ├── routes/             # REST API routes
│   │   ├── seed/               # Curated opportunity dataset
│   │   ├── services/           # Rule engine and ML Vector Space services
│   │   └── tests/              # Automated verification test suite
│   └── package.json
│
└── package.json                # Root workspace configuration
```

---

---

## Quick Start Guide for Teammates / Developers

### 1. Clone the Repository & Install Dependencies
```bash
git clone <YOUR_GIT_REPOSITORY_URL>
cd educonnect
npm run setup
```
*(This automatically installs dependencies for root, backend server, and frontend client in one go).*

### 2. Configure Environment Files
- Copy `server/.env.example` to `server/.env`
- Copy `client/.env.example` to `client/.env`
*(If using Firebase Auth, fill in your Firebase configuration keys).*

### 3. Start Both Backend and Frontend (Single Command)
```bash
npm run dev
```
- **Backend API**: Runs on `http://localhost:5000`
- **Frontend UI**: Runs on `http://localhost:5173`

*(Alternatively, you can run `npm start` for standard mode).*

---

## Individual Service Commands

- **Run Automated Tests**: `npm test`
- **Start Backend only**: `npm run server` (or `npm run server:dev` for live reload)
- **Start Frontend only**: `npm run client`
- **Seed Opportunities Data**: `npm run seed`
