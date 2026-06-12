"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

interface QRCodeDisplayProps {
  sessionId: string;
}

export default function QRCodeDisplay({ sessionId }: QRCodeDisplayProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [listenerUrl, setListenerUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const url = `${window.location.origin}/session/${sessionId}/listen`;
    setListenerUrl(url);

    fetch(`/api/sessions/${sessionId}/qrcode`)
      .then((res) => res.json())
      .then((data) => {
        if (data.qrCode) setQrDataUrl(data.qrCode);
      })
      .catch(console.error);
  }, [sessionId]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(listenerUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-400">Share with audience</h3>
      {qrDataUrl ? (
        <Image
          src={qrDataUrl}
          alt="QR code for listener page"
          width={160}
          height={160}
          unoptimized
          className="mx-auto rounded-lg bg-white p-2"
        />
      ) : (
        <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-lg bg-white/5 text-sm text-gray-500">
          Loading QR...
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={listenerUrl}
          className="flex-1 truncate rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300"
        />
        <button
          onClick={copyLink}
          className="shrink-0 rounded-lg bg-accent/20 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/30"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
