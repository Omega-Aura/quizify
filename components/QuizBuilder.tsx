'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Select } from '@/components/Select';

// ─── Types ───────────────────────────────────────────────────────────

interface AnswerState {
  text: string;
  imageUrl: string | null;
  isCorrect: boolean;
}

interface QuestionState {
  prompt: string;
  mediaUrl: string | null;
  type: 'QUIZ' | 'TRUE_FALSE';
  timeLimit: number;
  pointsMode: 'STANDARD' | 'DOUBLE' | 'NONE';
  singleSelect: boolean;
  answers: AnswerState[];
}

const SHAPES = ['▲', '◆', '●', '■'] as const;
const COLORS = ['answer-red', 'answer-blue', 'answer-yellow', 'answer-green'] as const;
const BG_COLORS = ['bg-answer-red', 'bg-answer-blue', 'bg-answer-yellow', 'bg-answer-green'] as const;
const TIME_LIMITS = [5, 10, 20, 30, 60, 90];
const MAX_MEDIA_BYTES = 3 * 1024 * 1024; // 3MB — stored inline as a data URL, no file storage backend

function createBlankQuestion(): QuestionState {
  return {
    prompt: '',
    mediaUrl: null,
    type: 'QUIZ',
    timeLimit: 20,
    pointsMode: 'STANDARD',
    singleSelect: true,
    answers: [
      { text: '', imageUrl: null, isCorrect: false },
      { text: '', imageUrl: null, isCorrect: false },
      { text: '', imageUrl: null, isCorrect: false },
      { text: '', imageUrl: null, isCorrect: false },
    ],
  };
}

// ─── Shared Builder Component ────────────────────────────────────────

