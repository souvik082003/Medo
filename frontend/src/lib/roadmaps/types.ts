export type ResourceKind = "Course" | "Book" | "Paper" | "Article" | "Tutorial" | "Tool" | "Challenges" | "Docs";

export interface RoadmapResource {
  title: string;
  kind: ResourceKind;
  note?: string;
  noteHi?: string;
}

export interface RoadmapTopic {
  id: string;
  label: string;
  labelHi: string;
  subtopics: string[];
  summary: string;
  summaryHi: string;
  howToLearn: string[];
  howToLearnHi: string[];
  projectIdea?: string;
  projectIdeaHi?: string;
  resources: RoadmapResource[];
  kind?: "core" | "option" | "checkpoint";
}

export interface RoadmapSection {
  id: string;
  order: number;
  title: string;
  titleHi: string;
  tagline: string;
  taglineHi: string;
  estimatedWeeks: string;
  description: string;
  descriptionHi: string;
  howToMaster: string[];
  howToMasterHi: string[];
  topics: RoadmapTopic[];
}

export interface RoadmapTrack {
  id: string;
  title: string;
  titleHi: string;
  category: "AI & Data" | "Software & Mobile" | "Infra & Security" | "Design & Product" | "Specialized";
  categoryHi: string;
  shortDesc: string;
  shortDescHi: string;
  prerequisites: string[];
  prerequisitesHi: string[];
  relatedTrackIds: string[];
  keywords: string[];
  sections: RoadmapSection[];
}

/** Compact helper for defining clean topic objects without boilerplate repetition. */
export function topic(
  id: string,
  label: string,
  labelHi: string,
  subtopics: string[],
  summary: string,
  summaryHi: string,
  howToLearn: string[],
  howToLearnHi: string[],
  resources: RoadmapResource[] = [],
  extra: { kind?: RoadmapTopic["kind"]; projectIdea?: string; projectIdeaHi?: string } = {}
): RoadmapTopic {
  return {
    id,
    label,
    labelHi,
    subtopics,
    summary,
    summaryHi,
    howToLearn,
    howToLearnHi,
    resources,
    ...extra,
  };
}
