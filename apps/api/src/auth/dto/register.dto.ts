import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^\d{1,4}$/, { message: 'Invalid country dial code' })
  phoneCountryCode!: string;

  @IsString()
  @Matches(/^\d{4,15}$/, { message: 'Phone number must be 4–15 digits' })
  phoneNo!: string;

  @IsString()
  @MinLength(1)
  organization!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