export function QuizBuilder({
  initialTitle = '',
  initialDescription = '',
  initialQuestions,
  quizId,
}: {
  initialTitle?: string;
  initialDescription?: string;
  initialQuestions?: QuestionState[];
  quizId?: string;
}) {
  const router = useRouter();

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [questions, setQuestions] = useState<QuestionState[]>(
    initialQuestions || [createBlankQuestion()]
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [mediaError, setMediaError] = useState('');
  const [mediaDragOver, setMediaDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeQ = questions[activeIndex] || questions[0];

  // ─── Question management ─────────────────────────────────────────

  const updateQuestion = useCallback(
    (index: number, updates: Partial<QuestionState>) => {
      setQuestions((prev) =>
        prev.map((q, i) => (i === index ? { ...q, ...updates } : q))
      );
    },
    []
  );

  const updateAnswer = useCallback(
    (qIndex: number, aIndex: number, updates: Partial<AnswerState>) => {
      setQuestions((prev) =>
        prev.map((q, qi) =>
          qi === qIndex
            ? {
                ...q,
                answers: q.answers.map((a, ai) =>
                  ai === aIndex ? { ...a, ...updates } : a
                ),
              }
            : q
        )
      );
    },
    []
  );

  const handleMediaFile = useCallback(
    (file: File | undefined | null) => {
      if (!file) return;
      setMediaError('');

      if (!file.type.startsWith('image/')) {
        setMediaError('Please choose an image file');
        return;
      }
      if (file.size > MAX_MEDIA_BYTES) {
        setMediaError('Image must be under 3MB');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        updateQuestion(activeIndex, { mediaUrl: reader.result as string });
      };
      reader.onerror = () => setMediaError('Failed to read image');
      reader.readAsDataURL(file);
    },
    [activeIndex, updateQuestion]
  );

  const addQuestion = () => {
    const newQ = createBlankQuestion();
    setQuestions((prev) => [...prev, newQ]);
    setActiveIndex(questions.length);
  };

  const deleteQuestion = (index: number) => {
    if (questions.length <= 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== index));
    if (activeIndex >= questions.length - 1) {
      setActiveIndex(Math.max(0, questions.length - 2));
    } else if (activeIndex > index) {
      setActiveIndex(activeIndex - 1);
    }
  };

  const duplicateQuestion = (index: number) => {
    const copy = JSON.parse(JSON.stringify(questions[index]));
    setQuestions((prev) => [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)]);
    setActiveIndex(index + 1);
  };

  const toggleCorrect = (qIndex: number, aIndex: number) => {
    const q = questions[qIndex];
    if (q.singleSelect) {
      // Single select: toggle this answer and unset others
      setQuestions((prev) =>
        prev.map((question, qi) =>
          qi === qIndex
            ? {
                ...question,
                answers: question.answers.map((a, ai) => ({
                  ...a,
                  isCorrect: ai === aIndex ? !a.isCorrect : false,
                })),
              }
            : question
        )
      );
    } else {
      updateAnswer(qIndex, aIndex, { isCorrect: !q.answers[aIndex].isCorrect });
    }
  };

  // Change type adjusts answer count
  const changeType = (index: number, type: 'QUIZ' | 'TRUE_FALSE') => {
    const q = questions[index];
    if (type === 'TRUE_FALSE') {
      updateQuestion(index, {
        type,
        answers: [
          { text: 'True', imageUrl: null, isCorrect: q.answers[0]?.isCorrect || false },
          { text: 'False', imageUrl: null, isCorrect: q.answers[1]?.isCorrect || false },
        ],
        singleSelect: true,
      });
    } else {
      updateQuestion(index, {
        type,
        answers:
          q.answers.length < 4
            ? [
                ...q.answers,
                ...Array(4 - q.answers.length)
                  .fill(null)
                  .map(() => ({ text: '', imageUrl: null, isCorrect: false })),
              ]
            : q.answers,
      });
    }
  };

  // ─── Drag & drop reorder ─────────────────────────────────────────

  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    setQuestions((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(dragIndex, 1);
      updated.splice(index, 0, moved);
      return updated;
    });
    setActiveIndex(index);
    setDragIndex(index);
  };
  const handleDragEnd = () => setDragIndex(null);

  // ─── Bulk import ─────────────────────────────────────────────────

  const handleBulkImport = () => {
    const lines = bulkText.trim().split('\n').filter(Boolean);
    const imported: QuestionState[] = [];

    for (const line of lines) {
      const parts = line.split(',').map((s) => s.trim());
      if (parts.length >= 6) {
        const [prompt, a1, a2, a3, a4, correctIdx] = parts;
        const correct = parseInt(correctIdx, 10);
        imported.push({
          prompt,
          mediaUrl: null,
          type: 'QUIZ',
          timeLimit: 20,
          pointsMode: 'STANDARD',
          singleSelect: true,
          answers: [a1, a2, a3, a4].map((text, i) => ({
            text,
            imageUrl: null,
            isCorrect: i === correct,
          })),
        });
      }
    }

    if (imported.length === 0) {
      alert('No valid questions found. Format: question, ans1, ans2, ans3, ans4, correctIndex');
      return;
    }

    setQuestions((prev) => [...prev, ...imported]);
    setShowBulkImport(false);
    setBulkText('');
  };

  // ─── Save ────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Quiz title is required');
      return;
    }

    const hasEmptyPrompt = questions.some((q) => !q.prompt.trim());
    if (hasEmptyPrompt) {
      setError('All questions must have a prompt');
      return;
    }

    const hasNoCorrect = questions.some(
      (q) => !q.answers.some((a) => a.isCorrect)
    );
    if (hasNoCorrect) {
      setError('Each question must have at least one correct answer');
      return;
    }

    setSaving(true);
    setError('');

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      coverImage: null,
      questions: questions.map((q, i) => ({
        order: i,
        prompt: q.prompt.trim(),
        mediaUrl: q.mediaUrl,
        type: q.type,
        timeLimit: q.timeLimit,
        pointsMode: q.pointsMode,
        singleSelect: q.singleSelect,
        answers: q.answers.map((a, ai) => ({
          index: ai,
          text: a.text.trim() || `Answer ${ai + 1}`,
          imageUrl: a.imageUrl,
          isCorrect: a.isCorrect,
        })),
      })),
    };

    try {
      if (quizId) {
        await api.put(`/api/quiz/${quizId}`, payload);
      } else {
        await api.post('/api/quiz', payload);
      }
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to save quiz');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-surface">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-ink/[0.06] bg-surface/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-ink/55 hover:text-ink/75 transition-colors">
            ← Back
          </Link>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled Quiz"
            className="bg-transparent text-xl font-bold outline-none placeholder:text-ink/35 w-64"
          />
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-red-600 text-sm">{error}</span>}
          <button onClick={() => setShowBulkImport(true)} className="btn-secondary text-sm !px-3 !py-2">
            📋 Bulk Import
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm !px-6">
            {saving ? 'Saving...' : quizId ? 'Update Quiz' : 'Create Quiz'}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* ─── Left sidebar: slide navigation ─────────────────────── */}
        <div className="builder-sidebar bg-surface/50 flex flex-col">
          <div className="flex-1 overflow-y-auto py-2">
            {questions.map((q, i) => (
              <div
                key={i}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDragEnd={handleDragEnd}
                onClick={() => setActiveIndex(i)}
                className={`question-thumb ${i === activeIndex ? 'active' : ''} ${dragIndex === i ? 'dragging' : ''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-ink/45">Q{i + 1}</span>
                  <span className="text-[10px] text-ink/35">{q.timeLimit}s</span>
                </div>
                <p className="text-xs text-ink/75 line-clamp-2">
                  {q.prompt || 'Untitled question'}
                </p>
                <div className="flex gap-1 mt-2">
                  {q.answers.slice(0, 4).map((_, ai) => (
                    <div key={ai} className={`w-3 h-1.5 rounded-full ${BG_COLORS[ai]} opacity-40`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-ink/[0.06]">
            <button onClick={addQuestion} className="btn-secondary w-full text-sm !py-2.5">
              + Add Question
            </button>
          </div>
        </div>

        {/* ─── Main canvas: question editor ───────────────────────── */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Description (only shown when no question is active) */}
            {activeIndex === 0 && (
              <div className="mb-6">
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Quiz description (optional)"
                  className="input-field text-sm"
                />
              </div>
            )}

            {/* Question prompt */}
            <div className="glass-card p-6">
              <textarea
                value={activeQ.prompt}
                onChange={(e) => updateQuestion(activeIndex, { prompt: e.target.value })}
                placeholder="Type your question here..."
                rows={2}
                className="w-full bg-transparent text-2xl font-bold outline-none resize-none placeholder:text-ink/45"
              />
            </div>

            {/* Media dropzone */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                handleMediaFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <div
              onClick={() => !activeQ.mediaUrl && fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                if (!activeQ.mediaUrl) setMediaDragOver(true);
              }}
              onDragLeave={() => setMediaDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setMediaDragOver(false);
                if (!activeQ.mediaUrl) handleMediaFile(e.dataTransfer.files?.[0]);
              }}
              className={`glass-card p-8 text-center border-2 border-dashed transition-colors ${
                activeQ.mediaUrl ? '' : 'cursor-pointer'
              } ${mediaDragOver ? 'border-brand-500/60 bg-brand-600/5' : 'border-ink/[0.14] hover:border-brand-500/30'}`}
            >
              {activeQ.mediaUrl ? (
                <div className="relative">
                  <img src={activeQ.mediaUrl} alt="" className="max-h-48 mx-auto rounded-lg" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateQuestion(activeIndex, { mediaUrl: null });
                    }}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="text-ink/45">
                  <p className="text-3xl mb-2">🖼️</p>
                  <p className="text-sm">Click to upload an image or drag and drop</p>
                </div>
              )}
            </div>
            {mediaError && <p className="text-sm text-red-600">{mediaError}</p>}

            {/* Answer grid */}
            <div className={`grid gap-4 ${activeQ.type === 'TRUE_FALSE' ? 'grid-cols-2' : 'grid-cols-2'}`}>
              {activeQ.answers.map((answer, ai) => (
                <div
                  key={ai}
                  className={`relative rounded-xl p-4 ${BG_COLORS[ai]} ${
                    answer.isCorrect ? 'ring-2 ring-ink/60 ring-offset-2 ring-offset-surface' : ''
                  } transition-all duration-200`}
                >
                  {/* Shape icon */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xl opacity-80">{SHAPES[ai]}</span>
                    <button
                      type="button"
                      onClick={() => toggleCorrect(activeIndex, ai)}
                      className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${
                        answer.isCorrect
                          ? 'bg-white border-white text-green-600'
                          : 'border-ink/50 text-transparent hover:border-ink/70'
                      }`}
                      title={answer.isCorrect ? 'Correct answer' : 'Mark as correct'}
                      aria-label={`Mark answer ${ai + 1} as ${answer.isCorrect ? 'incorrect' : 'correct'}`}
                    >
                      ✓
                    </button>
                  </div>
                  {/* Answer text input */}
                  <input
                    type="text"
                    value={answer.text}
                    onChange={(e) => updateAnswer(activeIndex, ai, { text: e.target.value })}
                    placeholder={`Answer ${ai + 1}`}
                    className="w-full bg-transparent text-white font-semibold text-lg outline-none placeholder:text-ink/75"
                    disabled={activeQ.type === 'TRUE_FALSE'}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Right sidebar: question properties ─────────────────── */}
        <div className="w-72 overflow-y-auto border-l border-ink/[0.08] bg-surface/50 p-5 space-y-6">
          <div>
            <h3 className="text-sm font-bold text-ink/65 mb-4 uppercase tracking-wider">
              Question Settings
            </h3>
          </div>

          {/* Question type */}
          <div>
            <label className="input-label">Question Type</label>
            <Select
              value={activeQ.type}
              onChange={(v) => changeType(activeIndex, v as 'QUIZ' | 'TRUE_FALSE')}
              className="text-sm"
              options={[
                { value: 'QUIZ', label: 'Quiz' },
                { value: 'TRUE_FALSE', label: 'True / False' },
              ]}
            />
          </div>

          {/* Time limit */}
          <div>
            <label className="input-label">Time Limit</label>
            <div className="grid grid-cols-3 gap-2">
              {TIME_LIMITS.map((t) => (
                <button
                  key={t}
                  onClick={() => updateQuestion(activeIndex, { timeLimit: t })}
                  className={`py-2 rounded-lg text-sm font-medium transition-all ${
                    activeQ.timeLimit === t
                      ? 'bg-brand-600 text-white'
                      : 'bg-ink/[0.08] text-ink/65 hover:bg-ink/[0.13]'
                  }`}
                >
                  {t}s
                </button>
              ))}
            </div>
          </div>

          {/* Points */}
          <div>
            <label className="input-label">Points</label>
            <Select
              value={activeQ.pointsMode}
              onChange={(v) =>
                updateQuestion(activeIndex, { pointsMode: v as 'STANDARD' | 'DOUBLE' | 'NONE' })
              }
              className="text-sm"
              options={[
                { value: 'STANDARD', label: 'Standard (1x)' },
                { value: 'DOUBLE', label: 'Double (2x)' },
                { value: 'NONE', label: 'No points' },
              ]}
            />
          </div>

          {/* Answer mode */}
          {activeQ.type === 'QUIZ' && (
            <div>
              <label className="input-label">Answer Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => updateQuestion(activeIndex, { singleSelect: true })}
                  className={`py-2 rounded-lg text-sm font-medium transition-all ${
                    activeQ.singleSelect
                      ? 'bg-brand-600 text-white'
                      : 'bg-ink/[0.08] text-ink/65 hover:bg-ink/[0.13]'
                  }`}
                >
                  Single
                </button>
                <button
                  onClick={() => updateQuestion(activeIndex, { singleSelect: false })}
                  className={`py-2 rounded-lg text-sm font-medium transition-all ${
                    !activeQ.singleSelect
                      ? 'bg-brand-600 text-white'
                      : 'bg-ink/[0.08] text-ink/65 hover:bg-ink/[0.13]'
                  }`}
                >
                  Multi
                </button>
              </div>
            </div>
          )}

          {/* Divider */}
          <hr className="border-ink/[0.06]" />

          {/* Slide actions */}
          <div>
            <label className="input-label">Actions</label>
            <div className="space-y-2">
              <button
                onClick={() => duplicateQuestion(activeIndex)}
                className="btn-secondary w-full text-sm !py-2"
              >
                📋 Duplicate
              </button>
              <button
                onClick={() => deleteQuestion(activeIndex)}
                disabled={questions.length <= 1}
                className="btn-danger w-full text-sm !py-2"
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Bulk Import Modal ──────────────────────────────────────── */}
      {showBulkImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-card p-8 w-full max-w-xl mx-4 animate-scale-in">
            <h2 className="text-xl font-bold mb-2">Bulk Import Questions</h2>
            <p className="text-sm text-ink/40 mb-4">
              Paste CSV or plain text, one question per line:
              <br />
              <code className="text-brand-600 text-xs">question, ans1, ans2, ans3, ans4, correctIndex</code>
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={`What is 2+2?, 3, 4, 5, 6, 1\nWhat color is the sky?, Red, Blue, Green, Yellow, 1`}
              rows={8}
              className="input-field font-mono text-sm mb-4"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowBulkImport(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleBulkImport} className="btn-primary">
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
