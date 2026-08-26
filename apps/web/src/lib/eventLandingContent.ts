// Frontend mirror of apps/api/src/events/dto/landing-content.dto.ts's LandingContent type —
// hand-duplicated, no shared import, matching this codebase's existing convention for API-shape
// types (e.g. SessionCard.tsx's EventSession/CalendarEvent). Keep the two in sync by hand if the
// shape ever changes.
export type LandingContent = {
  hero: {
    name: string;
    title: string;
    credentials: string[];
    photoUrl: string;
  };
  course: {
    title: string;
    subtitle: string;
    days: Array<{
      title: string;
      theme: string;
      points: string[];
      takeaway: string;
    }>;
  };
  testimonials: Array<{
    videoUrl: string;
    // Resolved from videoUrl by the admin form at save time — see EventLandingTemplate /
    // admin edit page for the YouTube/Vimeo resolution logic. Never resolved here.
    thumbnailUrl: string;
    embedUrl: string;
    name: string;
    role: string;
    quote: string;
  }>;
  gallery: string[];
};
