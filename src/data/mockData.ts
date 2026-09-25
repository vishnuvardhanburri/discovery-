export interface TargetCompany {
  id: string;
  slug: string;
  name: string;
  sector: string;
  priorityScore: number;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  techStack: string[];
  fundingStage: string;
  totalRaised: string;
  whyNowSignals: string[];
  currentStage: 'First Email' | 'Follow Up #1' | 'Follow Up #2' | 'Follow Up #3' | 'Breakup Email' | 'Research Update Needed' | 'Meeting Booked' | 'Closed Client';
  dueTime: string;
  dueUrgency: 'DUE NOW' | 'IN 12 MIN' | 'DUE TODAY' | 'WAITING';
  emailSubject: string;
  emailBody: string;
  personalisationScore: number;
  spamScore: number;
  readingTime: string;
  aiConfidence: number;
  timeline: { title: string; date: string; type: 'research' | 'sent' | 'opened' | 'reply' | 'meeting' | 'client' }[];
  hiringSignals: string[];
  githubActivity: string;
  architectureNotes: string;
}

export interface ProspectReply {
  id: string;
  companyName: string;
  contactName: string;
  contactRole: string;
  category: 'Interested' | 'Meeting Requested' | 'Question' | 'Referral' | 'Not Interested' | 'Out Of Office' | 'Spam' | 'Wrong Contact';
  subject: string;
  preview: string;
  receivedTime: string;
  suggestedAiReply: string;
  isRead: boolean;
}

