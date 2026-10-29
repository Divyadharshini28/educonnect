# EduConnect — Unified Student Opportunity Platform

EduConnect is a centralized web application that helps students discover scholarships, internships, hackathons, certification courses, workshops, and placement opportunities in one place.

The platform combines student profiles, eligibility checking, opportunity discovery, and personalized recommendations to help students find opportunities that match their academic background, skills, and interests.

## Features

- **Student Authentication:** Secure registration and login using Firebase Authentication.
- **Student Profiles:** Manage academic details, CGPA, skills, and interests.
- **Opportunity Discovery:** Browse, search, and filter educational and career opportunities.
- **Personalized Recommendations:** Combine eligibility rules with content-based similarity to identify relevant opportunities.
- **Application Tracking:** Track application progress for supported workflows.
- **Resume Intelligence:** Upload PDF or DOCX resumes, extract relevant information, and review suggested skills.
- **Opportunity Integrations:** Collect opportunity data from supported external APIs.
- **Administrator Management:** Protected administrative workflows for opportunity management and data synchronization.
- **Interaction Analytics:** Record student interactions to support future recommendation improvements.

## Technology Stack

- **Frontend:** React.js, Vite, Tailwind CSS
- **Backend:** Node.js, Express.js
- **Database:** MongoDB
- **Authentication:** Firebase Authentication
- **Resume Storage:** MongoDB GridFS
- **Recommendation Techniques:** Eligibility rules, TF-IDF, and cosine similarity

## Project Structure

```text
educonnect/
├── client/       # React frontend
├── server/       # Express backend and API services
├── docs/         # Technical documentation
└── package.json  # Root scripts and configuration
```

## Getting Started

### Prerequisites

- Node.js and npm
- MongoDB connection
- Firebase project and authentication configuration

### 1. Clone the repository

```bash
git clone https://github.com/Divyadharshini28/educonnect.git
cd educonnect
```

### 2. Install dependencies

If the root package configuration provides the setup script:

```bash
npm run setup
```

### 3. Configure environment variables

Create the required environment files using the example files provided in the repository, if available:

- `server/.env.example` → `server/.env`
- `client/.env.example` → `client/.env`

Configure the required database, Firebase, and API settings using your own credentials.

**Never commit environment files, service-account credentials, API keys, or passwords.**

### 4. Run the application

If the root development script is configured:

```bash
npm run dev
```

Expected local addresses:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5000`

Actual ports and commands may vary according to the project configuration.

## Testing

Run the test and build commands supported by the repository's package scripts. Examples documented for this project include:

```bash
npm test
npm run test:b5
npm run test:b6
npm --prefix client run build
```
