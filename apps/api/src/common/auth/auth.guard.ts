import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    supabaseUserId: string;
  };
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');

    const token = auth.slice(7);
    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('Invalid token');

    req.user = {
      id: data.user.id,
      email: data.user.email!,
      supabaseUserId: data.user.id,
    };
    return true;
  }
}
