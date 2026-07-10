import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { RegisterDto } from './dto/register.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @HttpCode(200)
  @UseGuards(LocalAuthGuard)
  @Post('login')
  login(
    @Request()
    req: {
      user: {
        id: string;
        tenantId: string | null;
        studentId: string | null;
        email: string;
        role: string;
      };
    },
  ) {
    return this.authService.login(req.user);
  }

  @Get('me')
  me(@Request() req: { user: { userId: string } }) {
    return this.authService.getMe(req.user.userId);
  }
}