export const INITIAL_COMPANIES: TargetCompany[] = [
  {
    id: 'wiz-1',
    slug: 'wiz',
    name: 'Wiz',
    sector: 'Cybersecurity',
    priorityScore: 98,
    contactName: 'Ami Luttwak',
    contactRole: 'CTO',
    contactEmail: 'ami@wiz.io',
    techStack: ['Go', 'eBPF', 'AWS EKS', 'PostgreSQL', 'Cilium'],
    fundingStage: 'Series E',
    totalRaised: '$1.9B',
    whyNowSignals: [
      'Posted 6 new platform engineering jobs yesterday',
      'New Cloud Detection & Response (CDR) module launched',
      'Kubernetes IAM role policy refactoring announced',
      'CTO active on LinkedIn discussing eBPF security'
    ],
    currentStage: 'First Email',
    dueTime: 'Due Now',
    dueUrgency: 'DUE NOW',
    emailSubject: 'Engineering Intelligence Recon: Wiz (AST & eBPF Security Architecture)',
    emailBody: `Hi Ami,\n\nOur static telemetry scanner flagged potential AST query latency spikes and eBPF kernel memory retention bounds within multi-cluster ingestion pipelines.\n\nAt XAVIRA Technologies, we specialize in high-velocity 5-day architectural refactoring sprints. We recently refactored a high-frequency cloud security ingestion engine, dropping p99 latencies from 4.8s to 1.42ms under a 10x traffic surge.\n\nWe authored a concise 3-page AST threat diagnostic report specifically for Wiz's platform architecture. Would you be open to reviewing the audit breakdown this week?\n\nBest regards,\n\nVishnu Vardhan Burri\nDirector & Principal Architect | XAVIRA Technologies\nhttps://www.xaviratechlabs.com`,
    personalisationScore: 98,
    spamScore: 0.1,
    readingTime: '38 sec',
    aiConfidence: 99,
    timeline: [
      { title: 'Research Created & AST Telemetry Scanned', date: 'Yesterday 14:20', type: 'research' },
      { title: 'AI Scoring Engine Assigned Score 98/100', date: 'Today 06:00', type: 'research' }
    ],
    hiringSignals: ['Senior Principal Engineer (eBPF)', 'Platform Security Lead', 'Infrastructure Architect'],
    githubActivity: '142 commits to security proxy repo this week',
    architectureNotes: 'AWS EKS multi-region cluster footprint with Cilium mesh encryption. Core bottleneck identified in PostgreSQL connection pool locks.'
  },
  {
    id: 'stripe-2',
    slug: 'stripe',
    name: 'Stripe',
    sector: 'FinTech',
    priorityScore: 92,
    contactName: 'David Singleton',
    contactRole: 'CTO',
    contactEmail: 'david@stripe.com',
    techStack: ['Ruby', 'Go', 'Rust', 'PostgreSQL', 'Redis'],
    fundingStage: 'Series I',
    totalRaised: '$8.7B',
    whyNowSignals: [
      'High-frequency reconciliation lock timeouts flagged',
      'Scaling ledger infrastructure past 500k tps',
      'Research report updated yesterday'
    ],
    currentStage: 'Follow Up #2',
    dueTime: 'Due in 12 Minutes',
    dueUrgency: 'IN 12 MIN',
    emailSubject: 'Re: High-Frequency Payment Reconciliation Benchmarks (Stripe)',
    emailBody: `Hi David,\n\nFollowing up on my previous note regarding transactional lock contention during peak payment reconciliation runs.\n\nWe recently decoupled a high-throughput ledger stream using a lockless Rust async ring buffer queue and PostgreSQL advisory locks, quadrupling settlement throughput without connection pool spikes.\n\nIf Stripe is currently evaluating ledger lock-freeness ahead of Q3 peak volume, our 5-Day Engineering Intelligence Audit (£10,000 fixed) delivers immediate code-level clarity.\n\nDo you have 10 minutes for a technical alignment call this Thursday?\n\nBest,\n\nVishnu Vardhan Burri`,
    personalisationScore: 94,
    spamScore: 0.2,
    readingTime: '42 sec',
    aiConfidence: 96,
    timeline: [
      { title: 'Research Created', date: '14 Days Ago', type: 'research' },
      { title: 'Email #1 Sent', date: '12 Days Ago', type: 'sent' },
      { title: 'Email #1 Opened (3 times)', date: '11 Days Ago', type: 'opened' },
      { title: 'Follow Up #1 Sent', date: '5 Days Ago', type: 'sent' }
    ],
    hiringSignals: ['Staff Database Reliability Engineer', 'Principal Distributed Systems Engineer'],
    githubActivity: 'Active commits to Sorbet and Ruby concurrency layers',
    architectureNotes: 'Distributed database ledger locks during end-of-month processing. Advisory lock refactoring recommended.'
  },
  {
    id: 'datadog-3',
    slug: 'datadog',
    name: 'Datadog',
    sector: 'DevTools & Observability',
    priorityScore: 90,
    contactName: 'Alexis Le-Quoc',
    contactRole: 'CTO',
    contactEmail: 'alexis@datadoghq.com',
    techStack: ['Go', 'Python', 'Kafka', 'ClickHouse', 'Kubernetes'],
    fundingStage: 'Public (NASDAQ: DDOG)',
    totalRaised: '$147M',
    whyNowSignals: [
      'New APM telemetry ingestion engine launched',
      'Engineering blog post on ClickHouse vector indexing',
      'Research update needed'
    ],
    currentStage: 'Research Update Needed',
    dueTime: 'Due Today',
    dueUrgency: 'DUE TODAY',
    emailSubject: 'Engineering Intelligence Recon: Datadog Telemetry Ingestion',
    emailBody: `Hi Alexis,\n\nOur static telemetry scanner flagged memory retention loops inside worker process stream parsers.\n\nWe authored a research breakdown on hard memory isolation boundaries across high-throughput telemetry pipelines.\n\nWould you be open to reviewing the audit brief?\n\nBest,\n\nVishnu Vardhan Burri`,
    personalisationScore: 91,
    spamScore: 0.1,
    readingTime: '30 sec',
    aiConfidence: 93,
    timeline: [
      { title: 'Research Created', date: '30 Days Ago', type: 'research' }
    ],
    hiringSignals: ['Director of Core Observability Engine'],
    githubActivity: 'Vector agent repo updated 2 hours ago',
    architectureNotes: 'High volume ingestion worker pools requiring memory gate refactoring.'
  },
  {
    id: 'supabase-4',
    slug: 'supabase',
    name: 'Supabase',
    sector: 'DevTools & Database',
    priorityScore: 83,
    contactName: 'Paul Copplestone',
    contactRole: 'CEO',
    contactEmail: 'paul@supabase.io',
    techStack: ['Elixir', 'PostgreSQL', 'Go', 'TypeScript', 'Docker'],
    fundingStage: 'Series B',
    totalRaised: '$116M',
    whyNowSignals: [
      'Published engineering blog on Postgres row-level security limits',
      'Launched Supabase Index Advisor tool',
      'Active github release on pg_graphql'
    ],
    currentStage: 'First Email',
    dueTime: 'Due Today',
    dueUrgency: 'DUE TODAY',
    emailSubject: 'PostgreSQL Row-Level Security Latency Remediation (Supabase)',
    emailBody: `Hi Paul,\n\nReviewed your recent post on PostgreSQL RLS execution overhead during high-concurrency client requests.\n\nWe engineered a private caching gateway layer featuring tenant-isolated memory tokens that reduced query evaluation latencies by 72% under 50k concurrent websockets.\n\nWould you be open to comparing architectural benchmarks?\n\nBest,\n\nVishnu Vardhan Burri`,
    personalisationScore: 95,
    spamScore: 0.1,
    readingTime: '35 sec',
    aiConfidence: 97,
    timeline: [
      { title: 'Research Created', date: '3 Days Ago', type: 'research' }
    ],
    hiringSignals: ['Staff Postgres Internal Engineer'],
    githubActivity: '89 PRs merged this week across realtime & storage',
    architectureNotes: 'Postgres RLS policy evaluation overhead during tenant spikes.'
  },
  {
    id: 'modal-5',
    slug: 'modal',
    name: 'Modal Labs',
    sector: 'AI Infrastructure',
    priorityScore: 88,
    contactName: 'Erik Bernhardsson',
    contactRole: 'CEO',
    contactEmail: 'erik@modal.com',
    techStack: ['Python', 'Rust', 'Linux Kernel', 'GPU CUDA', 'Containerd'],
    fundingStage: 'Series A',
    totalRaised: '$16M',
    whyNowSignals: [
      'Launched serverless GPU cold-start optimization paper',
      'Hiring senior Linux container runtime engineers',
      'CTO posted CUDA memory allocation benchmarks'
    ],
    currentStage: 'First Email',
    dueTime: 'Due Today',
    dueUrgency: 'DUE TODAY',
    emailSubject: 'Serverless GPU Container Runtime Latency Audit (Modal)',
    emailBody: `Hi Erik,\n\nFascinating post on container cold-starts for GPU inference nodes.\n\nWe recently benchmarked a custom C++ vLLM continuous batching router that increased hardware utilization from 35% to 88% while cutting VRAM allocation stalls to sub-10ms.\n\nI authored a concise 3-page technical audit report on container memory isolation. Mind if I send over the brief?\n\nBest,\n\nVishnu Vardhan Burri`,
    personalisationScore: 96,
    spamScore: 0.1,
    readingTime: '36 sec',
    aiConfidence: 98,
    timeline: [
      { title: 'Research Created', date: 'Yesterday', type: 'research' }
    ],
    hiringSignals: ['Staff Container Systems Engineer (Rust/C++)'],
    githubActivity: 'Active releases on modal client runtime',
    architectureNotes: 'CUDA VRAM allocation queue stalls under spike inference requests.'
  }
];

