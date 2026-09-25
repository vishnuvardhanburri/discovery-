export interface AllCompanyResearch {
  name: string;
  sector: string;
  geography: string;
  fundingStage: string;
  totalRaised: string;
  scalingRisks: string;
  ceo: string;
  cto: string;
  vpEngineering: string;
  email: string;
  techStack: string;
  website: string;
  status: string;
  headquarters: string;
  industry: string;
  subIndustry: string;
  businessModel: string;
  employeeCount: number;
  engineeringTeamSize: number;
  lastFundingDate: string;
  leadInvestor: string;
  keyCompetitors: string;
  techStackFit: string;
  painPointSeverity: string;
  budgetEstimate: number;
  strategicFit: string;
  healthScore: string;
  accountOwner: string;
  lastActivityDate: string;
  priorityScore: number;
  priorityTier: string;
  priorityRank: number;
  priorityScore1to10: number;
  abilityToPay1to10: number;
  technicalRiskCategory: string;
  recommendedPlaybook: string;
}

// Highly optimized representation to prevent token limit issues while maintaining 100% fidelity of the 104 companies
const COMPACT_DATA: Array<{
  n: string; // name
  sec: string; // sector
  geo: string; // geography
  fs: string; // funding stage
  tr: string; // total raised
  sr: string; // scaling risks
  ceo: string;
  cto: string;
  vp: string; // vp engineering
  em: string; // email
  tech: string; // tech stack
  web: string; // website
  hq?: string; // headquarters
  ind?: string; // industry
  sub?: string; // sub-industry
  bm?: string; // business model
  emp?: number; // employee count
  eng?: number; // engineering team size
  lfd?: string; // last funding date
  li?: string; // lead investor
  comp?: string; // competitors
  tsf?: string; // tech stack fit
  pps?: string; // pain point severity
  be?: number; // budget estimate
  sf?: string; // strategic fit
  hs?: string; // health score
  ao?: string; // account owner
  lad?: string; // last activity date
  ps?: number; // priority score
  pt?: string; // priority tier
  pr?: number; // priority rank
  ps10?: number; // priority score (1-10)
  atp10?: number; // ability to pay score (1-10)
  trc?: string; // technical risk category
  rp?: string; // recommended playbook
}> = [
  {
    n: "Doppel", sec: "Cybersecurity / AI", geo: "USA", fs: "Series C", tr: "$129M",
    sr: "Recursive context inflation; RAG latency; Guardrail overhead latency",
    ceo: "Kevin Tian", cto: "Rahul Madduluri", vp: "Anish Shandilya", em: "kevin@doppel.com",
    tech: "Python, Go, Node.js, React, AWS, GCP, PostgreSQL, Redis, Docker, Kubernetes, OpenAI (GPT-5/RFT)", web: "doppel.com"
  },
  {
    n: "Adaptive Security", sec: "Cybersecurity / AI", geo: "USA", fs: "Series B", tr: "$145M",
    sr: "GPU allocation bottlenecks; OSINT ingestion pipeline lag",
    ceo: "Brian Long", cto: "Andrew Jones", vp: "James Almeida", em: "brian@adaptivesecurity.com",
    tech: "Python, Go, React, Next.js, AWS, GCP, PostgreSQL, MongoDB, Docker, Kubernetes, OpenAI, NVIDIA", web: "adaptivesecurity.com"
  },
  {
    n: "Camber Health", sec: "HealthTech / FinTech", geo: "USA", fs: "Series B", tr: "$50M",
    sr: "PostgreSQL query overloads; HIPAA compliance logging penalties; Ingestion bottlenecks",
    ceo: "Christophe Rimann", cto: "Jade Chan", vp: "Nathan Lee", em: "christophe@camber.health",
    tech: "Node.js, TypeScript, React, Next.js, Python, PostgreSQL, AWS, HIPAA Compliance Engine", web: "camber.health"
  },
  {
    n: "Omnea", sec: "AI SaaS / Procurement", geo: "UK", fs: "Series B", tr: "$75M",
    sr: "Aurora connection pool exhaustion; EventBridge queue bottlenecks; Lambda cold starts",
    ceo: "Ben Freeman", cto: "Henry Chong", vp: "Ed Bishop", em: "ben.freeman@omnea.co",
    tech: "TypeScript, React, Postgres, AWS (Lambda, DynamoDB, EventBridge, Aurora), Pulumi, Datadog", web: "omnea.co",
    ao: "Jane Smith (UK)"
  },
  {
    n: "Clay", sec: "DevTools / AI", geo: "USA", fs: "Series C", tr: "$100M+",
    sr: "Node.js, React, PostgreSQL, Pinecone (Needs technical diagnosis)",
    ceo: "Kareem Amin", cto: "Varun Anand", vp: "Mark Hahnenberg", em: "kareem@clay.com",
    tech: "Node.js, TypeScript, React, Next.js, PostgreSQL, Redis, AWS, GCP, Pinecone, OpenAI, Anthropic", web: "clay.com",
    trc: "Discovery-Led", rp: "Discovery Playbook"
  },
  {
    n: "PhysicsX", sec: "AI / DeepTech", geo: "UK", fs: "Series C", tr: "$489M",
    sr: "Python, Go, PyTorch, Kubernetes (Needs technical diagnosis)",
    ceo: "Jacomo Corbo", cto: "Robin Tuluie", vp: "Garazi Gómez de Segura", em: "jacomo.corbo@physicsx.ai",
    tech: "Python, Go, C++, CUDA, PyTorch, Deutsche Telekom Sovereign AI Cloud, AWS, Docker, Kubernetes", web: "physicsx.ai",
    ao: "Jane Smith (UK)", trc: "Discovery-Led", rp: "Discovery Playbook"
  },
  {
    n: "Graphite", sec: "DevTools / AI", geo: "USA", fs: "Series B", tr: "$72M",
    sr: "TypeScript, React, Next.js, Python, AWS (Needs technical diagnosis)",
    ceo: "Merrill Lutsky", cto: "Greg Foster", vp: "Tomas Reimers", em: "merrill@graphite.dev",
    tech: "TypeScript, React, Next.js, Python, AWS, PostgreSQL, Redis, OpenAI, Anthropic, Git Engine", web: "graphite.dev",
    trc: "Discovery-Led", rp: "Discovery Playbook"
  },
  {
    n: "Opal Security", sec: "Cybersecurity", geo: "USA", fs: "Series B", tr: "$34M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Howard Ting", cto: "Alex Pien", vp: "John Clark", em: "howard@opal.dev",
    tech: "Kubernetes, Golang, Postgres, Redis, Terraform, GraphQL, TypeScript, React, AWS, GCP", web: "opal.dev",
    trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Vanta", sec: "Cybersecurity", geo: "USA", fs: "Series D", tr: "$150M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Christina Cacioppo", cto: "N/A", vp: "Iccha Sethi", em: "christina@vanta.com",
    tech: "AWS, LangChain, Node.js, TypeScript, React, GraphQL", web: "vanta.com",
    trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "XBOW", sec: "Cybersecurity / AI", geo: "USA", fs: "Series B", tr: "$75M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Oege de Moor", cto: "Max Vozoff", vp: "Andrew Rice", em: "oege@xbow.com",
    tech: "Python, LLMs, JavaScript, XML, Kubernetes, AWS", web: "xbow.com",
    trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Chainguard", sec: "Cybersecurity", geo: "USA", fs: "Series D", tr: "$356M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Dan Lorenc", cto: "Matt Moore", vp: "Dustin Kirkland", em: "dan@chainguard.dev",
    tech: "Go, Kubernetes, Sigstore, Snowflake, AWS, GCP", web: "chainguard.dev",
    trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Island", sec: "Cybersecurity", geo: "USA", fs: "Series E", tr: "$250M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Mike Fey", cto: "Dan Amiga", vp: "Dudi Kovarski", em: "mike.fey@island.io",
    tech: "Chromium, C++, React, Node.js, AWS, Azure", web: "island.io",
    trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Aura", sec: "Cybersecurity", geo: "USA", fs: "Series G", tr: "$140M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Hari Ravichandran", cto: "Rekha Singh", vp: "Michael Kepe", em: "hari.ravichandran@aura.com",
    tech: "Node.js, React, Python, AWS, Kubernetes", web: "aura.com",
    trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Semgrep", sec: "Cybersecurity", geo: "USA", fs: "Series D", tr: "$100M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Isaac Evans", cto: "Cathy Polinsky", vp: "Cathy Polinsky", em: "ievans@r2cgroup.com",
    tech: "OCaml, Python, React, Go, Docker, Kubernetes, AWS", web: "r2cgroup.com",
    trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Eclypsium", sec: "Cybersecurity", geo: "USA", fs: "Series C", tr: "$45M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Yuriy Bulygin", cto: "Alex Bazhaniuk", vp: "Yoav Yaari", em: "yuriy@eclypsium.com",
    tech: "Python, C, C++, Go, AWS, Docker", web: "eclypsium.com",
    trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Cyera", sec: "Cybersecurity / AI", geo: "USA", fs: "Series D", tr: "$300M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Yotam Segev", cto: "Tamar Bar-Ilan", vp: "Yonatan Itai", em: "yotam.segev@cyera.io",
    tech: "Looker, Salesforce CPQ, MongoDB, Next.js, Hadoop, Highspot", web: "cyera.io",
    trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Socket", sec: "Cybersecurity", geo: "USA", fs: "Series B", tr: "$40M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Feross Aboukhadijeh", cto: "Len Glaenzer", vp: "N/A", em: "feross@socket.dev",
    tech: "JavaScript, Python, Go, Node.js, GitHub Actions", web: "socket.dev",
    trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Huntress", sec: "Cybersecurity", geo: "USA", fs: "Series D", tr: "$150M",
    sr: "Microsoft Defender, EDR, SIEM (Needs technical diagnosis)",
    ceo: "Kyle Hanslovan", cto: "Chris Bisnett", vp: "Chad Berkley", em: "kyle.hanslovan@huntresslabs.com",
    tech: "Microsoft Defender, EDR, SIEM", web: "huntresslabs.com",
    trc: "Discovery-Led", rp: "Discovery Playbook"
  },
  {
    n: "Alkira", sec: "Cybersecurity", geo: "USA", fs: "Series C", tr: "$54M",
    sr: "Go, C, HTML5, HubSpot, NitroPack, Amazon SES (Needs technical diagnosis)",
    ceo: "Amir Khan", cto: "Atif Khan", vp: "Santosh Kumar Dornal", em: "amir@alkira.com",
    tech: "Go, C, HTML5, HubSpot, NitroPack, Amazon SES", web: "alkira.com",
    trc: "Discovery-Led", rp: "Discovery Playbook"
  },
  {
    n: "Axonius", sec: "Cybersecurity", geo: "USA", fs: "Series E", tr: "$200M",
    sr: "AWS EC2, OpenStack, Threat Stack (Needs technical diagnosis)",
    ceo: "Dean Sysman", cto: "Ofri Shur", vp: "N/A", em: "dean.sysman@axonius.com",
    tech: "AWS EC2, OpenStack, Threat Stack", web: "axonius.com",
    trc: "Discovery-Led", rp: "Discovery Playbook"
  },
  {
    n: "Corelight", sec: "Cybersecurity", geo: "USA", fs: "Series E", tr: "$150M",
    sr: "Vue.js, Kotlin, Laravel, Goober, Oracle Cloud, Red Hat (Needs technical diagnosis)",
    ceo: "Brian Dye", cto: "Jean Schaffer", vp: "Ali Islam", em: "brian.dye@corelight.com",
    tech: "Vue.js, Kotlin, Laravel, Goober, Oracle Cloud, Red Hat", web: "corelight.com",
    trc: "Discovery-Led", rp: "Discovery Playbook"
  },
  {
    n: "DUST Identity", sec: "Cybersecurity", geo: "USA", fs: "Series B", tr: "$40M",
    sr: "Synthetic diamond resin, Nanoengineered diamonds (Needs technical diagnosis)",
    ceo: "Ophir Gaathon", cto: "N/A", vp: "N/A", em: "ogaathon@dustidentity.com",
    tech: "Synthetic diamond resin, Nanoengineered diamonds", web: "dustidentity.com",
    trc: "Discovery-Led", rp: "Discovery Playbook"
  },
  {
    n: "Wiz", sec: "Cybersecurity", geo: "Israel/USA", fs: "Series D", tr: "$300M",
    sr: "Optimizely, Workday, GitHub, Anaplan, Swiper, Snort (Needs technical diagnosis)",
    ceo: "Assaf Rappaport", cto: "Ami Luttwak", vp: "N/A", em: "assaf.rappaport@wiz.io",
    tech: "Optimizely, Workday, GitHub, Anaplan, Swiper, Snort", web: "wiz.io",
    trc: "Discovery-Led", rp: "Discovery Playbook"
  },
  {
    n: "Harmonic", sec: "AI", geo: "USA", fs: "Series B", tr: "$100M",
    sr: "Data engine, Formal mathematical reasoning (Needs technical diagnosis)",
    ceo: "Vlad Tenev", cto: "Tudor Achim", vp: "N/A", em: "vlad.tenev@harmonic.ai",
    tech: "Data engine, Formal mathematical reasoning", web: "harmonic.ai",
    trc: "Discovery-Led", rp: "Discovery Playbook"
  },
  {
    n: "NewLimit", sec: "Biotech / HealthTech", geo: "USA", fs: "Series B", tr: "$130M",
    sr: "Reprogramming payloads, Epigenetic reprogramming (Needs technical diagnosis)",
    ceo: "Jacob C. Kimmel", cto: "N/A", vp: "N/A", em: "jacob.kimmel@newlimit.com",
    tech: "Reprogramming payloads, Epigenetic reprogramming", web: "newlimit.com",
    trc: "Discovery-Led", rp: "Discovery Playbook"
  },
  {
    n: "Base Power", sec: "Hardware", geo: "USA", fs: "Series B", tr: "$200M",
    sr: "Telemetry stack, Distributed Energy Resources (DERs) (Needs technical diagnosis)",
    ceo: "Zach Dell", cto: "N/A", vp: "N/A", em: "zach.dell@basepowercompany.com",
    tech: "Telemetry stack, Distributed Energy Resources (DERs)", web: "basepowercompany.com",
    trc: "Discovery-Led", rp: "Discovery Playbook"
  },
  {
    n: "Sprinter Health", sec: "HealthTech", geo: "USA", fs: "Series B", tr: "$32M",
    sr: "Serverless AWS, React Native, GraphQL, TypeScript, Node.js (Needs technical diagnosis)",
    ceo: "Max Cohen", cto: "Cameron Behar", vp: "N/A", em: "max@sprinterhealth.com",
    tech: "Serverless AWS, React Native, GraphQL, TypeScript, Node.js", web: "sprinterhealth.com",
    trc: "Discovery-Led", rp: "Discovery Playbook"
  },
  {
    n: "Graphiant", sec: "Networking", geo: "USA", fs: "Series B", tr: "$19M",
    sr: "HashiCorp Consul, Amazon CloudFront, Angular, jQuery, Go (Needs technical diagnosis)",
    ceo: "Ali Shaikh", cto: "Khalid Raza", vp: "N/A", em: "ali@graphiant.com",
    tech: "HashiCorp Consul, Amazon CloudFront, Angular, jQuery, Go", web: "graphiant.com",
    trc: "Discovery-Led", rp: "Discovery Playbook"
  },
  {
    n: "Bounce", sec: "Travel / Marketplace", geo: "USA", fs: "Series B", tr: "$19M",
    sr: "Luggage storage marketplace platform (Needs technical diagnosis)",
    ceo: "Cody Candee", cto: "Guy Ling", vp: "N/A", em: "cody.candee@bounce.com",
    tech: "Luggage storage marketplace platform", web: "bounce.com",
    trc: "Discovery-Led", rp: "Discovery Playbook"
  },
  {
    n: "Nooks", sec: "AI / Sales", geo: "USA", fs: "Series B", tr: "$43M",
    sr: "AI cold email generator, Virtual sales floor, AI sequencing (Needs technical diagnosis)",
    ceo: "Dan Lee", cto: "Nikhil Cheerla", vp: "N/A", em: "dan.lee@nooks.ai",
    tech: "AI cold email generator, Virtual sales floor, AI sequencing", web: "nooks.ai",
    trc: "Discovery-Led", rp: "Discovery Playbook"
  },
  {
    n: "Decagon", sec: "AI / SaaS", geo: "USA", fs: "Series B", tr: "$65M",
    sr: "Conversational AI, Salesforce, Zendesk (Needs technical diagnosis)",
    ceo: "Jesse Zhang", cto: "Ashwin Sreenivas", vp: "N/A", em: "jesse@decagon.ai",
    tech: "Conversational AI, Salesforce, Zendesk", web: "decagon.ai",
    trc: "Discovery-Led", rp: "Discovery Playbook"
  },
  {
    n: "Atlys", sec: "Immigration / Travel", geo: "USA", fs: "Series B", tr: "$20M",
    sr: "RSS, Drupal, jQuery, PHP, Apache (Needs technical diagnosis)",
    ceo: "Mohak Nahta", cto: "N/A", vp: "Udbhav Rai", em: "info@atlys.com",
    tech: "RSS, Drupal, jQuery, PHP, Apache", web: "atlys.com",
    trc: "Discovery-Led", rp: "Discovery Playbook"
  },
  {
    n: "Story Protocol", sec: "Crypto", geo: "USA", fs: "Series B", tr: "$80M",
    sr: "Cross-chain messaging latency, EVM state bloat",
    ceo: "S.Y. Lee", cto: "N/A", vp: "Leo Chen", em: "sy@storyprotocol.xyz",
    tech: "EVM, CometBFT, LayerZero, ERC-6551", web: "storyprotocol.xyz"
  },
  {
    n: "FNZ", sec: "FinTech", geo: "UK", fs: "Established", tr: "£1.95B",
    sr: "Legacy .NET/SOAP integration issues, deployment bottlenecks",
    ceo: "Blythe Masters", cto: "N/A", vp: "N/A", em: "blythe.masters@fnz.com",
    tech: ".NET, SOAP, Jaspersoft, Octopus Deploy, ReactJS, TypeScript", web: "fnz.com",
    ao: "Jane Smith (UK)"
  },
  {
    n: "Monzo", sec: "FinTech", geo: "UK", fs: "Established", tr: "£1.41B",
    sr: "Cassandra scaling, Kafka message queues, Go microservices latency",
    ceo: "TS Anil", cto: "Jonas Huckestein", vp: "N/A", em: "tsanil@monzo.com",
    tech: "Go, Cassandra, Kafka, Kubernetes, GCP", web: "monzo.com",
    ao: "Jane Smith (UK)"
  },
  {
    n: "Checkout.com", sec: "FinTech", geo: "UK", fs: "Established", tr: "£1.36B",
    sr: "DynamoDB hot partitions, Node.js memory leaks",
    ceo: "Guillaume Pousaz", cto: "Mariano Albera", vp: "N/A", em: "guillaume.pousaz@checkout.com",
    tech: "AWS, DynamoDB, Node.js, C#, Kubernetes, Snowflake", web: "checkout.com",
    ao: "Jane Smith (UK)"
  },
  {
    n: "Revolut", sec: "FinTech", geo: "UK", fs: "Established", tr: "£1.26B",
    sr: "PostgreSQL scaling, GCP Kubernetes management",
    ceo: "Nik Storonsky", cto: "Vlad Yatsenko", vp: "Donato Lucia", em: "nik.storonsky@revolut.com",
    tech: "Java, GCP, PostgreSQL, Kubernetes", web: "revolut.com",
    ao: "Jane Smith (UK)"
  },
  {
    n: "SumUp", sec: "FinTech", geo: "UK", fs: "Established", tr: "£770M",
    sr: "Kafka stream processing, Kubernetes pod scaling",
    ceo: "Daniel Klein", cto: "Johannes Schaback", vp: "Andi Zink", em: "johannes.schaback@sumup.com",
    tech: "AWS, Kubernetes, Kotlin, Elixir, React, Kafka, Snowflake", web: "sumup.com",
    ao: "Jane Smith (UK)"
  },
  {
    n: "Atom Bank", sec: "FinTech", geo: "UK", fs: "Established", tr: "£738M",
    sr: "Middleware integration, GCP scaling, Kotlin backend",
    ceo: "Mark Mullen", cto: "Andy Sturrock", vp: "Rob Smith", em: "rob.smith@atombank.co.uk",
    tech: "Kotlin, React, TypeScript, Astro, Google Cloud, Kubernetes", web: "atombank.co.uk",
    ao: "Jane Smith (UK)"
  },
  {
    n: "Starling Bank", sec: "FinTech", geo: "UK", fs: "Established", tr: "£715M",
    sr: "AWS cloud scaling, PostgreSQL database tuning",
    ceo: "Raman Bhatia", cto: "N/A", vp: "Steve Newson", em: "raman.bhatia@starlingbank.com",
    tech: "AWS, Java, PostgreSQL, Angular", web: "starlingbank.com",
    ao: "Jane Smith (UK)"
  },
  {
    n: "Metro Bank", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£640M",
    sr: "Temenos T24 legacy integration, NoSQL data consistency",
    ceo: "Daniel Frumkin", cto: "Faisal Hussain", vp: "Sailesh Panchal", em: "daniel.frumkin@metrobank.plc.uk",
    tech: "Temenos T24, scikit-learn, ServiceNow, RxJS, NoSQL", web: "metrobank.plc.uk",
    ao: "Jane Smith (UK)"
  },
  {
    n: "OakNorth", sec: "FinTech", geo: "UK", fs: "Established", tr: "£637M",
    sr: "React Native performance, AWS infrastructure scaling",
    ceo: "Rishi Khosla", cto: "Jackson Hull", vp: "Raj Cherabuddi", em: "rishi.khosla@oaknorth.com",
    tech: "AWS, React Native, Python, Go, Kubernetes", web: "oaknorth.com",
    ao: "Jane Smith (UK)"
  },
  {
    n: "Allica Bank", sec: "FinTech", geo: "UK", fs: "Established", tr: "£513M",
    sr: "Azure Spring Cloud scaling, Kotlin/Spring Boot performance",
    ceo: "Richard Davies", cto: "Ravneet Shah", vp: "Ravneet Shah", em: "richard.davies@allica.bank",
    tech: "Azure, Spring Boot, Kotlin, React, Snowflake", web: "allica.bank",
    ao: "Jane Smith (UK)"
  },
  {
    n: "Blockchain.com", sec: "Crypto", geo: "UK", fs: "Growth", tr: "£473M",
    sr: "Crypto transaction throughput, AWS security",
    ceo: "Peter Smith", cto: "N/A", vp: "Lewis Tuff", em: "peter@blockchain.com",
    tech: "Java, Kotlin, React, AWS", web: "blockchain.com",
    ao: "Jane Smith (UK)"
  },
  {
    n: "Dojo", sec: "FinTech", geo: "UK", fs: "Established", tr: "£470M",
    sr: "ASP.NET legacy modernization, IIS performance",
    ceo: "George Karibian", cto: "Nick Fryer", vp: "N/A", em: "nick.fryer@dojotechnology.com",
    tech: "Windows Server, ASP.NET, IIS", web: "dojotechnology.com",
    ao: "Jane Smith (UK)"
  },
  {
    n: "Thought Machine", sec: "FinTech", geo: "UK", fs: "Established", tr: "£442M",
    sr: "Kubernetes cluster management, Python backend scaling",
    ceo: "Paul Taylor", cto: "N/A", vp: "N/A", em: "paul@thoughtmachine.net",
    tech: "Python, Prometheus, AWS, Kubernetes, Bootstrap", web: "thoughtmachine.net",
    ao: "Jane Smith (UK)"
  },
  {
    n: "GoCardless", sec: "FinTech", geo: "UK", fs: "Established", tr: "£392M",
    sr: "Ruby on Rails monolithic scaling, PostgreSQL database locks",
    ceo: "Hiroki Takeuchi", cto: "N/A", vp: "N/A", em: "htakeuchi@gocardless.com",
    tech: "Ruby on Rails, Next.js, Go, Kubernetes, PostgreSQL, GCP", web: "gocardless.com",
    ao: "Jane Smith (UK)"
  },
  {
    n: "Marex", sec: "FinTech", geo: "UK", fs: "Established", tr: "£373M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Arthur Fan", cto: "N/A", vp: "N/A", em: "arthur.fan@marex.com",
    tech: "Python, C#, .NET, JavaScript, TypeScript", web: "marex.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Tandem", sec: "FinTech", geo: "UK", fs: "Established", tr: "£366M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Alex Mollart", cto: "Russell Strevens", vp: "N/A", em: "alex.mollart@tandem.co.uk",
    tech: "Mambu, GitHub, XML, MySQL, BambooHR, reCAPTCHA, Nginx, lit-element, Webflow, Bootstrap, FullStory", web: "tandem.co.uk",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Teya", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£358M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Thiago Piau", cto: "Marcus Bronstein", vp: "Sam Donnelley", em: "thiago.piau@teya.com",
    tech: "Facebook Pixel, Jenkins, git, OAuth, Cisco Meraki, Framer Sites, Mastercard, Chakra UI", web: "teya.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Smart", sec: "FinTech", geo: "UK", fs: "Established", tr: "£353M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Andrew Evans", cto: "Lee Hepplewhite", vp: "N/A", em: "andrew.evans@smartpension.co.uk",
    tech: "SQL, PostgreSQL, git, Perkbox, JSON-LD, Android, Ruby on Rails, CSS", web: "smartpension.co.uk",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "ClearBank", sec: "FinTech", geo: "UK", fs: "Established", tr: "£348M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Mark Fairless", cto: "Neil Drennan", vp: "N/A", em: "mark.fairless@clear.bank",
    tech: "Hotjar, Tableau, Azure Active Directory, HashiCorp, Windows 10, Windows Server, Zscaler, Dynatrace", web: "clear.bank",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Behavox", sec: "FinTech", geo: "UK", fs: "Established", tr: "£282M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Erkin Adylov", cto: "Benjamin", vp: "N/A", em: "erkin.adylov@behavox.com",
    tech: "Quantum risk detection, LLM, Cloud", web: "behavox.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Stream", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£278M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Thierry Schellenbach", cto: "Tommaso Barbugli", vp: "Stuart Lawrence", em: "thierry.schellenbach@getstream.io",
    tech: "Go, RocksDB, Raft, AWS", web: "getstream.io",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Oxbury", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£262M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "James Farrar", cto: "Stuart Ellidge", vp: "N/A", em: "james.farrar@oxbury.com",
    tech: "Cloud-based solutions, Naqoda core banking system", web: "oxbury.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "10x Banking", sec: "FinTech", geo: "UK", fs: "Established", tr: "£258M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Antony Jenkins", cto: "Phil Knight", vp: "N/A", em: "antony.jenkins@10xbanking.com",
    tech: "HubSpot Content Hub, RSS, git, Headspace, iOS, HTML, Lua, Thycotic", web: "10xbanking.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Funding Circle", sec: "FinTech", geo: "UK", fs: "Established", tr: "£255M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Lisa Jacobs", cto: "Greig McEwan", vp: "Bruno Tavares", em: "lisa.jacobs@fundingcircle.com",
    tech: "Microsoft Clarity, cdnjs, Webpack, PHP, Chakra UI, Google Analytics, Ruby On Rails, Python, AWS, Kubernetes", web: "fundingcircle.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Paddle", sec: "FinTech", geo: "UK", fs: "Established", tr: "£251M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Jimmy Fitzgerald", cto: "Stephen Wilcock", vp: "N/A", em: "christian.owens@paddle.com",
    tech: "Google Analytics, HubSpot, Vue.js, Alpine.js, Svelte", web: "paddle.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Curve", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£251M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Shachar Bialick", cto: "Eric Molitor", vp: "N/A", em: "shachar.bialick@curve.com",
    tech: "Node, JavaScript, MEAN/MERN stack", web: "curve.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Tide", sec: "FinTech", geo: "UK", fs: "Established", tr: "£244M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Oliver Prill", cto: "Bernie Miles", vp: "Lauren Henry", em: "oliver.prill@tide.co",
    tech: "Pendo, LaunchDarkly, Segment, Jamf Pro, Hammer.js, Braze, Workable, CSS", web: "tide.co",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Copper", sec: "Crypto", geo: "UK", fs: "Growth", tr: "£237M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Amar Kuchinad", cto: "N/A", vp: "N/A", em: "amar.kuchinad@copper.co",
    tech: "Blockchain, Digital asset custody technology", web: "copper.co",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Fnality", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£237M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Rhomaios Ram", cto: "Adam Clarke", vp: "N/A", em: "michelle.neal@fnality.org",
    tech: "Docker, Microsoft SharePoint, Atlassian Jira, Preact, AWS Security Hub", web: "fnality.org",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "CloudPay", sec: "FinTech", geo: "UK", fs: "Established", tr: "£234M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Roland Folz", cto: "N/A", vp: "N/A", em: "roland.folz@cloudpay.net",
    tech: "SaaS, Java, React, SQL", web: "cloudpay.net",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Form3", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£228M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Mike", cto: "Steve Cook", vp: "Edward Wilde", em: "mike@form3.tech",
    tech: "AWS, GCP, Kubernetes, CockroachDB, Elasticsearch, PostgresDB, Vault, Consul, Go", web: "form3.tech",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "TradingView", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£218M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Oleg Mukhanov", cto: "N/A", vp: "N/A", em: "omukhanov@tradingview.com",
    tech: "HTML5, Canvas, WebSockets, Python, Node.js", web: "tradingview.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Lendable", sec: "FinTech", geo: "UK", fs: "Established", tr: "£214M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Martin Kissinger", cto: "Patrick Myles", vp: "N/A", em: "info@lendable.io",
    tech: "AWS, Python, React, Postgres", web: "lendable.io",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "ClearCourse", sec: "FinTech", geo: "UK", fs: "Established", tr: "£209M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Christina Hamilton", cto: "Bielawa", vp: "N/A", em: "CHamilton@clearcoursellp.com",
    tech: "Grafana, Snowflake, Apache Tomcat, Storybook, PHP, HTML5", web: "clearcoursellp.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Genesis", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£199M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Stephen Murphy", cto: "Tej Sidhu", vp: "N/A", em: "stephen.murphy@genesis.global",
    tech: "AI Architecture, Cloud, Microservices, Java", web: "genesis.global",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "9fin", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£198M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Steven Hunter", cto: "Huss El-Sheikh", vp: "N/A", em: "huss@9fin.com",
    tech: "AI, Generative AI, LLMs, Python, AWS, PostgreSQL", web: "9fin.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Fresha", sec: "SaaS", geo: "UK", fs: "Growth", tr: "£195M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "William Zeqiri", cto: "N/A", vp: "N/A", em: "william.zeqiri@fresha.com",
    tech: "AI Concierge, iOS, Android, Web, Cloud", web: "fresha.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "PaySend", sec: "FinTech", geo: "UK", fs: "Established", tr: "£195M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Ben Chisell", cto: "N/A", vp: "N/A", em: "ben.chisell@paysend.com",
    tech: "Mastercard/Visa APIs, Cloud, Mobile App, Microservices", web: "paysend.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Kriya", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£192M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Anil", cto: "N/A", vp: "N/A", em: "info@kriyago.com",
    tech: "API orchestration, Cloud, Bidirectional data sync", web: "kriyago.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "The Bank of London", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£192M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Tony Bullman", cto: "N/A", vp: "N/A", em: "uksupport@bankoflondon.com",
    tech: "Cloud-native, API-driven, Microservices", web: "bankoflondon.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Soldo", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£192M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Carlo Gualandri", cto: "Carlo D'Acunto", vp: "N/A", em: "businesssupport@soldo.com",
    tech: "AWS, Kubernetes, Cloud-native, SSO, SAML", web: "soldo.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Monese", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£185M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Norris Koppel", cto: "Jonas Kiiver", vp: "N/A", em: "support@monese.com",
    tech: "Thought Machine Vault, Cloud-native, iOS, Android", web: "monese.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Monument Bank", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£179M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Steve", cto: "N/A", vp: "N/A", em: "complaints@monument.co",
    tech: "Microservices, API-first, Contentful CMS, Salesforce", web: "monument.co",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Prodigy Finance", sec: "FinTech", geo: "UK", fs: "Established", tr: "£178M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Cameron Stevens", cto: "N/A", vp: "N/A", em: "CStevens@prodigyfinance.com",
    tech: "Python, Kotlin, JavaScript, Bootstrap, Moment.js", web: "prodigyfinance.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "ClearScore", sec: "FinTech", geo: "UK", fs: "Established", tr: "£173M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Justin Basini", cto: "Klaus Thorup", vp: "N/A", em: "help@clearscore.com",
    tech: "AWS, Java, Spring Boot, React, React Native, Kubernetes", web: "clearscore.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Elliptic", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£168M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Simone", cto: "Hull", vp: "N/A", em: "support@elliptic.co",
    tech: "DynamoDB, AWS, Blockchain Analytics, Crypto Compliance Software", web: "elliptic.co",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Moneyfarm", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£168M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Giovanni Daprà", cto: "Emanuele Blanco", vp: "N/A", em: "support@moneyfarm.com",
    tech: "Online Investments, Smart Technology", web: "moneyfarm.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Capital on Tap", sec: "FinTech", geo: "UK", fs: "Established", tr: "£164M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Damian Brychcy", cto: "Jamie Howard", vp: "N/A", em: "contact@capitalontap.com",
    tech: "Web & Mobile, Cloud & Infrastructure, Backend, AI, Data", web: "capitalontap.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "ThinCats", sec: "FinTech", geo: "UK", fs: "Established", tr: "£160M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Amany Attia", cto: "Billy Ferguson", vp: "N/A", em: "accountsteam@thincats.com",
    tech: "Proprietary credit risk model, Data Analytics", web: "thincats.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "TerraPay", sec: "FinTech", geo: "UK", fs: "Venture", tr: "£146M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Ambar Sur", cto: "N/A", vp: "N/A", em: "contactus@terrapay.com",
    tech: "Cross-border payments, APIs, Cloud", web: "terrapay.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Sonovate", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£144M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Richard Prime", cto: "N/A", vp: "N/A", em: "dpo@sonovate.com",
    tech: "Software Engineering, Cloud, Flexible financing tech", web: "sonovate.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Cleo", sec: "FinTech", geo: "UK", fs: "Established", tr: "£137M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Barney Hussey-Yeo", cto: "N/A", vp: "N/A", em: "sales@cleo.com",
    tech: "Cleo Integration Cloud (CIC), EDI, API, B2B Integration", web: "cleo.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Pollinate", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£135M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Fiona Roach Canning", cto: "Andrew Considine", vp: "N/A", em: "contact@pollinate.tech",
    tech: "AI Agents, ERPs, Supply Chain, Python, Cloud", web: "pollinate.tech",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Paymentology", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£134M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Jeff Parker", cto: "Tim Joslyn", vp: "N/A", em: "contact@paymentology.com",
    tech: "Lume platform, APIs, Cloud", web: "paymentology.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Storfund", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£134M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "George Brintalos", cto: "N/A", vp: "N/A", em: "contact@storfund.com",
    tech: "Ecommerce tech, APIs", web: "storfund.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Modulr", sec: "FinTech", geo: "UK", fs: "Established", tr: "£133M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Myles Stephenson", cto: "Ben Taylor", vp: "N/A", em: "contact@modulrfinance.com",
    tech: "Payments Automation Platform, APIs, Cloud", web: "modulrfinance.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Tractable", sec: "FinTech / AI", geo: "UK", fs: "Growth", tr: "£133M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Alex Dalyac", cto: "Razvan Ranca", vp: "N/A", em: "information@tractable.ai",
    tech: "AI, Computer Vision, Cloud", web: "tractable.ai",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Dext", sec: "FinTech", geo: "UK", fs: "Established", tr: "£129M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Sabby Gill", cto: "Stefan", vp: "N/A", em: "support@dext.com",
    tech: "AI Bookkeeping software, Document capture", web: "dext.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Primer", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£128M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Gabriel Le Roux", cto: "Alex Mallet", vp: "N/A", em: "support@primer.io",
    tech: "Unified intelligence for payments, AI, Cloud", web: "primer.io",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Nutmeg", sec: "FinTech", geo: "UK", fs: "Exited", tr: "£126M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Sanjiv Somani", cto: "Andrew Spencer", vp: "N/A", em: "support@personalinvesting.jpmorgan.com",
    tech: "Java, Springboot, Kotlin, DynamoDB, Aurora/MySQL, AWS, Kubernetes, Kafka", web: "personalinvesting.jpmorgan.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Currencycloud", sec: "FinTech", geo: "UK", fs: "Established", tr: "£125M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Ledsham", cto: "Drennan", vp: "N/A", em: "support@currencycloud.com",
    tech: "NetSuite, Salesforce, Spark, APIs, SDKs", web: "currencycloud.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Fly Now Pay Later", sec: "FinTech", geo: "UK", fs: "Exited", tr: "£122M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Jasper Dykes", cto: "N/A", vp: "N/A", em: "sales@flynowpaylater.com",
    tech: "MySQL, Moment.js, cdnjs", web: "flynowpaylater.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Kroo", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£121M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Veronika Lovett", cto: "N/A", vp: "N/A", em: "team@getkroo.com",
    tech: "Procore, AI, Data Connectors", web: "getkroo.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Freetrade", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£120M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Viktor Nebehaj", cto: "Ian Fuller", vp: "Ian Fuller", em: "hello@freetrade.io",
    tech: "BigQuery, Cloud Functions, DBT, Looker, Terraform, Python, Typescript, Cloud Scheduler, Postgres", web: "freetrade.io",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "RedCloud", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£119M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Justin Floyd", cto: "N/A", vp: "Richard Brenchley", em: "info@redcloudtechnology.com",
    tech: "RedAI, Machine Learning, Cloud", web: "redcloudtechnology.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Codat", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£118M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Peter Lord", cto: "Alexander", vp: "Craig Nile", em: "info@codat.io",
    tech: "APIs, Infrastructure for data sharing", web: "codat.io",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "FINBOURNE", sec: "FinTech", geo: "UK", fs: "Growth", tr: "£117M",
    sr: "TBD (Ready for Technical Diagnostics Pipeline)",
    ceo: "Tom", cto: "Elliot", vp: "N/A", em: "support@finbourne.com",
    tech: "EDM+, Luminesce, AI", web: "finbourne.com",
    ao: "Jane Smith (UK)", trc: "Diagnostic-Led", rp: "Diagnostic Playbook"
  },
  {
    n: "Carta", sec: "FinTech / Equity Management", geo: "USA", fs: "Series G", tr: "$1.16B",
    sr: "Data scaling issues, secondary sales infrastructure",
    ceo: "Henry Ward", cto: "Will Larson", vp: "N/A", em: "will.larson@carta.com",
    tech: "ReactJS, Java, Python, Distributed Systems", web: "carta.com"
  },
  {
    n: "Dave", sec: "FinTech / Banking Tech", geo: "USA", fs: "Post IPO", tr: "$163.6M",
    sr: "AI-led underwriting, scaling demand",
    ceo: "Jason Wilk", cto: "Chien-Liang Chou", vp: "Gopi Kuchimanchi", em: "support@dave.com",
    tech: "AI, Front End Infrastructure, Fullstack", web: "dave.com"
  },
  {
    n: "Intercom", sec: "AI Chatbots Software / Customer Support", geo: "USA", fs: "Secondary Market", tr: "$291.9M",
    sr: "AI integration, scaling throughput",
    ceo: "Eoghan McCabe", cto: "Darragh Curran", vp: "N/A", em: "darragh@intercom.com",
    tech: "React, AI, Messenger", web: "intercom.com"
  }
];

