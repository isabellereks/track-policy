import type { Entity } from "@/types";
import { RESEARCHED_INTERNATIONAL } from "./international-researched";

/**
 * EU + Asia + Canada (non-US North America) entities. Hand-curated baseline
 * entities live in HAND_CURATED below. Claude-researched additions (via
 * scripts/sync/international.ts) are imported from data/international/*.json
 * through ./international-researched and merged in below.
 */
const HAND_CURATED: Entity[] = [
  // ─────────── EU REGION ───────────
  {
    id: "eu-bloc",
    geoId: "eu-bloc",
    name: "European Union",
    region: "eu",
    level: "bloc",
    isOverview: true,
    // EU passed the world's most comprehensive AI law (the AI Act) plus
    // EnEfG-style data center mandates. Heaviest regulator on the planet.
    stanceDatacenter: "concerning",
    stanceAI: "concerning",
    contextBlurb:
      "The EU AI Act is the world's first comprehensive legal framework for AI — a risk-based regime that bans certain uses outright, forces conformity assessments on high-risk systems, and layers transparency duties on general-purpose models. Alongside it, the recast Energy Efficiency Directive imposes mandatory reporting, PUE disclosure, and waste-heat reuse on any data center above 500 kW.",
    legislation: [
      {
        id: "eu-ai-act",
        billCode: "Reg. 2024/1689",
        title: "Artificial Intelligence Act",
        summary:
          "Risk-based regulation prohibiting unacceptable AI uses, requiring conformity assessments for high-risk systems, and transparency obligations for general-purpose AI models.",
        stage: "Enacted",
        impactTags: [],
        category: "ai-governance",
        updatedDate: "2026-03-12",
        partyOrigin: "B",
      },
      {
        id: "eu-edd",
        billCode: "Dir. 2023/1791",
        title: "Energy Efficiency Directive (recast)",
        summary:
          "Mandatory reporting and efficiency standards for data centers above 500 kW, including PUE disclosure and waste-heat reuse requirements.",
        stage: "Enacted",
        impactTags: ["carbon-emissions", "renewable-energy"],
        category: "data-center-siting",
        updatedDate: "2026-02-28",
        partyOrigin: "B",
      },
    ],
    keyFigures: [
      {
        id: "eu-vdl",
        name: "Ursula von der Leyen",
        role: "European Commission · President · AI Act and Cloud & AI Development Act",
        party: "EPP",
        stance: "concerning",
      },
      {
        id: "eu-virkkunen",
        name: "Henna Virkkunen",
        role: "European Commission · EVP Tech Sovereignty, Security & Democracy",
        party: "EPP",
        stance: "concerning",
      },
      {
        id: "eu-ribera",
        name: "Teresa Ribera",
        role: "European Commission · EVP Clean, Just & Competitive Transition · data-center energy rules",
        party: "S&D",
        stance: "restrictive",
      },
      {
        id: "eu-merz",
        name: "Friedrich Merz",
        role: "Germany · Chancellor · EnEfG enforcement and sovereign-AI investment",
        party: "CDU",
        stance: "concerning",
      },
      {
        id: "eu-macron",
        name: "Emmanuel Macron",
        role: "France · President · sovereign-AI champion (Mistral, Scaleway)",
        party: "Renaissance",
        stance: "favorable",
      },
      {
        id: "eu-meloni",
        name: "Giorgia Meloni",
        role: "Italy · Prime Minister · G7 AI chair and Hiroshima Process lead",
        party: "FdI",
        stance: "review",
      },
      {
        id: "eu-martin",
        name: "Micheál Martin",
        role: "Ireland · Taoiseach · host of 30%+ of EU hyperscale capacity",
        party: "Fianna Fáil",
        stance: "favorable",
      },
      {
        id: "eu-sioli",
        name: "Lucilla Sioli",
        role: "European AI Office · Director · AI Act operational lead",
        party: "—",
        stance: "concerning",
      },
    ],
    news: [
      {
        id: "eu-news-1",
        headline:
          "EU Commission Publishes First Guidelines for GPAI Providers",
        source: "European Commission",
        date: "2025-07-18",
        url: "https://digital-strategy.ec.europa.eu/en/policies/guidelines-gpai-providers",
      },
      {
        id: "eu-news-2",
        headline: "EU Sets 2026 AI Act Enforcement Priorities",
        source: "Creati AI",
        date: "2026-02-12",
        url: "https://creati.ai/ai-news/2026-02-12/eu-commission-ai-act-implementation-2026/",
      },
      {
        id: "eu-news-3",
        headline: "Orrick: Six Steps Before EU AI Act Enforcement",
        source: "Orrick",
        date: "2025-11-15",
        url: "https://www.orrick.com/en/Insights/2025/11/The-EU-AI-Act-6-Steps-to-Take-Before-2-August-2026",
      },
      {
        id: "eu-news-4",
        headline: "EU AI Act GPAI Transparency Rules Take Effect",
        source: "DLA Piper",
        date: "2025-08-15",
        url: "https://www.dlapiper.com/en-us/insights/publications/2025/08/latest-wave-of-obligations-under-the-eu-ai-act-take-effect",
      },
    ],
  },
  {
    id: "germany",
    geoId: "276",
    name: "Germany",
    region: "eu",
    level: "federal",
    // Germany has the strictest data center energy law in Europe (EnEfG:
    // PUE ≤ 1.2, 100% renewables by 2027, mandatory waste-heat reuse).
    // Pro-tech in tone but the actual regulatory regime is restrictive.
    stanceDatacenter: "concerning",
    stanceAI: "concerning",
    contextBlurb:
      "Germany is implementing the EU AI Act with extra national teeth — especially on AI in employment. Its binding data center efficiency law (EnEfG) requires all new facilities to run on 100% renewable power by 2027, the strictest grid standard among major EU economies.",
    legislation: [
      {
        id: "de-enefg",
        billCode: "EnEfG §11",
        title: "Energy Efficiency Act — Data Centre Provisions",
        summary:
          "Requires PUE ≤ 1.2 for new data centers, 50% waste-heat reuse, and 100% renewable energy by 2027.",
        stage: "Enacted",
        impactTags: ["carbon-emissions", "renewable-energy"],
        category: "data-center-siting",
        updatedDate: "2026-03-27",
        partyOrigin: "B",
      },
      {
        id: "de-ai-employment",
        billCode: "Drs. 20/8129",
        title: "AI in Employment Act",
        summary:
          "Establishes works council co-determination rights over AI systems used in hiring, performance review, and dismissal decisions.",
        stage: "Floor",
        impactTags: [],
        category: "ai-workforce",
        updatedDate: "2026-03-10",
        partyOrigin: "D",
      },
    ],
    keyFigures: [
      {
        id: "de-wissing",
        name: "Volker Wissing",
        role: "Federal Minister for Digital and Transport · EnEfG sponsor",
        party: "FDP",
        stance: "favorable",
      },
      {
        id: "de-mast",
        name: "Katja Mast",
        role: "MdB · SPD · Lead, AI in Employment Act",
        party: "SPD",
        stance: "favorable",
      },
      {
        id: "de-rasche",
        name: "Maria-Lena Weiss",
        role: "MdB · CDU · Digital Committee Ranking Member",
        party: "CDU",
        stance: "review",
      },
    ],
    news: [
      {
        id: "de-news-1",
        headline: "EnEfG Sets PUE ≤1.2 for German Data Centers",
        source: "White & Case",
        date: "2024-02-08",
        url: "https://www.whitecase.com/insight-alert/data-center-requirements-under-new-german-energy-efficiency-act",
      },
      {
        id: "de-news-2",
        headline: "Germany Mandates Data Center Waste-Heat Recovery",
        source: "Cundall",
        date: "2024-04-30",
        url: "https://www.cundall.com/ideas/blog/why-germanys-energy-efficiency-act-makes-waste-heat-recovery-a-national-priority",
      },
      {
        id: "de-news-3",
        headline: "Germany First to Codify EU Data Center Rules",
        source: "Columbia Climate Law Blog",
        date: "2025-10-24",
        url: "https://blogs.law.columbia.edu/climatechange/2025/10/24/from-eu-framework-to-national-action-how-germany-regulates-data-center-energy-use/",
      },
    ],
  },
  {
    id: "france",
    geoId: "250",
    name: "France",
    region: "eu",
    level: "federal",
    // Macron's all-in sovereign-AI-compute push, €2.5B France 2030 fund,
    // and the AI mega-site build-out make France one of the most
    // innovation-friendly EU members despite the bloc-level AI Act.
    stanceDatacenter: "favorable",
    stanceAI: "concerning",
    contextBlurb:
      "France is pitching itself as Europe's AI capital — anchored by an AI sovereignty strategy and a hard push for domestic compute. On the flip side, CNIL (the data protection authority) has flagged data center water consumption as an urgent regulatory gap, signaling scrutiny of the hyperscale buildout alongside the welcome mat.",
    legislation: [
      {
        id: "fr-loi-num",
        billCode: "PJL-AN 2024-512",
        title: "Loi pour la Souveraineté Numérique",
        summary:
          "Establishes a national framework for sovereign cloud certification and data center siting near low-carbon power sources.",
        stage: "Committee",
        impactTags: [],
        category: "data-center-siting",
        updatedDate: "2026-03-05",
        partyOrigin: "B",
      },
      {
        id: "fr-cnil-water",
        billCode: "Arr. CNIL-2025",
        title: "CNIL Water Use Disclosure Order",
        summary:
          "Mandates water consumption disclosure for data centers exceeding 5 MW under expanded environmental reporting authority.",
        stage: "Enacted",
        impactTags: ["water-consumption"],
        category: "data-center-siting",
        updatedDate: "2026-03-22",
        partyOrigin: "B",
      },
    ],
    keyFigures: [
      {
        id: "fr-bothorel",
        name: "Éric Bothorel",
        role: "Deputy · Renaissance · Chair, AI Working Group",
        party: "Renaissance",
        stance: "favorable",
      },
      {
        id: "fr-de-montchalin",
        name: "Amélie de Montchalin",
        role: "Senator · Renaissance · Lead, Loi pour la Souveraineté Numérique",
        party: "Renaissance",
        stance: "favorable",
      },
      {
        id: "fr-bayou",
        name: "Julien Bayou",
        role: "Deputy · EELV · Water-use disclosure advocate",
        party: "EELV",
        stance: "restrictive",
      },
    ],
    news: [
      {
        id: "fr-news-1",
        headline: "France Adds Sector-Specific Data Center Rules",
        source: "National Law Review",
        date: "2026-02-20",
        url: "https://natlawreview.com/article/building-data-centers-france-navigating-regulatory-hurdles-and-unlocking-growth",
      },
      {
        id: "fr-news-2",
        headline: "France Now Hosts 352 Active Data Centers",
        source: "Futura Sciences",
        date: "2026-01-25",
        url: "https://www.futura-sciences.com/en/french-data-centers-set-off-alarm-what-risks-are-hitting-closer-than-you-think_27400/",
      },
      {
        id: "fr-news-3",
        headline: "Inside Macron's Push for AI Data Center Capital",
        source: "Data Center Dynamics",
        date: "2026-02-28",
        url: "https://www.datacenterdynamics.com/en/analysis/france-ai-data-center-build-out-emmanuel-macron/",
      },
    ],
  },
  {
    id: "united-kingdom",
    geoId: "826",
    name: "United Kingdom",
    region: "eu",
    level: "federal",
    // Post-Brexit UK deliberately chose a pro-innovation, principles-based
    // approach distinct from the EU AI Act. Bletchley Declaration host,
    // AI Growth Zones in planning, AI Bill delayed to keep options open.
    stanceDatacenter: "review",
    stanceAI: "review",
    // (key figures populated below)
    contextBlurb:
      "Post-Brexit the UK has taken a pro-innovation, principles-based AI approach that's deliberately distinct from the EU AI Act. Surging data center demand has pressured the grid hard enough that National Grid is now running a formal load-zone review.",
    legislation: [
      {
        id: "uk-ai-bill",
        billCode: "HL Bill 11",
        title: "Artificial Intelligence (Regulation) Bill",
        summary:
          "Establishes a UK AI Authority with cross-sectoral coordination duties and a statutory duty to consult on high-risk model evaluations.",
        stage: "Committee",
        impactTags: [],
        category: "ai-governance",
        updatedDate: "2026-03-28",
        partyOrigin: "B",
      },
      {
        id: "uk-grid",
        billCode: "Ofgem CR-2025/04",
        title: "Data Centre Connection Code Review",
        summary:
          "Ofgem consultation on new connection queue rules for sub-50 MW data center loads following grid congestion in West London.",
        stage: "Filed",
        impactTags: ["grid-capacity"],
        category: "data-center-siting",
        updatedDate: "2026-03-13",
        partyOrigin: "B",
      },
    ],
    keyFigures: [
      {
        id: "uk-clement-jones",
        name: "Lord Tim Clement-Jones",
        role: "Peer · Lib Dem · Lead, HL Bill 11",
        party: "Lib Dem",
        stance: "favorable",
      },
      {
        id: "uk-onwurah",
        name: "Chi Onwurah",
        role: "MP · Labour · Shadow Minister, Science & Innovation",
        party: "Labour",
        stance: "review",
      },
      {
        id: "uk-vaizey",
        name: "Lord Ed Vaizey",
        role: "Peer · Conservative · Communications and Digital Committee",
        party: "Conservative",
        stance: "concerning",
      },
    ],
    news: [
      {
        id: "uk-news-1",
        headline: "Ofgem Launches Grid Connection Overhaul",
        source: "Data Center Dynamics",
        date: "2026-02-15",
        url: "https://www.datacenterdynamics.com/en/news/uk-energy-regulator-ofgem-launches-grid-connection-overhaul-consultation-with-data-centers-a-focal-point/",
      },
      {
        id: "uk-news-2",
        headline: "Planning Reform for UK AI Growth Zones",
        source: "Burges Salmon",
        date: "2026-01-30",
        url: "https://www.burges-salmon.com/articles/102lxwu/data-centres-ai-growth-zones-in-planning-change-on-the-horizon-in-2026/",
      },
      {
        id: "uk-news-3",
        headline: "UK AI Bill Delayed Until After King's Speech",
        source: "Taylor Wessing",
        date: "2025-12-10",
        url: "https://www.taylorwessing.com/en/interface/2025/predictions-2026/uk-tech-and-digital-regulatory-policy-in-2026",
      },
    ],
  },

  // ─────────── ASIA REGION ───────────
  {
    id: "asia-region",
    geoId: "asia-region",
    name: "Asia",
    region: "asia",
    level: "bloc",
    isOverview: true,
    stanceDatacenter: "favorable",
    stanceAI: "review",
    contextBlurb:
      "Taiwan's TSMC produces over 90% of leading-edge silicon — the supply-chain chokepoint behind every AI buildout. China is racing ahead via its East-Data-West-Compute grid. Japan and Korea have both passed national AI laws (Japan voluntary, Korea binding).",
    legislation: [],
    keyFigures: [
      {
        id: "asia-xi",
        name: "Xi Jinping",
        role: "China · President · drives East-Data-West-Compute and state AI strategy",
        party: "CCP",
        stance: "concerning",
      },
      {
        id: "asia-cc-wei",
        name: "C.C. Wei",
        role: "Taiwan · TSMC Chair & CEO · controls >90% of leading-edge silicon",
        party: "—",
        stance: "favorable",
      },
      {
        id: "asia-lai",
        name: "Lai Ching-te",
        role: "Taiwan · President · US semiconductor alliance steward",
        party: "DPP",
        stance: "favorable",
      },
      {
        id: "asia-modi",
        name: "Narendra Modi",
        role: "India · Prime Minister · IndiaAI Mission and sovereign compute push",
        party: "BJP",
        stance: "favorable",
      },
      {
        id: "asia-wong",
        name: "Lawrence Wong",
        role: "Singapore · Prime Minister · regional AI hub strategy",
        party: "PAP",
        stance: "favorable",
      },
      {
        id: "asia-ishiba",
        name: "Shigeru Ishiba",
        role: "Japan · Prime Minister · voluntary AI framework and hyperscale investment",
        party: "LDP",
        stance: "review",
      },
      {
        id: "asia-koh",
        name: "Tan See Leng",
        role: "Singapore · Minister for Manpower & Trade · AI Verify toolkit lead",
        party: "PAP",
        stance: "favorable",
      },
      {
        id: "asia-lim",
        name: "Lim Joon Yong",
        role: "ASEAN Digital Working Group · Lead Negotiator",
        party: "—",
        stance: "review",
      },
    ],
    news: [
      {
        id: "asia-news-1",
        headline: "Japan Joins Asia PUE Cap Push for Data Centers",
        source: "Uptime Institute",
        date: "2026-02-10",
        url: "https://intelligence.uptimeinstitute.com/resource/japan-joins-push-data-center-regulation",
      },
      {
        id: "asia-news-2",
        headline: "South Korea AI Basic Act Takes Effect",
        source: "Cooley",
        date: "2026-01-27",
        url: "https://www.cooley.com/news/insight/2026/2026-01-27-south-koreas-ai-basic-act-overview-and-key-takeaways",
      },
      {
        id: "asia-news-3",
        headline: "China Cybersecurity Law Adds AI Governance",
        source: "ICLG",
        date: "2026-01-10",
        url: "https://iclg.com/practice-areas/telecoms-media-and-internet-laws-and-regulations/03-china-s-key-developments-in-artificial-intelligence-governance-in-2025",
      },
      {
        id: "asia-news-chip-smugglers",
        headline: "Chasing the Asia Chip Smuggling Network",
        source: "The Wire China",
        date: "2026-03-01",
        url: "https://www.thewirechina.com/2026/03/01/chasing-the-chip-smugglers-nvidia-ai-chips-china/",
      },
      {
        id: "asia-news-axios-smuggling",
        headline: "AI Chip Smuggling Signals Strong Chinese Demand",
        source: "Axios",
        date: "2026-03-20",
        url: "https://www.axios.com/2026/03/20/ai-chip-smuggling-china",
      },
      {
        id: "asia-news-fdd-smuggling",
        headline: "FDD: Limits of Industry Self-Policing on Chip Smuggling",
        source: "Foundation for Defense of Democracies",
        date: "2026-03-20",
        url: "https://www.fdd.org/analysis/2026/03/20/exposure-of-major-chinese-linked-chip-smuggling-operations-shows-limits-of-industry-self-policing/",
      },
      {
        id: "asia-news-singapore-deepseek",
        headline: "US Probes DeepSeek for Smuggling Nvidia GPUs via Singapore",
        source: "Tom's Hardware",
        date: "2025-02-03",
        url: "https://www.tomshardware.com/tech-industry/artificial-intelligence/u-s-investigates-whether-deepseek-smuggled-nvidia-ai-gpus-via-singapore",
      },
    ],
  },
  {
    id: "japan",
    geoId: "392",
    name: "Japan",
    region: "asia",
    level: "federal",
    stanceDatacenter: "favorable",
    stanceAI: "review",
    contextBlurb:
      "Japan has taken an innovation-first approach: METI's voluntary AI guidelines rather than binding rules. In parallel, the FSA and METI are jointly reviewing how data centers integrate with the grid as part of the GX (Green Transformation) initiative.",
    legislation: [
      {
        id: "jp-ai-guidelines",
        billCode: "METI 2024-G",
        title: "AI Business Operator Guidelines (revised)",
        summary:
          "Voluntary risk management framework for AI developers and deployers, aligned with international interoperability principles.",
        stage: "Enacted",
        impactTags: [],
        category: "ai-governance",
        updatedDate: "2026-03-22",
        partyOrigin: "B",
      },
      {
        id: "jp-gx-dc",
        billCode: "Bill 213",
        title: "GX Data Centre Promotion Act",
        summary:
          "Provides tax incentives for data centers sited in regions with surplus renewable generation and grid capacity headroom.",
        stage: "Floor",
        impactTags: ["renewable-energy", "tax-incentives"],
        category: "data-center-siting",
        updatedDate: "2026-03-26",
        partyOrigin: "B",
      },
    ],
    keyFigures: [
      {
        id: "jp-saito",
        name: "Ken Saito",
        role: "Minister of Economy, Trade and Industry · METI guidelines",
        party: "LDP",
        stance: "favorable",
      },
      {
        id: "jp-konishi",
        name: "Hiroyuki Konishi",
        role: "Diet Member · CDP · Lead, GX Data Centre Promotion Act",
        party: "CDP",
        stance: "favorable",
      },
      {
        id: "jp-yamada",
        name: "Taro Yamada",
        role: "Diet Member · LDP · Digital Society Committee",
        party: "LDP",
        stance: "review",
      },
    ],
    news: [
      {
        id: "jp-news-1",
        headline: "METI to Mandate 1.4 PUE Cap for Japanese Data Centers",
        source: "Uptime Institute",
        date: "2026-02-10",
        url: "https://intelligence.uptimeinstitute.com/resource/japan-joins-push-data-center-regulation",
      },
      {
        id: "jp-news-2",
        headline: "METI Releases AI Contract Checklist",
        source: "BABL AI",
        date: "2026-01-15",
        url: "https://babl.ai/japans-meti-releases-ai-contract-checklist-to-guide-businesses-in-the-era-of-generative-ai/",
      },
      {
        id: "jp-news-3",
        headline: "Japan Passes AI Law With No Fines or Bans",
        source: "MailMate",
        date: "2025-11-20",
        url: "https://mailmate.jp/blog/japan-ai-regulation-news",
      },
      {
        id: "jp-news-china-feud",
        headline: "China Probes Japan's Chipmaking Material Exports",
        source: "Bloomberg",
        date: "2026-01-06",
        url: "https://www.bloomberg.com/news/articles/2026-01-06/japan-protests-china-s-new-export-controls-on-dual-use-goods",
      },
      {
        id: "jp-news-meti-controls",
        headline: "Japan Tightens 23 Categories of Chip Equipment Exports",
        source: "CSIS",
        date: "2025-11-10",
        url: "https://www.csis.org/analysis/understanding-us-allies-current-legal-authority-implement-ai-and-semiconductor-export",
      },
    ],
  },
  {
    id: "china",
    geoId: "156",
    name: "China",
    region: "asia",
    level: "federal",
    // Mixed: heavy hand on AI services (CAC content labeling, generative
    // AI security review, algorithm filing) but massive state subsidy on
    // compute infrastructure (East Data West Compute, $8.2B AI fund,
    // 80–100% grid reserve margin). "concerning" captures the tension
    // better than the older "restrictive" tag.
    stanceDatacenter: "favorable",
    stanceAI: "restrictive",
    contextBlurb:
      "China runs the world's most prescriptive AI regime. Generative AI services face mandatory pre-launch security reviews, content labeling is required, and strict data localization rules sit alongside enormous state compute investment.",
    legislation: [
      {
        id: "cn-genai",
        billCode: "CAC 2023-07",
        title: "Interim Measures for Generative AI Services",
        summary:
          "Requires security assessments, content labeling, and licensed providers for public-facing generative AI services.",
        stage: "Enacted",
        impactTags: [],
        category: "ai-governance",
        updatedDate: "2026-03-29",
        partyOrigin: "B",
      },
      {
        id: "cn-east-data",
        billCode: "NDRC-2024-DC",
        title: "East Data West Compute Initiative — Phase II",
        summary:
          "National plan directing eastern data center workloads to renewable-rich western provinces, with mandatory PUE caps in eastern hubs.",
        stage: "Enacted",
        impactTags: ["grid-capacity", "renewable-energy", "carbon-emissions"],
        category: "data-center-siting",
        updatedDate: "2026-03-08",
        partyOrigin: "B",
      },
    ],
    keyFigures: [
      {
        id: "cn-zhuang",
        name: "Zhuang Rongwen",
        role: "Director · Cyberspace Administration of China",
        party: "CCP",
        stance: "restrictive",
      },
      {
        id: "cn-li",
        name: "Li Lecheng",
        role: "Vice Minister · MIIT · NDRC East Data West Compute lead",
        party: "CCP",
        stance: "restrictive",
      },
      {
        id: "cn-wang",
        name: "Wang Zhigang",
        role: "Former Minister of Science and Technology",
        party: "CCP",
        stance: "favorable",
      },
    ],
    news: [
      {
        id: "cn-news-1",
        headline: "China Cybersecurity Law Adds AI Governance Rules",
        source: "King & Wood Mallesons",
        date: "2025-11-15",
        url: "https://www.kwm.com/us/en/insights/latest-thinking/from-ai-governance-to-enhanced-enforcement-chinas-cybersecurity-law-amendment.html",
      },
      {
        id: "cn-news-2",
        headline: "China Announces Global AI Governance Action Plan",
        source: "ANSI",
        date: "2025-08-01",
        url: "https://www.ansi.org/standards-news/all-news/8-1-25-china-announces-action-plan-for-global-ai-governance",
      },
      {
        id: "cn-news-3",
        headline: "China's Mandatory AI Content Labelling Takes Effect",
        source: "ICLG",
        date: "2026-01-10",
        url: "https://iclg.com/practice-areas/telecoms-media-and-internet-laws-and-regulations/03-china-s-key-developments-in-artificial-intelligence-governance-in-2025",
      },
      {
        id: "cn-news-supermicro",
        headline: "Super Micro Co-Founder Charged in $2.5B Chip Smuggling",
        source: "Tech Insider",
        date: "2026-04-08",
        url: "https://tech-insider.org/super-micro-nvidia-chip-smuggling-china-2026/",
      },
      {
        id: "cn-news-160m",
        headline: "DOJ Breaks Up $160M Nvidia GPU Smuggling Ring",
        source: "CNBC",
        date: "2025-12-31",
        url: "https://www.cnbc.com/2025/12/31/160-million-export-controlled-nvidia-gpus-allegedly-smuggled-to-china.html",
      },
      {
        id: "cn-news-grid-advantage",
        headline: "China's Grid Advantage May Decide the AI Race",
        source: "Fortune",
        date: "2025-08-14",
        url: "https://fortune.com/2025/08/14/data-centers-china-grid-us-infrastructure/",
      },
      {
        id: "cn-news-chip-security-act",
        headline: "Congress Passes Chip Security Act With Tracking Tech",
        source: "BISI",
        date: "2026-03-26",
        url: "https://bisi.org.uk/reports/ai-chip-smuggling-the-limits-of-us-export-controls",
      },
    ],
  },
  {
    id: "south-korea",
    geoId: "410",
    name: "South Korea",
    region: "asia",
    level: "federal",
    // South Korea's AI Basic Act (effective Jan 22 2026) is a real binding
    // framework with statutory high-impact-AI categories and reporting
    // obligations — that's heavier than Japan's voluntary regime, so
    // "review" / under-discussion fits better than "favorable".
    stanceDatacenter: "review",
    stanceAI: "concerning",
    contextBlurb:
      "South Korea passed its AI Basic Act in 2024 — establishing a national oversight framework, a regulatory sandbox, and an AI safety institute. The Ministry of Trade is now studying how upcoming hyperscale projects will stress the grid.",
    legislation: [
      {
        id: "kr-ai-bf",
        billCode: "Bill 2206128",
        title: "AI Basic Act",
        summary:
          "Framework establishing high-impact AI categories, regulatory sandbox provisions, and a national AI safety institute.",
        stage: "Enacted",
        impactTags: [],
        category: "ai-governance",
        updatedDate: "2026-03-25",
        partyOrigin: "B",
      },
      {
        id: "kr-dc-grid",
        billCode: "MOTIE-2025-04",
        title: "Hyperscale Data Centre Grid Integration Act",
        summary:
          "Mandates grid impact assessments and curtailment agreements for data centers exceeding 200 MW.",
        stage: "Committee",
        impactTags: ["grid-capacity", "environmental-review"],
        category: "data-center-siting",
        updatedDate: "2026-03-11",
        partyOrigin: "B",
      },
    ],
    keyFigures: [
      {
        id: "kr-ahn",
        name: "Ahn Cheol-soo",
        role: "National Assembly Member · PPP · Lead, AI Basic Act",
        party: "PPP",
        stance: "favorable",
      },
      {
        id: "kr-jo",
        name: "Jo Seoung-lae",
        role: "National Assembly Member · DPK · Lead, MOTIE-2025-04",
        party: "DPK",
        stance: "review",
      },
      {
        id: "kr-park",
        name: "Park Soo-young",
        role: "Minister of Science and ICT",
        party: "PPP",
        stance: "favorable",
      },
    ],
    news: [
      {
        id: "kr-news-1",
        headline: "South Korea's AI Basic Act Takes Effect",
        source: "Cooley",
        date: "2026-01-27",
        url: "https://www.cooley.com/news/insight/2026/2026-01-27-south-koreas-ai-basic-act-overview-and-key-takeaways",
      },
      {
        id: "kr-news-2",
        headline: "OneTrust: Preparing for South Korea's New AI Law",
        source: "OneTrust",
        date: "2026-01-22",
        url: "https://www.onetrust.com/blog/south-koreas-new-ai-law-what-it-means-for-organizations-and-how-to-prepare/",
      },
      {
        id: "kr-news-3",
        headline: "ITIF: One Law, One Weak Link in Korea's AI Policy",
        source: "ITIF",
        date: "2025-09-29",
        url: "https://itif.org/publications/2025/09/29/one-law-sets-south-koreas-ai-policy-one-weak-link-could-break-it/",
      },
      {
        id: "kr-news-tier1",
        headline: "Korea Tier 1 on US AI Diffusion Rule",
        source: "CSIS",
        date: "2025-11-10",
        url: "https://www.csis.org/analysis/understanding-us-allies-current-legal-authority-implement-ai-and-semiconductor-export",
      },
      {
        id: "kr-news-cotton-letter",
        headline: "Cotton, Huizenga Press for Tighter Asia Chip Controls",
        source: "Office of Senator Tom Cotton",
        date: "2026-03-25",
        url: "https://www.cotton.senate.gov/news/press-releases/cotton-introduces-bill-to-lower-energy-costs-for-arkansans",
      },
    ],
  },
  {
    id: "australia",
    geoId: "36",
    name: "Australia",
    region: "asia",
    level: "federal",
    // The Mar 2026 National Expectations framework is non-binding and
    // operates as approval prioritization, not hard regulation — closer
    // to innovation-friendly than restrictive.
    stanceDatacenter: "review",
    stanceAI: "review",
    contextBlurb:
      "Australia is betting on voluntary standards over AI legislation, relying on its October 2025 Guidance for AI Adoption and a forthcoming AI Safety Institute. In March 2026 the federal government issued its first national expectations for data center developers, tying regulatory priority to clean energy and water sustainability. Privacy reform is rolling out in tranches, and the eSafety Commissioner runs one of the world's most active online-safety enforcement regimes.",
    legislation: [
      {
        id: "au-expectations-2026",
        billCode: "DISR Expectations 2026",
        title:
          "National Expectations of Data Centres and AI Infrastructure Developers",
        summary:
          "Commonwealth framework released March 2026 setting non-binding expectations for hyperscale data center and AI infrastructure projects, including grid impact, water use, local compute access for Australian startups and researchers, and alignment with the national clean energy transition. Operates as a prioritization lens for federal approvals rather than a hard regulatory regime.",
        stage: "Enacted",
        impactTags: [
          "grid-capacity",
          "water-consumption",
          "renewable-energy",
          "environmental-review",
        ],
        category: "data-center-siting",
        updatedDate: "2026-03-23",
        partyOrigin: "B",
        sourceUrl:
          "https://www.industry.gov.au/publications/expectations-data-centres-and-ai-infrastructure-developers",
      },
    ],
    keyFigures: [],
    news: [
      {
        id: "au-news-1",
        headline: "Australia Releases National Data Center Expectations",
        source: "DISR",
        date: "2026-03-23",
        url: "https://www.industry.gov.au/publications/expectations-data-centres-and-ai-infrastructure-developers",
      },
      {
        id: "au-news-2",
        headline: "HSF Kramer Breaks Down Australia's New Framework",
        source: "Herbert Smith Freehills Kramer",
        date: "2026-03-25",
        url: "https://www.hsfkramer.com/insights/2026-03/national-expectations-for-the-development-of-data-centres-and-ai-infrastructure-have-been-released-what-you-need-to-know",
      },
      {
        id: "au-news-3",
        headline: "Australia Puts AI Data Centers on Notice",
        source: "Data Center Knowledge",
        date: "2026-03-24",
        url: "https://www.datacenterknowledge.com/regulations/australia-puts-ai-data-centers-on-notice-with-new-approval-rules",
      },
      {
        id: "au-news-4",
        headline: "Bird & Bird: Australia Tightens Hyperscaler Obligations",
        source: "Bird & Bird",
        date: "2026-03-26",
        url: "https://www.twobirds.com/en/insights/2026/australia/australia-sets-new-national-expectations-for-data-centres-and-ai-infrastructure",
      },
    ],
  },
];

// Merge hand-curated baseline with whatever Claude has researched so far.
// Researched entries override hand-curated ones if IDs collide.
const RESEARCHED_BY_ID = new Map<string, Entity>();
for (const e of RESEARCHED_INTERNATIONAL) RESEARCHED_BY_ID.set(e.id, e);

export const INTERNATIONAL_ENTITIES: Entity[] = [
  ...HAND_CURATED.filter((e) => !RESEARCHED_BY_ID.has(e.id)),
  ...RESEARCHED_INTERNATIONAL,
];
