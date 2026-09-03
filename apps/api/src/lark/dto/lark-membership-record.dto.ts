import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { STATUS_OPTIONS, TIER_OPTIONS } from '../../memberships/membership-labels';

export class LarkMembershipRecordDto {
  @IsString()
  @MinLength(1)
  larkRecordId: string;

  @IsString()
  @MinLength(1)
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  phoneCountryCode?: string;

  @IsString()
  @IsOptional()
  phoneNo?: string;

  @IsIn(TIER_OPTIONS)
  tier: string;

  @IsIn(STATUS_OPTIONS)
  status: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsEmail()
  @IsOptional()
  referredByEmail?: string;

  @IsString()
  @IsOptional()
  referralCode?: string;

  @IsNumber()
  @Min(0)
  pendingCommission: number;

  @IsNumber()
  @Min(0)
  approvedCommission: number;

  @IsNumber()
  @Min(0)
  totalCommission: number;

  @IsDateString()
  @IsOptional()
  larkUpdatedAt?: string;
}
