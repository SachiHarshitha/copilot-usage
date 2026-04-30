import { deleteUserHandler, userDetailHandler } from '@/lib/admin/userManagement';

export const GET = userDetailHandler;
export const DELETE = deleteUserHandler;
export const dynamic = 'force-dynamic';