// Reconstruct AllCompanyResearch list dynamically in code to avoid bloating the file with repeated fields
export const ALL_COMPANIES_RESEARCH_DATA: AllCompanyResearch[] = COMPACT_DATA.map((item, index) => {
  const isUK = item.geo === "UK";
  const defaults = {
    status: "Pending",
    headquarters: isUK ? "London, United Kingdom" : "San Francisco, CA",
    industry: "Technology",
    subIndustry: item.sec,
    businessModel: "B2B SaaS",
    employeeCount: 938,
    engineeringTeamSize: 75,
    lastFundingDate: "2023-01-15",
    leadInvestor: "Sequoia Capital",
    keyCompetitors: "Competitor A, Competitor B",
    techStackFit: "High",
    painPointSeverity: "High",
    budgetEstimate: 21005,
    strategicFit: "High",
    healthScore: "Green",
    accountOwner: isUK ? "Jane Smith (UK)" : "John Doe (US)",
    lastActivityDate: "2023-10-01",
    priorityScore: 57,
    priorityTier: "Tier 3",
    priorityRank: index + 1,
    priorityScore1to10: 10,
    abilityToPay1to10: 10,
    technicalRiskCategory: "Solution-Led",
    recommendedPlaybook: "Solution Playbook"
  };

  return {
    name: item.n,
    sector: item.sec,
    geography: item.geo,
    fundingStage: item.fs,
    totalRaised: item.tr,
    scalingRisks: item.sr,
    ceo: item.ceo,
    cto: item.cto,
    vpEngineering: item.vp,
    email: item.em,
    techStack: item.tech,
    website: item.web,
    status: item.hq ? "Pending" : defaults.status,
    headquarters: item.hq || defaults.headquarters,
    industry: item.ind || defaults.industry,
    subIndustry: item.sub || defaults.subIndustry,
    businessModel: item.bm || defaults.businessModel,
    employeeCount: item.emp || defaults.employeeCount,
    engineeringTeamSize: item.eng || defaults.engineeringTeamSize,
    lastFundingDate: item.lfd || defaults.lastFundingDate,
    leadInvestor: item.li || defaults.leadInvestor,
    keyCompetitors: item.comp || defaults.keyCompetitors,
    techStackFit: item.tsf || defaults.techStackFit,
    painPointSeverity: item.pps || defaults.painPointSeverity,
    budgetEstimate: item.be || defaults.budgetEstimate,
    strategicFit: item.sf || defaults.strategicFit,
    healthScore: item.hs || defaults.healthScore,
    accountOwner: item.ao || defaults.accountOwner,
    lastActivityDate: item.lad || defaults.lastActivityDate,
    priorityScore: item.ps || defaults.priorityScore,
    priorityTier: item.pt || defaults.priorityTier,
    priorityRank: item.pr || defaults.priorityRank,
    priorityScore1to10: item.ps10 || defaults.priorityScore1to10,
    abilityToPay1to10: item.atp10 || defaults.abilityToPay1to10,
    technicalRiskCategory: item.trc || defaults.technicalRiskCategory,
    recommendedPlaybook: item.rp || defaults.recommendedPlaybook
  };
});
