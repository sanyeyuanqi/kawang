import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { loginSchema } from '@/lib/validators';
import { useAuth } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/lib/errors';
import { useLanguage } from '@/context/LanguageContext';
import AuthScaffold from '@/components/shop/AuthScaffold';
import AuthWebLayout from '@/components/shop/AuthWebLayout';
import MobilePhoneFrame from '@/components/shop/MobilePhoneFrame';

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const { t } = useLanguage();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { account: '', password: '' },
  });

  const [remember, setRemember] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);

  const onSubmit = async (data: LoginFormData) => {
    setLoginError(null);
    try {
      const loggedInUser = await login(data.account, data.password, remember);
      const redirect = searchParams.get('redirect');
      const isAdmin = loggedInUser.role === 'admin';
      const target = isAdmin
        ? (redirect?.startsWith('/admin') ? redirect : '/admin')
        : (redirect && !redirect.startsWith('/admin') ? redirect : '/');
      navigate(target, { replace: true });
    } catch (err: any) {
      if (err?.response?.status === 429) {
        const retryAfter =
          err?.response?.data?.retryAfter ?? err?.response?.headers?.['retry-after'];
        const minutes = retryAfter ? Math.ceil(Number(retryAfter) / 60) : 5;
        setLoginError(t("auth.retryLater").replace("{minutes}", String(minutes)));
      } else {
        setLoginError(getApiErrorMessage(err, t("auth.loginFailed")));
      }
    }
  };

  return (
    <AuthScaffold>
      <MobilePhoneFrame contentClassName="px-7 pt-[75px]">
        <form onSubmit={handleSubmit(onSubmit)} className="rounded-[20px] border border-[#dfe5ed] bg-white px-7 pb-14 pt-9">
          <h1 className="text-center text-[26px] font-bold leading-none text-[#0e131e]">{t("auth.login.title")}</h1>
          <label className="mt-5 block text-[15px] font-medium text-[#404a5c]">{t("auth.account")}</label>
          <Controller name="account" control={control} render={({ field }) => (
            <input {...field} disabled={isSubmitting} autoComplete="username" placeholder={t("auth.accountPlaceholder")} className="mt-3 h-[54px] w-full rounded-[14px] border border-[#dfe5ed] bg-white px-5 text-[16px] text-[#111827] outline-none placeholder:text-[#8b98ad] focus:border-[#0e4beb]" />
          )} />
          {errors.account?.message && <p className="mt-2 text-[13px] text-[#e82828]">{errors.account.message}</p>}
          <label className="mt-7 block text-[15px] font-medium text-[#404a5c]">{t("auth.password")}</label>
          <Controller name="password" control={control} render={({ field }) => (
            <input {...field} type="password" disabled={isSubmitting} autoComplete="current-password" placeholder={t("auth.passwordPlaceholder")} className="mt-3 h-[54px] w-full rounded-[14px] border border-[#dfe5ed] bg-white px-5 text-[16px] text-[#111827] outline-none placeholder:text-[#8b98ad] focus:border-[#0e4beb]" />
          )} />
          {errors.password?.message && <p className="mt-2 text-[13px] text-[#e82828]">{errors.password.message}</p>}
          <div className="mt-6 flex items-center justify-between">
            <label className="flex items-center gap-3 text-[15px] text-[#404a5c]">
              <input checked={remember} onChange={(e) => setRemember(e.target.checked)} type="checkbox" className="h-5 w-5 rounded-[6px] border border-[#dfe5ed] accent-[#0e4beb]" />
              {t("auth.remember")}
            </label>
            <Link to="/forgot-password" className="text-[15px] font-medium text-[#0e4beb]">{t("auth.forgotPassword")}</Link>
          </div>
          {loginError && <p className="mt-4 text-[13px] text-[#e82828]">{loginError}</p>}
          <button disabled={isSubmitting} className="auth-submit-button mt-7 h-[52px] w-full rounded-[14px] bg-[#0e4beb] text-[16px] font-medium text-white disabled:opacity-60">
            {isSubmitting ? t("auth.loggingIn") : t("auth.login")}
          </button>
          <div className="mt-7 h-px bg-[#e3e8f0]" />
          <button type="button" onClick={() => navigate('/register')} className="mt-6 h-[50px] w-full rounded-[14px] bg-[#e8f2ff] text-[16px] font-medium text-[#0e4beb]">
            {t("auth.noAccountRegister")}
          </button>
        </form>
      </MobilePhoneFrame>
      <AuthWebLayout
        badge={t("auth.loginBadge")}
        title={t("auth.loginHeroTitle")}
        description={t("auth.loginHeroDesc")}
        cardHeightClassName="min-h-[clamp(500px,25.36vw,720px)]"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
          <p className="text-center text-[clamp(10px,0.49vw,14px)] font-bold uppercase tracking-[0.08em] text-[#6b7990]">Account Login</p>
          <h1 className="mt-2 text-center text-[clamp(22px,1.2vw,34px)] font-bold leading-none text-[#111827]">{t("auth.login.title")}</h1>
          <p className="mt-[clamp(14px,0.72vw,20px)] text-center text-[clamp(11px,0.56vw,16px)] leading-none text-[#6b7990]">{t("auth.login.subtitle")}</p>
          <div className="mt-[clamp(10px,0.63vw,18px)] h-px bg-[#e3e8f0]" />

          <label className="mt-[clamp(14px,0.78vw,22px)] text-[clamp(11px,0.56vw,16px)] font-medium text-[#404a5c]">{t("auth.account")}</label>
          <Controller name="account" control={control} render={({ field }) => (
            <input {...field} disabled={isSubmitting} autoComplete="username" placeholder={t("auth.accountPlaceholder")} className="mt-[clamp(9px,0.49vw,14px)] h-[clamp(44px,2.11vw,60px)] rounded-[clamp(9px,0.56vw,16px)] border border-[#dfe5ed] bg-white px-[clamp(14px,0.77vw,22px)] text-[clamp(12px,0.56vw,16px)] text-[#111827] outline-none placeholder:text-[#9aa6b7] focus:border-[#0e4beb]" />
          )} />
          {errors.account?.message && <p className="mt-2 text-[12px] text-[#e82828]">{errors.account.message}</p>}

          <label className="mt-[clamp(14px,0.78vw,22px)] text-[clamp(11px,0.56vw,16px)] font-medium text-[#404a5c]">{t("auth.password")}</label>
          <Controller name="password" control={control} render={({ field }) => (
            <input {...field} type="password" disabled={isSubmitting} autoComplete="current-password" placeholder={t("auth.passwordPlaceholder")} className="mt-[clamp(9px,0.49vw,14px)] h-[clamp(44px,2.11vw,60px)] rounded-[clamp(9px,0.56vw,16px)] border border-[#dfe5ed] bg-white px-[clamp(14px,0.77vw,22px)] text-[clamp(12px,0.56vw,16px)] text-[#111827] outline-none placeholder:text-[#9aa6b7] focus:border-[#0e4beb]" />
          )} />
          {errors.password?.message && <p className="mt-2 text-[12px] text-[#e82828]">{errors.password.message}</p>}

          <div className="mt-[clamp(14px,0.78vw,22px)] flex items-center justify-between">
            <label className="flex items-center gap-[10px] text-[clamp(11px,0.56vw,16px)] text-[#404a5c]">
              <input checked={remember} onChange={(e) => setRemember(e.target.checked)} type="checkbox" className="h-[clamp(14px,0.63vw,18px)] w-[clamp(14px,0.63vw,18px)] rounded border border-[#dfe5ed] accent-[#0e4beb]" />
              {t("auth.remember")}
            </label>
            <Link to="/forgot-password" className="text-[clamp(11px,0.56vw,16px)] font-semibold text-[#0e4beb]">{t("auth.forgotPassword")}</Link>
          </div>

          {loginError && <p className="mt-3 text-[12px] text-[#e82828]">{loginError}</p>}
          <button disabled={isSubmitting} className="auth-submit-button mt-[clamp(16px,0.92vw,26px)] h-[clamp(46px,2.25vw,64px)] rounded-[clamp(9px,0.56vw,16px)] bg-[#111827] text-[clamp(13px,0.56vw,16px)] font-semibold text-white disabled:opacity-60">
            {isSubmitting ? t("auth.loggingIn") : t("auth.login")}
          </button>
          <div className="mt-[clamp(12px,0.7vw,20px)] h-px bg-[#e3e8f0]" />
          <button type="button" onClick={() => navigate('/register')} className="mt-[clamp(12px,0.7vw,20px)] h-[clamp(42px,1.97vw,56px)] rounded-[clamp(9px,0.56vw,16px)] bg-[#e8f2ff] text-[clamp(12px,0.56vw,16px)] font-semibold text-[#0e4beb]">
            {t("auth.noAccountRegister")}
          </button>
        </form>
      </AuthWebLayout>
    </AuthScaffold>
  );
}
