"use client";

import { Clock, Mail } from "lucide-react";

export default function PortalExpiredPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-6">
          <Clock className="w-8 h-8 text-amber-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Link Expired
        </h1>
        <p className="text-gray-600 mb-8">
          This portal link is no longer valid. Please contact your agent to
          request a new one.
        </p>
        <div className="inline-flex items-center gap-2 text-sm text-gray-500">
          <Mail className="w-4 h-4" />
          <span>Reach out to your agent for a fresh link</span>
        </div>
        <div className="mt-10 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-400">Powered by CloAgent</p>
        </div>
      </div>
    </div>
  );
}
