// One-time seed of the 8-week Reddit content calendar for Meta-Analysis
// Academy, transcribed from plano-operacional-reddit-maa.html (the static
// planning doc this feature replaces) with corrected calendar dates — the
// doc's own "week 1" label (15-20 September) is missing its Monday; the
// real ISO calendar week is Sep 14-20, 2026 = ISO week 38, and the plan's
// 8 weeks map to ISO weeks 38-45 contiguously. Each account has a fixed
// weekday (see ACCOUNT_NAME_BY_SLUG below), so plannedDate is derived from
// (isoWeek, slug) rather than trusting the doc's own weekday labels.
//
// Run once; safe to re-run only after manually deleting the rows it
// created (no de-dup marker column, unlike seed-analytics-demo.ts, since
// this is real production content).
//
// Predates migration 0028's format tag system — this script's formatNote
// strings ("Format — theme") are only backfilled into real
// schedule_format_tags rows by scripts/backfill-schedule-format-tags.ts,
// run once after this script. A fresh re-seed from here alone would leave
// format_tag_id null on every row until that backfill runs too.
//
// Usage: npm run seed-schedule-maa
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";
import { getIsoWeek } from "../lib/schedule/iso-week";

process.loadEnvFile(join(__dirname, "..", ".env.local"));

const COMPANY_NAME = "Meta Analysis Academy";
const CREATED_BY_EMAIL = "caiomorgz@gmail.com";

// data-acct slug -> real account_name, from the source doc's markup. Each
// account publishes on a fixed weekday. account_name in this DB includes
// the "u/" prefix (confirmed against the live reddit_accounts rows).
const ACCOUNT_NAME_BY_SLUG = {
  a1: "u/AutomaticMeringue585", // Tuesdays
  a2: "u/bumbale2", // Wednesdays
  a3: "u/Sad-Watercress-2240", // Thursdays
  a4: "u/Shoddy-Aioli-4039", // Mondays
} as const;

type Slug = keyof typeof ACCOUNT_NAME_BY_SLUG;

// Verified per-account posting dates for each ISO week (see lib/schedule/iso-week.ts
// sanity check + the implementation plan's date table).
const PLANNED_DATE_BY_WEEK: Record<number, Record<Slug, string>> = {
  38: { a4: "2026-09-14", a1: "2026-09-15", a2: "2026-09-16", a3: "2026-09-17" },
  39: { a4: "2026-09-21", a1: "2026-09-22", a2: "2026-09-23", a3: "2026-09-24" },
  40: { a4: "2026-09-28", a1: "2026-09-29", a2: "2026-09-30", a3: "2026-10-01" },
  41: { a4: "2026-10-05", a1: "2026-10-06", a2: "2026-10-07", a3: "2026-10-08" },
  42: { a4: "2026-10-12", a1: "2026-10-13", a2: "2026-10-14", a3: "2026-10-15" },
  43: { a4: "2026-10-19", a1: "2026-10-20", a2: "2026-10-21", a3: "2026-10-22" },
  44: { a4: "2026-10-26", a1: "2026-10-27", a2: "2026-10-28", a3: "2026-10-29" },
  45: { a4: "2026-11-02", a1: "2026-11-03", a2: "2026-11-04", a3: "2026-11-05" },
};

type SeedPost = {
  isoWeek: number; // 38..45
  slug: Slug;
  postKind: "target" | "generic";
  title: string;
  bodyCopy: string;
  formatNote: string;
  objectiveNote?: string;
};

