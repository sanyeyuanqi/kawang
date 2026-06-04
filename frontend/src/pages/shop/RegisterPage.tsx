import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { registerSchema } from '@/lib/validators';
import { getApiErrorMessage } from '@/lib/errors';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/components/ui/Toast';
import api from '@/api/client'
import { useAuth } from '@/hooks/useAuth';
import AuthScaffold from '@/components/shop/AuthScaffold';
import AuthWebLayout from '@/components/shop/AuthWebLayout';
import MobilePhoneFrame from '@/components/shop/MobilePhoneFrame';

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { register } = useAuth();
  const { t } = useLanguage();

  const {
    control,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: '',
      email: '',
      code: '',
      password: '',
    },
  });

  const [agree, setAgree] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleSendCode = async () => {
    const email = getValues('email');
    if (!email) {
      setFormError(t("auth.needEmail"));
      addToast({ type: 'error', message: t("auth.needEmail") });
      return;
    }
    setFormError('');
    setSendingCode(true);
    try {
      await api.post('/auth/send-code', { email, purpose: 'register' });
      setCountdown(60);
      addToast({ type: 'success', message: t("auth.codeSent") });
    } catch (err: any) {
      const message = getApiErrorMessage(err, t("auth.sendCodeFailed"));
      setFormError(message);
      addToast({
        type: 'error',
        message,
      });
    } finally {
      setSendingCode(false);
    }
  };

  const onSubmit = async (data: RegisterFormData) => {
    setFormError('');
    if (!agree) {
      setFormError(t("auth.agreeTerms"));
      addToast({ type: 'error', message: t("auth.agreeTerms") });
      return;
    }
    try {
      await register(data);
      addToast({ type: 'success', message: t("auth.registerSuccess") });
      navigate('/', { replace: true });
    } catch (err: any) {
      const message = getApiErrorMessage(err, t("auth.registerFailed"));
      setFormError(message);
      addToast({
        type: 'error',
        message,
      });
    }
  };

  const isCodeBtnDisabled = sendingCode || countdown > 0;

  return (
    <AuthScaffold>
      <MobilePhoneFrame contentClassName="px-4 pt-[76px] pb-12">
        <form onSubmit={handleSubmit(onSubmit)} className="rounded-[20px] border border-[#dfe5ed] bg-white px-7 pb-7 pt-7">
          <h1 className="text-center text-[26px] font-bold leading-none text-[#0e131e]">{t("auth.register.title")}</h1>
          <label className="mt-6 block text-[15px] font-medium text-[#404a5c]">{t("auth.username")}</label>
          <Controller name="username" control={control} render={({ field }) => (
            <input {...field} disabled={isSubmitting} autoComplete="username" placeholder={t("auth.usernamePlaceholder")} className="mt-3 h-[54px] w-full rounded-[14px] border border-[#dfe5ed] bg-white px-5 text-[16px] text-[#111827] outline-none placeholder:text-[#8b98ad] focus:border-[#0e4beb]" />
          )} />
          {errors.username?.message && <p className="mt-2 text-[13px] text-[#e82828]">{errors.username.message}</p>}
          <label className="mt-5 block text-[15px] font-medium text-[#404a5c]">{t("auth.email")}</label>
          <Controller name="email" control={control} render={({ field }) => (
            <input {...field} type="email" disabled={isSubmitting} autoComplete="email" placeholder={t("auth.emailPlaceholderLong")} className="mt-3 h-[54px] w-full rounded-[14px] border border-[#dfe5ed] bg-white px-5 text-[16px] text-[#111827] outline-none placeholder:text-[#8b98ad] focus:border-[#0e4beb]" />
          )} />
          {errors.email?.message && <p className="mt-2 text-[13px] text-[#e82828]">{errors.email.message}</p>}
          <label className="mt-5 block text-[15px] font-medium text-[#404a5c]">{t("auth.code")}</label>
          <div className="mt-3 grid grid-cols-[1fr_112px] gap-3">
            <Controller name="code" control={control} render={({ field }) => (
              <input {...field} disabled={isSubmitting} autoComplete="off" placeholder={t("auth.codePlaceholder")} className="h-[54px] min-w-0 rounded-[14px] border border-[#dfe5ed] bg-white px-5 text-[16px] text-[#111827] outline-none placeholder:text-[#8b98ad] focus:border-[#0e4beb]" />
            )} />
            <button type="button" onClick={handleSendCode} disabled={isCodeBtnDisabled} className="h-[54px] rounded-[14px] bg-[#e8f2ff] text-[15px] font-semibold text-[#0e4beb] disabled:opacity-60">
              {sendingCode ? t("auth.sending") : countdown > 0 ? `${countdown}s` : t("auth.sendCode")}
            </button>
          </div>
          {errors.code?.message && <p className="mt-2 text-[13px] text-[#e82828]">{errors.code.message}</p>}
          <label className="mt-5 block text-[15px] font-medium text-[#404a5c]">{t("auth.setPassword")}</label>
          <Controller name="password" control={control} render={({ field }) => (
            <input {...field} type="password" disabled={isSubmitting} autoComplete="new-password" placeholder={t("auth.passwordMinPlaceholder")} className="mt-3 h-[54px] w-full rounded-[14px] border border-[#dfe5ed] bg-white px-5 text-[16px] text-[#111827] outline-none placeholder:text-[#8b98ad] focus:border-[#0e4beb]" />
          )} />
          {errors.password?.message && <p className="mt-2 text-[13px] text-[#e82828]">{errors.password.message}</p>}
          <label className="mt-6 flex items-center gap-3 text-[14px] text-[#404a5c]">
            <input checked={agree} onChange={(e) => setAgree(e.target.checked)} type="checkbox" className="h-5 w-5 rounded-[6px] border border-[#dfe5ed] accent-[#0e4beb]" />
            {t("auth.agreeTerms")}
          </label>
          {formError && <p className="mt-4 text-[13px] text-[#e82828]">{formError}</p>}
          <button disabled={isSubmitting} className="auth-submit-button mt-7 h-[52px] w-full rounded-[14px] bg-[#0e4aeb] text-[16px] font-medium text-white disabled:opacity-60">
            {isSubmitting ? t("auth.registering") : t("auth.register")}
          </button>
          <button type="button" onClick={() => navigate('/login')} className="mt-6 h-[50px] w-full rounded-[14px] bg-[#e8f2ff] text-[16px] font-medium text-[#0e4beb]">
            {t("auth.hasAccountLogin")}
          </button>
        </form>
      </MobilePhoneFrame>
      <AuthWebLayout
        badge={t("auth.registerBadge")}
        title={t("auth.registerHeroTitle")}
        description={t("auth.registerHeroDesc")}
        cardHeightClassName="min-h-[clamp(620px,29.58vw,840px)]"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
          <p className="text-center text-[clamp(10px,0.49vw,14px)] font-bold uppercase tracking-[0.08em] text-[#6b7990]">Save Orders</p>
          <h1 className="mt-2 text-center text-[clamp(22px,1.2vw,34px)] font-bold leading-none text-[#111827]">{t("auth.register.title")}</h1>
          <p className="mt-[clamp(14px,0.72vw,20px)] text-center text-[clamp(11px,0.56vw,16px)] leading-none text-[#6b7990]">{t("auth.registerSubtitle")}</p>
          <div className="mt-[clamp(14px,0.78vw,22px)] h-px bg-[#e3e8f0]" />

          <label className="mt-[clamp(14px,0.78vw,22px)] text-[clamp(11px,0.56vw,16px)] font-medium text-[#404a5c]">{t("auth.username")}</label>
          <Controller name="username" control={control} render={({ field }) => (
            <input {...field} disabled={isSubmitting} autoComplete="username" placeholder={t("auth.usernamePlaceholder")} className="mt-[clamp(8px,0.42vw,12px)] h-[clamp(42px,1.97vw,56px)] rounded-[clamp(9px,0.56vw,16px)] border border-[#dfe5ed] bg-white px-[clamp(14px,0.77vw,22px)] text-[clamp(12px,0.56vw,16px)] text-[#111827] outline-none placeholder:text-[#9aa6b7] focus:border-[#0e4beb]" />
          )} />
          {errors.username?.message && <p className="mt-2 text-[12px] text-[#e82828]">{errors.username.message}</p>}
          <label className="mt-[clamp(14px,0.78vw,22px)] text-[clamp(11px,0.56vw,16px)] font-medium text-[#404a5c]">{t("auth.email")}</label>
          <Controller name="email" control={control} render={({ field }) => (
            <input {...field} type="email" disabled={isSubmitting} autoComplete="email" placeholder={t("auth.emailPlaceholder")} className="mt-[clamp(8px,0.42vw,12px)] h-[clamp(42px,1.97vw,56px)] rounded-[clamp(9px,0.56vw,16px)] border border-[#dfe5ed] bg-white px-[clamp(14px,0.77vw,22px)] text-[clamp(12px,0.56vw,16px)] text-[#111827] outline-none placeholder:text-[#9aa6b7] focus:border-[#0e4beb]" />
          )} />
          {errors.email?.message && <p className="mt-2 text-[12px] text-[#e82828]">{errors.email.message}</p>}
          <label className="mt-[clamp(14px,0.78vw,22px)] text-[clamp(11px,0.56vw,16px)] font-medium text-[#404a5c]">{t("auth.code")}</label>
          <div className="mt-[clamp(8px,0.42vw,12px)] grid grid-cols-[1fr_minmax(112px,190px)] gap-[clamp(12px,0.63vw,18px)]">
            <Controller name="code" control={control} render={({ field }) => (
              <input {...field} disabled={isSubmitting} autoComplete="off" placeholder={t("auth.codePlaceholder")} className="h-[clamp(42px,1.97vw,56px)] rounded-[clamp(9px,0.56vw,16px)] border border-[#dfe5ed] bg-white px-[clamp(14px,0.77vw,22px)] text-[clamp(12px,0.56vw,16px)] text-[#111827] outline-none placeholder:text-[#9aa6b7] focus:border-[#0e4beb]" />
            )} />
            <button type="button" onClick={handleSendCode} disabled={isCodeBtnDisabled} className="h-[clamp(42px,1.97vw,56px)] rounded-[clamp(9px,0.56vw,16px)] bg-[#e8f2ff] text-[clamp(12px,0.56vw,16px)] font-semibold text-[#0e4beb] disabled:opacity-60">
              {sendingCode ? t("auth.sending") : countdown > 0 ? `${countdown}s` : t("auth.sendCode")}
            </button>
          </div>
          {errors.code?.message && <p className="mt-2 text-[12px] text-[#e82828]">{errors.code.message}</p>}
          <label className="mt-[clamp(14px,0.78vw,22px)] text-[clamp(11px,0.56vw,16px)] font-medium text-[#404a5c]">{t("auth.setPassword")}</label>
          <Controller name="password" control={control} render={({ field }) => (
            <input {...field} type="password" disabled={isSubmitting} autoComplete="new-password" placeholder={t("auth.passwordStrongPlaceholder")} className="mt-[clamp(8px,0.42vw,12px)] h-[clamp(42px,1.97vw,56px)] rounded-[clamp(9px,0.56vw,16px)] border border-[#dfe5ed] bg-white px-[clamp(14px,0.77vw,22px)] text-[clamp(12px,0.56vw,16px)] text-[#111827] outline-none placeholder:text-[#9aa6b7] focus:border-[#0e4beb]" />
          )} />
          {errors.password?.message && <p className="mt-2 text-[12px] text-[#e82828]">{errors.password.message}</p>}
          <label className="mt-[clamp(18px,0.92vw,26px)] flex items-center gap-[10px] text-[clamp(11px,0.49vw,14px)] text-[#6b7990]">
            <input checked={agree} onChange={(e) => setAgree(e.target.checked)} type="checkbox" className="h-[clamp(14px,0.63vw,18px)] w-[clamp(14px,0.63vw,18px)] rounded border border-[#dfe5ed] accent-[#0e4beb]" />
            {t("auth.agreeTermsLong")}
          </label>
          {formError && <p className="mt-3 text-[12px] text-[#e82828]">{formError}</p>}
          <button disabled={isSubmitting} className="auth-submit-button mt-[clamp(14px,0.78vw,22px)] h-[clamp(42px,1.97vw,56px)] rounded-[clamp(9px,0.56vw,16px)] bg-[#111827] text-[clamp(13px,0.56vw,16px)] font-semibold text-white disabled:opacity-60">
            {isSubmitting ? t("auth.registering") : t("auth.register")}
          </button>
          <div className="mt-[clamp(10px,0.63vw,18px)] h-px bg-[#e3e8f0]" />
          <button type="button" onClick={() => navigate('/login')} className="mt-[clamp(10px,0.63vw,18px)] h-[clamp(38px,1.76vw,50px)] rounded-[clamp(9px,0.56vw,16px)] bg-[#e8f2ff] text-[clamp(12px,0.56vw,16px)] font-semibold text-[#0e4beb]">
            {t("auth.hasAccountLogin")}
          </button>
        </form>
      </AuthWebLayout>
    </AuthScaffold>
  );
}
