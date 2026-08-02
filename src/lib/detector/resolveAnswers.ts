/**
 * Phase 6.1 — resolve profile-kind fields directly from storage.
 * No network call for these — pure lookup against the user's Profile.
 */
import type { DetectedField, Profile, ProfileFieldKey, ProfileLink } from "../types";

export function resolveProfileField(field: DetectedField, profile: Profile): string {
  const key = field.matchedProfileKey;
  if (!key) return "";
  return resolveByKey(key, profile);
}

export function resolveByKey(key: ProfileFieldKey, profile: Profile): string {
  switch (key) {
    case "fullName":
      return profile.fullName;
    case "firstName":
      return profile.fullName.trim().split(/\s+/)[0] ?? "";
    case "lastName": {
      const parts = profile.fullName.trim().split(/\s+/);
      return parts.length > 1 ? parts[parts.length - 1] : "";
    }
    case "email":
      return profile.email;
    case "phone":
      return profile.phone;
    case "nationalId":
      return profile.nationalId;
    case "address":
      return profile.address ?? "";
    case "linkedin":
      return findLink(profile.links, /linkedin|لينكد/i);
    case "github":
      return findLink(profile.links, /github|جيت هاب/i);
    case "portfolio":
      return findLink(profile.links, /portfolio|بورتفوليو|اعمال|أعمال/i);
    case "drive":
      return findLink(profile.links, /drive|درايف/i);
    case "otherLink":
      return profile.links.find((l) => l.url.trim())?.url ?? "";
    default:
      return "";
  }
}

function findLink(links: ProfileLink[], pattern: RegExp): string {
  const link = links.find((l) => pattern.test(`${l.label} ${l.url}`));
  return link?.url ?? "";
}
