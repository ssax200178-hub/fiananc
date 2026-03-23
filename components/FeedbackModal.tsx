import React, { useState, useRef } from 'react';
import { db, storage, auth } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAppContext } from '../AppContext';
import type { FeedbackType } from '../AppContext';

const ROOT_COLLECTION = (import.meta as any).env.MODE === 'staging' ? 'app_staging' : 'app';
const DATA_PATH = 'v1_data';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_AUDIO_SIZE = 2 * 1024 * 1024; // 2MB

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const CATEGORY_OPTIONS: { value: FeedbackType; label: string; icon: string; emoji: string; color: string; selectedBg: string; selectedBorder: string }[] = [
    { value: 'bug', label: 'خطأ برمجي', icon: 'bug_report', emoji: '🔴', color: 'text-red-600 dark:text-red-400', selectedBg: 'bg-red-500/10 dark:bg-red-500/20', selectedBorder: 'border-red-500' },
    { value: 'suggestion', label: 'اقتراح', icon: 'lightbulb', emoji: '💡', color: 'text-amber-600 dark:text-amber-400', selectedBg: 'bg-amber-500/10 dark:bg-amber-500/20', selectedBorder: 'border-amber-500' },
    { value: 'improvement', label: 'تحسين', icon: 'trending_up', emoji: '⚡', color: 'text-emerald-600 dark:text-emerald-400', selectedBg: 'bg-emerald-500/10 dark:bg-emerald-500/20', selectedBorder: 'border-emerald-500' },
];

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose }) => {
    const { currentUser, devFeedbackSettings } = useAppContext();
    const [message, setMessage] = useState('');
    const [feedbackType, setFeedbackType] = useState<FeedbackType | null>(null);
    const [image, setImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [typeError, setTypeError] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    if (!isOpen) return null;

    const allowImages = devFeedbackSettings?.allowImageAttachments !== false;
    const allowAudio = devFeedbackSettings?.allowAudioRecordings !== false;

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > MAX_IMAGE_SIZE) {
                alert('⚠️ حجم الصورة يتجاوز 5 ميجابايت. يرجى اختيار صورة أصغر.');
                return;
            }
            setImage(file);
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                if (blob.size > MAX_AUDIO_SIZE) {
                    alert('⚠️ حجم التسجيل يتجاوز 2 ميجابايت. يرجى تسجيل مقطع أقصر.');
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }
                setAudioBlob(blob);
                setAudioUrl(URL.createObjectURL(blob));
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("تعذر الوصول إلى الميكروفون. تأكد من منح الصلاحيات اللازمة.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const clearRecording = () => {
        setAudioBlob(null);
        setAudioUrl(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate category selection
        if (!feedbackType) {
            setTypeError(true);
            return;
        }

        if (!message.trim() && !image && !audioBlob) return;
        const currentUid = auth.currentUser?.uid || currentUser?.firebaseUid;
        if (!currentUid) {
            console.error("❌ [FEEDBACK] No UID found", { authUid: auth.currentUser?.uid, dbUid: currentUser?.firebaseUid });
            alert("يجب تسجيل الدخول أولاً");
            return;
        }

        setIsSubmitting(true);
        console.log("🚀 [FEEDBACK] Starting submission...", { userId: currentUid, root: ROOT_COLLECTION, type: feedbackType });
        try {
            const attachments: { imageUrl?: string; audioUrl?: string } = {};

            // Helper to convert Blob/File to Base64
            const blobToBase64 = (blob: Blob): Promise<string> => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            };

            // Convert Image to Base64
            if (image && allowImages) {
                console.log("📸 [FEEDBACK] Converting image to Base64...");
                attachments.imageUrl = await blobToBase64(image);
            }

            // Convert Audio to Base64
            if (audioBlob && allowAudio) {
                console.log("🎤 [FEEDBACK] Converting audio to Base64...");
                attachments.audioUrl = await blobToBase64(audioBlob);
            }

            // Save to Firestore
            console.log("📝 [FEEDBACK] Saving to Firestore...");
            await addDoc(collection(db, ROOT_COLLECTION, DATA_PATH, 'feedback'), {
                userId: currentUid,
                userName: currentUser?.name || currentUser?.username || 'مستخدم غير معروف',
                message: message.trim(),
                type: feedbackType,
                attachments,
                status: 'new',
                createdAt: serverTimestamp(),
            });
            console.log("🎉 [FEEDBACK] Submission successful!");

            setShowSuccess(true);
            setTimeout(() => {
                setShowSuccess(false);
                setMessage('');
                setFeedbackType(null);
                setImage(null);
                setImagePreview(null);
                clearRecording();
                onClose();
            }, 2500);

        } catch (error: any) {
            console.error("❌ [FEEDBACK] Error submitting feedback:", error);

            let errorMsg = "حدث خطأ أثناء إرسال الملاحظة. حاول مرة أخرى.";
            if (error.code === 'resource-exhausted' || error.message?.includes('quota')) {
                errorMsg = "عذراً، تم تجاوز حصة العمليات اليومية للنظام (Quota Exceeded). سيتم تصفير العداد غداً بشكل تلقائي.";
            } else if (error.code === 'permission-denied') {
                errorMsg = "ليس لديك صلاحية للكتابة في قاعدة البيانات. يرجى التواصل مع المدير.";
            }

            alert(errorMsg);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 RTL" dir="rtl">
            <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in border border-slate-200 dark:border-slate-700">

                {/* Header */}
                <div className="bg-gradient-to-l from-indigo-600 to-indigo-700 p-6 flex justify-between items-center text-white relative overflow-hidden">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                    <div className="relative z-10">
                        <h2 className="text-2xl font-black flex items-center gap-2">
                            <span className="material-symbols-outlined">support_agent</span>
                            تواصل مع المطور
                        </h2>
                        <p className="text-indigo-100 text-sm mt-1 opacity-90">أرسل ملاحظاتك أو أبلغ عن مشكلة</p>
                    </div>
                    <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-xl transition relative z-10">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {showSuccess ? (
                    <div className="p-12 text-center h-[400px] flex flex-col items-center justify-center">
                        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-6">
                            <span className="material-symbols-outlined text-4xl">check_circle</span>
                        </div>
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-2">تم الإرسال بنجاح!</h3>
                        <p className="text-slate-500 dark:text-slate-400">شكراً لملاحظاتك. سيقوم فريق التطوير بمراجعتها قريباً.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-6 space-y-5">
                        {/* Support Contacts Banner */}
                        {(devFeedbackSettings?.whatsappNumber || devFeedbackSettings?.supportPhone) && (
                            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800/50 flex flex-col gap-2">
                                <h4 className="text-sm font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[16px]">contact_support</span>
                                    للدعم المباشر أو الحالات العاجلة
                                </h4>
                                <div className="flex flex-wrap gap-4 mt-1">
                                    {devFeedbackSettings.whatsappNumber && (
                                        <a href={`https://wa.me/${devFeedbackSettings.whatsappNumber.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs font-bold bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-700/50 text-[#25D366] hover:bg-indigo-50 dark:hover:bg-slate-700 transition">
                                            <span className="material-symbols-outlined text-[16px]">chat</span>
                                            واتساب: <span dir="ltr">{devFeedbackSettings.whatsappNumber}</span>
                                        </a>
                                    )}
                                    {devFeedbackSettings.supportPhone && (
                                        <a href={`tel:${devFeedbackSettings.supportPhone.replace(/[^0-9+]/g, '')}`} className="flex items-center gap-2 text-xs font-bold bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-700/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-700 transition">
                                            <span className="material-symbols-outlined text-[16px]">call</span>
                                            اتصال: <span dir="ltr">{devFeedbackSettings.supportPhone}</span>
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Category Selection */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                                نوع الملاحظة <span className="text-red-500">*</span>
                            </label>
                            <div className="grid grid-cols-3 gap-3">
                                {CATEGORY_OPTIONS.map((cat) => {
                                    const isSelected = feedbackType === cat.value;
                                    return (
                                        <button
                                            key={cat.value}
                                            type="button"
                                            onClick={() => { setFeedbackType(cat.value); setTypeError(false); }}
                                            className={`
                                                relative flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 transition-all duration-200 font-bold text-sm
                                                ${isSelected
                                                    ? `${cat.selectedBg} ${cat.selectedBorder} shadow-sm`
                                                    : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 bg-white dark:bg-slate-900'
                                                }
                                            `}
                                        >
                                            <span className={`material-symbols-outlined text-2xl ${isSelected ? cat.color : 'text-slate-400'}`}>{cat.icon}</span>
                                            <span className={isSelected ? cat.color : 'text-slate-500 dark:text-slate-400'}>
                                                {cat.emoji} {cat.label}
                                            </span>
                                            {isSelected && (
                                                <span className="absolute top-1 left-1">
                                                    <span className={`material-symbols-outlined text-base ${cat.color}`}>check_circle</span>
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                            {typeError && (
                                <p className="text-red-500 text-xs font-bold mt-2 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">error</span>
                                    يرجى اختيار نوع الملاحظة قبل الإرسال
                                </p>
                            )}
                        </div>

                        {/* Text Message */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                                الملاحظة / المشكلة <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-semibold outline-none resize-none"
                                rows={4}
                                placeholder="صف المشكلة أو اقتراحك هنا..."
                                required={!image && !audioBlob}
                            ></textarea>
                        </div>

                        {/* Attachments Section */}
                        {(allowImages || allowAudio) && (
                            <div className="grid grid-cols-2 gap-4">
                                {/* Image Upload */}
                                {allowImages ? (
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">إرفاق صورة</label>
                                        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 dark:border-slate-600 border-dashed rounded-xl relative hover:bg-slate-50 dark:hover:bg-slate-700/50 transition cursor-pointer">
                                            <div className="space-y-1 text-center">
                                                {imagePreview ? (
                                                    <div className="relative group">
                                                        <img src={imagePreview} alt="Preview" className="mx-auto h-24 object-cover rounded-lg" />
                                                        <button type="button" onClick={() => { setImage(null); setImagePreview(null); }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition">
                                                            <span className="material-symbols-outlined text-sm">close</span>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <span className="material-symbols-outlined text-4xl text-slate-400">add_photo_alternate</span>
                                                        <div className="flex text-sm text-slate-600 dark:text-slate-400 justify-center">
                                                            <span className="relative cursor-pointer bg-white dark:bg-transparent rounded-md font-bold text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500">
                                                                <span>رفع ملف</span>
                                                                <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept="image/*" onChange={handleImageChange} />
                                                            </span>
                                                        </div>
                                                        <p className="text-[10px] text-slate-400">الحد الأقصى: 5 ميجابايت</p>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/30 opacity-60">
                                        <span className="material-symbols-outlined text-3xl text-slate-300 dark:text-slate-600">no_photography</span>
                                        <p className="text-xs text-slate-400 dark:text-slate-500 font-bold mt-2 text-center">⚠️ خاصية رفع الصور معطلة حالياً</p>
                                    </div>
                                )}

                                {/* Audio Recording */}
                                {allowAudio ? (
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">تسجيل صوتي</label>
                                        <div className="mt-1 border-2 border-slate-300 dark:border-slate-600 rounded-xl h-full flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-900/50">
                                            {audioUrl ? (
                                                <div className="w-full flex-col items-center gap-2">
                                                    <audio src={audioUrl} controls className="w-full h-8 mb-2" />
                                                    <button type="button" onClick={clearRecording} className="text-red-500 text-sm font-bold flex items-center justify-center gap-1 mx-auto hover:text-red-600">
                                                        <span className="material-symbols-outlined text-sm">delete</span> مسح
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={isRecording ? stopRecording : startRecording}
                                                    className={`p-4 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'}`}
                                                >
                                                    <span className="material-symbols-outlined text-3xl">{isRecording ? 'stop_circle' : 'mic'}</span>
                                                </button>
                                            )}
                                            {!audioUrl && <span className="text-xs font-bold text-slate-500 mt-2">{isRecording ? 'جاري التسجيل...' : 'اضغط للتسجيل'}</span>}
                                            <p className="text-[10px] text-slate-400 mt-1">الحد الأقصى: 2 ميجابايت</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/30 opacity-60">
                                        <span className="material-symbols-outlined text-3xl text-slate-300 dark:text-slate-600">mic_off</span>
                                        <p className="text-xs text-slate-400 dark:text-slate-500 font-bold mt-2 text-center">⚠️ خاصية التسجيل الصوتي معطلة حالياً</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Both disabled message */}
                        {!allowImages && !allowAudio && (
                            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl flex items-center gap-2">
                                <span className="material-symbols-outlined text-amber-600 text-lg">info</span>
                                <p className="text-xs text-amber-700 dark:text-amber-300 font-bold">تم تعطيل خاصية إرفاق الملفات (صور وصوت) من قِبل المشرف.</p>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isSubmitting}
                                className="px-5 py-2.5 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition"
                            >
                                إلغاء
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting || (!message.trim() && !image && !audioBlob)}
                                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition shadow-lg shadow-indigo-200 dark:shadow-none flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin">sync</span>
                                        جاري الإرسال...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined">send</span>
                                        إرسال الملاحظة
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default FeedbackModal;
