import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';

// Plain TS mirror of these DTOs — single source of truth for the shape on the backend side,
// imported by events.service.ts to type the Json column's read paths. Deliberately duplicated
// (not shared) on the frontend, matching this codebase's existing convention of hand-mirrored
// API-shape types with no shared import (e.g. SessionCard.tsx's EventSession/CalendarEvent).
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
    thumbnailUrl: string;
    embedUrl: string;
    name: string;
    role: string;
    quote: string;
  }>;
  gallery: string[];
};

export class LandingHeroDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsArray()
  @IsString({ each: true })
  credentials: string[];

  @IsString()
  @IsNotEmpty()
  photoUrl: string;
}

export class LandingDayDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  theme: string;

  @IsArray()
  @IsString({ each: true })
  points: string[];

  @IsString()
  @IsNotEmpty()
  takeaway: string;
}

export class LandingCourseDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  subtitle: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LandingDayDto)
  days: LandingDayDto[];
}

export class LandingTestimonialDto {
  @IsString()
  @IsNotEmpty()
  videoUrl: string;

  @IsString()
  @IsNotEmpty()
  thumbnailUrl: string;

  @IsString()
  @IsNotEmpty()
  embedUrl: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  role: string;

  @IsString()
  @IsNotEmpty()
  quote: string;
}

export class LandingContentDto {
  @ValidateNested()
  @Type(() => LandingHeroDto)
  hero: LandingHeroDto;

  @ValidateNested()
  @Type(() => LandingCourseDto)
  course: LandingCourseDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LandingTestimonialDto)
  testimonials: LandingTestimonialDto[];

  @IsArray()
  @IsString({ each: true })
  gallery: string[];
}
