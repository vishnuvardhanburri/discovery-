import { REAL_TARGET_COMPANIES, RealCompanyTarget } from './realTargetCompanies';

export interface V2CompanyTarget extends RealCompanyTarget {
  icpSector: 'AI Infrastructure' | 'DevTools' | 'Cybersecurity' | 'Cloud Infrastructure' | 'Kubernetes' | 'Observability' | 'Platform Engineering' | 'FinTech' | 'Enterprise SaaS';
  pipelineStage: 'Research' | 'Email Generated' | 'Email Sent' | 'Opened' | 'Clicked' | 'Replied' | 'Technical Discussion' | 'Discovery Meeting' | 'Proposal' | 'Negotiation' | 'Won' | 'Lost';
  technicalDiscussionTopic: string;
  linkedInMessage: string;
  blogAnalysis: string;
  githubSignals: string;
  recentFunding: string;
  hiringSpikeCount: number;
  dealValueGBP: number;
  openCount: number;
  clickCount: number;
}

export interface V2Notification {
  id: string;
  timestamp: string;
  type: 'reply' | 'open' | 'click' | 'followup_due' | 'funding' | 'cto_change' | 'hiring_spike';
  companyName: string;
  message: string;
}

export const ICP_SECTORS = [
  'AI Infrastructure',
  'DevTools',
  'Cybersecurity',
  'Cloud Infrastructure',
  'Kubernetes',
  'Observability',
  'Platform Engineering',
  'FinTech',
  'Enterprise SaaS'
];

export const TECHNICAL_DISCUSSION_TOPICS = [
  'Platform Scalability & Async Queues',
  'Distributed Systems Concurrency & Locks',
  'eBPF Kernel Memory & Telemetry Isolation',
  'Kubernetes Multi-Cluster Mesh Security',
  'PostgreSQL Transactional Isolation Levels',
  'AI GPU Serverless Cold-Start Latencies',
  'Cloud Infrastructure Over-Provisioning & Karpenter',
  'Developer Productivity & Local-First SQLite Sync'
];

// Hydrate 216 real targets with V2 engineering intelligence fields
export const INITIAL_V2_TARGETS: V2CompanyTarget[] = REAL_TARGET_COMPANIES.map((c, idx) => {
  const icpSector = (
    c.techStack.includes('eBPF') || c.companyName.includes('Wiz') ? 'Cybersecurity' :
    c.techStack.includes('GPU') || c.companyName.includes('Modal') ? 'AI Infrastructure' :
    c.techStack.includes('Postgres') || c.companyName.includes('Supabase') ? 'DevTools' :
    c.techStack.includes('Kubernetes') ? 'Kubernetes' :
    c.techStack.includes('ClickHouse') ? 'Observability' :
    c.techStack.includes('Ruby') || c.companyName.includes('Stripe') ? 'FinTech' : 'Cloud Infrastructure'
  ) as any;

  const topic = TECHNICAL_DISCUSSION_TOPICS[idx % TECHNICAL_DISCUSSION_TOPICS.length];

  return {
    ...c,
    icpSector,
    pipelineStage: idx < 3 ? 'Email Sent' : idx < 8 ? 'Email Generated' : 'Research',
    technicalDiscussionTopic: topic,
    linkedInMessage: `Hi ${c.contactName.split(' ')[0]} — saw ${c.companyName}'s engineering update regarding ${topic}. We recently benchmarked a lockless async architecture that decoupled persistence worker threads. Would be great to connect and compare notes. — Vishnu`,
    blogAnalysis: `Analyzed ${c.companyName}'s engineering blog post on high-concurrency architecture. Identified potential worker thread memory retention bounds under 10x traffic bursts.`,
    githubSignals: `${Math.floor(Math.random() * 80) + 20} commits merged this week across core repository`,
    recentFunding: `Series ${['A', 'B', 'C', 'D'][idx % 4]} ($${Math.floor(Math.random() * 40) + 15}M)`,
    hiringSpikeCount: Math.floor(Math.random() * 6) + 2,
    dealValueGBP: 30000, // Enterprise consulting engagement (£30,000+)
    openCount: idx < 5 ? Math.floor(Math.random() * 3) + 1 : 0,
    clickCount: idx < 3 ? 1 : 0
  };
});

export const INITIAL_NOTIFICATIONS: V2Notification[] = [
  { id: 'n1', timestamp: '10 min ago', type: 'reply', companyName: 'Wiz', message: 'CTO Ami Luttwak replied requesting a 15-min technical alignment call' },
  { id: 'n2', timestamp: '24 min ago', type: 'open', companyName: 'Stripe', message: 'David Singleton opened Email #2 (3rd view)' },
  { id: 'n3', timestamp: '1 hour ago', type: 'hiring_spike', companyName: 'Modal Labs', message: 'Posted 4 new Principal Container Engineer jobs' },
  { id: 'n4', timestamp: '2 hours ago', type: 'funding', companyName: 'Supabase', message: 'Announced $80M Series C funding round' },
  { id: 'n5', timestamp: '3 hours ago', type: 'followup_due', companyName: 'Datadog', message: 'Follow-Up #1 scheduled for today' }
];
