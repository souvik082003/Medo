import { AI_DATA_TRACKS } from "./aiDataTracks";
import { CLOUD_API_TRACKS } from "./cloudApiTracks";
import { DATA_DESIGN_TRACKS } from "./dataDesignTracks";
import { INFRA_SPECIALIZED_TRACKS } from "./infraSpecializedTracks";
import { MOBILE_LANG_TRACKS } from "./mobileLangTracks";
import { SOFTWARE_TRACKS } from "./softwareTracks";
import { RoadmapTrack } from "./types";

export * from "./types";

export const ALL_ROADMAP_TRACKS: RoadmapTrack[] = [
  ...AI_DATA_TRACKS,
  ...DATA_DESIGN_TRACKS,
  ...SOFTWARE_TRACKS,
  ...MOBILE_LANG_TRACKS,
  ...CLOUD_API_TRACKS,
  ...INFRA_SPECIALIZED_TRACKS,
];

export const ROADMAP_BY_ID: Record<string, RoadmapTrack> = Object.fromEntries(
  ALL_ROADMAP_TRACKS.map((track) => [track.id, track])
);

/** Match the user's preferences & extracted resume skills against tracks to suggest the best starting track. */
export function rankTracksForCandidate(
  preferredRoles: string[],
  candidateSkills: string[]
): { recommendedId: string; scores: Record<string, number> } {
  const roleHay = preferredRoles.join(" ").toLowerCase();
  const skillSet = new Set(candidateSkills.map((s) => s.toLowerCase()));
  const scores: Record<string, number> = {};
  let bestId = ALL_ROADMAP_TRACKS[0].id;
  let bestScore = -1;

  for (const track of ALL_ROADMAP_TRACKS) {
    let score = 0;
    const trackTitleLower = track.title.toLowerCase();
    for (const r of preferredRoles) {
      const rl = r.toLowerCase();
      if (trackTitleLower.includes(rl) || rl.includes(trackTitleLower.split(" ")[0])) {
        score += 20;
      }
    }
    for (const kw of track.keywords) {
      if (roleHay.includes(kw)) score += 6;
      if (skillSet.has(kw)) score += 3;
    }
    scores[track.id] = score;
    if (score > bestScore) {
      bestScore = score;
      bestId = track.id;
    }
  }

  return { recommendedId: bestId, scores };
}
