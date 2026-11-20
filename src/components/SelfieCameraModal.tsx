import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, RefreshCw, Upload, X } from 'lucide-react';

interface SelfieCameraModalProps {
  mode: 'clock-in' | 'clock-out';
  employeeName: string;
  onClose: () => void;
  onSubmit: (photoDataUrl: string, note: string) => Promise<void>;
}

export const SelfieCameraModal: React.FC<SelfieCameraModalProps> = ({
  mode,
  employeeName,
  onClose,
  onSubmit,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nowText, setNowText] = useState(() =>
    new Date().toLocaleTimeString('id-ID', { hour12: false })
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setNowText(new Date().toLocaleTimeString('id-ID', { hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    setCameraReady(false);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Browser tidak mendukung akses kamera langsung. Gunakan unggah foto.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch {
      setCameraError(
        'Kamera tidak tersedia atau izin ditolak. Anda dapat mengunggah foto selfie dari perangkat.'
      );
    }
  };

  useEffect(() => {
    if (!capturedPhoto) {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [capturedPhoto]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video) return;
    const size = 320;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const vw = video.videoWidth || 320;
    const vh = video.videoHeight || 320;
    const minDim = Math.min(vw, vh);
    const sx = (vw - minDim) / 2;
    const sy = (vh - minDim) / 2;

    // Mirror horizontally for natural selfie orientation
    ctx.save();
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, minDim, minDim, 0, 0, size, size);
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/jpeg', 0.62);
    stopCamera();
    setCapturedPhoto(dataUrl);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 320;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.62);
        stopCamera();
        setCapturedPhoto(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = async () => {
    if (!capturedPhoto) return;
    setSubmitting(true);
    try {
      await onSubmit(capturedPhoto, note.trim().slice(0, 240));
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 overflow-hidden shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {mode === 'clock-in' ? 'Foto Selfie Clock-In' : 'Foto Selfie Clock-Out'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {employeeName} · <span className="font-mono tabular-nums">{nowText}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera / Preview Viewport */}
        <div className="p-5 overflow-y-auto space-y-4">
          <div className="relative aspect-square w-full max-w-[320px] mx-auto rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 flex items-center justify-center">
            {capturedPhoto ? (
              <img
                src={capturedPhoto}
                alt="Preview Foto Selfie"
                className="w-full h-full object-cover"
              />
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover -scale-x-100"
                />
                {!cameraReady && !cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 text-xs gap-2 p-4 text-center">
                    <Camera className="w-8 h-8 opacity-60" />
                    <span>Mengaktifkan kamera depan...</span>
                  </div>
                )}
                {cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-slate-200 text-xs gap-3 p-6 text-center">
                    <Camera className="w-8 h-8 text-amber-400" />
                    <p className="leading-relaxed">{cameraError}</p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-700 cursor-pointer min-h-[44px]"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Pilih / Ambil Foto</span>
                    </button>
                  </div>
                )}
                {cameraReady && (
                  <div className="pointer-events-none absolute inset-4 rounded-full border-2 border-dashed border-white/40" />
                )}
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={handleFileUpload}
          />

          {/* Optional Note */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Catatan Kehadiran (Opsional)
            </label>
            <input
              type="text"
              maxLength={240}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                mode === 'clock-in'
                  ? 'Contoh: Shift pagi di lokasi proyek A'
                  : 'Contoh: Pekerjaan selesai sesuai target'
              }
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600"
            />
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex items-center gap-3 pb-safe">
          {!capturedPhoto ? (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[48px] inline-flex items-center gap-2 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Unggah</span>
              </button>
              <button
                type="button"
                disabled={!cameraReady}
                onClick={handleCapture}
                className="flex-1 min-h-[48px] rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Ambil Foto Selfie</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setCapturedPhoto(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[48px] inline-flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Foto Ulang</span>
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirm}
                className="flex-1 min-h-[48px] rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'Menyimpan...'
                    : mode === 'clock-in'
                    ? 'Konfirmasi Clock-In'
                    : 'Konfirmasi Clock-Out'}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
