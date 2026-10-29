const mongoose = require('mongoose');
const Opportunity = require('../models/Opportunity');
const Student = require('../models/Student');

const sampleOpportunities = [
  // SCHOLARSHIPS
  {
    _id: new mongoose.Types.ObjectId('6a925f66dface60c7c05e37b'),
    title: 'National Scholarship Portal Post-Matric Merit Scheme',
    type: 'scholarship',
    organization: 'Ministry of Education and NSP',
    description: 'Government scholarship scheme awarding financial grants to undergraduate and postgraduate students with distinguished academic records.',
    eligibility: {
      department: ['All'],
      minYear: 1,
      minCGPA: 7.0,
      skills: []
    },
    deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    postedDate: new Date(),
    location: 'National / All States',
    stipendOrReward: 'INR 50,000 / year grant',
    officialUrl: 'https://scholarships.gov.in',
    tags: ['scholarship', 'merit', 'financial aid', 'government']
  },
  {
    _id: new mongoose.Types.ObjectId('6a925f66dface60c7c05e37c'),
    title: 'Google Generation Scholarship (Asia Pacific)',
    type: 'scholarship',
    organization: 'Google',
    description: 'Empowering undergraduate students in computer science and technology through educational funding, professional network building, and mentorship.',
    eligibility: {
      department: ['Computer Science', 'Information Technology', 'Data Science', 'Software Engineering'],
      minYear: 2,
      minCGPA: 8.0,
      skills: ['Python', 'C++', 'Java', 'Data Structures']
    },
    deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
    postedDate: new Date(),
    location: 'Remote / Asia Pacific',
    stipendOrReward: 'USD 2,500 grant and Google Mentorship',
    officialUrl: 'https://buildyourfuture.withgoogle.com/scholarships',
    tags: ['scholarship', 'diversity', 'google', 'computer science']
  },
  {
    _id: new mongoose.Types.ObjectId('6a925f66dface60c7c05e37d'),
    title: 'Reliance Foundation Undergraduate Scholarship',
    type: 'scholarship',
    organization: 'Reliance Foundation',
    description: 'Competitive scholarship designed to support outstanding undergraduate students pursuing degrees in engineering, science, and technology disciplines.',
    eligibility: {
      department: ['Computer Science', 'Information Technology', 'Electronics & Communication', 'Mechanical', 'Electrical'],
      minYear: 1,
      minCGPA: 7.5,
      skills: []
    },
    deadline: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    postedDate: new Date(),
    location: 'India',
    stipendOrReward: 'INR 2,00,000 overall degree grant',
    officialUrl: 'https://www.scholarships.reliancefoundation.org',
    tags: ['scholarship', 'engineering', 'reliance', 'stem']
  },

  // INTERNSHIPS
  {
    _id: new mongoose.Types.ObjectId('6a925f66dface60c7c05e37e'),
    title: 'Full-Stack MERN Developer Intern',
    type: 'internship',
    organization: 'Zeta Technologies',
    description: 'Join an agile engineering team building modern enterprise portals. Responsible for developing RESTful APIs, React frontends, and optimizing MongoDB queries.',
    eligibility: {
      department: ['Computer Science', 'Information Technology', 'Software Engineering'],
      minYear: 2,
      minCGPA: 7.0,
      skills: ['React', 'Node.js', 'Express', 'MongoDB', 'JavaScript']
    },
    deadline: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    postedDate: new Date(),
    location: 'Bengaluru / Hybrid',
    stipendOrReward: 'INR 25,000 / month stipend',
    officialUrl: 'https://internshala.com',
    tags: ['internship', 'web development', 'mern', 'fullstack', 'react']
  },
  {
    _id: new mongoose.Types.ObjectId('6a925f66dface60c7c05e37f'),
    title: 'AI and Data Science Research Intern',
    type: 'internship',
    organization: 'NeuralWave AI Labs',
    description: 'Conduct exploratory data analysis, implement NLP transformer models, and benchmark recommender algorithms on large real-world datasets.',
    eligibility: {
      department: ['Computer Science', 'Data Science', 'Information Technology', 'Artificial Intelligence'],
      minYear: 3,
      minCGPA: 8.0,
      skills: ['Python', 'Machine Learning', 'TensorFlow', 'PyTorch', 'SQL']
    },
    deadline: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
    postedDate: new Date(),
    location: 'Remote',
    stipendOrReward: 'INR 35,000 / month stipend',
    officialUrl: 'https://www.linkedin.com/jobs',
    tags: ['internship', 'ai', 'machine learning', 'data science', 'python']
  },
  {
    _id: new mongoose.Types.ObjectId('6a925f66dface60c7c05e380'),
    title: 'Cloud Systems and DevOps Intern',
    type: 'internship',
    organization: 'CloudScale Solutions',
    description: 'Work with infrastructure engineers to automate CI/CD pipelines, manage Docker containers, and deploy microservices on AWS.',
    eligibility: {
      department: ['Computer Science', 'Information Technology', 'Electronics & Communication'],
      minYear: 2,
      minCGPA: 7.2,
      skills: ['Linux', 'Docker', 'AWS', 'Git', 'Python']
    },
    deadline: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000),
    postedDate: new Date(),
    location: 'Hyderabad / Hybrid',
    stipendOrReward: 'INR 28,000 / month stipend',
    officialUrl: 'https://unstop.com/internships',
    tags: ['internship', 'cloud', 'devops', 'aws', 'docker']
  },

  // HACKATHONS
  {
    _id: new mongoose.Types.ObjectId('6a925f66dface60c7c05e381'),
    title: 'Smart India Hackathon (SIH) 2026',
    type: 'hackathon',
    organization: 'Ministry of Education and AICTE',
    description: 'Nationwide 36-hour hackathon providing students a platform to solve pressing challenges faced by government ministries, departments, and industries.',
    eligibility: {
      department: ['All'],
      minYear: 1,
      minCGPA: 6.0,
      skills: ['Problem Solving', 'Git', 'Team Collaboration']
    },
    deadline: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000),
    postedDate: new Date(),
    location: 'National Nodal Centers / Hybrid',
    stipendOrReward: 'INR 1,00,000 grand prize per problem statement',
    officialUrl: 'https://www.sih.gov.in',
    tags: ['hackathon', 'sih', 'innovation', 'government']
  },
  {
    _id: new mongoose.Types.ObjectId('6a925f66dface60c7c05e382'),
    title: 'FinTech Innovation Sprint 2026',
    type: 'hackathon',
    organization: 'Unstop and Razorpay',
    description: 'Design and build high-impact payment solutions, fraud detection algorithms, or smart budgeting agents.',
    eligibility: {
      department: ['Computer Science', 'Information Technology', 'Data Science'],
      minYear: 2,
      minCGPA: 7.0,
      skills: ['JavaScript', 'React', 'Node.js', 'API Integration']
    },
    deadline: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
    postedDate: new Date(),
    location: 'Virtual / Online',
    stipendOrReward: 'INR 3,00,000 prize pool',
    officialUrl: 'https://unstop.com/hackathons',
    tags: ['hackathon', 'fintech', 'unstop', 'web development']
  },
  {
    _id: new mongoose.Types.ObjectId('6a925f66dface60c7c05e383'),
    title: 'Global Climate and GreenTech Hackathon',
    type: 'hackathon',
    organization: 'Major League Hacking (MLH)',
    description: 'A 48-hour global sprint tackling sustainability, carbon tracking, renewable energy optimization, and smart agriculture.',
    eligibility: {
      department: ['All'],
      minYear: 1,
      minCGPA: 6.5,
      skills: ['Web Development', 'Python', 'IoT']
    },
    deadline: new Date(Date.now() + 22 * 24 * 60 * 60 * 1000),
    postedDate: new Date(),
    location: 'Online / Global',
    stipendOrReward: 'USD 10,000 prize pool and certificates',
    officialUrl: 'https://mlh.io/seasons/2026/events',
    tags: ['hackathon', 'mlh', 'greentech', 'iot']
  },

  // CERTIFICATIONS
  {
    _id: new mongoose.Types.ObjectId('6a925f66dface60c7c05e384'),
    title: 'AWS Certified Cloud Practitioner (Academic Voucher Program)',
    type: 'certification',
    organization: 'Amazon Web Services (AWS) Academy',
    description: 'Foundational certification validating overall understanding of the AWS Cloud platform, core services, security, architecture, and pricing.',
    eligibility: {
      department: ['Computer Science', 'Information Technology', 'Electronics & Communication', 'Data Science'],
      minYear: 1,
      minCGPA: 6.5,
      skills: ['Cloud Computing', 'Networking Basics']
    },
    deadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    postedDate: new Date(),
    location: 'Online Examination',
    stipendOrReward: '100% Exam Fee Waiver (USD 100 value)',
    officialUrl: 'https://aws.amazon.com/certification/certified-cloud-practitioner/',
    tags: ['certification', 'aws', 'cloud', 'exam voucher']
  },
  {
    _id: new mongoose.Types.ObjectId('6a925f66dface60c7c05e385'),
    title: 'NPTEL Elite Certification: Recommender Systems and Data Analytics',
    type: 'certification',
    organization: 'IIT Kharagpur and NPTEL',
    description: '12-week academic course covering collaborative filtering, rule-based systems, content-based recommendation engines, and user modeling.',
    eligibility: {
      department: ['Computer Science', 'Information Technology', 'Data Science', 'Mathematics'],
      minYear: 2,
      minCGPA: 7.0,
      skills: ['Data Structures', 'Python', 'Algorithms']
    },
    deadline: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000),
    postedDate: new Date(),
    location: 'Online Courses and NPTEL Test Centers',
    stipendOrReward: 'IIT-accredited 3 Credit Transfer Certificate',
    officialUrl: 'https://nptel.ac.in',
    tags: ['certification', 'nptel', 'recommender systems', 'iit']
  },
  {
    _id: new mongoose.Types.ObjectId('6a925f66dface60c7c05e386'),
    title: 'Coursera Deep Learning Specialization by Andrew Ng',
    type: 'certification',
    organization: 'DeepLearning.AI and Coursera',
    description: 'Master deep learning fundamentals, neural network architecture, CNNs, RNNs, and hyperparameter tuning with hands-on labs.',
    eligibility: {
      department: ['All'],
      minYear: 2,
      minCGPA: 7.5,
      skills: ['Python', 'Linear Algebra']
    },
    deadline: new Date(Date.now() + 50 * 24 * 60 * 60 * 1000),
    postedDate: new Date(),
    location: 'Online Self-Paced',
    stipendOrReward: 'Full Financial Aid Available and Verified Certificate',
    officialUrl: 'https://www.coursera.org/specializations/deep-learning',
    tags: ['certification', 'coursera', 'deep learning', 'ai']
  }
];

async function seedDatabase() {
  try {
    console.log('Seeding EduConnect catalog opportunities...');
    for (const opp of sampleOpportunities) {
      opp.isActive = opp.isActive !== false;
      opp.status = opp.status || 'ACTIVE';
      await Opportunity.updateOne(
        { _id: opp._id },
        { $set: opp },
        { upsert: true }
      );
    }
    await Opportunity.updateMany(
      { isActive: { $exists: false } },
      { $set: { isActive: true, status: 'ACTIVE' } }
    );
    const count = await Opportunity.countDocuments();
    console.log(`Successfully seeded/ensured ${count} opportunities in database.`);
    return { opportunitiesCount: count };
  } catch (error) {
    console.error('Error during database seed:', error);
    throw error;
  }
}

if (require.main === module) {
  const { connectDB } = require('../config/db');
  connectDB().then(async () => {
    await seedDatabase();
    process.exit(0);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  sampleOpportunities,
  seedDatabase
};