export const INITIAL_REPLIES: ProspectReply[] = [
  {
    id: 'rep-1',
    companyName: 'Wiz',
    contactName: 'Ami Luttwak',
    contactRole: 'CTO',
    category: 'Meeting Requested',
    subject: 'Re: Engineering Intelligence Recon: Wiz (AST & eBPF Security Architecture)',
    preview: 'Hi Vishnu, thanks for reaching out with this eBPF memory profiling breakdown. Our platform security team was actually discussing this exact issue. Are you free for a 15-minute call this Friday at 3 PM EST?',
    receivedTime: '18 min ago',
    suggestedAiReply: 'Hi Ami, appreciate the quick reply. Yes, Friday at 3 PM EST works perfectly. I will send over a calendar invite along with our initial 3-page AST threat diagnostic report. Looking forward to speaking. Best, Vishnu',
    isRead: false
  },
  {
    id: 'rep-2',
    companyName: 'Supabase',
    contactName: 'Paul Copplestone',
    contactRole: 'CEO',
    category: 'Interested',
    subject: 'Re: PostgreSQL Row-Level Security Latency Remediation (Supabase)',
    preview: 'Interesting benchmark data. Can you share the technical whitepaper on your tenant-isolated memory token gateway?',
    receivedTime: '1 hour ago',
    suggestedAiReply: 'Hi Paul, absolutely. Attached is the technical case study detailing how we decoupled RLS policy evaluation to achieve sub-5ms websocket query latency. Let me know if you would like to run a parallel 48-hour recon on your staging cluster. Best, Vishnu',
    isRead: false
  },
  {
    id: 'rep-3',
    companyName: 'Linear',
    contactName: 'Karri Saarinen',
    contactRole: 'CEO',
    category: 'Question',
    subject: 'Re: Linear Sync Engine Throughput Audit',
    preview: 'Vishnu - how does your 5-day transformation sprint handle zero-downtime schema migrations for local-first SQLite clients?',
    receivedTime: '3 hours ago',
    suggestedAiReply: 'Hi Karri, great question. We utilize dual-write shadow tables combined with an event-sourced delta log that streams structural migrations backgrounded without breaking client-side SQLite sync locks. Happy to send over the architectural blueprint. Best, Vishnu',
    isRead: true
  }
];
