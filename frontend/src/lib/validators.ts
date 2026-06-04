import { z } from 'zod';

export const loginSchema = z.object({
  account: z.string().min(1, '请输入账号'),
  password: z.string().min(8, '密码至少8位'),
  remember: z.boolean().optional(),
});
export type LoginFormData = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, '用户名至少3个字符')
    .max(20, '用户名最多20个字符'),
  email: z.string().email('邮箱格式不正确'),
  code: z
    .string()
    .length(6, '验证码为6位数字')
    .regex(/^\d{6}$/, '验证码为6位数字'),
  password: z
    .string()
    .min(8, '密码至少8位')
    .regex(/[a-z]/, '密码需包含小写字母')
    .regex(/[A-Z]/, '密码需包含大写字母')
    .regex(/[0-9]/, '密码需包含数字'),
});
export type RegisterFormData = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z
  .object({
    email: z.string().email('邮箱格式不正确'),
    code: z.string().length(6, '验证码为6位数字'),
    newPassword: z.string().min(8, '密码至少8位'),
    confirmPassword: z.string().min(1, '请确认密码'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: '两次密码不一致',
    path: ['confirmPassword'],
  });
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