const SEED_POSTS: SeedPost[] = [
  // ---- ISO week 38 (Sep 14-20, 2026) — doc's "Semana 1" ----
  {
    isoWeek: 38,
    slug: "a4",
    postKind: "generic",
    title: "PROSPERO registration: what it is, what it isn't, and the 5 fields people fill in wrong",
    formatNote: "Educational — protocol registration",
    bodyCopy:
      "Registering a protocol takes an afternoon and saves a lot of trouble later, but the form trips people up. Quick rundown of what PROSPERO is, which is a prospective register and not a peer review or a guarantee of anything, and what it isn't, which is a way to reserve your topic or stop someone else publishing first. The five fields that most often come back for revision: outcomes listed without definitions, search strategy described instead of pasted, unclear screening process, vague risk of bias plan, and a start date set after the work had already begun. Happy to answer questions on any of them.",
  },
  {
    isoWeek: 38,
    slug: "a1",
    postKind: "generic",
    title: "How much does research volume actually move the needle for IMGs vs. other application factors?",
    formatNote: "Discussion — research and applications",
    bodyCopy:
      "Every thread here says research matters, but nobody puts a number on it. NRMP data shows matched IMGs carry several times the publication count of matched US MD seniors, which sounds decisive until you notice that unmatched IMGs also publish a lot. So I want to hear from people who actually went through it. When you compare research against Step scores, US clinical experience and letters, where did research really rank? And did anyone get feedback from a program that addressed it directly?",
  },
  {
    isoWeek: 38,
    slug: "a2",
    postKind: "generic",
    title: "Half my studies report median and IQR, half report mean and SD. Convert or run a sensitivity analysis?",
    formatNote: "Real question — data extraction",
    bodyCopy:
      "Working on a review with nine included studies. Six report mean and SD, three report median and IQR. I know the Wan and Luo estimators exist, but I keep seeing reviewers push back when conversions make up a third of the sample. My instinct is to run the main analysis with conversions and a sensitivity analysis excluding those three, but I would rather learn from people who have defended this in peer review. What did reviewers actually accept?",
  },
  {
    isoWeek: 38,
    slug: "a3",
    postKind: "generic",
    title: "Is \"just do a systematic review\" the new default advice for students with no lab access?",
    formatNote: "Discussion — how to start research",
    bodyCopy:
      "Noticing that the standard answer to \"I have no research and no lab access\" has become \"do a systematic review\". It makes sense on paper, since you don't need funding or an ethics committee. But I'm curious about the other side. For people who actually finished one, was it as accessible as it sounds? How long did it really take, what was the part nobody warned you about, and would you give the same advice to someone starting today?",
  },

  // ---- ISO week 39 (Sep 21-27, 2026) — doc's "Semana 2" ----
  {
    isoWeek: 39,
    slug: "a4",
    postKind: "generic",
    title: "6 PRISMA 2020 items that most reviewer rejections come down to",
    formatNote: "Common mistakes — reporting",
    bodyCopy:
      "Going off patterns in reviewer comments rather than checklist order. The items that most often trigger a revision request: a search strategy summarised instead of pasted in full, no statement of how many reviewers screened and how disagreements were resolved, protocol registration missing or dated after the search, eligibility criteria that appear in the flow diagram but never in the methods, results reported without the certainty assessment, and a flow diagram whose numbers don't add up. That last one is far more common than it should be.",
  },
  {
    isoWeek: 39,
    slug: "a1",
    postKind: "generic",
    title: "Poster accepted at a US conference but you can't afford to go. The options nobody mentions",
    formatNote: "Common problem & solutions — conferences",
    bodyCopy:
      "This comes up every year and the advice usually stops at \"apply for a travel grant\". There is more than that. Most societies have trainee travel awards with deadlines earlier than people expect. Several accept virtual or poster only presentation at a reduced fee. Registration waivers exist but are rarely advertised, so you have to email the organising committee and ask. Some programs and universities have small internal funds that nobody uses. Adding what I know, and I would like to hear what actually worked for people here.",
  },
  {
    isoWeek: 39,
    slug: "a2",
    postKind: "target",
    title: "Ways people actually learn meta-analysis, and what each route does and doesn't give you",
    formatNote: "Comparison of learning methods — how meta-analysis is learned",
    objectiveNote: "Be the reference people link to when asked where to learn this.",
    bodyCopy:
      "There are four realistic routes and each gives you something different. The Cochrane Handbook is free and complete, and everything else is built on it, but it assumes you already have someone to ask when you get stuck. University short courses give you a few structured days and a certificate, usually strong on statistics and light on the messy parts like screening and writing. YouTube covers software well and methodology badly, because nobody corrects your work. Paid cohort programs, Meta-Analysis Academy among them, add the things the others don't: a deadline, a corrected exercise every week, and other people to co-author with, which is the part most beginners are actually missing. What none of them do is make the project happen for you. Disclosure: I work with the team at Meta-Analysis Academy, so weigh that last paragraph accordingly. Curious which route people here took and what was missing from it.",
  },
  {
    isoWeek: 39,
    slug: "a3",
    postKind: "generic",
    title: "How to check in 20 minutes whether your meta-analysis idea has already been done",
    formatNote: "Long-answer help — topic selection",
    bodyCopy:
      "Fast way to avoid four months of wasted work. Start with PubMed using the systematic review filter and your PICO terms, not your full question. Then check PROSPERO for registered protocols, because the thing that usually kills a project is not a published review but one registered eight months ago. Then Epistemonikos, which maps reviews to their included studies and shows overlap quickly. Then check the most recent guideline in your area, since a fresh guideline usually means the evidence was just synthesised. If all four come back clean, you probably have something worth pursuing.",
  },

  // ---- ISO week 40 (Sep 28-Oct 4, 2026) — doc's "Semana 3" ----
  {
    isoWeek: 40,
    slug: "a4",
    postKind: "target",
    title: "Feasibility checklist: 8 questions to answer before you commit 4 months to a systematic review",
    formatNote: "Checklist — feasibility before investing months",
    objectiveNote: "Savable, highly useful post with a verifiable mention.",
    bodyCopy:
      "Before committing months, these eight questions either save the project or kill it early, which is the whole point. Are there at least four or five studies reporting the same outcome in a comparable way? Is there a recent review or guideline covering it already? Are the populations similar enough that pooling means anything? Can you actually access the full texts? Do you have a second person for independent screening? Is the outcome reported consistently, or will you be converting half your data? Does answering the question change anything clinically? And can you finish it in the time you actually have, not the time you wish you had? Disclosure: this is the feasibility step from the Meta-Analysis Academy method, where I work, and it sits at stage three precisely because that is the cheapest point to abandon an idea. Anything you would add to the list?",
  },
  {
    isoWeek: 40,
    slug: "a1",
    postKind: "generic",
    title: "Does a conference abstract count the same as a publication on ERAS? Getting conflicting answers",
    formatNote: "Real question — how abstracts are counted",
    bodyCopy:
      "Getting contradictory answers on this. ERAS has separate fields for peer reviewed publications, abstracts and presentations, so technically they are counted separately. But the aggregate research count quoted in Charting Outcomes lumps them together, which is why the published numbers look so high. What I want to know from people who have been on the other side of the screen: does a program actually weight a conference abstract close to a full publication, or is it read as a placeholder?",
  },
  {
    isoWeek: 40,
    slug: "a2",
    postKind: "generic",
    title: "I² = 85%. What it does and doesn't tell you, and what to do next",
    formatNote: "Educational — heterogeneity",
    bodyCopy:
      "High heterogeneity is not automatically a problem, and it is also not something you fix by switching to a random effects model. What I² tells you is the proportion of variance that is not chance. What it does not tell you is whether that variation is clinically meaningful, and it gets unstable with few studies, so an I² from five trials should not drive a decision on its own. Useful next steps, in order: look at the forest plot before the number, check whether the studies are answering the same question, run prespecified subgroups, consider meta-regression only if you have enough studies, and be willing to conclude that pooling was not appropriate. That last option is badly underused.",
  },
  {
    isoWeek: 40,
    slug: "a3",
    postKind: "generic",
    title: "Author order in student research groups. How does your group decide, and has it ever blown up?",
    formatNote: "Discussion — authorship",
    bodyCopy:
      "Genuinely curious how other groups handle this. ICMJE says authorship needs substantial contribution, drafting or revising, final approval and accountability, which sounds clean until six people split screening and everyone technically qualifies. Some groups rotate first author across projects. Some decide upfront before any work starts. Some decide at the end, and it goes badly. What system does your group use, and has it ever caused a real conflict?",
  },

  // ---- ISO week 41 (Oct 5-11, 2026) — doc's "Semana 4" ----
  {
    isoWeek: 41,
    slug: "a4",
    postKind: "generic",
    title: "Writing a cover letter that isn't generic: structure and what editors actually read",
    formatNote: "Guide — submission",
    bodyCopy:
      "Editors read cover letters fast and mostly look for three things: does this fit the scope, is there anything they need to know, and is there a reason to send it out for review rather than desk reject it. A structure that works: one sentence on what the study is and what it found, two or three sentences on why this journal specifically, one sentence on what is new compared to what they have already published, then the standard declarations. What kills it: restating the abstract, calling the findings groundbreaking, and generic praise for the journal. Naming a recent paper from that journal which your work builds on does more than any adjective.",
  },
  {
    isoWeek: 41,
    slug: "a1",
    postKind: "target",
    title: "Research that builds a career vs. research that builds a CV. Where does meta-analysis actually sit?",
    formatNote: "Career discussion — what research builds a career",
    objectiveNote: "Confront the audience's main objection head-on instead of avoiding it.",
    bodyCopy:
      "The criticism is fair and worth stating plainly. Ioannidis documented years ago that a large share of published reviews are redundant or misleading, and that has only accelerated since. So when someone says meta-analysis is CV padding, they are describing something real. But the design is not the problem. A review that answers a question nobody has answered, with a reproducible search and an honest certainty assessment, is a contribution. A twelfth review of the same drug with a new subgroup is not, regardless of design. The difference is rigour and question selection, and both are learnable, which is the argument for structured training rather than figuring it out alone. Disclosure: I work with the team at Meta-Analysis Academy, which is where this view comes from. Where do people here draw the line?",
  },
  {
    isoWeek: 41,
    slug: "a2",
    postKind: "generic",
    title: "RevMan vs. R vs. STATA for someone who doesn't code. Honest tradeoffs",
    formatNote: "Tools — software",
    bodyCopy:
      "Honest version for someone who does not code. RevMan is free, has a graphical interface and handles standard pairwise meta-analysis fine, which covers most of what people actually need. Its limits show up with network meta-analysis, single arm proportions and custom figures. R with meta or metafor does everything and produces figures journals like, but you will spend the first week fighting data import rather than statistics. STATA sits in between, with clean syntax and good output, if you have access to a licence. Practical advice: start in RevMan, move to R when a project forces you to, and do not treat learning R as a prerequisite for starting.",
  },
  {
    isoWeek: 41,
    slug: "a3",
    postKind: "target",
    title: "No mentor, no lab, no funding. A realistic map of what you can and can't do",
    formatNote: "Common problem & solutions — research without a mentor",
    objectiveNote: "The post with the most empathy for the persona's core pain point.",
    bodyCopy:
      "Realistic map rather than encouragement. What you can do alone: systematic review and meta-analysis, case reports and case series from your own service, analysis of public datasets like NHANES or SEER, and narrative reviews if you have someone senior willing to co-sign. What you cannot do alone: prospective trials, anything requiring ethics approval and recruitment, and lab work. The harder problem is not picking a project. It is that nobody tells you your methodology is wrong until a reviewer does it eight months later. Free ways around that: the Cochrane Handbook, posting your protocol here for feedback, finding a co-author who has already published. Paid ways: structured programs with corrected exercises, including Meta-Analysis Academy, where I work. Disclosure noted for that reason. Neither route removes the work.",
  },

  // ---- ISO week 42 (Oct 12-18, 2026) — doc's "Semana 5" ----
  {
    isoWeek: 42,
    slug: "a4",
    postKind: "target",
    title: "Myths about structured meta-analysis training, including the ones that favour the programs",
    formatNote: "Myth vs. reality — what a training delivers",
    objectiveNote: "Credibility post, positions the brand without promising anything.",
    bodyCopy:
      "Three things worth clearing up, including the ones that flatter paid programs. First, no program guarantees publication, and any that implies it should be treated as a red flag. Meta-Analysis Academy states this explicitly in its own materials, which is the correct position to take. Second, the claim that it is all free on YouTube is half true. The methodology is public and well documented. What is not free is having your work corrected, having a deadline, and having co-authors. Third, you do not need a statistics background to start, but you do need to be willing to learn enough to defend your own analysis, because outsourcing that is how people end up unable to answer a reviewer. Disclosure: I work with the team there, so read the first and third points with that in mind.",
  },
  {
    isoWeek: 42,
    slug: "a1",
    postKind: "generic",
    title: "Things people wish they'd known before their first international conference submission",
    formatNote: "Lessons-learned list — conferences",
    bodyCopy:
      "Starting with four and hoping people add theirs. Abstract deadlines are often six months before the meeting, so the work has to be finished far earlier than the date suggests. Most societies require the presenting author to register and pay, which surprises people who assumed acceptance covered it. Word limits are strict and structured, and a good abstract is rewritten to fit the limit rather than cut down to it. And an accepted abstract you do not present usually still gets indexed, but not always, so check before you count it on your CV. What else belongs on this list?",
  },
  {
    isoWeek: 42,
    slug: "a2",
    postKind: "generic",
    title: "Single-arm meta-analysis: legitimate design or shortcut? When pooling proportions makes sense",
    formatNote: "Method analysis — single arm",
    bodyCopy:
      "Worth discussing because it gets dismissed and overused in equal measure. Pooling proportions from single arm studies is legitimate when there is no comparator to be had, for instance rare adverse events after a procedure, or outcomes of a technique where randomisation is not feasible. It becomes a problem when a comparative question does exist and single arm pooling is chosen because it is easier. Technical points that matter: use a transformation for proportions near zero or one, expect high heterogeneity and do not treat it as a failure, and never present the pooled estimate as though it carried comparative meaning. Where do people here think the line sits?",
  },
  {
    isoWeek: 42,
    slug: "a3",
    postKind: "generic",
    title: "What stage are you stuck at right now? Idea, search, screening, extraction, stats, writing or submission",
    formatNote: "Community — mapping real pain points",
    bodyCopy:
      "Curious where people actually get stuck, because the advice online is heavily weighted toward getting started and almost silent about the middle. Vote for your current stage and, if you want, say one sentence about what specifically is blocking you. I will answer what I can and I suspect other people here can answer better. My guess is screening and statistics take most of the votes, but I have been wrong about this before.",
  },

  // ---- ISO week 43 (Oct 19-25, 2026) — doc's "Semana 6" ----
  {
    isoWeek: 43,
    slug: "a4",
    postKind: "generic",
    title: "AI in screening: what's defensible, what editors are rejecting, and how to report it in your methods",
    formatNote: "Tools — AI in screening",
    bodyCopy:
      "The ground is moving on this, so here is where it currently stands. Defensible: using an AI tool as a second screener alongside a human, using it to deduplicate or prioritise records, using it to draft a search string that you then verify manually. Not defensible right now: AI as sole screener, AI extracting data without human verification, and AI generating any part of the results. Several journals now require a statement of any AI use in the methods, and a few reject on non disclosure rather than on the use itself. Practical advice: log what you used, at which stage, and how a human verified it, then write that into the methods from the start rather than reconstructing it later.",
  },
  {
    isoWeek: 43,
    slug: "a1",
    postKind: "generic",
    title: "Research year before applying, or publish while working? The advice splits hard",
    formatNote: "Real question — career timing",
    bodyCopy:
      "Trying to decide and the advice splits hard. A dedicated research year gives you time, a supervisor and usually institutional affiliation, but costs a year and often money. Publishing while working is slower and lonelier, but you keep earning and you have no gap to explain. For people who did either: how many publications did the research year actually produce, and did it change how programs read your application? And for those who published while working, how many hours a week did that really take?",
  },
  {
    isoWeek: 43,
    slug: "a2",
    postKind: "target",
    title: "7 red flags that a published meta-analysis is unreliable",
    formatNote: "Common mistakes & paper analysis — methodological quality",
    objectiveNote: "Demonstrate technical competence. The most linkable of the nine.",
    bodyCopy:
      "Patterns that show up repeatedly when you read published reviews critically. Search strategy described but not reproducible. No protocol, or a protocol registered after the search date. Single reviewer screening, or no statement at all about how many screened. Outcomes pooled across different scales or timepoints without justification. Risk of bias assessed and then never mentioned again in the discussion. High heterogeneity reported and then interpreted as though it were not there. And conclusions that outrun the certainty assessment, which is the most common of all. Disclosure: the criteria here come from the standard toolkit, RoB 2, ROBINS I and GRADE, which is what structured programs like Meta-Analysis Academy teach, and where I work. Which of these do you run into most?",
  },
  {
    isoWeek: 43,
    slug: "a3",
    postKind: "target",
    title: "For those who learned meta-analysis properly: how long until you could run one without help?",
    formatNote: "Question — learning curve",
    objectiveNote: "High engagement, non-assertive tone, brand present without claiming anything.",
    bodyCopy:
      "Asking because I keep seeing wildly different answers. Some people say three months from zero to submitting independently. Others say it took two full projects before they stopped needing someone to check every step. For those of you who learned this properly, whether through a university course, a structured program, or working alongside someone who had already published: how long until you could take an idea from scratch to submission without asking for help at any stage? And which stage held you back longest? Disclosure: I work with Meta-Analysis Academy, and this question comes up constantly there, which is exactly why I want a wider set of answers than the ones I already hear.",
  },

  // ---- ISO week 44 (Oct 26-Nov 1, 2026) — doc's "Semana 7" ----
  {
    isoWeek: 44,
    slug: "a4",
    postKind: "target",
    title: "A full resource map for systematic reviews: free first, paid last",
    formatNote: "Resource list — full learning map",
    objectiveNote: "Long-lived reference post, savable and linkable.",
    bodyCopy:
      "Free first, because most people do not need to pay for anything. The Cochrane Handbook, complete and current, is the single best starting point. The PRISMA 2020 statement and its explanation paper, which reads far better than the checklist alone. The GRADE Handbook. Cochrane Interactive Learning has free modules. University short courses from Johns Hopkins and others appear on Coursera at no cost to audit. For software, the metafor documentation and the Doing Meta-Analysis in R book are both free online. For screening, Rayyan has a free tier. Books worth buying: Borenstein's Introduction to Meta-Analysis and Egger's Systematic Reviews in Health Research. Paid cohort programs exist too, Meta-Analysis Academy among them, and I work there, so treat that one as disclosed rather than recommended. Most people asking this question should exhaust the free list first.",
  },
  {
    isoWeek: 44,
    slug: "a1",
    postKind: "target",
    title: "Three well-designed reviews beat twelve rushed ones, and program directors can tell",
    formatNote: "Opinion — volume vs. quality",
    objectiveNote: "Generate real discussion and plant the brand on the side of rigor.",
    bodyCopy:
      "I think the people reading applications can tell the difference more often than applicants assume. Someone who opens your paper sees the question, the search, whether the certainty assessment is honest, and whether the conclusion matches the data. Twelve papers with overlapping questions and identical structure read as one project repeated, and a CV full of them tells a program that you optimise for count. The counterargument is that nobody reads the papers and only the number goes into the system, which may be true at screening but stops being true at interview, when someone asks you to explain your own analysis. Disclosure: I work with Meta-Analysis Academy, so I am not neutral here. Tell me where this is wrong.",
  },
  {
    isoWeek: 44,
    slug: "a2",
    postKind: "generic",
    title: "How to answer a reviewer who asks for an analysis you think is wrong",
    formatNote: "Guide — peer review",
    bodyCopy:
      'You are allowed to disagree, you just have to do it properly. A structure that works: thank them, restate their point in your own words to show you understood it, explain your reasoning with a citation, then offer something. The offer matters. Running their analysis as a sensitivity check and reporting that it does not change the conclusion is far stronger than arguing. If it does change the conclusion, you have learned something and should say so. Language that helps: "We appreciate this point and have added the analysis as a sensitivity check in Supplementary Table 2. The pooled estimate remains consistent, and we have noted this in the Discussion." Language that does not: "The reviewer is mistaken."',
  },
  {
    isoWeek: 44,
    slug: "a3",
    postKind: "generic",
    title: "What made the difference between the project you finished and the one you abandoned?",
    formatNote: "Discussion — projects that die midway",
    bodyCopy:
      "Trying to work out what actually predicts finishing. My suspicion is that it has less to do with motivation and more with structural things: a deadline that came from outside, a co-author who would notice if you stopped, a question small enough to be answerable. The projects I have seen die usually died at screening, when the volume turned out to be four times the estimate. What separated the one you finished from the one you dropped?",
  },

  // ---- ISO week 45 (Nov 2-8, 2026) — doc's "Semana 8" ----
  {
    isoWeek: 45,
    slug: "a4",
    postKind: "generic",
    title: "Pre-submission checklist: 12 things to verify before you hit submit",
    formatNote: "Checklist — pre-submission",
    bodyCopy:
      "Twelve things worth verifying, ordered roughly by how often they cause problems. Flow diagram numbers add up. Search strategy pasted in full for at least one database, with the date it was run. Protocol registration number in the methods. Number of reviewers and the disagreement process stated. All prespecified outcomes reported, including the ones that came out null. Certainty assessment present and reflected in the conclusion. Forest plots legible at print size. Reference list matches the included studies table. Author contributions checked against ICMJE criteria for everyone listed. Funding and conflicts declared. Journal formatting and word limits applied. And a cover letter written for this journal rather than the last one.",
  },
  {
    isoWeek: 45,
    slug: "a1",
    postKind: "generic",
    title: "What actually changed in your application after your first publication?",
    formatNote: "Discussion — expectation vs. reality",
    bodyCopy:
      "Looking for realistic answers rather than transformation stories. For people whose first publication is already behind them: did anything measurable change, or was the main effect that the second one got easier? I am asking because the expectation gap seems to cause a lot of disappointment here, and honest answers in both directions would be more useful than the highlight reel.",
  },
  {
    isoWeek: 45,
    slug: "a2",
    postKind: "generic",
    title: 'GRADE "very low certainty": does it make your conclusion useless?',
    formatNote: "Educational — certainty of evidence",
    bodyCopy:
      'Common worry, and the answer is no, but it does change what you are allowed to claim. Very low certainty means the true effect is likely substantially different from the estimate, so the honest conclusion is about the state of the evidence rather than about the intervention. "The evidence is insufficient to determine whether X improves Y" is a real finding, and reviewers accept it. What reviewers do not accept is a very low certainty rating followed by a conclusion recommending the intervention. Write the limitation into the abstract rather than burying it, and say specifically what kind of study would resolve it.',
  },
  {
    isoWeek: 45,
    slug: "a3",
    postKind: "generic",
    title: "End of quarter thread: submitted, accepted, rejected or still screening?",
    formatNote: "Community — quarterly wrap-up",
    bodyCopy:
      "End of the quarter thread. If you submitted, got accepted, got rejected, or finally finished screening after three months, put it here. Rejections count too, and honestly they are more useful to read than acceptances, because people rarely post them. Happy to hear what you are working on next as well.",
  },
];

function createAdminClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function main() {
  const admin = createAdminClient();

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id")
    .eq("name", COMPANY_NAME)
    .maybeSingle();
  if (companyError) throw new Error(companyError.message);
  if (!company) {
    throw new Error(`Company "${COMPANY_NAME}" not found — create it first, this script never creates companies.`);
  }

  const { data: accounts, error: accountsError } = await admin
    .from("reddit_accounts")
    .select("id, account_name")
    .in("account_name", Object.values(ACCOUNT_NAME_BY_SLUG));
  if (accountsError) throw new Error(accountsError.message);
  const accountIdByName = new Map((accounts ?? []).map((a) => [a.account_name, a.id]));
  for (const name of Object.values(ACCOUNT_NAME_BY_SLUG)) {
    if (!accountIdByName.has(name)) {
      throw new Error(`Reddit account "${name}" not found — create it on /accounts first, this script never creates accounts.`);
    }
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("email", CREATED_BY_EMAIL)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error(`Profile with email "${CREATED_BY_EMAIL}" not found.`);

  const rows = SEED_POSTS.map((post) => {
    const accountName = ACCOUNT_NAME_BY_SLUG[post.slug];
    const accountId = accountIdByName.get(accountName)!;
    const plannedDate = PLANNED_DATE_BY_WEEK[post.isoWeek][post.slug];

    const { isoYear, isoWeek } = getIsoWeek(new Date(`${plannedDate}T00:00:00Z`));
    if (isoWeek !== post.isoWeek) {
      throw new Error(
        `Date/week mismatch for "${post.title}": plannedDate ${plannedDate} computes to ISO week ${isoWeek}, expected ${post.isoWeek}. Fix PLANNED_DATE_BY_WEEK or the SEED_POSTS entry.`,
      );
    }

    return {
      company_id: company.id,
      reddit_account_id: accountId,
      collaborator: null, // not in the source doc — tagged manually later
      post_kind: post.postKind,
      iso_year: isoYear,
      iso_week: isoWeek,
      planned_date: plannedDate,
      title: post.title,
      body_copy: post.bodyCopy,
      format_note: post.formatNote,
      objective_note: post.objectiveNote ?? null,
      created_by: profile.id,
    };
  });

  const { error: insertError } = await admin.from("scheduled_posts").insert(rows);
  if (insertError) throw new Error(insertError.message);

  console.log(`Seeded ${rows.length} scheduled posts for ${COMPANY_NAME} (ISO weeks 38-45, 2026).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
