'use client'

import { useActionState } from 'react'
import { resetPassword } from '@/lib/auth/actions'

export default function ForgotPasswordPage() {
  const [state, formAction] = useActionState(resetPassword, {})

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Reset your password</h1>
        <p className="text-gray-500 mt-1">We&apos;ll send you a link to reset it</p>
      </div>
      {state?.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {state.error}
        </div>
      )}
      {state?.success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {state.success}
        </div>
      )}
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input id="email" name="email" type="email" required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="you@example.com" />
        </div>
        <button type="submit"
          className="w-full py-2 px-4 bg-[var(--pz-teal)] text-[var(--pz-bg)] font-medium rounded-lg hover:bg-[var(--pz-teal-light)] transition-colors text-sm">
          Send reset link
        </button>
      </form>
      <p className="mt-6 text-center text-sm">
        <a href="/login" className="text-blue-600 hover:underline">Back to sign in</a>
      </p>
    </div>
  )
}
