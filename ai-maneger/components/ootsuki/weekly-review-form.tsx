"use client";

import { useEffect, useState } from "react";
import type { WeeklyReviewDraft } from "@/types/ootsuki";

interface WeeklyReviewFormProps {
  weekStart: string;
  weekEnd: string;
  initialDraft?: WeeklyReviewDraft | null;
}

function buildInitialNextActions(initialDraft?: WeeklyReviewDraft | null) {
  return [0, 1, 2].map((index) => initialDraft?.nextActions[index] ?? "");
}

export function WeeklyReviewForm({ weekStart, weekEnd, initialDraft }: WeeklyReviewFormProps) {
  const [status, setStatus] = useState(initialDraft?.status || "進行中");
  const [summary, setSummary] = useState(initialDraft?.summary || "");
  const [relatedNumbers, setRelatedNumbers] = useState(initialDraft?.relatedNumbers || "");
  const [nextActions, setNextActions] = useState<string[]>(() => buildInitialNextActions(initialDraft));
  const [error, setError] = useState("");
  const [submitStatus, setSubmitStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setStatus(initialDraft?.status || "進行中");
    setSummary(initialDraft?.summary || "");
    setRelatedNumbers(initialDraft?.relatedNumbers || "");
    setNextActions(buildInitialNextActions(initialDraft));
  }, [initialDraft, weekStart, weekEnd]);

  function clearFeedback() {
    setError("");
    setSubmitStatus("");
  }

  function updateNextAction(index: number, value: string) {
    setNextActions((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
    clearFeedback();
  }

  async function submitReview() {
    if (isSubmitting) return;

    const trimmedSummary = summary.trim();
    const trimmedNextActions = nextActions.map((item) => item.trim()).filter(Boolean);
    const payload = {
      weekStart,
      weekEnd,
      status: status.trim(),
      summary: trimmedSummary,
      relatedNumbers: relatedNumbers.trim(),
      nextActions: trimmedNextActions,
    };

    if (!payload.summary) {
      setSubmitStatus("");
      setError("今週の振り返りを入力してください。");
      return;
    }

    if (payload.nextActions.length === 0) {
      setSubmitStatus("");
      setError("来週やることを少なくとも1つ入力してください。");
      return;
    }

    setError("");
    setSubmitStatus("送信中です...");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/weekly-review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { ok: boolean; message?: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "週次レビューの保存に失敗しました。");
      }

      setSubmitStatus("保存しました。ページを再読み込みします...");
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (submitError) {
      setSubmitStatus("");
      setError(submitError instanceof Error ? submitError.message : "週次レビューの保存に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submitReview();
      }}
      className="grid gap-5"
    >
      <input type="hidden" name="weekStart" value={weekStart} />
      <input type="hidden" name="weekEnd" value={weekEnd} />

      <label className="grid gap-2 text-sm font-medium text-stone-700">
        進行状況
        <select
          name="status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            clearFeedback();
          }}
          disabled={isSubmitting}
          className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 outline-none"
        >
          <option value="未着手">未着手</option>
          <option value="進行中">進行中</option>
          <option value="完了">完了</option>
        </select>
      </label>

      <label className="grid gap-2 text-sm font-medium text-stone-700">
        今週の振り返り
        <textarea
          name="summary"
          rows={5}
          placeholder="例: LINE配信を1本実施。Google投稿も更新し、週後半は客単価アップの声かけを統一した。"
          value={summary}
          onChange={(event) => {
            setSummary(event.target.value);
            clearFeedback();
          }}
          disabled={isSubmitting}
          className="rounded-[24px] border border-stone-900/10 bg-white px-4 py-3 outline-none"
        />
      </label>

      <label className="grid gap-2 text-sm font-medium text-stone-700">
        関連する数字
        <textarea
          name="relatedNumbers"
          rows={4}
          placeholder="例: 売上 前週比 +8.2%、客数 +5.1%、客単価 +2.9%"
          value={relatedNumbers}
          onChange={(event) => {
            setRelatedNumbers(event.target.value);
            clearFeedback();
          }}
          disabled={isSubmitting}
          className="rounded-[24px] border border-stone-900/10 bg-white px-4 py-3 outline-none"
        />
      </label>

      {[1, 2, 3].map((index) => (
        <label key={index} className="grid gap-2 text-sm font-medium text-stone-700">
          来週やること {index}
          <input
            type="text"
            name={`nextAction${index}`}
            value={nextActions[index - 1]}
            onChange={(event) => {
              updateNextAction(index - 1, event.target.value);
            }}
            disabled={isSubmitting}
            placeholder={
              index === 1
                ? "最優先でやることを記入"
                : index === 2
                  ? "次に着手することを記入"
                  : "余力があれば進めることを記入"
            }
            className="rounded-2xl border border-stone-900/10 bg-white px-4 py-3 outline-none"
          />
        </label>
      ))}

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {submitStatus ? (
        <div className="rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-4 text-sm text-stone-700">
          {submitStatus}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex w-fit rounded-full bg-stone-950 px-6 py-3 text-sm font-medium text-white"
        >
          {isSubmitting ? "保存中..." : "レビューを保存"}
        </button>
      </div>
    </form>
  );
}
