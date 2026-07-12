import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../services/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpToken, setOtpToken] = useState('');
  const [code, setCode] = useState('');
  const [resent, setResent] = useState(false);
  const navigate = useNavigate();

  function extractError(err: unknown): string | undefined {
    return err && typeof err === 'object' && 'response' in err
      ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
      : undefined;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await auth.login(email, password);
      setOtpToken(res.data.otpToken);
    } catch (err: unknown) {
      setError(extractError(err) || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await auth.verifyOtp(otpToken, code);
      localStorage.setItem('parentToken', res.data.token);
      navigate('/dashboard');
    } catch (err: unknown) {
      setError(extractError(err) || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError('');
    setResent(false);
    try {
      await auth.resendOtp(otpToken);
      setResent(true);
    } catch (err: unknown) {
      setError(extractError(err) || 'Could not resend the code. Please log in again.');
    }
  }

  if (otpToken) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <img
              src="/migo-logo.jpg"
              alt="Migo"
              style={{ width: 200, height: 80, objectFit: 'contain', margin: '0 auto 8px' }}
            />
            <p className="text-gray-500 mt-2">Check your email for a login code</p>
          </div>

          <form onSubmit={handleVerifyOtp} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h2 className="text-xl font-bold text-gray-800 mb-2">Enter your code</h2>
            <p className="text-sm text-gray-500 mb-6">
              We sent a 6-digit code to {email}. It expires in 10 minutes.
            </p>

            {error && (
              <div className="bg-red/10 border border-red/30 text-red rounded-xl px-4 py-3 mb-5 text-sm">
                {error}
              </div>
            )}

            {resent && (
              <div className="bg-purple/10 border border-purple/30 text-purple rounded-xl px-4 py-3 mb-5 text-sm">
                A new code is on its way.
              </div>
            )}

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">6-digit code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                autoFocus
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm tracking-[0.5em] text-center focus:outline-none focus:ring-2 focus:ring-purple/40"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full bg-purple text-white font-bold py-3 rounded-xl hover:bg-purple/90 transition disabled:opacity-50"
            >
              {loading ? 'Verifying…' : 'Verify & Sign In'}
            </button>

            <button
              type="button"
              onClick={() => void handleResend()}
              className="w-full text-center text-sm text-purple font-medium mt-4 hover:underline"
            >
              Resend code
            </button>

            <button
              type="button"
              onClick={() => { setOtpToken(''); setCode(''); setError(''); }}
              className="w-full text-center text-sm text-gray-400 mt-3"
            >
              Back to login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <img
            src="/migo-logo.jpg"
            alt="Migo"
            style={{ width: 200, height: 80, objectFit: 'contain', margin: '0 auto 8px' }}
          />
          <p className="text-gray-500 mt-2">Parent Dashboard — your child's world, at a glance</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Welcome back</h2>

          {error && (
            <div className="bg-red/10 border border-red/30 text-red rounded-xl px-4 py-3 mb-5 text-sm">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
            <input
              type="email"
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple/40"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple/40"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple text-white font-bold py-3 rounded-xl hover:bg-purple/90 transition disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>

          <p className="text-center text-sm text-gray-400 mt-5">
            Don't have an account yet?{' '}
            <span className="text-purple font-medium cursor-pointer hover:underline">
              Download the Migo app to get started.
            </span>
          </p>
        </form>
      </div>
    </div>
  );
}
