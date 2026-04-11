import type { Entity } from "@/types";

/**
 * EU + Asia + Canada (non-US North America) entities, preserved from the
 * original placeholder data. The US federal entity and all 50 US states are
 * generated from real LegiScan data by scripts/build-placeholder.ts and live
 * in data/legislation/. This file stays hand-curated for international data
 * until we build a matching sync for it.
 */
export const INTERNATIONAL_ENTITIES: Entity[] = [
  // ─────────── EU REGION ───────────
  {
    id: "eu-bloc",
    geoId: "eu-bloc",
    name: "European Union",
    region: "eu",
    level: "bloc",
    isOverview: true,
    stance: "favorable",
    contextBlurb:
      "The EU AI Act represents the world's first comprehensive legal framework for artificial intelligence, establishing risk-based requirements for AI systems and strict limits on data center energy consumption.",
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
        id: "eu-vestager",
        name: "Margrethe Vestager",
        role: "Former EVP, Digital Age",
        party: "ALDE",
        stance: "favorable",
        quote:
          "Trustworthy AI requires guardrails — not after harm is done, but before products reach the market.",
      },
      {
        id: "eu-breton",
        name: "Thierry Breton",
        role: "Former Commissioner, Internal Market",
        party: "Renaissance",
        stance: "favorable",
      },
    ],
    news: [
      {
        id: "eu-news-1",
        headline: "EU AI Office issues first guidance on general-purpose models",
        source: "Politico EU",
        date: "2026-03-12",
        url: "#",
      },
      {
        id: "eu-news-2",
        headline: "Member states diverge on data center reporting deadlines",
        source: "Euractiv",
        date: "2026-02-28",
        url: "#",
      },
    ],
  },
  {
    id: "germany",
    geoId: "276",
    name: "Germany",
    region: "eu",
    level: "federal",
    stance: "favorable",
    contextBlurb:
      "Germany is implementing the EU AI Act with additional national provisions on AI in employment and a binding data center efficiency law (EnEfG) requiring 100% renewable power for new facilities by 2027.",
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
        quote:
          "Germany cannot lead on AI without first leading on data centre efficiency.",
      },
      {
        id: "de-mast",
        name: "Katja Mast",
        role: "MdB · SPD · Lead, AI in Employment Act",
        party: "SPD",
        stance: "favorable",
        quote:
          "Workers must have a seat at the table when AI decides who gets hired or fired.",
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
        headline: "Frankfurt operators warn EnEfG renewables deadline is unworkable",
        source: "Handelsblatt",
        date: "2026-03-27",
        url: "#",
      },
      {
        id: "de-news-2",
        headline: "Bundestag committee advances AI co-determination bill",
        source: "Süddeutsche Zeitung",
        date: "2026-03-10",
        url: "#",
      },
    ],
  },
  {
    id: "france",
    geoId: "250",
    name: "France",
    region: "eu",
    level: "federal",
    stance: "review",
    contextBlurb:
      "France is positioning itself as the European AI capital while CNIL has flagged data center water consumption as an urgent regulatory gap. The government's AI sovereignty strategy emphasizes domestic compute capacity.",
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
        quote:
          "Sovereignty is about controlling the stack — from chips to data to deployment.",
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
        quote:
          "Marseille's data centres cannot drink the Rhône dry while families ration water.",
      },
    ],
    news: [
      {
        id: "fr-news-1",
        headline: "Marseille tech hub sees pushback over freshwater cooling",
        source: "Le Monde",
        date: "2026-03-22",
        url: "#",
      },
      {
        id: "fr-news-2",
        headline: "France earmarks €2.5B for sovereign AI compute under France 2030",
        source: "Les Echos",
        date: "2026-03-05",
        url: "#",
      },
    ],
  },
  {
    id: "united-kingdom",
    geoId: "826",
    name: "United Kingdom",
    region: "eu",
    level: "federal",
    stance: "review",
    // (key figures populated below)
    contextBlurb:
      "Post-Brexit, the UK has pursued a pro-innovation, principles-based AI approach distinct from the EU AI Act. Recent grid pressures from data center growth have prompted a National Grid load-zone review.",
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
        quote:
          "A principles-based UK approach still needs a regulator with statutory teeth.",
      },
      {
        id: "uk-onwurah",
        name: "Chi Onwurah",
        role: "MP · Labour · Shadow Minister, Science & Innovation",
        party: "Labour",
        stance: "review",
        quote:
          "Innovation that nobody trusts isn't innovation. The AI Authority must be properly empowered.",
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
        headline: "DSIT publishes pre-deployment evaluation framework",
        source: "Financial Times",
        date: "2026-03-28",
        url: "#",
      },
      {
        id: "uk-news-2",
        headline: "West London council blocks 200 MW data center expansion",
        source: "BBC News",
        date: "2026-03-13",
        url: "#",
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
    stance: "review",
    contextBlurb:
      "AI governance across Asia varies widely. China maintains strict sovereign data requirements while Japan and South Korea pursue innovation-first frameworks with emerging environmental standards.",
    legislation: [
      {
        id: "asia-overview-1",
        billCode: "—",
        title: "Regional regulatory landscape",
        summary:
          "No pan-Asian AI framework exists. ASEAN issued non-binding guidance in 2024; APEC continues digital economy negotiations.",
        stage: "Filed",
        impactTags: [],
        category: "ai-governance",
        updatedDate: "2026-03-04",
        partyOrigin: "B",
      },
    ],
    keyFigures: [
      {
        id: "asia-koh",
        name: "Tan See Leng",
        role: "Singapore · Minister for Manpower & Trade",
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
        headline: "Japan METI updates voluntary AI guidelines for foundation models",
        source: "Nikkei Asia",
        date: "2026-03-22",
        url: "#",
      },
      {
        id: "asia-news-2",
        headline: "Singapore IMDA opens consultation on data center water use",
        source: "The Straits Times",
        date: "2026-03-04",
        url: "#",
      },
    ],
  },
  {
    id: "japan",
    geoId: "392",
    name: "Japan",
    region: "asia",
    level: "federal",
    stance: "favorable",
    contextBlurb:
      "Japan has pursued an innovation-first approach with voluntary AI guidelines from METI, while the FSA and METI jointly review data center grid integration as part of the GX (Green Transformation) initiative.",
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
        quote:
          "Voluntary frameworks let Japanese industry lead, not lag, on AI safety.",
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
        headline: "Hokkaido data center cluster wins GX designation",
        source: "Nikkei Asia",
        date: "2026-03-26",
        url: "#",
      },
      {
        id: "jp-news-2",
        headline: "JEITA publishes interoperability assessment for AI Act compliance",
        source: "The Japan Times",
        date: "2026-03-14",
        url: "#",
      },
    ],
  },
  {
    id: "china",
    geoId: "156",
    name: "China",
    region: "asia",
    level: "federal",
    stance: "restrictive",
    contextBlurb:
      "China maintains the world's most prescriptive AI regime, with mandatory security reviews for generative AI services, content labeling requirements, and aggressive data localization rules paired with significant state compute investment.",
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
        quote:
          "Generative AI must serve the socialist values of the people; security review is non-negotiable.",
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
        headline: "CAC publishes second batch of approved generative AI services",
        source: "Caixin",
        date: "2026-03-29",
        url: "#",
      },
      {
        id: "cn-news-2",
        headline: "Inner Mongolia surpasses Beijing in installed AI compute",
        source: "South China Morning Post",
        date: "2026-03-08",
        url: "#",
      },
    ],
  },
  {
    id: "south-korea",
    geoId: "410",
    name: "South Korea",
    region: "asia",
    level: "federal",
    stance: "favorable",
    contextBlurb:
      "South Korea enacted its AI Basic Act in 2024 establishing a national framework, sandbox provisions, and a national AI safety institute. The Ministry of Trade is studying grid impacts of upcoming hyperscale projects.",
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
        quote:
          "Korea must build the safety institute the world will trust to evaluate frontier AI.",
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
        headline: "Korea AI Safety Institute publishes evaluation methodology",
        source: "The Korea Herald",
        date: "2026-03-25",
        url: "#",
      },
      {
        id: "kr-news-2",
        headline: "Naver, Kakao announce joint compliance roadmap for AI Basic Act",
        source: "Yonhap News Agency",
        date: "2026-03-11",
        url: "#",
      },
    ],
  },
];
